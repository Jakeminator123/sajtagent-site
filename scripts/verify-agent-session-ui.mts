import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type {
  AgentEventV1,
  AgentSessionV1,
  AgentTurnRequestV1,
} from "../contracts/agent-session-v1.ts"
import {
  consumeAgentEventStreamV1,
  openAgentSessionV1,
  resumeAgentEventsV1,
  sendAgentTurnV1,
  type SiteagentFetchV1,
} from "../lib/siteagent/adapter.ts"
import {
  createAgentEventProjectionV1,
  isActiveAgentTurnTerminalV1,
  reduceAgentEventV1,
  reduceAgentEventsV1,
} from "../lib/siteagent/agent-event-reducer.ts"
import {
  reconcileAgentPreviewV1,
  type CanonicalProjectReadModelV1,
} from "../lib/siteagent/read-model.ts"

const occurredAt = "2026-09-01T19:00:00.000Z"
const sessionId = "session:abcdefghijklmnopqrstuvwxyzABCDEF"
const turnId = "turn:1234567890abcdef"
const secondTurnId = "turn:abcdef1234567890"

function event<T extends AgentEventV1>(value: T): T {
  return value
}

function eventBase(eventId: string, sequence: number) {
  return {
    schemaVersion: 1 as const,
    sessionId,
    turnId,
    eventId,
    sequence,
    occurredAt,
  }
}

const answerEvents: AgentEventV1[] = [
  event({
    schemaVersion: 1,
    sessionId,
    turnId,
    eventId: "event:accepted00000001",
    sequence: 1,
    occurredAt,
    type: "turn.accepted",
    payload: { acceptedAt: occurredAt },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId,
    eventId: "event:thinking00000001",
    sequence: 2,
    occurredAt,
    type: "agent.status",
    payload: { state: "thinking", label: "Tänker" },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId,
    eventId: "event:message000000001",
    sequence: 3,
    occurredAt,
    type: "message.delta",
    payload: { messageId: "message:one", delta: "Klockan " },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId,
    eventId: "event:message000000002",
    sequence: 4,
    occurredAt,
    type: "message.delta",
    payload: { messageId: "message:one", delta: "är tolv." },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId,
    eventId: "event:completed0000001",
    sequence: 5,
    occurredAt,
    type: "turn.completed",
    payload: { outcome: "answered" },
  }),
]

const answered = reduceAgentEventsV1(
  createAgentEventProjectionV1(sessionId),
  answerEvents,
)
assert.equal(answered.status, "idle")
assert.equal(answered.lastSequence, 5)
assert.equal(answered.messages["message:one"]?.content, "Klockan är tolv.")
assert.equal(isActiveAgentTurnTerminalV1(answered), true)

const exactReplay = reduceAgentEventV1(answered, answerEvents[2])
assert.strictEqual(exactReplay, answered, "exact event replay must be deduplicated")

const throughMessage = reduceAgentEventsV1(
  createAgentEventProjectionV1(sessionId),
  answerEvents.slice(0, 3),
)
const conflictingReplay = reduceAgentEventV1(throughMessage, {
  ...answerEvents[2],
  payload: { messageId: "message:one", delta: "Annat" },
})
assert.equal(conflictingReplay.status, "invalid")
assert.match(conflictingReplay.error ?? "", /annat innehåll/)

const duplicateEventId = reduceAgentEventV1(throughMessage, {
  ...answerEvents[3],
  eventId: answerEvents[2]?.eventId ?? "event:message000000001",
})
assert.equal(duplicateEventId.status, "invalid")
assert.match(duplicateEventId.error ?? "", /eventId/)

const gap = reduceAgentEventV1(createAgentEventProjectionV1(sessionId), answerEvents[1])
assert.equal(gap.status, "invalid")
assert.match(gap.error ?? "", /sekvensgap/)

const readToolThenBuild = reduceAgentEventsV1(
  createAgentEventProjectionV1(sessionId),
  [
    answerEvents[0],
    {
      ...eventBase("event:readtoolstarted01", 2),
      type: "tool.started" as const,
      payload: {
        toolCallId: "tool:read",
        capability: "project.read" as const,
        safeLabel: "Läser projektet",
      },
    },
    {
      ...eventBase("event:wrongbuildstart1", 3),
      type: "build.started" as const,
      payload: {
        jobId: "job:not-authorized",
        toolCallId: "tool:read",
        intentType: "site.create" as const,
      },
    },
  ],
)
assert.equal(readToolThenBuild.status, "invalid")
assert.match(readToolThenBuild.error ?? "", /build-verktyg/)

const afterTerminal = reduceAgentEventV1(answered, {
  ...answerEvents[1],
  eventId: "event:afterterminal001",
  sequence: 6,
})
assert.equal(afterTerminal.status, "invalid")
assert.match(afterTerminal.error ?? "", /terminal status/)

