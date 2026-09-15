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
import {
  CANNED_BUILD_SUCCESS_DELTA_V1,
  PRIVATE_REASONING_BLOCKED_MESSAGE_V1,
  RUNTIME_CONTRACT_FAILED_MESSAGE_V1,
  RUNTIME_STREAM_FAILED_MESSAGE_V1,
  SHORT_BUILD_SUCCESS_STATUS_DELTA_V1,
} from "../lib/siteagent/server/agent-session-public-text.ts"
import { classifyAgentTurnModeV1 } from "../lib/siteagent/agent-turn-mode.ts"
import { agentBuildProfile } from "../lib/siteagent/server/agent-build-profile.ts"
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
  replyToQuestionId?: string
  answerSelections?: string[]
}) {
  return AgentTurnRequestV1Schema.parse({
    schemaVersion: 1,
    sessionId: input.sessionId,
    turnId: input.turnId,
    idempotencyKey: input.idempotencyKey,
    message: input.message ?? "Vad är statusen för min sajt?",
    ...(input.replyToQuestionId
      ? {
          replyToQuestionId: input.replyToQuestionId,
          answerSelections: input.answerSelections ?? ["fortsatt"],
        }
      : {}),
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
const observedAnswerReadRevisions: Array<string | undefined> = []
const answerRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    answerRuntimeCalls += 1
    observedAnswerPolicies.push(input.policy)
    observedAnswerReadRevisions.push(input.projectReadRevisionId)
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
    observedAnswerPolicies[0]?.capabilities.join(",") ===
      "conversation.respond,project.read" &&
    observedAnswerPolicies[0]?.maxToolCalls === 16,
  "a normal AgentSession turn dispatches conversation.respond and project.read without a BuildJob",
)
check(
  observedAnswerReadRevisions[0] === undefined,
  "HTML-session turns do not invent a Next CAS revision for project.read",
)
const nextSourceRevision = `revision:sha256:${"b".repeat(64)}`
let observedNextReadRevision: string | undefined
const nextReadRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    observedNextReadRevision = input.projectReadRevisionId
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000011",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000012",
      sequence: input.baseSequence + 2,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 1_000).toISOString(),
      type: "message.delta",
      payload: { messageId: "message:next-read", delta: "Jag läste app/page.tsx." },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:runtime0000000013",
      sequence: input.baseSequence + 3,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 2_000).toISOString(),
      type: "turn.completed",
      payload: { outcome: "answered" },
    }
  },
}
const nextReadRequest = request({
  sessionId: refreshed.session.sessionId,
  turnId: "turn:0000000000000014",
  idempotencyKey: "idem:next-read",
  revisionId: refreshed.session.activeBaseRevisionId,
})
const nextRead = await startAgentTurnV1(nextReadRequest, principal, {
  ...dependencies,
  runtime: nextReadRuntime,
  readAcceptedNextSourceRevisionId: async () => nextSourceRevision,
})
check(nextRead.kind === "created", "a Next-aware conversation turn can complete")
check(
  observedNextReadRevision === nextSourceRevision,
  "Site sends the accepted Next sourceRevisionId beside the HTML session revision",
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
        event.payload.delta === CANNED_BUILD_SUCCESS_DELTA_V1,
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
        event.payload.code === "runtime_unavailable" &&
        event.payload.message ===
          "Sajtagentens privata runtime är inte ansluten. Inget svar eller bygge simulerades.",
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
    privateReasoning.events.some(
      (event) =>
        event.type === "turn.failed" &&
        event.payload.message === PRIVATE_REASONING_BLOCKED_MESSAGE_V1,
    ) &&
    !JSON.stringify(privateReasoning.events).includes("private reasoning"),
  "explicit private reasoning markers fail closed before persistence",
)

const summarizedBuildRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    buildVerifiedAt = new Date(
      Date.parse(input.policy.issuedAt) + 2_000,
    ).toISOString()
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:sumbuildruntime0001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:sumbuildruntime0002",
      sequence: input.baseSequence + 2,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 500).toISOString(),
      type: "message.delta",
      payload: {
        messageId: "message:build-summary",
        delta: "Jag har uppdaterat hero och footer.",
      },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:sumbuildruntime0003",
      sequence: input.baseSequence + 3,
      occurredAt: new Date(Date.parse(input.policy.issuedAt) + 1_000).toISOString(),
      type: "tool.started",
      payload: {
        toolCallId: "tool:sumbuild0000000001",
        capability: "build.request",
        safeLabel: "Bygg sajten",
      },
    }
  },
}
const summarizedBuildRequest = request({
  sessionId: refreshed.session.sessionId,
  turnId: "turn:0000000000000015",
  idempotencyKey: "idem:summarized-build",
  revisionId: advancedAfterBuild.session.activeBaseRevisionId,
  message: "Uppdatera hero och footer.",
})
const summarizedBuild = await startAgentTurnV1(summarizedBuildRequest, principal, {
  ...dependencies,
  runtime: summarizedBuildRuntime,
  buildCoordinator,
})
check(summarizedBuild.kind === "created", "a summarized build handoff is accepted")
if (summarizedBuild.kind !== "created") throw new Error("summarized_build_missing")
const summarizedDeltas = summarizedBuild.events.filter(
  (event) => event.type === "message.delta",
)
check(
  summarizedDeltas.map((event) => event.payload.delta).join("\n") ===
    `Jag har uppdaterat hero och footer.\n${SHORT_BUILD_SUCCESS_STATUS_DELTA_V1}` &&
    !summarizedDeltas.some(
      (event) => event.payload.delta === CANNED_BUILD_SUCCESS_DELTA_V1,
    ),
  "build success keeps the Runtime summary and appends a short status",
)

const emptyAnswerRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:emptyanswer000001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:emptyanswer000002",
      sequence: input.baseSequence + 2,
      occurredAt: input.policy.issuedAt,
      type: "turn.failed",
      payload: {
        code: "openclaw_empty_answer",
        message: "OpenClaw slutförde turen utan ett visningsbart svar.",
        retryable: true,
      },
    }
  },
}
const emptyAnswer = await startAgentTurnV1(
  request({
    sessionId: refreshed.session.sessionId,
    turnId: "turn:0000000000000016",
    idempotencyKey: "idem:empty-answer",
    revisionId: (
      await repository.getSession(principal, refreshed.session.sessionId)
    )?.session.activeBaseRevisionId ?? advancedAfterBuild.session.activeBaseRevisionId,
  }),
  principal,
  { ...dependencies, runtime: emptyAnswerRuntime },
)
check(emptyAnswer.kind === "created", "an empty-answer runtime failure is persisted")
if (emptyAnswer.kind !== "created") throw new Error("empty_answer_missing")
check(
  emptyAnswer.events.some(
    (event) =>
      event.type === "turn.failed" &&
      event.payload.code === "openclaw_empty_answer" &&
      event.payload.message ===
        "Sajtagent slutförde turen utan ett visningsbart svar.",
  ),
  "runtime empty-answer failures keep a useful product reason",
)

const recoveredAnswerRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:recovered00000001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:recovered00000002",
      sequence: input.baseSequence + 2,
      occurredAt: input.policy.issuedAt,
      type: "message.delta",
      payload: {
        messageId: "message:recovered",
        delta: "Parallax är en djup-effekt när sidan rullas.",
      },
    }
  },
}
const recoveredAnswer = await startAgentTurnV1(
  request({
    sessionId: refreshed.session.sessionId,
    turnId: "turn:0000000000000017",
    idempotencyKey: "idem:recovered-answer",
    revisionId: (
      await repository.getSession(principal, refreshed.session.sessionId)
    )?.session.activeBaseRevisionId ?? advancedAfterBuild.session.activeBaseRevisionId,
    message: "kan du förklara vad parallax är?",
  }),
  principal,
  { ...dependencies, runtime: recoveredAnswerRuntime },
)
check(recoveredAnswer.kind === "created", "an unterminated answer stream is recovered")
if (recoveredAnswer.kind !== "created") throw new Error("recovered_answer_missing")
check(
  recoveredAnswer.events.map((event) => event.type).join(",") ===
    "turn.accepted,message.delta,turn.completed" &&
    recoveredAnswer.events.some(
      (event) =>
        event.type === "message.delta" &&
        event.payload.delta === "Parallax är en djup-effekt när sidan rullas.",
    ) &&
    recoveredAnswer.events.at(-1)?.type === "turn.completed" &&
    (recoveredAnswer.events.at(-1) as Extract<
      (typeof recoveredAnswer.events)[number],
      { type: "turn.completed" }
    >).payload.outcome === "answered",
  "Site closes a real assistant reply even when Runtime omits turn.completed",
)

const acceptedOnlyRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:acceptedonly00001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
  },
}
const acceptedOnly = await startAgentTurnV1(
  request({
    sessionId: refreshed.session.sessionId,
    turnId: "turn:0000000000000018",
    idempotencyKey: "idem:accepted-only",
    revisionId: (
      await repository.getSession(principal, refreshed.session.sessionId)
    )?.session.activeBaseRevisionId ?? advancedAfterBuild.session.activeBaseRevisionId,
  }),
  principal,
  { ...dependencies, runtime: acceptedOnlyRuntime },
)
check(acceptedOnly.kind === "created", "an accepted-only stream remains a persisted turn")
if (acceptedOnly.kind !== "created") throw new Error("accepted_only_missing")
check(
  acceptedOnly.events.some(
    (event) =>
      event.type === "turn.failed" &&
      event.payload.message === RUNTIME_STREAM_FAILED_MESSAGE_V1,
  ),
  "an incomplete stream without assistant text fails as a stream error",
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
    policy.capabilities.includes("project.read") &&
    policy.allowedMutationIntents.length === 0 &&
    policy.maxToolCalls === 16,
  "a coordinator-free policy remains answer-only and may read the accepted source",
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
  turnRouteSource.includes("readAcceptedNextSourceRevisionId") &&
    turnRouteSource.includes("acceptedNextSourceRevisionIdV1"),
  "the product turn route sends the accepted Next source revision for project.read",
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
      agentTurnCapabilities: ["conversation.respond", "project.read"],
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
  tenantId: principal.tenantId,
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
      agentTurnCapabilities: ["conversation.respond", "project.read"],
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
  tenantId: adapterIngress.tenantId,
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
  JSON.stringify(JSON.parse(capturedBody)) === JSON.stringify(adapterIngress) &&
    JSON.parse(capturedBody).tenantId === principal.tenantId,
  "the private POST body contains tenant, session, turn, policy and base sequence",
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
  tenantId: principal.tenantId,
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
const recoveredConversationEvents = adapterEvents.slice(0, 2)
const recoveredConversationSse = recoveredConversationEvents
  .map(
    (event) =>
      `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  )
  .join("")
const recoveredConversationFetch: typeof fetch = async (input) => {
  if (String(input).endsWith("/health")) {
    return Response.json({
      agentSessionContractVersion: 1,
      agentTurnStreamTransport: "sse",
      agentTurnStreamEnabled: true,
      agentTurnCapabilities: ["conversation.respond", "project.read"],
      artifactReadEnabled: false,
    })
  }
  return new Response(recoveredConversationSse, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
const recoveredConversationClient = new SignedAgentSessionRuntimeClientV1(
  "http://127.0.0.1:4317",
  signingKey,
  {
    fetch: recoveredConversationFetch,
    now: () => new Date(adapterNow),
    createNonce: () => "nonce:adapterrecover001",
  },
)
const receivedRecoveredConversation = []
for await (const event of recoveredConversationClient.streamTurn({
  tenantId: adapterIngress.tenantId,
  session: adapterIngress.session,
  request: adapterIngress.turn,
  policy: adapterIngress.policy,
  baseSequence: adapterIngress.baseSequence,
})) {
  receivedRecoveredConversation.push(event)
}
check(
  recoveredConversationEvents.at(-1)?.type === "message.delta" &&
    JSON.stringify(receivedRecoveredConversation) ===
      JSON.stringify(recoveredConversationEvents),
  "the signed adapter accepts a conversation stream that ends with recoverable assistant text",
)
const acceptedOnlyEvent = adapterEvents[0]
if (!acceptedOnlyEvent) throw new Error("adapter_accepted_event_missing")
const acceptedOnlySse = `id: ${acceptedOnlyEvent.sequence}\nevent: ${acceptedOnlyEvent.type}\ndata: ${JSON.stringify(acceptedOnlyEvent)}\n\n`
const acceptedOnlyFetch: typeof fetch = async (input) => {
  if (String(input).endsWith("/health")) {
    return Response.json({
      agentSessionContractVersion: 1,
      agentTurnStreamTransport: "sse",
      agentTurnStreamEnabled: true,
      agentTurnCapabilities: ["conversation.respond", "project.read"],
      artifactReadEnabled: false,
    })
  }
  return new Response(acceptedOnlySse, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
const acceptedOnlyClient = new SignedAgentSessionRuntimeClientV1(
  "http://127.0.0.1:4317",
  signingKey,
  {
    fetch: acceptedOnlyFetch,
    now: () => new Date(adapterNow),
    createNonce: () => "nonce:adapteracceptonly1",
  },
)
let acceptedOnlyRejected = false
try {
  for await (const _event of acceptedOnlyClient.streamTurn({
    tenantId: adapterIngress.tenantId,
    session: adapterIngress.session,
    request: adapterIngress.turn,
    policy: adapterIngress.policy,
    baseSequence: adapterIngress.baseSequence,
  })) {
    void _event
  }
} catch (error) {
  acceptedOnlyRejected =
    error instanceof Error &&
    error.message === "A complete turn stream must be terminal"
}
check(
  acceptedOnlyRejected,
  "the signed adapter still rejects an accepted-only stream without assistant text",
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
  ReadyAgentTurnRuntimeHealthV1Schema.safeParse({
    agentSessionContractVersion: 1,
    agentTurnStreamTransport: "sse",
    agentTurnStreamEnabled: true,
    agentTurnCapabilities: ["conversation.respond", "project.read"],
    artifactReadEnabled: false,
  }).success,
  "health can advertise project.read as the second capability",
)
check(
  ReadyAgentTurnRuntimeHealthV1Schema.safeParse({
    agentSessionContractVersion: 1,
    agentTurnStreamTransport: "sse",
    agentTurnStreamEnabled: true,
    agentTurnCapabilities: [
      "conversation.respond",
      "project.read",
      "build.request",
    ],
    artifactReadEnabled: true,
  }).success,
  "health can advertise conversation, project.read and build.request together",
)
check(
  !ReadyAgentTurnRuntimeHealthV1Schema.safeParse({
    agentSessionContractVersion: 1,
    agentTurnStreamTransport: "sse",
    agentTurnStreamEnabled: true,
    agentTurnCapabilities: ["conversation.respond", "checks.run"],
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

const doctrineRepository = new MemoryAgentSessionRepositoryV1()
doctrineRepository.addProject(principal, "project:doctrine", "revision:doctrine")
const doctrineNow = clock(Date.parse("2026-09-01T22:00:00.000Z"))
const doctrineIds = ids()
const doctrineOpened = await openAgentSessionV1(
  "project:doctrine",
  principal,
  {
    repository: doctrineRepository,
    runtime: null,
    now: doctrineNow,
    createId: doctrineIds,
    createSessionSecret: () => "doctrineABCDEFGHIJKLMNOPQRSTUVWX",
  },
)
check(doctrineOpened.kind === "opened", "doctrine fixture opens a session")
if (doctrineOpened.kind !== "opened") throw new Error("doctrine_session_open_failed")

const observedDoctrinePolicies: Array<{
  capabilities: string
  maxToolCalls: number
}> = []
let doctrineRunCalls = 0
function doctrineAnswerRuntime(prefix: string): AgentSessionRuntimeClientV1 {
  return {
    async *streamTurn(input) {
      observedDoctrinePolicies.push({
        capabilities: input.policy.capabilities.join(","),
        maxToolCalls: input.policy.maxToolCalls,
      })
      yield {
        schemaVersion: 1,
        sessionId: input.session.sessionId,
        turnId: input.request.turnId,
        eventId: `event:${prefix}accepted00001`,
        sequence: input.baseSequence + 1,
        occurredAt: input.policy.issuedAt,
        type: "turn.accepted",
        payload: { acceptedAt: input.policy.issuedAt },
      }
      yield {
        schemaVersion: 1,
        sessionId: input.session.sessionId,
        turnId: input.request.turnId,
        eventId: `event:${prefix}message0000001`,
        sequence: input.baseSequence + 2,
        occurredAt: input.policy.issuedAt,
        type: "message.delta",
        payload: { messageId: `message:${prefix}answer`, delta: "Svar utan bygge." },
      }
      yield {
        schemaVersion: 1,
        sessionId: input.session.sessionId,
        turnId: input.request.turnId,
        eventId: `event:${prefix}complete000001`,
        sequence: input.baseSequence + 3,
        occurredAt: input.policy.issuedAt,
        type: "turn.completed",
        payload: { outcome: "answered" },
      }
    },
  }
}
const doctrineCoordinator: AgentTurnBuildCoordinatorV1 = {
  async plan(input) {
    if (classifyAgentTurnModeV1(input.request) !== "build.request") return null
    return buildCoordinator.plan(input)
  },
  async run() {
    doctrineRunCalls += 1
    throw new Error("conversation_turn_must_not_run_build")
  },
}

const questionWithCoordinator = await startAgentTurnV1(
  request({
    sessionId: doctrineOpened.session.sessionId,
    turnId: "turn:doctrinequestion01",
    idempotencyKey: "idem:doctrine-question",
    revisionId: doctrineOpened.session.activeBaseRevisionId,
    message: "Vad är statusen för min sajt?",
  }),
  principal,
  {
    repository: doctrineRepository,
    runtime: doctrineAnswerRuntime("qst"),
    now: doctrineNow,
    createId: doctrineIds,
    buildCoordinator: doctrineCoordinator,
  },
)
check(
  questionWithCoordinator.kind === "created" &&
    observedDoctrinePolicies[0]?.capabilities ===
      "conversation.respond,project.read" &&
    observedDoctrinePolicies[0]?.maxToolCalls === 16 &&
    doctrineRunCalls === 0 &&
    questionWithCoordinator.events.every(
      (event) => event.type !== "tool.started" && !event.type.startsWith("build."),
    ),
  "a coordinator-backed question may read the project and never starts a BuildJob",
)

const briefWithCoordinator = await startAgentTurnV1(
  request({
    sessionId: doctrineOpened.session.sessionId,
    turnId: "turn:doctrinebrief00001",
    idempotencyKey: "idem:doctrine-brief",
    revisionId: doctrineOpened.session.activeBaseRevisionId,
    message: "hemsida med parallax, responsiv",
  }),
  principal,
  {
    repository: doctrineRepository,
    runtime: doctrineAnswerRuntime("brf"),
    now: doctrineNow,
    createId: doctrineIds,
    buildCoordinator: doctrineCoordinator,
  },
)
check(
  briefWithCoordinator.kind === "created" &&
    observedDoctrinePolicies[1]?.capabilities ===
      "conversation.respond,build.request" &&
    observedDoctrinePolicies[1]?.maxToolCalls === 1 &&
    doctrineRunCalls === 0 &&
    briefWithCoordinator.events.at(-1)?.type === "turn.completed",
  "a clear build brief authorizes build.request without minting a job unless Runtime hands off",
)

const replyWithCoordinator = await startAgentTurnV1(
  request({
    sessionId: doctrineOpened.session.sessionId,
    turnId: "turn:doctrinereply00001",
    idempotencyKey: "idem:doctrine-reply",
    revisionId: doctrineOpened.session.activeBaseRevisionId,
    message: "Blått tema",
    replyToQuestionId: "color_choice",
    answerSelections: ["Blått tema"],
  }),
  principal,
  {
    repository: doctrineRepository,
    runtime: doctrineAnswerRuntime("rpl"),
    now: doctrineNow,
    createId: doctrineIds,
    buildCoordinator: doctrineCoordinator,
  },
)
check(
  replyWithCoordinator.kind === "created" &&
    observedDoctrinePolicies[2]?.capabilities ===
      "conversation.respond,build.request" &&
    doctrineRunCalls === 0,
  "a structured question reply keeps build.request so Runtime can continue without a second confirm",
)

const afterBuildSession = await repository.getSession(
  principal,
  refreshed.session.sessionId,
)
check(afterBuildSession !== null, "the built session is still readable for an explain turn")
if (!afterBuildSession) throw new Error("explain_after_build_session_missing")
const classifyAwareCoordinator: AgentTurnBuildCoordinatorV1 = {
  async plan(input) {
    if (classifyAgentTurnModeV1(input.request) !== "build.request") return null
    return buildCoordinator.plan(input)
  },
  run(input) {
    return buildCoordinator.run(input)
  },
}
let explainCapabilities = ""
const explainRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    explainCapabilities = input.policy.capabilities.join(",")
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:explainaccepted0001",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:explainmessage00001",
      sequence: input.baseSequence + 2,
      occurredAt: input.policy.issuedAt,
      type: "message.delta",
      payload: {
        messageId: "message:explain-answer",
        delta: "Hero-texten byttes mot Välkommen.",
      },
    }
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: input.request.turnId,
      eventId: "event:explaincomplete0001",
      sequence: input.baseSequence + 3,
      occurredAt: input.policy.issuedAt,
      type: "turn.completed",
      payload: { outcome: "answered" },
    }
  },
}
const explainAfterBuild = await startAgentTurnV1(
  request({
    sessionId: afterBuildSession.session.sessionId,
    turnId: "turn:explain-after-build01",
    idempotencyKey: "idem:explain-after-build",
    revisionId: afterBuildSession.session.activeBaseRevisionId,
    message: "förklara vad som ändrats på sidan",
  }),
  principal,
  {
    ...dependencies,
    runtime: explainRuntime,
    buildCoordinator: classifyAwareCoordinator,
  },
)
check(
  explainAfterBuild.kind === "created" &&
    explainCapabilities === "conversation.respond,project.read" &&
    doctrineRunCalls === 0 &&
    explainAfterBuild.events.some(
      (event) =>
        event.type === "message.delta" &&
        event.payload.delta === "Hero-texten byttes mot Välkommen.",
    ) &&
    !explainAfterBuild.events.some(
      (event) =>
        event.type === "message.delta" &&
        (event.payload.delta === CANNED_BUILD_SUCCESS_DELTA_V1 ||
          event.payload.delta === SHORT_BUILD_SUCCESS_STATUS_DELTA_V1),
    ) &&
    explainAfterBuild.events.at(-1)?.type === "turn.completed",
  "an explain turn after a built preview stays conversation-only and never injects canned build success",
)

const mismatchRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield {
      schemaVersion: 1,
      sessionId: input.session.sessionId,
      turnId: "turn:not-the-reserved-turn",
      eventId: "event:wrongturnaccepted01",
      sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt,
      type: "turn.accepted",
      payload: { acceptedAt: input.policy.issuedAt },
    }
  },
}
const mismatchedIds = await startAgentTurnV1(
  request({
    sessionId: afterBuildSession.session.sessionId,
    turnId: "turn:runtime-id-mismatch01",
    idempotencyKey: "idem:runtime-id-mismatch",
    revisionId:
      (await repository.getSession(principal, afterBuildSession.session.sessionId))
        ?.session.activeBaseRevisionId ??
      afterBuildSession.session.activeBaseRevisionId,
    message: "Vad syns i previewn?",
  }),
  principal,
  {
    ...dependencies,
    runtime: mismatchRuntime,
    buildCoordinator: classifyAwareCoordinator,
  },
)
check(
  mismatchedIds.kind === "created" &&
    mismatchedIds.events.every((event) => event.turnId === "turn:runtime-id-mismatch01") &&
    mismatchedIds.events.some(
      (event) =>
        event.type === "turn.failed" &&
        event.payload.message === RUNTIME_CONTRACT_FAILED_MESSAGE_V1,
    ) &&
    !mismatchedIds.events.some((event) => event.type === "message.delta"),
  "runtime events stamped for another turnId fail closed as a contract error",
)


// Next chat joins the same policy-gated turn, without fabricating V1 versions.
const nextConfigForChat = {
  SITEAGENT_NEXT_ENABLED: "true", SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.example.com",
  SITEAGENT_SITE_ORIGIN: "https://site.example.com", SITEAGENT_RUNTIME_URL: "https://runtime.example.com",
  SITEAGENT_RUNTIME_SIGNING_KEY: "k".repeat(32), SITEAGENT_NEXT_VERCEL_TOKEN: "test-token",
  SITEAGENT_NEXT_VERCEL_TEAM_ID: "team-test", SITEAGENT_NEXT_VERCEL_PROJECT_ID: "prj-test",
  SITEAGENT_NEXT_VERCEL_BYPASS: "test-bypass",
}
check(agentBuildProfile(nextConfigForChat, { current: null, accepted: null }) === "next",
  "fully configured Next is selected on the server for new chat builds")
check(agentBuildProfile(nextConfigForChat, { current: null, accepted: null }, "html") === "html",
  "an explicit HTML sketch preference wins while Next is available")
check(agentBuildProfile(nextConfigForChat, { current: null, accepted: null }, "next") === "next" &&
  agentBuildProfile(nextConfigForChat, { current: null, accepted: null }, null) === "next",
  "next or unset preference keeps the current Next default")
check(agentBuildProfile({ SITEAGENT_NEXT_ENABLED: "true" }, { current: null, accepted: null }) === "html" &&
  agentBuildProfile({ ...nextConfigForChat, SITEAGENT_NEXT_ENABLED: "false" }, { current: null, accepted: null }) === "html",
  "disabled or incomplete Next configuration preserves the existing HTML lane for new projects")
const previousNextAcceptance = {
  tenantId: principal.tenantId, projectId: "project:next-chat", jobId: "job:previous-next",
  sourceRevisionId: `revision:sha256:${"a".repeat(64)}`, previewRef: "preview:previousnextabcdefghijklmnop",
  deploymentId: "dpl_previous", deploymentUrl: "https://previous.vercel.app",
  acceptedAt: "2026-09-01T19:00:00.000Z", outputSha256: "a".repeat(64), files: [],
}
check(agentBuildProfile({}, { current: null, accepted: previousNextAcceptance }) === "next",
  "flag rollback cannot silently downgrade a previously accepted Next project to HTML")
check(agentBuildProfile({}, { current: null, accepted: previousNextAcceptance, profilePreference: "html" }, "html") === "next",
  "accepted Next state stays next when the deployment gate is off, even if the owner prefers HTML")
const nextRepository = new MemoryAgentSessionRepositoryV1()
nextRepository.addProject(principal, "project:next-chat", "revision:html-base")
const nextBuildRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    for await (const value of buildRuntime.streamTurn(input)) {
      const event = value as { eventId: string; sequence: number }
      yield { ...event, eventId: `event:${input.request.turnId.slice(5)}-${event.sequence}` }
    }
  },
}
const nextDeps = {
  repository: nextRepository, runtime: nextBuildRuntime, now: clock(), createId: ids(),
  createSessionSecret: () => "NextChatABCDEFGHIJKLMNOPQRSTUVWXYZ",
}
const nextSession = await openAgentSessionV1("project:next-chat", principal, nextDeps)
if (nextSession.kind !== "opened") throw new Error("next_session_missing")
let nextRuns = 0
let nextCommitted = false
const nextCoordinator: AgentTurnBuildCoordinatorV1 = {
  async plan(input) {
    if (classifyAgentTurnModeV1(input.request) !== "build.request") return null
    const plan = await buildCoordinator.plan(input)
    return plan ? { ...plan, profile: "next" } : null
  },
  async run(input) {
    nextRuns++
    check(!!input.latestStartAt && !!input.deadlineAt, "Next runs receive policy-start and route deadlines")
    await input.onStarted?.({ job: { jobId: "job:next-chat", createdAt: buildVerifiedAt } })
    nextCommitted = true
    return {
      kind: "next", record: null, httpStatus: 201,
      nextResult: {
        schemaVersion: 2, status: "succeeded", projectId: input.plan.request.projectId,
        jobId: "job:next-chat", sourceRevisionId: `revision:sha256:${"a".repeat(64)}`,
        previewRef: "preview:nextchatabcdefghijklmnop", verifiedAt: buildVerifiedAt,
      },
    }
  },
}
const nextRequest = request({
  sessionId: nextSession.session.sessionId, turnId: "turn:next-chat-build0001",
  idempotencyKey: "idem:next-chat-build", revisionId: "revision:html-base",
  message: "Bygg en ny sida om skidåkning.",
})
const nextBuilt = await startAgentTurnV1(nextRequest, principal, { ...nextDeps, buildCoordinator: nextCoordinator })
check(nextBuilt.kind === "created", "Next chat build is accepted through the ordinary turn controller")
if (nextBuilt.kind !== "created") throw new Error("next_build_missing")
check(nextCommitted && nextBuilt.events.map(event => event.type).join(",") ===
  "turn.accepted,tool.started,build.started,tool.completed,next.preview.ready,message.delta,turn.completed",
  "Site emits Next preview and built only after accepted result, using the existing ordered stream")
check(nextBuilt.events.some(event => event.type === "tool.completed" && event.payload.receipts.length === 0),
  "Next completion does not invent V1 receipts")
check((await nextRepository.getSession(principal, nextSession.session.sessionId))?.session.activeBaseRevisionId === "revision:html-base",
  "Next acceptance never changes the V1 session base revision")
const nextReplay = await startAgentTurnV1(nextRequest, principal, { ...nextDeps, buildCoordinator: nextCoordinator })
check(nextReplay.kind === "existing" && nextRuns === 1 && JSON.stringify(nextReplay.events) === JSON.stringify(nextBuilt.events),
  "an idempotent Next turn replay reuses accepted events without another generation")
const nextStranger = await startAgentTurnV1(nextRequest, stranger, { ...nextDeps, buildCoordinator: nextCoordinator })
check(nextStranger.kind === "session_not_found" && nextRuns === 1,
  "another account cannot start or replay the owner's Next turn")

const nextAnswerRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    check(input.policy.capabilities.join(",") === "conversation.respond,project.read", "Next availability does not authorize a build for a question")
    const base = { schemaVersion: 1 as const, sessionId: input.session.sessionId, turnId: input.request.turnId, occurredAt: input.policy.issuedAt }
    yield { ...base, eventId: "event:nextansweraccepted01", sequence: input.baseSequence + 1, type: "turn.accepted", payload: { acceptedAt: input.policy.issuedAt } }
    yield { ...base, eventId: "event:nextanswermessage001", sequence: input.baseSequence + 2, type: "message.delta", payload: { messageId: "message:nextanswer", delta: "Din sida finns kvar." } }
    yield { ...base, eventId: "event:nextanswercomplete01", sequence: input.baseSequence + 3, type: "turn.completed", payload: { outcome: "answered" } }
  },
}
const nextAnswered = await startAgentTurnV1({ ...nextRequest, turnId: "turn:next-chat-answer001", idempotencyKey: "idem:next-answer", message: "Vad är statusen?" }, principal,
  { ...nextDeps, runtime: nextAnswerRuntime, buildCoordinator: nextCoordinator })
check(nextAnswered.kind === "created" && nextRuns === 1 && !nextAnswered.events.some(event => event.type === "build.started"),
  "ordinary questions remain conversation-only after a Next build")

for (const failureMode of ["before-start", "after-start", "wrong-job", "throws-after-start"] as const) {
  const coordinator: AgentTurnBuildCoordinatorV1 = {
    plan: nextCoordinator.plan,
    async run(input) {
      if (failureMode !== "before-start") await input.onStarted?.({ job: { jobId: "job:next-failing", createdAt: buildVerifiedAt } })
      if (failureMode === "throws-after-start") throw new Error("deliberate_coordinator_failure")
      if (failureMode === "wrong-job") return {
        kind: "next", record: null, httpStatus: 201,
        nextResult: { schemaVersion: 2, status: "succeeded", projectId: input.plan.request.projectId,
          jobId: "job:another", sourceRevisionId: `revision:sha256:${"b".repeat(64)}`,
          previewRef: "preview:wrongjobabcdefghijklmnop", verifiedAt: buildVerifiedAt },
      }
      return { kind: "next", record: null, httpStatus: 503, nextResult: null,
        failure: { code: "next_build_failed", retryable: true, failedAt: buildVerifiedAt } }
    },
  }
  const failedNext = await startAgentTurnV1({ ...nextRequest, turnId: `turn:next-${failureMode}-0001`, idempotencyKey: `idem:next-${failureMode}` }, principal,
    { ...nextDeps, buildCoordinator: coordinator })
  check(failedNext.kind === "created" && failedNext.events.at(-1)?.type === "turn.failed" &&
    !failedNext.events.some(event => event.type === "next.preview.ready" || event.type === "preview.ready" || event.type === "turn.completed"),
    `${failureMode}: Next failure cannot claim a preview or strand the turn after build.started`)
}
const namedSourceFailCoordinator: AgentTurnBuildCoordinatorV1 = {
  plan: nextCoordinator.plan,
  async run(input) {
    await input.onStarted?.({ job: { jobId: "job:next-source-fail", createdAt: buildVerifiedAt } })
    return {
      kind: "next", record: null, httpStatus: 502, nextResult: null,
      failure: { code: "invalid_generated_source", retryable: false, failedAt: buildVerifiedAt },
    }
  },
}
const namedSourceFail = await startAgentTurnV1({
  ...nextRequest, turnId: "turn:next-invalid-source01", idempotencyKey: "idem:next-invalid-source",
}, principal, { ...nextDeps, buildCoordinator: namedSourceFailCoordinator })
check(
  namedSourceFail.kind === "created" &&
    namedSourceFail.events.some(event =>
      event.type === "turn.failed" &&
      event.payload.code === "invalid_generated_source" &&
      event.payload.message === "Källan gick inte att använda. Beskriv sidan tydligare eller försök igen."
    ) &&
    !namedSourceFail.events.some(event => event.type === "next.preview.ready"),
  "a named next-source 4xx is shown instead of the generic preview-rejected line",
)
const allNextHistory = await nextRepository.readEvents(principal, nextSession.session.sessionId, 0)
check(allNextHistory.kind === "found" && validateAgentSessionHistoryV1(allNextHistory.events).success,
  "mixed Next success, answer and failures persist replayable session-global sequences")

const forgedNextRuntime: AgentSessionRuntimeClientV1 = {
  async *streamTurn(input) {
    yield { schemaVersion: 1, sessionId: input.session.sessionId, turnId: input.request.turnId,
      eventId: "event:forgednextaccepted01", sequence: input.baseSequence + 1,
      occurredAt: input.policy.issuedAt, type: "turn.accepted", payload: { acceptedAt: input.policy.issuedAt } }
    const ready = nextBuilt.events.find(event => event.type === "next.preview.ready")!
    yield { ...ready, sessionId: input.session.sessionId, turnId: input.request.turnId,
      eventId: "event:forgednextpreview001", sequence: input.baseSequence + 2 }
  },
}
const forgedNext = await startAgentTurnV1({ ...nextRequest, turnId: "turn:next-forged-ready001", idempotencyKey: "idem:next-forged-ready" }, principal,
  { ...nextDeps, runtime: forgedNextRuntime, buildCoordinator: nextCoordinator })
check(forgedNext.kind === "created" && forgedNext.events.at(-1)?.type === "turn.failed" &&
  !forgedNext.events.some(event => event.type === "next.preview.ready") && nextRuns === 1,
  "runtime cannot forge Site's Next acceptance event")


// Simulate a process dying after reservation, before it writes any SSE event.
const crashRepository = new MemoryAgentSessionRepositoryV1()
crashRepository.addProject(principal, "project:crash-recovery", "revision:crash-base")
const crashStart = Date.parse("2026-09-14T18:00:00.000Z")
let crashNow = crashStart
const crashDeps = {
  repository: crashRepository, runtime: null, now: () => new Date(crashNow),
  createId: ids(), createSessionSecret: () => "CrashRecoveryABCDEFGHIJKLMNOPQRST",
}
const crashSession = await openAgentSessionV1("project:crash-recovery", principal, crashDeps)
if (crashSession.kind !== "opened") throw new Error("crash_session_missing")
const crashRequest = request({ sessionId: crashSession.session.sessionId,
  turnId: "turn:crashed-before-sse01", idempotencyKey: "idem:crashed-before-sse",
  revisionId: "revision:crash-base", message: "Vad är statusen?" })
const crashReserved = await prepareAgentTurnV1(crashRequest, principal, crashDeps)
check(crashReserved.kind === "created", "a crash fixture reserves a turn without consuming its stream")
const afterCrashRequest = { ...crashRequest, turnId: "turn:new-after-crash001", idempotencyKey: "idem:new-after-crash" }
crashNow = crashStart + 899_999
check((await prepareAgentTurnV1(afterCrashRequest, principal, crashDeps)).kind === "active_turn_conflict",
  "recovery does not expire a current turn before the conservative 15-minute cutoff")
crashNow = crashStart + 900_000
await crashRepository.recoverExpiredTurn(stranger, crashRequest.sessionId, new Date(crashNow).toISOString())
const stillCrashed = await crashRepository.readEvents(principal, crashRequest.sessionId, 0)
check(stillCrashed.kind === "found" && stillCrashed.events.length === 0,
  "another account cannot recover or mutate the owner's abandoned turn")
await Promise.all([
  crashRepository.recoverExpiredTurn(principal, crashRequest.sessionId, new Date(crashNow).toISOString()),
  crashRepository.recoverExpiredTurn(principal, crashRequest.sessionId, new Date(crashNow).toISOString()),
])
const recoveredCrash = await startAgentTurnV1(crashRequest, principal, crashDeps)
check(recoveredCrash.kind === "existing" && recoveredCrash.events.map(event => event.type).join(",") === "turn.accepted,turn.failed" &&
  recoveredCrash.events.some(event => event.type === "turn.failed" && event.payload.code === "turn_interrupted"),
  "concurrent recovery appends one canonical failure; replay preserves the original idempotency key")
if (recoveredCrash.kind !== "existing") throw new Error("crash_replay_missing")
await assert.rejects(() => crashRepository.appendProgressEvents(principal, crashRequest.sessionId, crashRequest.turnId, [
  { ...recoveredCrash.events[0]!, eventId: "event:latecrashcompletion01", sequence: 3 },
]), /agent_turn_terminal/)
check(true, "a late worker/request cannot resurrect a recovered terminal turn")
check((await startAgentTurnV1(afterCrashRequest, principal, crashDeps)).kind === "created",
  "a new turn can proceed after process-crash recovery")
check((await crashRepository.getSession(principal, crashRequest.sessionId))?.session.activeBaseRevisionId === "revision:crash-base",
  "crash recovery preserves the accepted project/session revision")
const recoveredHistory = await crashRepository.readEvents(principal, crashRequest.sessionId, 0)
check(recoveredHistory.kind === "found" && validateAgentSessionHistoryV1(recoveredHistory.events).success,
  "recovery and the next turn preserve contiguous replayable history")

console.log(`Agent session server: ${checks} checks passed.`)
