import assert from "node:assert/strict"

import {
  createBuildJobV1,
  type BuildRuntimeClientV1,
} from "../lib/siteagent/server/build-job-controller.ts"
import {
  MemoryBuildJobRepositoryV1,
} from "../lib/siteagent/server/build-job-repository.ts"
import type { BuildPrincipalV1 } from "../lib/siteagent/server/build-job-input.ts"
import { buildPrincipalFromClaimsV1 } from "../lib/siteagent/server/principal-claims.ts"
import {
  MemoryPersonalProjectRepositoryV1,
  personalStarterIdsV1,
} from "../lib/siteagent/server/project-repository.ts"
import {
  isSameOriginMutation,
  readBoundedJsonV1,
} from "../lib/siteagent/server/request-security.ts"
import type {
  BuildJobV1,
  WorkerReportV1,
} from "../contracts/builder-v1.ts"

const principal: BuildPrincipalV1 = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant:one",
}
const otherPrincipal: BuildPrincipalV1 = {
  userId: "22222222-2222-4222-8222-222222222222",
  tenantId: "tenant:one",
}
const now = () => new Date("2026-09-01T12:00:00.000Z")
let id = 0
const createId = () => `test-${++id}`

function request(idempotencyKey: string, message = "Bygg en startsida") {
  return {
    schemaVersion: 1 as const,
    projectId: "project:one",
    baseRevisionId: "revision:base",
    idempotencyKey,
    intent: {
      schemaVersion: 1 as const,
      intentType: "site.change" as const,
      message,
      context: {},
    },
  }
}

function dependencies(
  repository: MemoryBuildJobRepositoryV1,
  runtime: BuildRuntimeClientV1 | null,
) {
  return { repository, runtime, now, createId }
}

function candidateReport(job: BuildJobV1): WorkerReportV1 {
  return {
    schemaVersion: 1,
    status: "candidate",
    jobId: job.jobId,
    sourceRunId: "run:candidate",
    baseRevisionId: job.baseRevisionId,
    candidateRevisionId: `revision:sha256:${"5".repeat(64)}`,
    changedPaths: ["app/page.tsx"],
    artifacts: [],
    receipts: [],
    diagnostics: [],
    reportedAt: now().toISOString(),
  }
}

const assertions: string[] = []
function passed(name: string): void {
  assertions.push(name)
}

assert.deepEqual(buildPrincipalFromClaimsV1({ sub: principal.userId }), {
  userId: principal.userId,
  tenantId: `personal:${principal.userId}`,
})
assert.equal(
  buildPrincipalFromClaimsV1({ sub: principal.userId, is_anonymous: true }),
  null,
)
assert.equal(buildPrincipalFromClaimsV1({ sub: "not-a-uuid" }), null)
passed("verified Supabase claims derive a server-owned personal tenant")

const projectRepository = new MemoryPersonalProjectRepositoryV1()
const starter = await projectRepository.ensurePersonalStarterProject(principal)
assert.deepEqual(starter, personalStarterIdsV1(principal.userId))
assert.deepEqual(await projectRepository.ensurePersonalStarterProject(principal), starter)
await assert.rejects(
  projectRepository.ensurePersonalStarterProject({ ...principal, tenantId: "tenant:changed" }),
  /starter_project_ownership_conflict/,
)
passed("personal starter project is deterministic, idempotent, and owner-bound")

assert.equal(
  isSameOriginMutation(new Request("https://site.test/api", { method: "POST", headers: { origin: "https://site.test" } })),
  true,
)
assert.equal(
  isSameOriginMutation(new Request("https://site.test/api", { method: "POST", headers: { origin: "https://evil.test" } })),
  false,
)
assert.equal(
  isSameOriginMutation(new Request("http://localhost:3000/api", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3147",
      host: "127.0.0.1:3147",
      "x-forwarded-proto": "http",
    },
  })),
  true,
)
assert.deepEqual(
  await readBoundedJsonV1(
    new Request("https://site.test/api", { method: "POST", body: JSON.stringify({ ok: true }) }),
    64,
  ),
  { ok: true },
)
await assert.rejects(
  readBoundedJsonV1(new Request("https://site.test/api", { method: "POST", body: "x".repeat(65) }), 64),
  /payload_too_large/,
)
passed("mutation boundary rejects cross-origin and oversized requests")

const repository = new MemoryBuildJobRepositoryV1()
repository.addProjectRevision(principal, "project:one", "revision:base")

