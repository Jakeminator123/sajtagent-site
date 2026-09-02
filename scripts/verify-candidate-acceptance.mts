import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import {
  BuildEventV1Schema,
  BuildJobV1Schema,
  BuildResultSuccessV1Schema,
  WorkerCandidateReportV1Schema,
  type BuildJobV1,
  type WorkerReportV1,
} from "../contracts/builder-v1.ts"
import {
  DeterministicCandidateAcceptanceV1,
  type CandidateArtifactReaderV1,
  type LoadedCandidatePreviewV1,
  type MaterializedSitePreviewV1,
  type PreparedAcceptedCandidateV1,
  type SiteCandidatePreviewStoreV1,
  type SitePreviewHealthV1,
} from "../lib/siteagent/server/candidate-acceptance.ts"
import {
  createBuildJobV1,
  type AcceptedCandidateCommitterV1,
  type BuildRuntimeClientV1,
} from "../lib/siteagent/server/build-job-controller.ts"
import {
  MemoryBuildJobRepositoryV1,
  type StoredBuildJobV1,
} from "../lib/siteagent/server/build-job-repository.ts"
import type { BuildPrincipalV1 } from "../lib/siteagent/server/build-job-input.ts"

const principal: BuildPrincipalV1 = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant:one",
}
const acceptanceNow = () => new Date("2026-09-01T12:02:00.000Z")
const htmlBytes = new TextEncoder().encode("<!doctype html><html><body>SiteAgent</body></html>")
const htmlSha256 = createHash("sha256").update(htmlBytes).digest("hex")

function job(): BuildJobV1 {
  return BuildJobV1Schema.parse({
    schemaVersion: 1,
    jobId: "job:acceptance",
    tenantId: principal.tenantId,
    projectId: "project:one",
    baseRevisionId: "revision:base",
    idempotencyKey: "acceptance",
    createdAt: "2026-09-01T12:00:00.000Z",
    expiresAt: "2026-09-01T12:10:00.000Z",
    intent: {
      schemaVersion: 1,
      intentType: "site.change",
      message: "Bygg en verifierad startsida",
      context: {},
    },
    executionPolicy: {
      deadlineAt: "2026-09-01T12:08:00.000Z",
      maxSteps: 20,
      maxToolCalls: 50,
      maxModelTokens: 20_000,
      maxCostMicros: 500_000,
      capabilities: [
        "workspace.read",
        "workspace.write",
        "checks.run",
        "preview.manage",
      ],
      network: { mode: "deny-all" },
      packages: { mode: "deny" },
    },
  })
}

type CandidateReport = ReturnType<typeof WorkerCandidateReportV1Schema.parse>

function candidateReport(buildJob: BuildJobV1): CandidateReport {
  const reportedAt = buildJob.createdAt
  return WorkerCandidateReportV1Schema.parse({
    schemaVersion: 1,
    status: "candidate",
    jobId: buildJob.jobId,
    sourceRunId: "run:acceptance",
    baseRevisionId: buildJob.baseRevisionId,
    candidateRevisionId: `revision:sha256:${"4".repeat(64)}`,
    changedPaths: ["index.html"],
    artifacts: [
      {
        kind: "diff",
        ref: "opaque:diff",
        mediaType: "application/vnd.git-diff",
      },
      {
        kind: "preview",
        ref: "opaque:preview-source",
        mediaType: "text/html",
        sha256: htmlSha256,
      },
    ],
    receipts: [
      {
        receiptId: "check:one",
        category: "check",
        name: "runtime-defined-check-name",
        status: "passed",
        startedAt: reportedAt,
        finishedAt: reportedAt,
      },
      {
        receiptId: "preview:one",
        category: "preview",
        name: "runtime-defined-preview-name",
        status: "passed",
        startedAt: reportedAt,
        finishedAt: reportedAt,
        evidenceRef: "opaque:preview-source",
      },
    ],
    diagnostics: [],
    reportedAt,
  })
}

