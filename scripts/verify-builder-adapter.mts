import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  completeBuildEventStreamV1,
  createBuildEventProjectionV1,
  reduceBuildEventV1,
  reduceBuildEventsV1,
} from "../lib/siteagent/build-event-reducer.ts"
import {
  CanonicalVersionV1Schema,
  loadCanonicalProjectV1,
  reconcileBuildSuccessV1,
  toSiteVersionV1,
  type CanonicalProjectReadModelV1,
} from "../lib/siteagent/read-model.ts"

const occurredAt = "2026-09-01T12:00:00.000Z"
const jobId = "job:projection-test"
const baseRevisionId = "revision:base"
const successResult = {
  schemaVersion: 1 as const,
  status: "succeeded" as const,
  jobId,
  baseRevisionId,
  workspaceRevisionId: "revision:verified",
  versionId: "version:1",
  previewRef: "preview:verified/1",
  sitemapRevision: "sitemap:verified",
  verifiedAt: occurredAt,
  receipts: [
    {
      receiptId: "receipt:preview",
      category: "preview" as const,
      name: "preview-health",
      status: "passed" as const,
      startedAt: occurredAt,
      finishedAt: occurredAt,
    },
  ],
}

const successEvents = [
  {
    schemaVersion: 1,
    jobId,
    sequence: 1,
    occurredAt,
    type: "job.accepted",
    payload: { acceptedAt: occurredAt },
  },
  {
    schemaVersion: 1,
    jobId,
    sequence: 2,
    occurredAt,
    type: "job.running",
    payload: { phase: "build", label: "Bygger sidan" },
  },
  {
    schemaVersion: 1,
    jobId,
    sequence: 3,
    occurredAt,
    type: "message.delta",
    payload: { delta: "Jag bygger startsidan." },
  },
  {
    schemaVersion: 1,
    jobId,
    sequence: 4,
    occurredAt,
    type: "job.succeeded",
    payload: { result: successResult },
  },
]

const succeeded = reduceBuildEventsV1(createBuildEventProjectionV1(), successEvents)
assert.equal(succeeded.status, "succeeded")
assert.equal(succeeded.terminal, "succeeded")
assert.equal(succeeded.lastSequence, 4)
assert.equal(succeeded.assistantText, "Jag bygger startsidan.")
assert.deepEqual(succeeded.result, successResult)

const exactReplay = reduceBuildEventV1(succeeded, successEvents[1])
assert.strictEqual(exactReplay, succeeded, "an exact replay must be deduplicated")

const gap = reduceBuildEventV1(createBuildEventProjectionV1(), successEvents[1])
assert.equal(gap.status, "invalid")
assert.equal(gap.result, null)
assert.match(gap.error ?? "", /sekvensgap/)

const throughRunning = reduceBuildEventsV1(createBuildEventProjectionV1(), successEvents.slice(0, 2))
const conflictingReplay = reduceBuildEventV1(throughRunning, {
  ...successEvents[1],
  payload: { phase: "check", label: "Annat innehåll" },
})
assert.equal(conflictingReplay.status, "invalid")
assert.equal(conflictingReplay.result, null)
assert.match(conflictingReplay.error ?? "", /annat innehåll/)

const mixedJob = reduceBuildEventV1(throughRunning, {
  ...successEvents[2],
  jobId: "job:other",
})
assert.equal(mixedJob.status, "invalid")
assert.equal(mixedJob.result, null)
assert.match(mixedJob.error ?? "", /olika jobb/)

const afterTerminal = reduceBuildEventV1(succeeded, {
  ...successEvents[2],
  sequence: 5,
})
assert.equal(afterTerminal.status, "invalid")
assert.equal(afterTerminal.terminal, "succeeded", "terminal identity stays locked")
assert.equal(afterTerminal.result, null, "post-terminal data invalidates the ready projection")
assert.equal(afterTerminal.activity.some((activity) => activity.kind === "success"), false)

const incomplete = completeBuildEventStreamV1(throughRunning)
assert.equal(incomplete.status, "invalid")
assert.equal(incomplete.result, null)

