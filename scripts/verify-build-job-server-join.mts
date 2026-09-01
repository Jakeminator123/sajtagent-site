import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import {
  BuildEventV1Schema,
  BuildResultSuccessV1Schema,
  type BuildJobV1,
} from "../contracts/builder-v1.ts"
import {
  RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1,
  RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1,
  createBuildJobServerJoinV1,
} from "../lib/siteagent/server/build-job-server-join.ts"
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
import { InlineSiteCandidatePreviewStoreV1 } from "../lib/siteagent/server/candidate-preview-store.ts"
import type {
  CandidateArtifactReaderV1,
  PreparedAcceptedCandidateV1,
} from "../lib/siteagent/server/candidate-acceptance.ts"

const principal: BuildPrincipalV1 = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "personal:11111111-1111-4111-8111-111111111111",
}
const now = () => new Date("2026-09-01T12:00:00.000Z")
const htmlBytes = new TextEncoder().encode(
  "<!doctype html><html><body>Verifierad Site-preview</body></html>",
)
const htmlSha256 = createHash("sha256").update(htmlBytes).digest("hex")
const previewRef = "preview:33333333-3333-4333-8333-333333333333"

function request(idempotencyKey: string) {
  return {
    schemaVersion: 1 as const,
    projectId: "project:one",
    baseRevisionId: "revision:base",
    idempotencyKey,
    intent: {
      schemaVersion: 1 as const,
      intentType: "site.change" as const,
      message: "Bygg den verifierade sidan",
      context: {},
    },
  }
}

function candidateReport(job: BuildJobV1) {
  return {
    schemaVersion: 1 as const,
    status: "candidate" as const,
    jobId: job.jobId,
    sourceRunId: "run:join",
    baseRevisionId: job.baseRevisionId,
    candidateRevisionId: "candidate:join",
    changedPaths: ["index.html"],
    artifacts: [
      {
        kind: "preview" as const,
        ref: "opaque:runtime-preview",
        mediaType: "text/html",
        sha256: htmlSha256,
      },
    ],
    receipts: [
      {
        receiptId: "check:join",
        category: "check" as const,
        name: "runtime-defined-check",
        status: "passed" as const,
        startedAt: job.createdAt,
        finishedAt: job.createdAt,
      },
      {
        receiptId: "preview:join",
        category: "preview" as const,
        name: "runtime-defined-preview",
        status: "passed" as const,
        startedAt: job.createdAt,
        finishedAt: job.createdAt,
        evidenceRef: "opaque:runtime-preview",
      },
    ],
    diagnostics: [],
    reportedAt: job.createdAt,
  }
}

class MemoryAcceptedCandidateCommitterV1 implements AcceptedCandidateCommitterV1 {
  private readonly repository: MemoryBuildJobRepositoryV1

  constructor(repository: MemoryBuildJobRepositoryV1) {
    this.repository = repository
  }

  async commitAcceptedCandidate(
    commitPrincipal: BuildPrincipalV1,
    job: BuildJobV1,
    prepared: PreparedAcceptedCandidateV1,
    expectedSequence: number,
  ): Promise<StoredBuildJobV1> {
    const result = BuildResultSuccessV1Schema.parse({
      schemaVersion: 1,
      status: "succeeded",
      jobId: job.jobId,
      baseRevisionId: job.baseRevisionId,
      workspaceRevisionId: "revision:joined",
      versionId: "version:joined",
      previewRef: prepared.preview.previewRef,
      sitemapRevision: "sitemap:joined",
      verifiedAt: prepared.verifiedAt,
      receipts: prepared.receipts,
    })
    return this.repository.appendEvent(
      commitPrincipal,
      job.jobId,
      BuildEventV1Schema.parse({
        schemaVersion: 1,
        jobId: job.jobId,
        sequence: expectedSequence,
        occurredAt: prepared.verifiedAt,
        sourceRunId: prepared.report.sourceRunId,
        type: "job.succeeded",
        payload: { result },
      }),
      { status: "succeeded", result, workerReport: prepared.report },
    )
  }
}