class MemoryPreviewBoundaryV1
  implements CandidateArtifactReaderV1, SiteCandidatePreviewStoreV1
{
  readonly calls: string[] = []
  loaded: LoadedCandidatePreviewV1 = {
    sourceRef: "opaque:preview-source",
    relativePath: "index.html",
    mediaType: "text/html",
    sha256: htmlSha256,
    sizeBytes: htmlBytes.byteLength,
    bytes: htmlBytes,
  }
  materialized: MaterializedSitePreviewV1 = {
    state: "staged",
    previewRef: "preview:33333333-3333-4333-8333-333333333333",
    mediaType: "text/html",
    sha256: htmlSha256,
    sizeBytes: htmlBytes.byteLength,
    content: htmlBytes,
  }
  health: SitePreviewHealthV1 = {
    healthy: true,
    statusCode: 200,
    previewRef: "preview:33333333-3333-4333-8333-333333333333",
    mediaType: "text/html",
    sha256: htmlSha256,
    sizeBytes: htmlBytes.byteLength,
  }
  throwAt: "read" | "materialize" | "health" | null = null

  async readPreviewArtifact(): Promise<LoadedCandidatePreviewV1> {
    this.calls.push("read")
    if (this.throwAt === "read") throw new Error("read_failed")
    return this.loaded
  }

  async materializePreview(): Promise<MaterializedSitePreviewV1> {
    this.calls.push("materialize")
    if (this.throwAt === "materialize") throw new Error("materialize_failed")
    return this.materialized
  }

  async checkPreviewHealth(): Promise<SitePreviewHealthV1> {
    this.calls.push("health")
    if (this.throwAt === "health") throw new Error("health_failed")
    return this.health
  }

}

class MemoryAcceptedCandidateCommitterV1 implements AcceptedCandidateCommitterV1 {
  readonly committedVersionIds: string[] = []
  private readonly repository: MemoryBuildJobRepositoryV1

  constructor(repository: MemoryBuildJobRepositoryV1) {
    this.repository = repository
  }

  async commitAcceptedCandidate(
    commitPrincipal: BuildPrincipalV1,
    buildJob: BuildJobV1,
    prepared: PreparedAcceptedCandidateV1,
    expectedSequence: number,
  ): Promise<StoredBuildJobV1> {
    const result = BuildResultSuccessV1Schema.parse({
      schemaVersion: 1,
      status: "succeeded",
      jobId: buildJob.jobId,
      baseRevisionId: buildJob.baseRevisionId,
      workspaceRevisionId: "revision:accepted",
      versionId: "version:accepted",
      previewRef: prepared.preview.previewRef,
      sitemapRevision: "sitemap:accepted",
      verifiedAt: prepared.verifiedAt,
      receipts: prepared.receipts,
    })
    const event = BuildEventV1Schema.parse({
      schemaVersion: 1,
      jobId: buildJob.jobId,
      sequence: expectedSequence,
      occurredAt: prepared.verifiedAt,
      sourceRunId: prepared.report.sourceRunId,
      type: "job.succeeded",
      payload: { result },
    })
    const record = await this.repository.appendEvent(
      commitPrincipal,
      buildJob.jobId,
      event,
      { status: "succeeded", result, workerReport: prepared.report },
    )
    this.committedVersionIds.push(result.versionId)
    return record
  }
}

function setup(options: { currentChecks?: boolean[] } = {}) {
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  const boundary = new MemoryPreviewBoundaryV1()
  let currentCheck = 0
  const revisionGuard = options.currentChecks
    ? {
        isProjectRevisionCurrent: async () =>
          options.currentChecks?.[currentCheck++] ?? false,
      }
    : repository
  const acceptance = new DeterministicCandidateAcceptanceV1({
    revisionGuard,
    artifactReader: boundary,
    previewStore: boundary,
    now: acceptanceNow,
  })
  return { repository, boundary, acceptance }
}

const assertions: string[] = []
function passed(name: string): void {
  assertions.push(name)
}