const questionEvents: AgentEventV1[] = [
  event({
    schemaVersion: 1,
    sessionId,
    turnId: secondTurnId,
    eventId: "event:accepted00000002",
    sequence: 6,
    occurredAt,
    type: "turn.accepted",
    payload: { acceptedAt: occurredAt },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId: secondTurnId,
    eventId: "event:question00000001",
    sequence: 7,
    occurredAt,
    type: "question.requested",
    payload: {
      questionId: "site_style",
      header: "Stil",
      question: "Vilken stil vill du ha?",
      options: [
        { label: "Minimal", description: "Luftigt och enkelt" },
        { label: "Lekfull" },
      ],
      multiSelect: false,
      isOther: true,
    },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId: secondTurnId,
    eventId: "event:completed0000002",
    sequence: 8,
    occurredAt,
    type: "turn.completed",
    payload: { outcome: "awaiting_user" },
  }),
]
const awaiting = reduceAgentEventsV1(answered, questionEvents)
assert.equal(awaiting.status, "awaiting_user")
assert.equal(awaiting.pendingQuestion?.questionId, "site_style")
assert.equal(awaiting.pendingQuestion?.options.length, 2)

const buildTurnId = "turn:fedcba0987654321"
const previewResult = {
  schemaVersion: 1 as const,
  status: "succeeded" as const,
  jobId: "job:verified",
  baseRevisionId: "revision:base",
  workspaceRevisionId: "revision:verified",
  versionId: "version:1",
  previewRef: "preview:abcdefghijklmnop",
  sitemapRevision: "sitemap:verified",
  verifiedAt: occurredAt,
}
const buildEvents: AgentEventV1[] = [
  event({
    schemaVersion: 1,
    sessionId,
    turnId: buildTurnId,
    eventId: "event:buildaccepted001",
    sequence: 1,
    occurredAt,
    type: "turn.accepted",
    payload: { acceptedAt: occurredAt },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId: buildTurnId,
    eventId: "event:toolstarted00001",
    sequence: 2,
    occurredAt,
    type: "tool.started",
    payload: {
      toolCallId: "tool:build",
      capability: "build.request",
      safeLabel: "Bygger startsidan",
    },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId: buildTurnId,
    eventId: "event:buildstarted0001",
    sequence: 3,
    occurredAt,
    type: "build.started",
    payload: {
      jobId: previewResult.jobId,
      toolCallId: "tool:build",
      intentType: "site.create",
    },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId: buildTurnId,
    eventId: "event:toolcomplete0001",
    sequence: 4,
    occurredAt,
    type: "tool.completed",
    payload: {
      toolCallId: "tool:build",
      status: "passed",
      receipts: [],
      artifacts: [],
    },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId: buildTurnId,
    eventId: "event:previewready0001",
    sequence: 5,
    occurredAt,
    type: "preview.ready",
    payload: { jobId: previewResult.jobId, result: previewResult },
  }),
  event({
    schemaVersion: 1,
    sessionId,
    turnId: buildTurnId,
    eventId: "event:buildcomplete001",
    sequence: 6,
    occurredAt,
    type: "turn.completed",
    payload: { outcome: "built" },
  }),
]
const built = reduceAgentEventsV1(
  createAgentEventProjectionV1(sessionId),
  buildEvents,
)
assert.equal(built.status, "idle")
assert.deepEqual(built.canonicalPreviewCandidate, previewResult)
assert.equal(built.tools["tool:build"]?.safeLabel, "Bygger startsidan")

const canonicalReadModel: CanonicalProjectReadModelV1 = {
  project: {
    projectId: "project:default",
    name: "Min sajt",
    activeRevisionId: previewResult.workspaceRevisionId,
    updatedAt: occurredAt,
    activeVersion: {
      versionId: previewResult.versionId,
      projectId: "project:default",
      workspaceRevisionId: previewResult.workspaceRevisionId,
      previewRef: previewResult.previewRef,
      sitemapRevision: previewResult.sitemapRevision,
      versionNumber: 1,
      sha256: "a".repeat(64),
      sizeBytes: 1024,
      verifiedAt: previewResult.verifiedAt,
      createdAt: occurredAt,
    },
  },
  versions: [],
}
canonicalReadModel.versions = [canonicalReadModel.project.activeVersion!]
assert.equal(
  reconcileAgentPreviewV1(previewResult, canonicalReadModel)?.versionId,
  previewResult.versionId,
)
assert.equal(
  reconcileAgentPreviewV1(
    { ...previewResult, previewRef: "preview:qrstuvwxyzABCDEF" },
    canonicalReadModel,
  ),
  null,
)

