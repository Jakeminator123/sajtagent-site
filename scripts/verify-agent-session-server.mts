import assert from "node:assert/strict"
import { createHmac } from "node:crypto"

import {
  AgentTurnRequestV1Schema,
  validateAgentEventBatchV1,
  validateAgentSessionHistoryV1,
} from "../contracts/agent-session-v1.ts"
import {
  mintDefaultAgentTurnPolicyV1,
  openAgentSessionV1,
  startAgentTurnV1,
} from "../lib/siteagent/server/agent-session-controller.ts"
import { MemoryAgentSessionRepositoryV1 } from "../lib/siteagent/server/agent-session-repository.ts"
import {
  ReadyAgentTurnRuntimeHealthV1Schema,
  SignedAgentSessionRuntimeClientV1,
  resolveAgentSessionRuntimeConfigurationV1,
  type AgentSessionRuntimeClientV1,
  type RuntimeAgentTurnIngressV1,
} from "../lib/siteagent/server/agent-session-runtime-client.ts"
import { agentEventsSseResponseV1 } from "../lib/siteagent/server/agent-session-sse.ts"
import type { BuildPrincipalV1 } from "../lib/siteagent/server/build-job-input.ts"
import { runtimeSignaturePayloadV1 } from "../lib/siteagent/server/runtime-protocol-v1.ts"

let checks = 0
function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message)
  checks += 1
}

function clock(start = Date.parse("2026-09-01T19:00:00.000Z")): () => Date {
  let tick = 0
  return () => new Date(start + tick++ * 1_000)
}

function ids(): () => string {
  let id = 0
  return () => `local-${String(++id).padStart(16, "0")}`
}

function request(input: {
  sessionId: string
  turnId: string
  idempotencyKey: string
  revisionId: string
  message?: string
}) {
  return AgentTurnRequestV1Schema.parse({
    schemaVersion: 1,
    sessionId: input.sessionId,
    turnId: input.turnId,
    idempotencyKey: input.idempotencyKey,
    message: input.message ?? "Vad är statusen för min sajt?",
    uiContext: {
      selectedBaseRevisionId: input.revisionId,
      mode: "freeform",
    },
  })
}

const principal: BuildPrincipalV1 = {
  userId: "77777777-7777-4777-8777-777777777777",
  tenantId: "personal:77777777-7777-4777-8777-777777777777",
}
const stranger: BuildPrincipalV1 = {
  userId: "88888888-8888-4888-8888-888888888888",
  tenantId: "personal:88888888-8888-4888-8888-888888888888",
}
const repository = new MemoryAgentSessionRepositoryV1()
repository.addProject(principal, "project:session-test", "revision:initial")
const now = clock()
const createId = ids()
const dependencies = {
  repository,
  runtime: null,
  now,
  createId,
  createSessionSecret: () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
}

const opened = await openAgentSessionV1(
  "project:session-test",
  principal,
  dependencies,
)
check(opened.kind === "opened", "an owned project opens a session")
if (opened.kind !== "opened") throw new Error("session_open_failed")
check(
  opened.session.sessionId ===
    "session:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
  "Site mints the high-entropy public session id",
)

const reopened = await openAgentSessionV1(
  "project:session-test",
  principal,
  dependencies,
)
check(
  reopened.kind === "opened" &&
    reopened.session.sessionId === opened.session.sessionId,
  "opening the project reuses its active Site session",
)

const firstRequest = request({
  sessionId: opened.session.sessionId,
  turnId: "turn:0000000000000001",
  idempotencyKey: "idem:first",
  revisionId: opened.session.activeBaseRevisionId,
})
const first = await startAgentTurnV1(firstRequest, principal, dependencies)
check(first.kind === "created", "a first turn is accepted")
if (first.kind !== "created") throw new Error("first_turn_failed")
check(
  first.events.map((event) => event.type).join(",") ===
    "turn.accepted,turn.failed",
  "a disconnected runtime fails closed without a simulated reply",
)
check(
  first.events[0]?.sequence === 1 && first.events[1]?.sequence === 2,
  "the first turn receives a contiguous session-global sequence",
)

const replay = await startAgentTurnV1(firstRequest, principal, dependencies)
check(replay.kind === "existing", "an exact idempotent replay reuses the turn")
if (replay.kind !== "existing") throw new Error("idempotent_replay_failed")
check(
  JSON.stringify(replay.events) === JSON.stringify(first.events),
  "an idempotent replay never dispatches or appends events again",
)

