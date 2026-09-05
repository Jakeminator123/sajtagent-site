import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  AgentTurnRequestV1Schema,
  validateAgentEventBatchV1,
  validateAgentSessionHistoryV1,
} from "../contracts/agent-session-v1.ts"
import {
  mintDefaultAgentTurnPolicyV1,
  openAgentSessionV1,
  prepareAgentTurnV1,
  startAgentTurnV1,
} from "../lib/siteagent/server/agent-session-controller.ts"
import type { AgentTurnBuildCoordinatorV1 } from "../lib/siteagent/server/agent-turn-build-join.ts"
import { MemoryAgentSessionRepositoryV1 } from "../lib/siteagent/server/agent-session-repository.ts"
import type { StoredBuildJobV1 } from "../lib/siteagent/server/build-job-repository.ts"
import {
  ReadyAgentTurnRuntimeHealthV1Schema,
  SignedAgentSessionRuntimeClientV1,
  resolveAgentSessionRuntimeConfigurationV1,
  type AgentSessionRuntimeClientV1,
  type RuntimeAgentTurnIngressV1,
} from "../lib/siteagent/server/agent-session-runtime-client.ts"
import {
  agentEventStreamSseResponseV1,
  agentEventsSseResponseV1,
} from "../lib/siteagent/server/agent-session-sse.ts"
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
check(
  (await repository.getSession(principal, opened.session.sessionId))?.session
    .activeBaseRevisionId === "revision:refreshed",
  "turn startup repairs an idle session after canonical project acceptance",
)

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
      type: "agent.status",
      payload: { state: "thinking", label: "analysis: private runtime progress" },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000003",
      sequence: input.baseSequence + 3,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 2_000).toISOString(),
      type: "message.delta",
      payload: { messageId: "message:answer", delta: "Allt ser bra ut." },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000004",
      sequence: input.baseSequence + 4,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 3_000).toISOString(),
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
  answered.events.some(
    (event) =>
      event.type === "agent.status" &&
      event.payload.label === "Sajtagent arbetar…",
  ) && !JSON.stringify(answered.events).includes("private runtime progress"),
  "runtime status labels are replaced by deterministic public progress",
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