{
  const buildJob = job()
  const { acceptance, boundary } = setup()
  const decision = await acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(decision.accepted, true)
  assert.equal(
    decision.accepted && decision.prepared.preview.previewRef,
    "preview:33333333-3333-4333-8333-333333333333",
  )
  assert.equal(decision.accepted && decision.prepared.receipts.at(-1)?.category, "policy")
  assert.deepEqual(boundary.calls, ["read", "materialize", "health"])
  passed("valid evidence becomes prepared only after Site preview health")
}

{
  const buildJob = BuildJobV1Schema.parse({ ...job(), jobId: "j".repeat(160) })
  const { acceptance } = setup()
  const decision = await acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(decision.accepted, true)
  const acceptanceReceipt = decision.accepted
    ? decision.prepared.receipts.at(-1)
    : undefined
  assert.equal(acceptanceReceipt?.receiptId.startsWith("acceptance:"), true)
  assert.equal((acceptanceReceipt?.receiptId.length ?? 161) <= 160, true)
  passed("acceptance receipt ID stays bounded for a maximal valid job ID")
}

{
  const buildJob = job()
  const report = candidateReport(buildJob)
  const { acceptance, boundary } = setup()
  const decision = await acceptance.accept({
    principal,
    job: buildJob,
    report: { ...report, jobId: "job:other" },
  })
  assert.equal(decision.accepted, false)
  assert.equal(!decision.accepted && decision.code, "verification_failed")
  assert.deepEqual(boundary.calls, [])
  passed("job and report binding fails before artifact access")
}

{
  const buildJob = job()
  const { repository, acceptance, boundary } = setup()
  repository.addProjectRevision(principal, "project:one", "revision:newer")
  const decision = await acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!decision.accepted && decision.code, "stale_revision")
  assert.deepEqual(boundary.calls, [])
  passed("stale base revision fails before artifact access")
}

{
  const buildJob = job()
  const report = candidateReport(buildJob)
  const failedReceipts = report.receipts.map((receipt, index) =>
    index === 0 ? { ...receipt, status: "failed" as const } : receipt,
  )
  const { acceptance, boundary } = setup()
  const decision = await acceptance.accept({
    principal,
    job: buildJob,
    report: { ...report, receipts: failedReceipts },
  })
  assert.equal(!decision.accepted && decision.code, "verification_failed")
  assert.deepEqual(boundary.calls, [])
  passed("failed receipts never reach materialization")
}

{
  const buildJob = job()
  const report = candidateReport(buildJob)
  const { acceptance } = setup()
  const withoutCheck = await acceptance.accept({
    principal,
    job: buildJob,
    report: {
      ...report,
      receipts: report.receipts.filter((receipt) => receipt.category !== "check"),
    },
  })
  assert.equal(!withoutCheck.accepted && withoutCheck.code, "verification_failed")
  const mismatchedPreview = await acceptance.accept({
    principal,
    job: buildJob,
    report: {
      ...report,
      receipts: report.receipts.map((receipt) =>
        receipt.category === "preview"
          ? { ...receipt, evidenceRef: "opaque:other-preview" }
          : receipt,
      ),
    },
  })
  assert.equal(!mismatchedPreview.accepted && mismatchedPreview.code, "verification_failed")
  passed("semantic check and exact preview receipts are both required")
}

{
  const buildJob = job()
  const report = candidateReport(buildJob)
  const preview = report.artifacts.find((artifact) => artifact.kind === "preview")
  if (!preview) throw new Error("Expected preview fixture")
  const { acceptance } = setup()
  const duplicate = await acceptance.accept({
    principal,
    job: buildJob,
    report: { ...report, artifacts: [...report.artifacts, preview] },
  })
  assert.equal(!duplicate.accepted && duplicate.code, "verification_failed")
  const missingHash = await acceptance.accept({
    principal,
    job: buildJob,
    report: {
      ...report,
      artifacts: report.artifacts.map((artifact) =>
        artifact.kind === "preview" ? { ...artifact, sha256: undefined } : artifact,
      ),
    },
  })
  assert.equal(!missingHash.accepted && missingHash.code, "verification_failed")
  passed("exactly one SHA-marked preview artifact is required")
}