const failedResult = {
  schemaVersion: 1 as const,
  status: "failed" as const,
  jobId,
  baseRevisionId,
  code: "runtime_unavailable" as const,
  message: "Runtime saknas.",
  retryable: true,
  failedAt: occurredAt,
  receipts: [],
}
const failed = reduceBuildEventsV1(createBuildEventProjectionV1(), [
  successEvents[0],
  {
    schemaVersion: 1,
    jobId,
    sequence: 2,
    occurredAt,
    type: "job.failed",
    payload: { result: failedResult },
  },
])
assert.equal(failed.status, "failed")
assert.equal(failed.result?.status, "failed")

const canonicalVersion = CanonicalVersionV1Schema.parse({
  versionId: successResult.versionId,
  projectId: "project:default",
  workspaceRevisionId: successResult.workspaceRevisionId,
  previewRef: successResult.previewRef,
  sitemapRevision: successResult.sitemapRevision,
  versionNumber: 1,
  sha256: "a".repeat(64),
  sizeBytes: 2048,
  verifiedAt: occurredAt,
  createdAt: occurredAt,
})
const readModel: CanonicalProjectReadModelV1 = {
  project: {
    projectId: canonicalVersion.projectId,
    name: "Min sajt",
    activeRevisionId: successResult.workspaceRevisionId,
    updatedAt: occurredAt,
    activeVersion: canonicalVersion,
  },
  versions: [canonicalVersion],
}
assert.deepEqual(reconcileBuildSuccessV1(successResult, readModel), canonicalVersion)
assert.equal(
  reconcileBuildSuccessV1(
    { ...successResult, previewRef: "preview:unconfirmed" },
    readModel,
  ),
  null,
)
assert.equal(
  CanonicalVersionV1Schema.safeParse({ ...canonicalVersion, unexpected: true }).success,
  false,
  "read-model rows must be strict",
)
assert.equal(
  toSiteVersionV1(canonicalVersion).previewUrl,
  "/api/siteagent/previews/preview%3Averified%2F1",
)

const originalFetch = globalThis.fetch
const requestedUrls: string[] = []
globalThis.fetch = async (input) => {
  const url = String(input)
  requestedUrls.push(url)
  if (url.endsWith("/state")) {
    return Response.json({ schemaVersion: 1, project: readModel.project })
  }
  return Response.json({
    schemaVersion: 1,
    projectId: canonicalVersion.projectId,
    versions: readModel.versions,
  })
}
try {
  const loaded = await loadCanonicalProjectV1(canonicalVersion.projectId)
  assert.equal(loaded.ok, true)
  assert.deepEqual(
    [...requestedUrls].sort(),
    [
      "/api/siteagent/projects/project%3Adefault/state",
      "/api/siteagent/projects/project%3Adefault/versions",
    ],
  )
} finally {
  globalThis.fetch = originalFetch
}

const adapterSource = readFileSync(resolve(process.cwd(), "lib/siteagent/adapter.ts"), "utf8")
const storeSource = readFileSync(resolve(process.cwd(), "components/siteagent/builder-store.tsx"), "utf8")
const previewSource = readFileSync(resolve(process.cwd(), "components/siteagent/preview-stage.tsx"), "utf8")
const versionListSource = readFileSync(resolve(process.cwd(), "components/siteagent/version-list.tsx"), "utf8")

for (const source of [adapterSource, storeSource, previewSource]) {
  for (const forbidden of ["/api/engine/chats/stream", "simulateStream", "srcDoc", "<!doctype html>"]) {
    assert.equal(source.includes(forbidden), false, `product projection must not contain ${forbidden}`)
  }
}
assert.doesNotMatch(adapterSource, /submitBuildIntent/)
assert.doesNotMatch(adapterSource, /\/api\/siteagent\/build-jobs/)
assert.match(adapterSource, /AgentTurnRequestV1/)
assert.match(adapterSource, /\/events\?afterSequence=/)
assert.match(storeSource, /reconcileAgentPreviewV1/)
assert.match(storeSource, /canonicalPreviewCandidate/)
assert.match(versionListSource, /Ingen version skapas före verifierad framgång/)
assert.match(previewSource, /previewStatus === "ready" && Boolean\(previewUrl\)/)

console.log("Builder projection: PASS (dedupe, sequence/terminal lock, canonical ready boundary)")
