import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Pool } from "pg"
import { ZodError } from "zod"
import {
  agentBuildProfile,
  nextPreviewOwnerReadModel,
  projectBuildProfileView,
  readBuildProfilePreference,
} from "../lib/siteagent/server/agent-build-profile.ts"
import { nextProfileFailureResponse } from "../lib/siteagent/server/next-preview-failure.ts"
import { PostgresNextPreviewRepository } from "../lib/siteagent/server/next-preview-repository.ts"
import type { NextAccepted, NextJob, NextState } from "../lib/siteagent/server/next-preview-model.ts"

const completeNextEnv = {
  SITEAGENT_NEXT_ENABLED: "true",
  SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.example.com",
  SITEAGENT_SITE_ORIGIN: "https://site.example.com",
  SITEAGENT_RUNTIME_URL: "https://runtime.example.com",
  SITEAGENT_RUNTIME_SIGNING_KEY: "k".repeat(32),
  SITEAGENT_NEXT_VERCEL_TOKEN: "token",
  SITEAGENT_NEXT_VERCEL_TEAM_ID: "team",
  SITEAGENT_NEXT_VERCEL_PROJECT_ID: "prj",
  SITEAGENT_NEXT_VERCEL_BYPASS: "bypass",
} as unknown as NodeJS.ProcessEnv

const empty: NextState = { current: null, accepted: null }
const accepted: NextAccepted = {
  tenantId: "tenant:a",
  projectId: "project:a",
  jobId: "job:accepted",
  sourceRevisionId: `revision:sha256:${"a".repeat(64)}`,
  previewRef: "preview:abcdefghijklmnop",
  deploymentId: "dpl:a",
  deploymentUrl: "https://private.example",
  acceptedAt: "2026-09-15T00:00:00.000Z",
  outputSha256: "b".repeat(64),
  files: [],
}
const withAccepted: NextState = { current: null, accepted }

const cases: Array<{
  name: string
  env: NodeJS.ProcessEnv
  state: NextState
  preference?: "html" | "next" | null
  effective: "html" | "next"
}> = [
  { name: "Next off, no preference, no accepted", env: {}, state: empty, effective: "html" },
  { name: "Next off, html preference", env: {}, state: { ...empty, profilePreference: "html" }, preference: "html", effective: "html" },
  { name: "Next off, next preference", env: {}, state: { ...empty, profilePreference: "next" }, preference: "next", effective: "html" },
  { name: "Next off, accepted stays next", env: {}, state: withAccepted, preference: "html", effective: "next" },
  { name: "Next on, unset preference defaults next", env: completeNextEnv, state: empty, preference: null, effective: "next" },
  { name: "Next on, explicit next", env: completeNextEnv, state: { ...empty, profilePreference: "next" }, preference: "next", effective: "next" },
  { name: "Next on, html preference", env: completeNextEnv, state: { ...empty, profilePreference: "html" }, preference: "html", effective: "html" },
  { name: "Next on, html preference keeps accepted Next artifacts", env: completeNextEnv, state: { ...withAccepted, profilePreference: "html" }, preference: "html", effective: "html" },
  { name: "incomplete Next env is unavailable", env: { SITEAGENT_NEXT_ENABLED: "true" } as unknown as NodeJS.ProcessEnv, state: empty, effective: "html" },
]

for (const test of cases) {
  const preference = test.preference === undefined ? readBuildProfilePreference(test.state) : test.preference
  assert.equal(agentBuildProfile(test.env, test.state, preference), test.effective, test.name)
}

assert.equal(readBuildProfilePreference({ ...empty, profilePreference: "html" }), "html")
assert.equal(readBuildProfilePreference(empty), null)
assert.equal(readBuildProfilePreference({ current: null, accepted: null, profilePreference: "nope" as NextState["profilePreference"] }), null)

const onView = projectBuildProfileView(completeNextEnv, { ...empty, profilePreference: "html" })
assert.deepEqual(onView, { available: ["html", "next"], preference: "html", effective: "html" })
const unsetView = projectBuildProfileView(completeNextEnv, empty)
assert.deepEqual(unsetView, { available: ["html", "next"], preference: null, effective: "next" })
const offView = projectBuildProfileView({}, withAccepted)
assert.deepEqual(offView, { available: ["html"], preference: null, effective: "next" })

const ownerRead = nextPreviewOwnerReadModel(completeNextEnv, { ...withAccepted, profilePreference: "html" })
assert.equal(ownerRead.schemaVersion, 2)
assert.equal(ownerRead.state.accepted?.jobId, "job:accepted")
assert.equal("files" in (ownerRead.state.accepted ?? {}), false)
assert.equal("deploymentUrl" in (ownerRead.state.accepted ?? {}), false)
assert.deepEqual(ownerRead.profile, { available: ["html", "next"], preference: "html", effective: "html" })

assert.deepEqual(nextProfileFailureResponse(new Error("next_preview_unavailable")), { status: 404, body: { error: "next_preview_unavailable" } })
assert.deepEqual(nextProfileFailureResponse(new Error("project_not_found")), { status: 404, body: { error: "project_not_found" } })
assert.deepEqual(nextProfileFailureResponse(new ZodError([])), { status: 400, body: { error: "invalid_profile_preference" } })
assert.deepEqual(nextProfileFailureResponse(new Error("invalid_json")), { status: 400, body: { error: "invalid_profile_preference" } })
assert.deepEqual(nextProfileFailureResponse(new Error("payload_too_large")), { status: 413, body: { error: "payload_too_large" } })
assert.deepEqual(nextProfileFailureResponse(new Error("db boom https://secret.example")), { status: 503, body: { error: "next_profile_failed" } })
assert.equal(JSON.stringify(nextProfileFailureResponse(new Error("db boom https://secret.example"))).includes("secret.example"), false)