{
  const buildJob = job()
  const { acceptance, boundary } = setup()
  boundary.loaded = { ...boundary.loaded, relativePath: "../index.html" }
  const wrongPath = await acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!wrongPath.accepted && wrongPath.code, "verification_failed")

  const second = setup()
  second.boundary.loaded = { ...second.boundary.loaded, sizeBytes: htmlBytes.byteLength + 1 }
  const wrongSize = await second.acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!wrongSize.accepted && wrongSize.code, "verification_failed")

  const third = setup()
  third.boundary.loaded = { ...third.boundary.loaded, sha256: "0".repeat(64) }
  const wrongHash = await third.acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!wrongHash.accepted && wrongHash.code, "verification_failed")
  passed("path, byte size and SHA boundaries are exact")
}

{
  const buildJob = job()
  const materialization = setup()
  materialization.boundary.materialized = {
    ...materialization.boundary.materialized,
    previewRef: "opaque:preview-source",
  }
  const unowned = await materialization.acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!unowned.accepted && unowned.code, "persistence_failed")

  const changedContentSetup = setup()
  changedContentSetup.boundary.materialized = {
    ...changedContentSetup.boundary.materialized,
    content: new TextEncoder().encode("<!doctype html><html>changed</html>"),
  }
  const changedContent = await changedContentSetup.acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!changedContent.accepted && changedContent.code, "persistence_failed")

  const unhealthySetup = setup()
  unhealthySetup.boundary.health = { ...unhealthySetup.boundary.health, healthy: false }
  const unhealthy = await unhealthySetup.acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!unhealthy.accepted && unhealthy.code, "preview_unhealthy")
  passed("unmaterialized or unhealthy previews cannot create versions")
}

{
  const buildJob = job()
  const { acceptance, boundary } = setup({ currentChecks: [true, false] })
  const decision = await acceptance.accept({
    principal,
    job: buildJob,
    report: candidateReport(buildJob),
  })
  assert.equal(!decision.accepted && decision.code, "stale_revision")
  assert.deepEqual(boundary.calls, ["read", "materialize", "health"])
  passed("revision is checked again immediately before finalization")
}