const assertions: string[] = []
function passed(name: string): void {
  assertions.push(name)
}

{
  const store = new InlineSiteCandidatePreviewStoreV1({
    createId: () => "33333333-3333-4333-8333-333333333333",
  })
  const materialized = await store.materializePreview({
    preview: {
      sourceRef: "opaque:runtime-preview",
      relativePath: "index.html",
      mediaType: "text/html",
      sha256: htmlSha256,
      sizeBytes: htmlBytes.byteLength,
      bytes: htmlBytes,
    },
  })
  assert.equal(materialized.previewRef, previewRef)
  assert.notEqual(materialized.content, htmlBytes)
  assert.deepEqual(
    await store.checkPreviewHealth({ preview: materialized }),
    {
      healthy: true,
      statusCode: 200,
      previewRef,
      mediaType: "text/html",
      sha256: htmlSha256,
      sizeBytes: htmlBytes.byteLength,
    },
  )
  materialized.content[0] = 0
  assert.equal(
    (await store.checkPreviewHealth({
      preview: materialized,
    })).healthy,
    false,
  )
  passed("Site staging copies exact bytes and health fails after tampering")
}

{
  const store = new InlineSiteCandidatePreviewStoreV1()
  await assert.rejects(
    store.materializePreview({
      preview: {
        sourceRef: "opaque:runtime-preview",
        relativePath: "index.html",
        mediaType: "text/html",
        sha256: "0".repeat(64),
        sizeBytes: htmlBytes.byteLength,
        bytes: htmlBytes,
      },
    }),
    /preview_hash_mismatch/,
  )
  const runtimeRefBytes = new TextEncoder().encode(
    "<!doctype html><html><!-- sprite-worktree:private --></html>",
  )
  await assert.rejects(
    store.materializePreview({
      preview: {
        sourceRef: "opaque:runtime-preview",
        relativePath: "index.html",
        mediaType: "text/html",
        sha256: createHash("sha256").update(runtimeRefBytes).digest("hex"),
        sizeBytes: runtimeRefBytes.byteLength,
        bytes: runtimeRefBytes,
      },
    }),
    /preview_contains_runtime_ref/,
  )
  passed("Site staging rejects wrong hashes and embedded runtime refs")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  let runtimeCalls = 0
  const runtime: BuildRuntimeClientV1 = {
    run: async (job) => {
      runtimeCalls += 1
      return candidateReport(job)
    },
  }
  const join = createBuildJobServerJoinV1({
    repository,
    runtime,
    artifactTransfer: RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1,
    previewStore: new InlineSiteCandidatePreviewStoreV1(),
    successCommitter: new MemoryAcceptedCandidateCommitterV1(repository),
    now,
  })
  assert.deepEqual(join.capability, {
    runtimeConfigured: true,
    artifactTransferConfigured: false,
    dispatchReady: false,
    blockedReason: "runtime_artifact_protocol_missing",
  })
  const response = await createBuildJobV1(
    request("artifact-protocol-missing"),
    principal,
    { ...join.dependencies, createId: () => "artifact-protocol-missing" },
  )
  assert.equal(runtimeCalls, 0)
  assert.equal(response.httpStatus, 503)
  assert.equal(response.record?.result?.status, "failed")
  assert.match(
    response.record?.result?.status === "failed" ? response.record.result.message : "",
    /protokoll för artefaktbytes saknas/,
  )
  assert.equal(JSON.stringify(response).includes("previewRef"), false)
  passed("missing artifact protocol blocks runtime dispatch and product success")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  let runtimeCalls = 0
  const join = createBuildJobServerJoinV1({
    repository,
    runtime: {
      run: async (job) => {
        runtimeCalls += 1
        return candidateReport(job)
      },
    },
    artifactTransfer: RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1,
    previewStore: new InlineSiteCandidatePreviewStoreV1(),
    successCommitter: new MemoryAcceptedCandidateCommitterV1(repository),
    now,
  })
  assert.deepEqual(join.capability, {
    runtimeConfigured: true,
    artifactTransferConfigured: false,
    dispatchReady: false,
    blockedReason: "runtime_artifact_capability_unavailable",
  })
  const response = await createBuildJobV1(
    request("artifact-capability-unavailable"),
    principal,
    { ...join.dependencies, createId: () => "artifact-capability-unavailable" },
  )
  assert.equal(runtimeCalls, 0)
  assert.equal(response.httpStatus, 503)
  assert.equal(response.record?.result?.status, "failed")
  assert.match(
    response.record?.result?.status === "failed"
      ? response.record.result.message
      : "",
    /ArtifactReadV1 inte annonserades som aktivt/,
  )
  passed("unhealthy or unadvertised ArtifactReadV1 blocks runtime dispatch")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  repository.addProjectRevision(principal, "project:one", "revision:base")
  let artifactReads = 0
  const artifactReader: CandidateArtifactReaderV1 = {
    readPreviewArtifact: async ({ sourceRef }) => {
      artifactReads += 1
      return {
        sourceRef,
        relativePath: "index.html",
        mediaType: "text/html",
        sha256: htmlSha256,
        sizeBytes: htmlBytes.byteLength,
        bytes: htmlBytes,
      }
    },
  }
  const join = createBuildJobServerJoinV1({
    repository,
    runtime: { run: async (job) => candidateReport(job) },
    artifactTransfer: { kind: "available", reader: artifactReader },
    previewStore: new InlineSiteCandidatePreviewStoreV1({
      createId: () => "33333333-3333-4333-8333-333333333333",
    }),
    successCommitter: new MemoryAcceptedCandidateCommitterV1(repository),
    now,
  })
  assert.equal(join.capability.dispatchReady, true)
  const response = await createBuildJobV1(
    request("complete-private-join"),
    principal,
    { ...join.dependencies, createId: () => "complete-private-join" },
  )
  assert.equal(artifactReads, 1)
  assert.equal(response.httpStatus, 201)
  assert.equal(response.record?.status, "succeeded")
  assert.equal(response.record?.result?.status, "succeeded")
  assert.equal(
    response.record?.result?.status === "succeeded" && response.record.result.previewRef,
    previewRef,
  )
  passed("an explicitly injected byte reader completes the deterministic private join")
}