let buildVerifiedAt = ""
let observedBuildIntent = ""
let observedBuildBaseRevision = ""
const buildCoordinator: AgentTurnBuildCoordinatorV1 = {
  async plan(input) {
    return {
      intentType: "site.change",
      request: {
        schemaVersion: 1,
        projectId: input.session.projectId,
        baseRevisionId: input.session.activeBaseRevisionId,
        idempotencyKey: `agent:${input.request.turnId.slice(5)}`,
        intent: {
          schemaVersion: 1,
          intentType: "site.change",
          message: input.request.message,
          context: {
            selectedBaseRevisionId:
              input.request.uiContext.selectedBaseRevisionId,
            mode: input.request.uiContext.mode,
          },
        },
      },
    }
  },
  async run(input) {
    observedBuildIntent = input.plan.intentType
    const createdAt = buildVerifiedAt
    const expiresAt = new Date(Date.parse(createdAt) + 10 * 60_000).toISOString()
    const receipt = {
      receiptId: "receipt:build00000001",
      category: "preview" as const,
        name: "runtime/check command details",
      status: "passed" as const,
      startedAt: createdAt,
      finishedAt: createdAt,
    }
    const job = {
      schemaVersion: 1 as const,
      jobId: "job:build000000000001",
      tenantId: principal.tenantId,
      projectId: input.plan.request.projectId,
      baseRevisionId: input.plan.request.baseRevisionId,
      idempotencyKey: input.plan.request.idempotencyKey,
      createdAt,
      expiresAt,
      intent: input.plan.request.intent,
      executionPolicy: {
        deadlineAt: expiresAt,
        maxSteps: 10,
        maxToolCalls: 10,
        maxModelTokens: 10_000,
        maxCostMicros: 10_000,
        capabilities: ["workspace.read" as const],
        network: { mode: "deny-all" as const },
        packages: { mode: "deny" as const },
      },
    }
    observedBuildBaseRevision = job.baseRevisionId
    const result = {
      schemaVersion: 1 as const,
      status: "succeeded" as const,
      jobId: job.jobId,
      baseRevisionId: job.baseRevisionId,
      workspaceRevisionId: "revision:build00000001",
      versionId: "version:build000000001",
      previewRef: "preview:build00000000001",
      sitemapRevision: "sitemap:build00000001",
      verifiedAt: buildVerifiedAt,
      receipts: [receipt],
    }
    repository.setProjectRevision(
      principal,
      input.plan.request.projectId,
      result.workspaceRevisionId,
    )
    return {
      httpStatus: 201,
      kind: "created",
      record: {
        job,
        requestHash: "c".repeat(64),
        status: "succeeded",
        result,
        workerReport: null,
        events: [],
      },
    }
  },
}
const buildRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    buildVerifiedAt = new Date(
      Date.parse(input.policy.issuedAt) + 2_000,
    ).toISOString()
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:buildruntime000001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:buildruntime000002",
      sequence: input.baseSequence + 2,
      occurredAt: new Date(
        Date.parse(input.policy.issuedAt) + 1_000,
      ).toISOString(),
      type: "tool.started",
      payload: {
        toolCallId: "tool:build000000000001",
        capability: "build.request",
        safeLabel: "siteagent_build_request internal stdout",
      },
    }
  },
}
const buildRequest = request({
  sessionId: refreshed.session.sessionId,
  turnId: "turn:0000000000000005",
  idempotencyKey: "idem:build",
  revisionId: refreshed.session.activeBaseRevisionId,
  message: "Ändra startsidan och bygg en verifierad preview.",
})
const built = await startAgentTurnV1(buildRequest, principal, {
  ...dependencies,
  runtime: buildRuntime,
  buildCoordinator,
})
check(built.kind === "created", "a typed build.request handoff creates a Site build turn")
if (built.kind !== "created") throw new Error("build_turn_failed")
check(
  built.events.map((event) => event.type).join(",") ===
    "turn.accepted,tool.started,build.started,tool.completed,preview.ready,message.delta,turn.completed",
  "Site closes the runtime handoff with a verified canonical preview sequence",
)
check(
  built.events.some(
    (event) =>
      event.type === "tool.started" &&
      event.payload.safeLabel === "Sajtagent förbereder bygget…",
  ) &&
    built.events.some(
      (event) =>
        event.type === "message.delta" &&
        event.payload.delta ===
          "Klart — sidan är byggd och verifierad. Previewn är redo.",
    ) &&
    !JSON.stringify(built.events).includes("internal stdout") &&
    !JSON.stringify(built.events).includes("runtime/check command details"),
  "build progress and final response expose only Site-owned public text",
)
check(
  built.events.at(-1)?.type === "turn.completed" &&
    (built.events.at(-1) as Extract<(typeof built.events)[number], { type: "turn.completed" }>).payload.outcome === "built" &&
    observedBuildIntent === "site.change",
  "only the singleton Site-authorized mutation intent reaches BuildJob",
)
const advancedAfterBuild = await repository.getSession(
  principal,
  refreshed.session.sessionId,
)
check(
  advancedAfterBuild?.session.activeBaseRevisionId ===
    "revision:build00000001",
  "canonical build acceptance advances the active session base atomically",
)
if (!advancedAfterBuild) throw new Error("advanced_build_session_missing")
const staleAfterBuild = await startAgentTurnV1(
  request({
    sessionId: refreshed.session.sessionId,
    turnId: "turn:0000000000000105",
    idempotencyKey: "idem:stale-after-build",
    revisionId: refreshed.session.activeBaseRevisionId,
  }),
  principal,
  dependencies,
)
check(
  staleAfterBuild.kind === "stale_revision",
  "the pre-build base is rejected immediately after canonical acceptance",
)