const session: AgentSessionV1 = {
  schemaVersion: 1,
  sessionId,
  projectId: "project:default",
  activeBaseRevisionId: "revision:base",
  status: "active",
  createdAt: occurredAt,
  updatedAt: occurredAt,
}
const request: AgentTurnRequestV1 = {
  schemaVersion: 1,
  sessionId,
  turnId,
  idempotencyKey: "browser:turn-one",
  message: "Vad är klockan?",
  uiContext: { selectedBaseRevisionId: "revision:base" },
}

function sseResponse(events: readonly AgentEventV1[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const payload = events
        .map(
          (item) =>
            `id: ${item.eventId}\r\nevent: ${item.type}\r\ndata: ${JSON.stringify(item)}\r\n\r\n`,
        )
        .join("")
      const midpoint = Math.floor(payload.length / 2)
      controller.enqueue(encoder.encode(payload.slice(0, midpoint)))
      controller.enqueue(encoder.encode(payload.slice(midpoint)))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  })
}

const sessionRequests: Array<{ url: string; init?: RequestInit }> = []
const sessionFetch: SiteagentFetchV1 = async (input, init) => {
  sessionRequests.push({ url: String(input), init })
  return Response.json(session)
}
assert.deepEqual(await openAgentSessionV1(session.projectId, undefined, sessionFetch), session)
assert.equal(
  sessionRequests[0]?.url,
  "/api/siteagent/projects/project%3Adefault/sessions",
)
assert.equal(sessionRequests[0]?.init?.method, "POST")
await assert.rejects(
  () =>
    openAgentSessionV1(
      session.projectId,
      undefined,
      async () => Response.json({ ...session, status: "closed" }),
    ),
  /kunde inte öppnas/,
)

const turnRequests: Array<{ url: string; init?: RequestInit }> = []
const turnFetch: SiteagentFetchV1 = async (input, init) => {
  turnRequests.push({ url: String(input), init })
  return sseResponse(answerEvents)
}
const streamed: AgentEventV1[] = []
const streamResult = await sendAgentTurnV1(
  request,
  (item) => {
    streamed.push(item)
  },
  { fetchImpl: turnFetch },
)
assert.equal(streamResult.eventCount, answerEvents.length)
assert.deepEqual(streamed, answerEvents)
assert.equal(
  turnRequests[0]?.url,
  `/api/siteagent/sessions/${encodeURIComponent(sessionId)}/turns`,
)
assert.equal(turnRequests[0]?.init?.method, "POST")
assert.deepEqual(JSON.parse(String(turnRequests[0]?.init?.body)), request)

const resumeRequests: string[] = []
const resumeFetch: SiteagentFetchV1 = async (input) => {
  resumeRequests.push(String(input))
  return sseResponse(answerEvents.slice(3))
}
const resumed: AgentEventV1[] = []
await resumeAgentEventsV1(sessionId, 3, (item) => {
  resumed.push(item)
}, {
  fetchImpl: resumeFetch,
})
assert.deepEqual(resumed, answerEvents.slice(3))
assert.equal(
  resumeRequests[0],
  `/api/siteagent/sessions/${encodeURIComponent(sessionId)}/events?afterSequence=3`,
)

await assert.rejects(
  () =>
    consumeAgentEventStreamV1(
      Response.json({ events: answerEvents }),
      () => undefined,
    ),
  /eventström/,
)

const adapterSource = readFileSync(resolve(process.cwd(), "lib/siteagent/adapter.ts"), "utf8")
const storeSource = readFileSync(resolve(process.cwd(), "components/siteagent/builder-store.tsx"), "utf8")
const agentFaceSource = readFileSync(resolve(process.cwd(), "components/siteagent/faces/agent-face.tsx"), "utf8")
const previewSource = readFileSync(resolve(process.cwd(), "components/siteagent/preview-stage.tsx"), "utf8")

for (const source of [adapterSource, storeSource]) {
  assert.doesNotMatch(source, /submitBuildIntent/)
  assert.doesNotMatch(source, /\/api\/siteagent\/build-jobs/)
}
for (const source of [adapterSource, storeSource, previewSource]) {
  assert.doesNotMatch(source, /srcDoc/)
}
assert.match(adapterSource, /\/sessions\/\$\{encodeURIComponent\(request\.sessionId\)\}\/turns/)
assert.match(adapterSource, /\/events\?afterSequence=/)
assert.match(storeSource, /replyToQuestionId/)
assert.match(storeSource, /answerSelections/)
assert.match(storeSource, /reconcileAgentPreviewV1/)
assert.match(agentFaceSource, /ReactMarkdown/)
assert.match(agentFaceSource, /option\.description/)
assert.match(agentFaceSource, /tool\.safeLabel/)
assert.match(agentFaceSource, /role="alert"/)

console.log(
  "Agent session UI: PASS (global sequence, terminal turns, SSE resume, questions, canonical preview)",
)