const principal = { tenantId: "tenant:a", userId: "11111111-1111-4111-8111-111111111111" }
const other = { tenantId: "tenant:a", userId: "22222222-2222-4222-8222-222222222222" }
const job: NextJob = {
  tenantId: principal.tenantId,
  projectId: "project:a",
  jobId: "job:current",
  sourceRevisionId: accepted.sourceRevisionId,
  previewRef: accepted.previewRef,
  status: "accepted",
  expiresAt: "2026-09-15T01:00:00.000Z",
}
let stored: NextState | null = { current: job, accepted, profilePreference: "next" }
let writes = 0
let publicationQueries = 0
const client = {
  async query(sql: string, values: unknown[] = []) {
    if (sql.includes("next_publications_v2")) { publicationQueries++; throw new Error(`publication table touched: ${sql}`) }
    if (["begin", "commit", "rollback"].includes(sql)) return { rows: [], rowCount: 0 }
    if (sql.startsWith("select id from public.site_projects")) {
      const owned = values[0] === "project:a" && values[1] === principal.tenantId && values[2] === principal.userId
      return { rows: owned ? [{ id: "project:a" }] : [], rowCount: Number(owned) }
    }
    if (sql.startsWith("select state from public.next_preview_states")) {
      const owned = values[0] === "project:a" && values[1] === principal.tenantId && values[2] === principal.userId
      return { rows: owned && stored ? [{ state: structuredClone(stored) }] : [], rowCount: owned && stored ? 1 : 0 }
    }
    if (sql.startsWith("insert into public.next_preview_states")) {
      assert.equal(values[0], "project:a")
      assert.equal(values[1], principal.tenantId)
      assert.equal(values[2], principal.userId)
      stored = JSON.parse(String(values[3])) as NextState
      writes++
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`unexpected query ${sql}`)
  },
  release() {},
}
const pool = { async connect() { return client } } as unknown as Pool
const repo = new PostgresNextPreviewRepository(pool)

const afterHtml = await repo.setProfilePreference(principal, "project:a", "html")
assert.equal(afterHtml.profilePreference, "html")
assert.deepEqual(afterHtml.accepted, accepted)
assert.deepEqual(afterHtml.current, job)
assert.equal(stored?.profilePreference, "html")
assert.deepEqual(stored?.accepted, accepted)
assert.equal(writes, 1)

const afterNext = await repo.setProfilePreference(principal, "project:a", "next")
assert.equal(afterNext.profilePreference, "next")
assert.deepEqual(afterNext.accepted, accepted)
assert.equal(writes, 2)

await assert.rejects(repo.setProfilePreference(other, "project:a", "html"), /project_not_found/)
await assert.rejects(repo.setProfilePreference(principal, "project:other", "html"), /project_not_found/)
assert.equal(writes, 2, "denied writes must not persist a preference")
assert.deepEqual(stored?.accepted, accepted, "preference writes never convert accepted Next state")
assert.equal(publicationQueries, 0, "preference writes never touch next_publications_v2")

stored = null
const lazy = await repo.setProfilePreference(principal, "project:a", "html")
assert.equal(lazy.profilePreference, "html")
assert.equal(lazy.current, null)
assert.equal(lazy.accepted, null)
assert.equal(writes, 3, "a project without a Next row still gets an owner-bound preference row")

const here = dirname(fileURLToPath(import.meta.url))
const profileRoute = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/profile/route.ts"), "utf8")
const nextRoute = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/route.ts"), "utf8")
const repository = readFileSync(resolve(here, "../lib/siteagent/server/next-preview-repository.ts"), "utf8")
assert.match(profileRoute, /Lives under `\/next\/`/)
assert.match(profileRoute, /Site #37/)
assert.match(profileRoute, /SITEAGENT_SITE_ORIGIN/)
assert.match(profileRoute, /error:\s*"origin_denied"/)
assert.match(profileRoute, /resolveBuildPrincipalV1/)
assert.match(profileRoute, /error:\s*"unauthenticated"/)
assert.match(profileRoute, /nextPreviewConfig\(\)/)
assert.match(profileRoute, /setProfilePreference/)
assert.match(profileRoute, /nextProfileFailureResponse/)
assert.match(profileRoute, /privateHeaders\(\)/)
assert.match(profileRoute, /readBoundedJsonV1\(request, 1024\)/)
assert.match(profileRoute, /preference: z\.enum\(\["html", "next"\]\)/)
assert.match(profileRoute, /nextPreviewOwnerReadModel/)
assert.doesNotMatch(profileRoute, /error\.message/)
assert.doesNotMatch(profileRoute, /(?:from|into|update)\s+public\.next_publications_v2/)
assert.match(nextRoute, /nextPreviewOwnerReadModel/)
assert.match(repository, /setProfilePreference/)
assert.doesNotMatch(repository, /(?:from|into|update)\s+public\.next_publications_v2/)
assert.match(profileRoute, /if \(!principal\) return json\(401/)
assert.ok(profileRoute.indexOf("origin_denied") < profileRoute.indexOf("unauthenticated"))
assert.ok(profileRoute.indexOf("unauthenticated") < profileRoute.indexOf("nextPreviewConfig()"))
assert.ok(profileRoute.indexOf("nextPreviewConfig()") < profileRoute.indexOf("setProfilePreference"))

console.log("Next build-profile preference: effective-rule matrix, owner-bound JSON upsert, named 4xx and route gates passed (mock SQL; not live DB).")