const failedBuildCoordinator: AgentTurnBuildCoordinatorV1 = {
  plan: buildCoordinator.plan,
  async run(input) {
    const success = await buildCoordinator.run(input)
    if (!success.record) throw new Error("missing_test_build_record")
    return {
      httpStatus: 503,
      kind: "failed",
      record: {
        ...success.record,
        status: "failed",
        result: {
          schemaVersion: 1,
          status: "failed",
          jobId: success.record.job.jobId,
          baseRevisionId: success.record.job.baseRevisionId,
          code: "runtime_unavailable",
          message: "<analysis>private runtime failure details</analysis>",
          retryable: true,
          failedAt: buildVerifiedAt,
          receipts: [],
        },
      },
    }
  },
}
const failedBuildRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    buildVerifiedAt = new Date(
      Date.parse(input.policy.issuedAt) + 2_000,
    ).toISOString()
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:failedruntime00001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:failedruntime00002",
      sequence: input.baseSequence + 2,
      occurredAt: new Date(
        Date.parse(input.policy.issuedAt) + 1_000,
      ).toISOString(),
      type: "tool.started",
      payload: {
        toolCallId: "tool:failedbuild000001",
        capability: "build.request",
        safeLabel: "Bygg sajten",
      },
    }
  },
}
const failedBuildRequest = request({
  sessionId: refreshed.session.sessionId,
  turnId: "turn:0000000000000006",
  idempotencyKey: "idem:failed-build",
  revisionId: advancedAfterBuild.session.activeBaseRevisionId,
  message: "Bygg en ny startsida.",
})
const failedBuild = await startAgentTurnV1(failedBuildRequest, principal, {
  ...dependencies,
  runtime: failedBuildRuntime,
  buildCoordinator: failedBuildCoordinator,
})
check(failedBuild.kind === "created", "a failed BuildJob still closes its AgentTurn")
if (failedBuild.kind !== "created") throw new Error("failed_build_turn_missing")
check(
  failedBuild.events.map((event) => event.type).join(",") ===
    "turn.accepted,tool.started,build.started,tool.completed,turn.failed" &&
    failedBuild.events.every((event) => event.type !== "preview.ready") &&
    failedBuild.events.some(
      (event) =>
        event.type === "turn.failed" &&
        event.payload.message ===
          "Bygget kunde inte slutföras. Ingen preview accepterades.",
    ) &&
    !JSON.stringify(failedBuild.events).includes("private runtime failure"),
  "a failed BuildJob closes the tool without minting preview.ready",
)
check(
  observedBuildBaseRevision === advancedAfterBuild.session.activeBaseRevisionId,
  "the next BuildJob in the same session uses the accepted workspace revision",
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
  turnId: "turn:0000000000000007",
  idempotencyKey: "idem:invalid-runtime",
  revisionId: advancedAfterBuild.session.activeBaseRevisionId,
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

const privateReasoningRequest = request({
  sessionId: refreshed.session.sessionId,
  turnId: "turn:0000000000000008",
  idempotencyKey: "idem:private-reasoning",
  revisionId: advancedAfterBuild.session.activeBaseRevisionId,
})
const privateReasoningRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:reasoning00000001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:reasoning00000002",
      sequence: input.baseSequence + 2,
      occurredAt: input.policy.issuedAt,
      type: "message.delta",
      payload: {
        messageId: "message:reasoning",
        delta: "<analysis>private reasoning</analysis>Publikt svar",
      },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:reasoning00000003",
      sequence: input.baseSequence + 3,
      occurredAt: input.policy.issuedAt,
      type: "turn.completed",
      payload: { outcome: "answered" },
    }
  },
}
const privateReasoning = await startAgentTurnV1(
  privateReasoningRequest,
  principal,
  { ...dependencies, runtime: privateReasoningRuntime },
)
check(
  privateReasoning.kind === "created" &&
    privateReasoning.events.map((event) => event.type).join(",") ===
      "turn.accepted,turn.failed" &&
    !JSON.stringify(privateReasoning.events).includes("private reasoning"),
  "explicit private reasoning markers fail closed before persistence",
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
  "a coordinator-free policy remains answer-only",
)
check(
  !AgentTurnRequestV1Schema.safeParse({
    ...answerRequest,
    capabilities: ["build.request"],
    policy: { maxToolCalls: 999 },
  }).success,
  "the strict browser request cannot inject capabilities or policy",
)
const turnRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/siteagent/sessions/[sessionId]/turns/route.ts"),
  "utf8",
)
const buildJoinSource = readFileSync(
  resolve(process.cwd(), "lib/siteagent/server/agent-turn-build-join.ts"),
  "utf8",
)
check(
  turnRouteSource.includes("PostgresAgentTurnBuildCoordinatorV1") &&
    turnRouteSource.includes("buildCoordinator:"),
  "the product turn route injects the server-owned BuildJob join",
)
check(
  buildJoinSource.startsWith('import "server-only"') &&
    !buildJoinSource.includes("NEXT_PUBLIC_") &&
    !turnRouteSource.includes("/api/siteagent/build-jobs"),
  "the build join remains server-only with no browser-callable job route",
)