const forbidden = await createBuildJobV1(
  request("forbidden"),
  otherPrincipal,
  dependencies(repository, null),
)
assert.equal(forbidden.httpStatus, 403)
passed("cross-owner revision access is denied")

const unavailable = await createBuildJobV1(
  request("runtime-missing"),
  principal,
  dependencies(repository, null),
)
assert.equal(unavailable.httpStatus, 503)
assert.equal(unavailable.record?.result?.status, "failed")
assert.equal(
  unavailable.record?.result?.status === "failed" && unavailable.record.result.code,
  "runtime_unavailable",
)
assert.deepEqual(unavailable.record?.events.map((event) => event.sequence), [1, 2])
assert.equal(JSON.stringify(unavailable).includes("previewRef"), false)
passed("missing runtime fails closed without a preview")
assert.equal(
  unavailable.record?.job.executionPolicy.capabilities.includes("checks.run"),
  true,
)
assert.equal(
  unavailable.record?.job.executionPolicy.capabilities.includes("command.execute"),
  false,
)
assert.equal(
  unavailable.record?.job.executionPolicy.capabilities.includes("packages.install"),
  false,
)
passed("Site issues runtime-owned checks without host execution capabilities")

const existing = await createBuildJobV1(
  request("runtime-missing"),
  principal,
  dependencies(repository, null),
)
assert.equal(existing.kind, "existing")
assert.equal(existing.record?.job.jobId, unavailable.record?.job.jobId)
passed("equal idempotent request returns the existing job")

const conflict = await createBuildJobV1(
  request("runtime-missing", "Bygg något annat"),
  principal,
  dependencies(repository, null),
)
assert.equal(conflict.httpStatus, 409)
assert.equal(conflict.kind, "idempotency_conflict")
passed("changed content with the same idempotency key conflicts")

if (!unavailable.record) throw new Error("Expected stored unavailable job")
await assert.rejects(
  repository.appendEvent(
    otherPrincipal,
    unavailable.record.job.jobId,
    unavailable.record.events[1],
    { status: "failed" },
  ),
  /build_job_not_found/,
)
passed("memory repository enforces user ownership")

const candidate = await createBuildJobV1(
  request("candidate"),
  principal,
  dependencies(repository, { run: async (job) => candidateReport(job) }),
)
assert.equal(candidate.httpStatus, 422)
assert.equal(
  candidate.record?.result?.status === "failed" && candidate.record.result.code,
  "verification_failed",
)
assert.deepEqual(candidate.record?.events.map((event) => event.sequence), [1, 2, 3])
passed("unverified candidate cannot become a successful version")

const workerFailure = await createBuildJobV1(
  request("worker-failure"),
  principal,
  dependencies(repository, {
    run: async (job) => ({
      schemaVersion: 1,
      status: "failed",
      jobId: job.jobId,
      sourceRunId: "run:failure",
      baseRevisionId: job.baseRevisionId,
      receipts: [],
      diagnostics: [{ code: "openclaw_not_connected", message: "Offline", retryable: true }],
      reportedAt: now().toISOString(),
    }),
  }),
)
assert.equal(
  workerFailure.record?.result?.status === "failed" && workerFailure.record.result.code,
  "worker_failed",
)
assert.equal(
  workerFailure.record?.result?.status === "failed" && workerFailure.record.result.message,
  "Offline",
)
assert.equal(
  workerFailure.record?.result?.status === "failed" && workerFailure.record.result.retryable,
  true,
)
assert.equal(workerFailure.record?.workerReport?.status, "failed")
passed("worker failure is persisted as a terminal failure")

const runtimeThrow = await createBuildJobV1(
  request("runtime-throw"),
  principal,
  dependencies(repository, { run: async () => { throw new Error("offline") } }),
)
assert.equal(runtimeThrow.httpStatus, 503)
assert.equal(
  runtimeThrow.record?.result?.status === "failed" && runtimeThrow.record.result.code,
  "runtime_unavailable",
)
passed("runtime transport errors fail closed")

await assert.rejects(
  createBuildJobV1(
    { ...request("invalid"), unexpected: true },
    principal,
    dependencies(repository, null),
  ),
)
passed("unknown request fields are rejected")

console.log(`Build-job boundary: PASS (${assertions.length} assertions)`)
for (const name of assertions) console.log(`- ${name}`)