const conflicting = await startAgentTurnV1(
  { ...firstRequest, message: "Annat innehåll" },
  principal,
  dependencies,
)
check(
  conflicting.kind === "idempotency_conflict",
  "changed content with the same idempotency key is rejected",
)

const secondRequest = request({
  sessionId: opened.session.sessionId,
  turnId: "turn:0000000000000002",
  idempotencyKey: "idem:second",
  revisionId: opened.session.activeBaseRevisionId,
})
const second = await startAgentTurnV1(secondRequest, principal, dependencies)
check(second.kind === "created", "a terminal first turn allows a second turn")
if (second.kind !== "created") throw new Error("second_turn_failed")
check(
  second.events[0]?.sequence === 3 && second.events[1]?.sequence === 4,
  "sequence continues across turns in the same session",
)

const suffix = await repository.readEvents(
  principal,
  opened.session.sessionId,
  2,
)
check(suffix.kind === "found", "resume reads the persisted suffix")
if (suffix.kind !== "found") throw new Error("resume_failed")
check(
  validateAgentEventBatchV1(suffix.events, {
    afterSequence: 2,
    expectedSessionId: opened.session.sessionId,
  }).success,
  "resume suffix passes the authoritative batch validator",
)
check(
  (await repository.readEvents(stranger, opened.session.sessionId, 0)).kind ===
    "session_not_found",
  "a different principal cannot discover the session",
)
check(
  (await repository.readEvents(principal, opened.session.sessionId, 99)).kind ===
    "invalid_cursor",
  "a cursor after the persisted sequence is rejected",
)

repository.setProjectRevision(
  principal,
  "project:session-test",
  "revision:refreshed",
)
const stale = await startAgentTurnV1(
  request({
    sessionId: opened.session.sessionId,
    turnId: "turn:0000000000000003",
    idempotencyKey: "idem:stale",
    revisionId: "revision:initial",
  }),
  principal,
  dependencies,
)
check(stale.kind === "stale_revision", "a changed project revision stops a stale turn")

const refreshed = await openAgentSessionV1(
  "project:session-test",
  principal,
  dependencies,
)
check(
  refreshed.kind === "opened" &&
    refreshed.session.activeBaseRevisionId === "revision:refreshed",
  "an idle continuous session refreshes to the project's active revision",
)
if (refreshed.kind !== "opened") throw new Error("session_refresh_failed")

let answerRuntimeCalls = 0
const observedAnswerPolicies: RuntimeAgentTurnIngressV1["policy"][] = []
const answerRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    answerRuntimeCalls += 1
    observedAnswerPolicies.push(input.policy)
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000002",
      sequence: input.baseSequence + 2,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 1_000).toISOString(),
      type: "message.delta",
      payload: { messageId: "message:answer", delta: "Allt ser bra ut." },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000003",
      sequence: input.baseSequence + 3,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 2_000).toISOString(),
      type: "turn.completed",
      payload: { outcome: "answered" },
    }
  },
}
const answerRequest = request({
  sessionId: refreshed.session.sessionId,
  turnId: "turn:0000000000000004",
  idempotencyKey: "idem:answer",
  revisionId: refreshed.session.activeBaseRevisionId,
})
const answered = await startAgentTurnV1(answerRequest, principal, {
  ...dependencies,
  runtime: answerRuntime,
})
check(answered.kind === "created", "an injected runtime can complete an answer turn")
if (answered.kind !== "created") throw new Error("answer_turn_failed")
check(
  answered.events.slice(-2).map((event) => event.type).join(",") ===
    "message.delta,turn.completed",
  "only sanitized runtime drafts become Site-owned events",
)
check(
  answerRuntimeCalls === 1 &&
    observedAnswerPolicies[0]?.capabilities.join(",") === "conversation.respond" &&
    observedAnswerPolicies[0]?.maxToolCalls === 0,
  "a normal AgentSession turn dispatches only conversation.respond with zero tool calls",
)
check(
  answered.events.every(
    (event) =>
      event.type !== "tool.started" &&
      !event.type.startsWith("build."),
  ),
  "a normal AgentSession answer produces zero build dispatch events",
)

const invalidRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:invalid0000000001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.completed",
      payload: { outcome: "answered" },
    }
  },
}
const invalidRequest = request({
  sessionId: refreshed.session.sessionId,
  turnId: "turn:0000000000000005",
  idempotencyKey: "idem:invalid-runtime",
  revisionId: refreshed.session.activeBaseRevisionId,
})
const invalid = await startAgentTurnV1(invalidRequest, principal, {
  ...dependencies,
  runtime: invalidRuntime,
})
check(invalid.kind === "created", "runtime protocol failure remains a persisted turn")
if (invalid.kind !== "created") throw new Error("invalid_runtime_turn_failed")
check(
  invalid.events.map((event) => event.type).join(",") ===
    "turn.accepted,turn.failed",
  "invalid runtime output is discarded before a safe terminal failure",
)

const allEvents = await repository.readEvents(
  principal,
  refreshed.session.sessionId,
  0,
)
check(allEvents.kind === "found", "the complete session history can be read")
if (allEvents.kind !== "found") throw new Error("history_read_failed")
check(
  validateAgentSessionHistoryV1(allEvents.events).success,
  "the complete multi-turn history passes the session validator",
)

const policy = mintDefaultAgentTurnPolicyV1({
  session: refreshed.session,
  request: answerRequest,
  issuedAt: "2026-09-01T20:00:00.000Z",
})
check(
  !policy.capabilities.includes("build.request") &&
    policy.allowedMutationIntents.length === 0 &&
    policy.maxToolCalls === 0,
  "the initial route policy is answer-only until the mandate join exists",
)
check(
  !AgentTurnRequestV1Schema.safeParse({
    ...answerRequest,
    capabilities: ["build.request"],
    policy: { maxToolCalls: 999 },
  }).success,
  "the strict browser request cannot inject capabilities or policy",
)

const sseText = await agentEventsSseResponseV1(answered.events).text()
check(
  sseText.includes(`id: ${answered.events[0]?.eventId}`) &&
    sseText.includes(`data: ${JSON.stringify(answered.events[0])}`),
  "SSE frames contain the raw AgentEventV1 without an authority envelope",
)