const sseText = await agentEventsSseResponseV1(answered.events).text()
check(
  sseText.includes(`id: ${answered.events[0]?.eventId}`) &&
    sseText.includes(`data: ${JSON.stringify(answered.events[0])}`),
  "SSE frames contain the raw AgentEventV1 without an authority envelope",
)

const streamingRepository = new MemoryAgentSessionRepositoryV1()
streamingRepository.addProject(
  principal,
  "project:streaming-turn",
  "revision:streaming",
)
const streamingNow = clock(Date.parse("2026-09-01T19:30:00.000Z"))
const streamingOpened = await openAgentSessionV1(
  "project:streaming-turn",
  principal,
  {
    repository: streamingRepository,
    runtime: null,
    now: streamingNow,
    createId: ids(),
    createSessionSecret: () => "streamingABCDEFGHIJKLMNOPQRSTUVWXYZ",
  },
)
if (streamingOpened.kind !== "opened") {
  throw new Error("streaming_session_open_failed")
}
const streamingRequest = request({
  sessionId: streamingOpened.session.sessionId,
  turnId: "turn:streaming00000001",
  idempotencyKey: "idem:streaming",
  revisionId: streamingOpened.session.activeBaseRevisionId,
})
const streamingEncoder = new TextEncoder()
let releaseRuntimeStream!: () => void
let runtimeStreamEnded = false
const streamingFetch: typeof fetch = async (input, init) => {
  if (String(input).endsWith("/health")) {
    return Response.json({
      agentSessionContractVersion: 1,
      agentTurnStreamTransport: "sse",
      agentTurnStreamEnabled: true,
      agentTurnCapabilities: ["conversation.respond"],
      artifactReadEnabled: false,
    })
  }
  const ingress = JSON.parse(String(init?.body)) as RuntimeAgentTurnIngressV1
  const accepted = {
    schemaVersion: 1 as const,
    sessionId: ingress.session.sessionId,
    turnId: ingress.turn.turnId,
    eventId: "event:streaming00000001",
    sequence: ingress.baseSequence + 1,
    occurredAt: ingress.policy.issuedAt,
    type: "turn.accepted" as const,
    payload: { acceptedAt: ingress.policy.issuedAt },
  }
  const message = {
    schemaVersion: 1 as const,
    sessionId: ingress.session.sessionId,
    turnId: ingress.turn.turnId,
    eventId: "event:streaming00000002",
    sequence: ingress.baseSequence + 2,
    occurredAt: new Date(Date.parse(ingress.policy.issuedAt) + 1_000).toISOString(),
    type: "message.delta" as const,
    payload: { messageId: "message:streaming", delta: "Live från Sajtagent." },
  }
  const completed = {
    schemaVersion: 1 as const,
    sessionId: ingress.session.sessionId,
    turnId: ingress.turn.turnId,
    eventId: "event:streaming00000003",
    sequence: ingress.baseSequence + 3,
    occurredAt: new Date(Date.parse(ingress.policy.issuedAt) + 2_000).toISOString(),
    type: "turn.completed" as const,
    payload: { outcome: "answered" as const },
  }
  const frame = (event: typeof accepted | typeof message | typeof completed) =>
    `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(streamingEncoder.encode(frame(accepted)))
        releaseRuntimeStream = () => {
          controller.enqueue(streamingEncoder.encode(frame(message) + frame(completed)))
          runtimeStreamEnded = true
          controller.close()
        }
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  )
}
const streamingClient = new SignedAgentSessionRuntimeClientV1(
  "http://127.0.0.1:4317",
  "streaming-siteagent-signing-key-32-bytes",
  {
    fetch: streamingFetch,
    now: () => new Date("2026-09-01T19:30:02.000Z"),
    createNonce: () => "nonce:streaming000001",
  },
)
const streamingPrepared = await prepareAgentTurnV1(
  streamingRequest,
  principal,
  {
    repository: streamingRepository,
    runtime: streamingClient,
    now: streamingNow,
    createId: ids(),
  },
)
if (streamingPrepared.kind !== "created") {
  throw new Error("streaming_turn_prepare_failed")
}
const streamingResponse = agentEventStreamSseResponseV1(
  streamingPrepared.events,
)
const streamingReader = streamingResponse.body!.getReader()
const firstStreamingChunk = await streamingReader.read()
const firstStreamingText = new TextDecoder().decode(firstStreamingChunk.value)
check(
  !firstStreamingChunk.done &&
    firstStreamingText.includes("event: turn.accepted") &&
    !runtimeStreamEnded,
  "the browser receives the first persisted SSE event before Runtime ends",
)
const persistedWhileOpen = await streamingRepository.readEvents(
  principal,
  streamingOpened.session.sessionId,
  0,
)
check(
  persistedWhileOpen.kind === "found" &&
    persistedWhileOpen.events.map((event) => event.type).join(",") ===
      "turn.accepted" &&
    !runtimeStreamEnded,
  "Site persists progress while the private Runtime stream remains open",
)
releaseRuntimeStream()
let remainingStreamingText = ""
while (true) {
  const chunk = await streamingReader.read()
  if (chunk.done) break
  remainingStreamingText += new TextDecoder().decode(chunk.value)
}
check(
  runtimeStreamEnded &&
    remainingStreamingText.includes("event: message.delta") &&
    remainingStreamingText.includes("event: turn.completed"),
  "the same response continues through the real terminal Runtime event",
)
const persistedStreamingTurn = await streamingRepository.readEvents(
  principal,
  streamingOpened.session.sessionId,
  0,
)
check(
  persistedStreamingTurn.kind === "found" &&
    persistedStreamingTurn.lastSequence === 3 &&
    persistedStreamingTurn.events.map((event) => event.type).join(",") ===
      "turn.accepted,message.delta,turn.completed",
  "two separately persisted progress batches remain contiguous before terminal closure",
)

const liveBuildRepository = new MemoryAgentSessionRepositoryV1()
liveBuildRepository.addProject(
  principal,
  "project:live-build",
  "revision:live-build",
)
const liveBuildNow = clock(Date.parse("2026-09-01T19:40:00.000Z"))
const liveBuildOpened = await openAgentSessionV1(
  "project:live-build",
  principal,
  {
    repository: liveBuildRepository,
    runtime: null,
    now: liveBuildNow,
    createId: ids(),
    createSessionSecret: () => "livebuildABCDEFGHIJKLMNOPQRSTUVWXYZ",
  },
)
if (liveBuildOpened.kind !== "opened") {
  throw new Error("live_build_session_open_failed")
}
const liveBuildRequest = request({
  sessionId: liveBuildOpened.session.sessionId,
  turnId: "turn:livebuild00000001",
  idempotencyKey: "idem:live-build",
  revisionId: liveBuildOpened.session.activeBaseRevisionId,
  message: "Bygg en ny verifierad sida.",
})
const liveBuildRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:livebuild00000001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:livebuild00000002",
      sequence: input.baseSequence + 2,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 1_000).toISOString(),
      type: "tool.started",
      payload: {
        toolCallId: "tool:livebuild00000001",
        capability: "build.request",
        safeLabel: "internal build label",
      },
    }
  },
}
let releaseBuildCoordinator!: () => void
let buildCoordinatorFinished = false
const buildCoordinatorGate = new Promise<void>((resolve) => {
  releaseBuildCoordinator = resolve
})
const liveBuildCoordinator: AgentTurnBuildCoordinatorV1 = {
  plan: buildCoordinator.plan,
  async run(input) {
    const createdAt = "2026-09-01T19:40:03.000Z"
    const job = {
      schemaVersion: 1 as const,
      jobId: "job:livebuild000000001",
      tenantId: principal.tenantId,
      projectId: input.plan.request.projectId,
      baseRevisionId: input.plan.request.baseRevisionId,
      idempotencyKey: input.plan.request.idempotencyKey,
      createdAt,
      expiresAt: "2026-09-01T19:45:03.000Z",
      intent: input.plan.request.intent,
      executionPolicy: {
        deadlineAt: "2026-09-01T19:44:03.000Z",
        maxSteps: 10,
        maxToolCalls: 10,
        maxModelTokens: 10_000,
        maxCostMicros: 10_000,
        capabilities: ["workspace.read" as const],
        network: { mode: "deny-all" as const },
        packages: { mode: "deny" as const },
      },
    }
    const acceptedRecord: StoredBuildJobV1 = {
      job,
      requestHash: "d".repeat(64),
      status: "accepted",
      result: null,
      workerReport: null,
      events: [],
    }
    await input.onStarted?.(acceptedRecord)
    await buildCoordinatorGate
    buildCoordinatorFinished = true
    const result = {
      schemaVersion: 1 as const,
      status: "failed" as const,
      jobId: job.jobId,
      baseRevisionId: job.baseRevisionId,
      code: "worker_failed" as const,
      message: "Deliberate blocked-coordinator verifier failure.",
      retryable: false,
      failedAt: "2026-09-01T19:40:04.000Z",
      receipts: [],
    }
    return {
      httpStatus: 502,
      kind: "failed" as const,
      record: { ...acceptedRecord, status: "failed" as const, result },
    }
  },
}
const liveBuildPrepared = await prepareAgentTurnV1(
  liveBuildRequest,
  principal,
  {
    repository: liveBuildRepository,
    runtime: liveBuildRuntime,
    buildCoordinator: liveBuildCoordinator,
    now: liveBuildNow,
    createId: ids(),
  },
)
if (liveBuildPrepared.kind !== "created") {
  throw new Error("live_build_turn_prepare_failed")
}
const liveBuildReader = agentEventStreamSseResponseV1(
  liveBuildPrepared.events,
).body!.getReader()
let liveBuildPrefix = ""
while (!liveBuildPrefix.includes("event: build.started")) {
  const chunk = await liveBuildReader.read()
  if (chunk.done) throw new Error("live_build_stream_closed_before_started")
  liveBuildPrefix += new TextDecoder().decode(chunk.value)
}
check(
  !buildCoordinatorFinished &&
    liveBuildPrefix.includes("event: turn.accepted") &&
    liveBuildPrefix.includes("event: tool.started") &&
    liveBuildPrefix.includes("event: build.started"),
  "build.started reaches the browser while the real coordinator run is blocked",
)
const persistedBlockedBuild = await liveBuildRepository.readEvents(
  principal,
  liveBuildOpened.session.sessionId,
  0,
)
check(
  persistedBlockedBuild.kind === "found" &&
    persistedBlockedBuild.events.map((event) => event.type).join(",") ===
      "turn.accepted,tool.started,build.started" &&
    !buildCoordinatorFinished,
  "Site persists build.started before the blocked coordinator can finish",
)
releaseBuildCoordinator()
let liveBuildTerminal = ""
while (true) {
  const chunk = await liveBuildReader.read()
  if (chunk.done) break
  liveBuildTerminal += new TextDecoder().decode(chunk.value)
}
check(
  buildCoordinatorFinished &&
    liveBuildTerminal.includes("event: tool.completed") &&
    liveBuildTerminal.includes("event: turn.failed"),
  "the same build response continues from live start to the actual terminal result",
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
const adapterBuildPlan = await buildCoordinator.plan({
  principal,
  session: refreshed.session,
  request: buildRequest,
})
const adapterBuildIssuedAt = "2026-09-01T20:05:00.000Z"
const adapterBuildNow = "2026-09-01T20:05:01.000Z"
const adapterBuildPolicy = mintDefaultAgentTurnPolicyV1({
  session: refreshed.session,
  request: buildRequest,
  issuedAt: adapterBuildIssuedAt,
  buildPlan: adapterBuildPlan,
})
const adapterBuildEvents = [
  {
    schemaVersion: 1 as const,
    sessionId: refreshed.session.sessionId,
    turnId: buildRequest.turnId,
    eventId: "event:adapterbuild000001",
    sequence: 21,
    occurredAt: adapterBuildIssuedAt,
    type: "turn.accepted" as const,
    payload: { acceptedAt: adapterBuildIssuedAt },
  },
  {
    schemaVersion: 1 as const,
    sessionId: refreshed.session.sessionId,
    turnId: buildRequest.turnId,
    eventId: "event:adapterbuild000002",
    sequence: 22,
    occurredAt: adapterBuildNow,
    type: "tool.started" as const,
    payload: {
      toolCallId: "tool:adapterbuild00001",
      capability: "build.request" as const,
      safeLabel: "Bygg sajten",
    },
  },
]
const adapterBuildSse = adapterBuildEvents
  .map(
    (event) =>
      `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  )
  .join("")
