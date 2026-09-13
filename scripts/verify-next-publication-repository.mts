import assert from "node:assert/strict"
import type { Pool } from "pg"
import { PostgresNextPublicationRepository } from "../lib/siteagent/server/next-publication-repository.ts"
import { publicationHost, type PublishedNext } from "../lib/siteagent/server/next-publication-model.ts"
import { outputDigest, type NextAccepted } from "../lib/siteagent/server/next-preview-model.ts"

const principal = { userId: "00000000-0000-4000-8000-000000000001", tenantId: "tenant-a" }
const files = [
  { path: "_next/static/app.js", content: Buffer.from("window.ready=true").toString("base64"), encoding: "base64" as const },
  { path: "index.html", content: Buffer.from("<h1>Next</h1>").toString("base64"), encoding: "base64" as const },
]
const accepted: NextAccepted = { tenantId: "tenant-a", projectId: "project-a", jobId: "job-a", sourceRevisionId: `revision:sha256:${"a".repeat(64)}`, previewRef: "preview:abcdefghijklmnopqrstu", deploymentId: "dpl-a", deploymentUrl: "https://private.example.test", outputSha256: outputDigest(files), acceptedAt: "2026-09-13T00:00:00.000Z", files }
const intent = { sourceRevisionId: accepted.sourceRevisionId, jobId: accepted.jobId }
let current: NextAccepted | null = structuredClone(accepted)
let saved: PublishedNext | null = null
let writes = 0
let savedHostname = publicationHost(principal.tenantId, "project-a", "public.example.test")
let rollbacks = 0
const client = {
  async query(sql: string, params: unknown[] = []) {
    if (sql === "rollback") { rollbacks++; return { rows: [], rowCount: 0 } }
    if (["begin", "commit"].includes(sql)) return { rows: [], rowCount: 0 }
    if (sql.startsWith("select id from public.site_projects")) {
      const owned = params[0] === "project-a" && params[1] === principal.tenantId && params[2] === principal.userId
      return { rows: owned ? [{ id: "project-a" }] : [], rowCount: Number(owned) }
    }
    if (sql.startsWith("select state from public.next_preview_states")) return { rows: [{ state: { accepted: current } }], rowCount: 1 }
    if (sql.startsWith("select snapshot,hostname from public.next_publications_v2")) return { rows: saved ? [{ snapshot: saved, hostname: savedHostname }] : [], rowCount: saved ? 1 : 0 }
    if (sql.startsWith("insert into public.next_publications_v2")) {
      assert.equal(params[0], "project-a"); assert.equal(params[1], principal.tenantId); assert.equal(params[2], principal.userId)
      savedHostname = String(params[3])
      saved = JSON.parse(String(params[4])); writes++
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unexpected test SQL: ${sql}`)
  },
  release() {},
}
const pool = { connect: async () => client } as unknown as Pool
const repo = new PostgresNextPublicationRepository(pool)
const first = await repo.publish(principal, "project-a", intent, "public.example.test")
assert.equal(writes, 1); assert.equal(first.sourceRevisionId, accepted.sourceRevisionId)
assert.deepEqual(first.files, files)
assert.equal((await repo.publish(principal, "project-a", intent, "public.example.test")).publishedAt, first.publishedAt)
assert.equal(writes, 1, "identical replay does not republish")
await assert.rejects(repo.publish({ ...principal, userId: "00000000-0000-4000-8000-000000000002" }, "project-a", intent, "public.example.test"), /project_not_found/)
await assert.rejects(repo.publish({ ...principal, tenantId: "tenant-b" }, "project-a", intent, "public.example.test"), /project_not_found/)
await assert.rejects(repo.publish(principal, "project-b", intent, "public.example.test"), /project_not_found/)
current = { ...accepted, jobId: "job-new", sourceRevisionId: `revision:sha256:${"b".repeat(64)}` }
await assert.rejects(repo.publish(principal, "project-a", intent, "public.example.test"), /accepted_revision_changed/)
current = { ...accepted, outputSha256: "0".repeat(64) }
await assert.rejects(repo.publish(principal, "project-a", intent, "public.example.test"), /accepted_output_invalid/)
current = null
await assert.rejects(repo.publish(principal, "project-a", intent, "public.example.test"), /accepted_revision_missing/)
assert.equal(writes, 1, "failed/unauthorized/stale publishes never replace published snapshot")
assert.equal(rollbacks, 6)
assert.deepEqual(saved, first)
current = structuredClone(accepted)
await repo.publish(principal, "project-a", intent, "new-public.example.test")
assert.equal(writes, 2, "same revision rebinds configured hostname after domain change")
assert.equal(savedHostname, publicationHost(principal.tenantId, "project-a", "new-public.example.test"))
console.log("Next publication repository: exact accepted revision, owner/tenant/project denials, immutable replay and failure preservation passed (mock SQL pool; not live DB)")
