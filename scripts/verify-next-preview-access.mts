import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Pool } from "pg"
import { ZodError } from "zod"
import { NextPreviewAccessBindingSchema, previewGrantHash, matchesPreviewAccessBinding } from "../lib/siteagent/server/next-preview-access-binding.ts"
import { nextAccessFailureResponse } from "../lib/siteagent/server/next-preview-failure.ts"
import { PostgresNextPreviewRepository } from "../lib/siteagent/server/next-preview-repository.ts"
import type { NextAccepted } from "../lib/siteagent/server/next-preview-model.ts"

const principal = { tenantId: "tenant:a", userId: "11111111-1111-4111-8111-111111111111" }
const binding = NextPreviewAccessBindingSchema.parse({ jobId: "job:a", sourceRevisionId: `revision:sha256:${"a".repeat(64)}`, previewRef: "preview:abcdefghijklmnop" })
let accepted: NextAccepted = { ...binding, tenantId: principal.tenantId, projectId: "project:a", deploymentId: "dpl:a", deploymentUrl: "https://artifact.example", acceptedAt: new Date().toISOString(), outputSha256: "b".repeat(64), files: [] }
const grants = new Map<string, { project_id: string; tenant_id: string; owner_user_id: string; auth_session_id: string; hostname: string }>()
let sessions = 0
const client = {
  async query(sql: string, values: unknown[] = []) {
    if (["begin", "commit", "rollback"].includes(sql)) return { rows: [], rowCount: 0 }
    if (sql.startsWith("delete from public.next_preview_access")) {
      const row = grants.get(String(values[0]))
      if (!row || row.hostname !== values[1]) return { rows: [], rowCount: 0 }
      grants.delete(String(values[0]))
      return { rows: [row], rowCount: 1 }
    }
    if (sql.startsWith("select state from public.next_preview_states")) {
      assert.deepEqual(values, [accepted.projectId, principal.tenantId, principal.userId])
      return { rows: [{ state: { current: null, accepted } }], rowCount: 1 }
    }
    if (sql.startsWith("insert into public.next_preview_access")) { sessions++; return { rows: [], rowCount: 1 } }
    throw new Error(`unexpected query ${sql}`)
  },
  release() {},
}
const pool = {
  async connect() { return client },
  async query(sql: string, values: unknown[]) {
    assert.match(sql, /n\.tenant_id=\$3 and n\.owner_user_id=\$6::uuid/)
    assert.match(sql, /accepted,jobId.*\$7.*accepted,sourceRevisionId.*\$8.*accepted,previewRef.*\$9/)
    const [hash, projectId, tenantId, authSessionId, hostname, userId, jobId, revision, ref] = values
    const match = projectId === accepted.projectId && tenantId === principal.tenantId && userId === principal.userId &&
      (jobId === null || (jobId === accepted.jobId && revision === accepted.sourceRevisionId && ref === accepted.previewRef))
    if (match) grants.set(String(hash), { project_id: String(projectId), tenant_id: String(tenantId), owner_user_id: String(userId), auth_session_id: String(authSessionId), hostname: String(hostname) })
    return { rows: [], rowCount: match ? 1 : 0 }
  },
} as unknown as Pool
const repo = new PostgresNextPreviewRepository(pool)
const issue = () => repo.issueGrant(principal, "project:a", "session:a", "project.preview.example", binding)
const token = await issue()
assert.equal(await repo.exchangeGrant(token, "project.preview.example"), null, "cannot drop a grant binding")
assert.equal(await repo.exchangeGrant(token, "project.preview.example", { ...binding, jobId: "job:other" }), null, "cannot change grant binding")
assert.equal(await repo.exchangeGrant(token, "other.preview.example", binding), null, "cannot change project origin")
assert.ok(await repo.exchangeGrant(token, "project.preview.example", binding))
assert.equal(await repo.exchangeGrant(token, "project.preview.example", binding), null, "grant is one-use")
assert.equal(sessions, 1)
const stale = await issue()
accepted = { ...accepted, jobId: "job:new", previewRef: "preview:qrstuvwxyzabcdef" }
assert.equal(await repo.exchangeGrant(stale, "project.preview.example", binding), null, "acceptance between grant and bootstrap must not show another revision")
assert.equal(sessions, 1, "stale exchange creates no session")
await assert.rejects(issue, /preview_access_denied/, "stale binding denied at issuance")
await assert.rejects(() => repo.issueGrant({ ...principal, userId: "22222222-2222-4222-8222-222222222222" }, "project:a", "session:b", "project.preview.example"), /preview_access_denied/)
const legacy = await repo.issueGrant(principal, "project:a", "session:a", "project.preview.example")
assert.ok(await repo.exchangeGrant(legacy, "project.preview.example"), "bodyless existing callers remain compatible")
assert.notEqual(previewGrantHash("token", binding), previewGrantHash("token"))
assert.equal(matchesPreviewAccessBinding(accepted, binding), false)
assert.equal(NextPreviewAccessBindingSchema.safeParse({ ...binding, sourceRevisionId: "wrong" }).success, false)

assert.deepEqual(nextAccessFailureResponse(new Error("next_preview_unavailable")), { status: 404, body: { error: "next_preview_unavailable" } })
assert.deepEqual(nextAccessFailureResponse(new Error("preview_access_denied")), { status: 403, body: { error: "preview_access_denied" } })
assert.deepEqual(nextAccessFailureResponse(new Error("payload_too_large")), { status: 413, body: { error: "payload_too_large" } })
assert.deepEqual(nextAccessFailureResponse(new ZodError([])), { status: 400, body: { error: "invalid_access_binding" } })
assert.deepEqual(nextAccessFailureResponse(new Error("persistence_unavailable")), { status: 503, body: { error: "preview_access_unavailable" } })
const leaked = nextAccessFailureResponse(new Error("Bearer grant token https://host.preview.example"))
assert.equal(JSON.stringify(leaked).includes("Bearer"), false)
assert.equal(JSON.stringify(leaked).includes("preview.example"), false)

const accessRoute = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../app/api/siteagent/projects/[projectId]/next/access/route.ts"), "utf8")
assert.match(accessRoute, /nextAccessFailureResponse\(error\)/)
assert.match(accessRoute, /content-length/)
assert.match(accessRoute, /transfer-encoding/)
assert.match(accessRoute, /error:"origin_denied"/)
assert.match(accessRoute, /error:"unauthenticated"/)
assert.doesNotMatch(accessRoute, /catch \{ return Response\.json\(\{error:"preview_access_denied"\}/)
assert.doesNotMatch(accessRoute, /error\.message/)
console.log("Next preview access: bound one-use grants, stale acceptance denial, classified access failures and legacy compatibility pass (mock SQL; not live browser/DB)")