const buildFetch: typeof fetch = async (input) => {
  if (String(input).endsWith("/health")) {
    return Response.json({
      agentSessionContractVersion: 1,
      agentTurnStreamTransport: "sse",
      agentTurnStreamEnabled: true,
      agentTurnCapabilities: ["conversation.respond", "build.request"],
      artifactReadEnabled: true,
    })
  }
  return new Response(adapterBuildSse, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
const buildClient = new SignedAgentSessionRuntimeClientV1(
  "http://127.0.0.1:4317",
  signingKey,
  {
    fetch: buildFetch,
    now: () => new Date(adapterBuildNow),
    createNonce: () => "nonce:adapterbuild0001",
  },
)
const receivedBuildHandoff = []
for await (const event of buildClient.streamTurn({
  session: refreshed.session,
  request: buildRequest,
  policy: adapterBuildPolicy,
  baseSequence: 20,
})) {
  receivedBuildHandoff.push(event)
}
check(
  JSON.stringify(receivedBuildHandoff) === JSON.stringify(adapterBuildEvents),
  "the signed adapter accepts only the exact open build.request handoff",
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
  ReadyAgentTurnRuntimeHealthV1Schema.safeParse({
    agentSessionContractVersion: 1,
    agentTurnStreamTransport: "sse",
    agentTurnStreamEnabled: true,
    agentTurnCapabilities: ["conversation.respond", "build.request"],
    artifactReadEnabled: true,
  }).success,
  "health can advertise the ratified build.request handoff only as the second capability",
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