const adapterIssuedAt = "2026-09-01T20:00:00.000Z"
const adapterNow = "2026-09-01T20:00:01.000Z"
const adapterPolicy = mintDefaultAgentTurnPolicyV1({
  session: refreshed.session,
  request: answerRequest,
  issuedAt: adapterIssuedAt,
})
const adapterIngress: RuntimeAgentTurnIngressV1 = {
  schemaVersion: 1,
  session: refreshed.session,
  turn: answerRequest,
  policy: adapterPolicy,
  baseSequence: 10,
}
const adapterEvents = [
  {
    schemaVersion: 1 as const,
    sessionId: refreshed.session.sessionId,
    turnId: answerRequest.turnId,
    eventId: "event:adapter0000000001",
    sequence: 11,
    occurredAt: adapterNow,
    type: "turn.accepted" as const,
    payload: { acceptedAt: adapterNow },
  },
  {
    schemaVersion: 1 as const,
    sessionId: refreshed.session.sessionId,
    turnId: answerRequest.turnId,
    eventId: "event:adapter0000000002",
    sequence: 12,
    occurredAt: "2026-09-01T20:00:02.000Z",
    type: "message.delta" as const,
    payload: { messageId: "message:adapter", delta: "Signerad SSE." },
  },
  {
    schemaVersion: 1 as const,
    sessionId: refreshed.session.sessionId,
    turnId: answerRequest.turnId,
    eventId: "event:adapter0000000003",
    sequence: 13,
    occurredAt: "2026-09-01T20:00:03.000Z",
    type: "turn.completed" as const,
    payload: { outcome: "answered" as const },
  },
]
const privateSse = adapterEvents
  .map(
    (event) =>
      `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  )
  .join("")
let capturedBody = ""
let capturedHeaders = new Headers()
const signingKey = "siteagent-test-signing-key-32-bytes-minimum"
const nonce = "nonce:adapter00000001"
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input)
  if (url.endsWith("/health")) {
    return Response.json({
      agentSessionContractVersion: 1,
      agentTurnStreamTransport: "sse",
      agentTurnStreamEnabled: true,
      agentTurnCapabilities: ["conversation.respond"],
      artifactReadEnabled: false,
    })
  }
  capturedBody = typeof init?.body === "string" ? init.body : ""
  capturedHeaders = new Headers(init?.headers)
  return new Response(privateSse, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  })
}
const signedClient = new SignedAgentSessionRuntimeClientV1(
  "http://127.0.0.1:4317",
  signingKey,
  {
    fetch: fakeFetch,
    now: () => new Date(adapterNow),
    createNonce: () => nonce,
  },
)
const receivedEvents = []
for await (const event of signedClient.streamTurn({
  session: adapterIngress.session,
  request: adapterIngress.turn,
  policy: adapterIngress.policy,
  baseSequence: adapterIngress.baseSequence,
})) {
  receivedEvents.push(event)
}
check(
  JSON.stringify(receivedEvents) === JSON.stringify(adapterEvents),
  "the signed adapter validates and returns the complete runtime event stream",
)
check(
  JSON.stringify(JSON.parse(capturedBody)) === JSON.stringify(adapterIngress),
  "the private POST body contains only session, turn, policy and base sequence",
)
const expectedSignature = createHmac("sha256", signingKey)
  .update(
    runtimeSignaturePayloadV1(
      "POST",
      "/v1/agent-turns",
      adapterNow,
      nonce,
      capturedBody,
    ),
  )
  .digest("hex")
check(
  capturedHeaders.get("x-siteagent-signature") === expectedSignature &&
    capturedHeaders.get("x-siteagent-timestamp") === adapterNow &&
    capturedHeaders.get("x-siteagent-nonce") === nonce,
  "the adapter signs the exact UTF-8 body with the ratified canonical payload",
)
check(
  [false, true].every((artifactReadEnabled) =>
    ReadyAgentTurnRuntimeHealthV1Schema.safeParse({
      agentSessionContractVersion: 1,
      agentTurnStreamTransport: "sse",
      agentTurnStreamEnabled: true,
      agentTurnCapabilities: ["conversation.respond"],
      artifactReadEnabled,
    }).success,
  ),
  "conversation ingress remains valid with ArtifactReadV1 disabled or enabled",
)
check(
  !ReadyAgentTurnRuntimeHealthV1Schema.safeParse({
    agentSessionContractVersion: 1,
    agentTurnStreamTransport: "sse",
    agentTurnStreamEnabled: true,
    agentTurnCapabilities: ["conversation.respond", "project.read"],
    artifactReadEnabled: false,
  }).success,
  "health fails closed when runtime advertises an unratified capability",
)
check(
  resolveAgentSessionRuntimeConfigurationV1({
    SITEAGENT_RUNTIME_URL: "https://runtime.test",
  }) === null,
  "partial runtime configuration stays disconnected",
)
assert.throws(
  () =>
    new SignedAgentSessionRuntimeClientV1(
      "http://runtime.example.test",
      signingKey,
    ),
  /HTTPS or loopback/,
)
checks += 1

const activeRepository = new MemoryAgentSessionRepositoryV1()
activeRepository.addProject(principal, "project:active-turn", "revision:active")
const activeOpened = await openAgentSessionV1(
  "project:active-turn",
  principal,
  {
    repository: activeRepository,
    runtime: null,
    now: clock(Date.parse("2026-09-01T21:00:00.000Z")),
    createId: ids(),
    createSessionSecret: () => "0123456789abcdefghijklmnopqrstuv",
  },
)
if (activeOpened.kind !== "opened") throw new Error("active_session_open_failed")
const activeRequest = request({
  sessionId: activeOpened.session.sessionId,
  turnId: "turn:1000000000000001",
  idempotencyKey: "idem:running",
  revisionId: activeOpened.session.activeBaseRevisionId,
})
const issuedAt = "2026-09-01T21:00:01.000Z"
const activeCreated = await activeRepository.reserveTurn(principal, {
  request: activeRequest,
  requestHash: "a".repeat(64),
  policy: mintDefaultAgentTurnPolicyV1({
    session: activeOpened.session,
    request: activeRequest,
    issuedAt,
  }),
  createdAt: issuedAt,
})
check(activeCreated.kind === "created", "the focused repository accepts one running turn")
const competingRequest = request({
  sessionId: activeOpened.session.sessionId,
  turnId: "turn:1000000000000002",
  idempotencyKey: "idem:competing",
  revisionId: activeOpened.session.activeBaseRevisionId,
})
const competing = await activeRepository.reserveTurn(principal, {
  request: competingRequest,
  requestHash: "b".repeat(64),
  policy: mintDefaultAgentTurnPolicyV1({
    session: activeOpened.session,
    request: competingRequest,
    issuedAt,
  }),
  createdAt: issuedAt,
})
check(
  competing.kind === "active_turn_conflict",
  "the repository permits only one active turn per session",
)

console.log(`Agent session server: ${checks} checks passed.`)