{
  const buildJob = job()
  const expiredJob = BuildJobV1Schema.parse({
    ...buildJob,
    expiresAt: "2026-09-01T12:01:30.000Z",
    executionPolicy: {
      ...buildJob.executionPolicy,
      deadlineAt: "2026-09-01T12:01:00.000Z",
    },
  })
  const { acceptance } = setup()
  const decision = await acceptance.accept({
    principal,
    job: expiredJob,
    report: candidateReport(expiredJob),
  })
  assert.equal(!decision.accepted && decision.code, "expired")
  passed("expired candidates fail closed")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  const boundary = new MemoryPreviewBoundaryV1()
  const acceptance = new DeterministicCandidateAcceptanceV1({
    revisionGuard: repository,
    artifactReader: boundary,
    previewStore: boundary,
    now: acceptanceNow,
  })
  const response = await createBuildJobV1(
    {
      schemaVersion: 1,
      projectId: "project:one",
      baseRevisionId: "revision:base",
      idempotencyKey: "missing-atomic-commit",
      intent: {
        schemaVersion: 1,
        intentType: "site.change",
        message: "Sakna atomisk commit",
        context: {},
      },
    },
    principal,
    {
      repository,
      runtime: { run: async (buildJob) => candidateReport(buildJob) },
      acceptance,
      successCommitter: null,
      now: acceptanceNow,
      createId: () => "missing-atomic-commit",
    },
  )
  assert.equal(response.httpStatus, 503)
  assert.equal(
    response.record?.result?.status === "failed" && response.record.result.code,
    "persistence_failed",
  )
  assert.deepEqual(boundary.calls, [])
  passed("candidate is not materialized without an atomic success committer")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  const boundary = new MemoryPreviewBoundaryV1()
  const acceptance = new DeterministicCandidateAcceptanceV1({
    revisionGuard: repository,
    artifactReader: boundary,
    previewStore: boundary,
    now: acceptanceNow,
  })
  const runtime: BuildRuntimeClientV1 = {
    run: async (buildJob) => candidateReport(buildJob),
  }
  const successCommitter = new MemoryAcceptedCandidateCommitterV1(repository)
  const response = await createBuildJobV1(
    {
      schemaVersion: 1,
      projectId: "project:one",
      baseRevisionId: "revision:base",
      idempotencyKey: "controller-success",
      intent: {
        schemaVersion: 1,
        intentType: "site.change",
        message: "Bygg den riktiga previewn",
        context: {},
      },
    },
    principal,
    {
      repository,
      runtime,
      acceptance,
      successCommitter,
      now: acceptanceNow,
      createId: () => "controller-success",
    },
  )
  assert.equal(response.httpStatus, 201, JSON.stringify(response))
  assert.equal(response.record?.status, "succeeded")
  assert.equal(response.record?.result?.status, "succeeded")
  assert.deepEqual(response.record?.events.map((event) => event.type), [
    "job.accepted",
    "job.running",
    "job.succeeded",
  ])
  assert.deepEqual(response.record?.events.map((event) => event.sequence), [1, 2, 3])
  assert.deepEqual(successCommitter.committedVersionIds, ["version:accepted"])
  passed("one atomic committer persists version, result, and ordered terminal success")

  if (!response.record) throw new Error("Expected successful record")
  await assert.rejects(
    repository.appendEvent(
      principal,
      response.record.job.jobId,
      BuildEventV1Schema.parse({
        schemaVersion: 1,
        jobId: response.record.job.jobId,
        sequence: 4,
        occurredAt: acceptanceNow().toISOString(),
        type: "job.running",
        payload: { phase: "persist" },
      }),
      { status: "running" },
    ),
    /terminal_event_already_exists/,
  )
  passed("repository rejects every event after the terminal success")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  const boundary = new MemoryPreviewBoundaryV1()
  const acceptance = new DeterministicCandidateAcceptanceV1({
    revisionGuard: repository,
    artifactReader: boundary,
    previewStore: boundary,
    now: acceptanceNow,
  })
  const response = await createBuildJobV1(
      {
        schemaVersion: 1,
        projectId: "project:one",
        baseRevisionId: "revision:base",
        idempotencyKey: "sequence-rejected",
        intent: {
          schemaVersion: 1,
          intentType: "site.change",
          message: "Avvisa falsk terminalsekvens",
          context: {},
        },
      },
      principal,
      {
        repository,
        runtime: { run: async (buildJob) => candidateReport(buildJob) },
        acceptance,
        successCommitter: {
          commitAcceptedCandidate: async () => {
            throw new Error("invalid_event_sequence")
          },
        },
        now: acceptanceNow,
        createId: () => "sequence-rejected",
      },
    )
  assert.equal(response.httpStatus, 503)
  assert.equal(response.record?.status, "failed")
  assert.equal(
    response.record?.result?.status === "failed" && response.record.result.code,
    "persistence_failed",
  )
  passed("atomic commit sequence errors become terminal persistence failure")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  const invalidRuntime: BuildRuntimeClientV1 = {
    run: async () => ({ status: "candidate" } as unknown as WorkerReportV1),
  }
  const response = await createBuildJobV1(
    {
      schemaVersion: 1,
      projectId: "project:one",
      baseRevisionId: "revision:base",
      idempotencyKey: "invalid-report",
      intent: {
        schemaVersion: 1,
        intentType: "site.change",
        message: "Avvisa rapporten",
        context: {},
      },
    },
    principal,
    {
      repository,
      runtime: invalidRuntime,
      acceptance: null,
      now: acceptanceNow,
      createId: () => "invalid-report",
    },
  )
  assert.equal(response.record?.result?.status, "failed")
  assert.equal(
    response.record?.result?.status === "failed" && response.record.result.code,
    "verification_failed",
  )
  passed("invalid WorkerReportV1 becomes terminal verification failure")
}

console.log(`Candidate acceptance: PASS (${assertions.length} assertions)`)
for (const name of assertions) console.log(`- ${name}`)