{
  const repository = new MemoryBuildJobRepositoryV1()
  const join = createBuildJobServerJoinV1({
    repository,
    runtime: null,
    artifactTransfer: {
      kind: "available",
      reader: {
        readPreviewArtifact: async () => {
          throw new Error("not_called")
        },
      },
    },
    previewStore: new InlineSiteCandidatePreviewStoreV1(),
    successCommitter: new MemoryAcceptedCandidateCommitterV1(repository),
  })
  assert.equal(join.capability.dispatchReady, false)
  assert.equal(join.capability.blockedReason, "runtime_unconfigured")
  assert.equal(join.dependencies.acceptance, null)
  passed("artifact capability alone cannot bypass missing signed runtime")
}

{
  const route = readFileSync(
    new URL("../app/api/siteagent/build-jobs/route.ts", import.meta.url),
    "utf8",
  )
  assert.match(route, /createBuildJobServerJoinV1/)
  assert.match(route, /PostgresSiteVersionRepositoryV1/)
  assert.match(route, /InlineSiteCandidatePreviewStoreV1/)
  assert.match(route, /createRuntimeArtifactReaderFromEnvV1/)
  assert.match(route, /await artifactReader\.isRuntimeReady\(\)/)
  assert.match(route, /RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1/)
  assert.doesNotMatch(route, /RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*RUNTIME/)
  passed("production route opens the server-only reader only after strict runtime health")
}

console.log(`Build-job server join: PASS (${assertions.length} assertions)`)
for (const name of assertions) console.log(`- ${name}`)
