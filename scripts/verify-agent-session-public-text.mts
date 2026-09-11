import assert from "node:assert/strict"

import type { AgentEventV1 } from "../contracts/agent-session-v1.ts"
import {
  CANNED_BUILD_SUCCESS_DELTA_V1,
  GENERIC_TURN_FAILED_MESSAGE_V1,
  PRIVATE_REASONING_BLOCKED_MESSAGE_V1,
  RUNTIME_CONTRACT_FAILED_MESSAGE_V1,
  RUNTIME_STREAM_FAILED_MESSAGE_V1,
  SHORT_BUILD_SUCCESS_STATUS_DELTA_V1,
  buildSuccessAssistantDeltaV1,
  containsPrivateReasoningV1,
  publicRuntimeCatchMessageV1,
  publicTurnFailedMessageV1,
  recoverableConversationOutcomeV1,
  runtimeAssistantTextV1,
} from "../lib/siteagent/server/agent-session-public-text.ts"

let checks = 0
function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message)
  checks += 1
}

check(
  containsPrivateReasoningV1("<analysis>hemlig plan</analysis>publikt"),
  "analysis markup is private reasoning",
)
check(
  containsPrivateReasoningV1("reasoning: step one"),
  "reasoning: prefix is private reasoning",
)
check(!containsPrivateReasoningV1("Sidan är klar."), "plain assistant text is public")

check(
  publicTurnFailedMessageV1({
    code: "openclaw_empty_answer",
    message: "OpenClaw slutförde turen utan ett visningsbart svar.",
  }) === "Sajtagent slutförde turen utan ett visningsbart svar.",
  "known empty-answer code keeps a useful product message",
)
check(
  publicTurnFailedMessageV1({
    code: "openclaw_run_timeout",
    message: "OpenClaw-körningen nådde sin turpolicydeadline.",
  }) === "Sajtagent nådde tidsgränsen för den här turen.",
  "timeout is distinguished from the generic fail-closed line",
)
check(
  publicTurnFailedMessageV1({
    code: "runtime_stream_incomplete",
    message: "whatever",
  }) === RUNTIME_STREAM_FAILED_MESSAGE_V1,
  "stream codes surface the stream failure, not the generic line",
)
check(
  publicTurnFailedMessageV1({
    code: "agent_event_schema_mismatch",
    message: "whatever",
  }) === RUNTIME_CONTRACT_FAILED_MESSAGE_V1,
  "contract-like codes surface the contract failure",
)
check(
  publicTurnFailedMessageV1({
    code: "openclaw_run_failed",
    message: "<analysis>private</analysis>",
  }) === GENERIC_TURN_FAILED_MESSAGE_V1,
  "RAW_REASONING_MARKER still blocks a known-code payload",
)
check(
  publicTurnFailedMessageV1({
    code: "custom_safe",
    message: "Modellen svarade inte i tid.",
  }) === "Modellen svarade inte i tid.",
  "a short safe runtime message is kept",
)
check(
  publicTurnFailedMessageV1({
    code: "custom_safe",
    message: "OpenClaw avbröts av operatören.",
  }) === "Sajtagent avbröts av operatören.",
  "safe OpenClaw wording is rewritten to the product persona",
)
check(
  publicTurnFailedMessageV1({
    code: "stack",
    message: "Error: boom\n    at runTurn (src/openclaw-gateway.ts:12:3)",
  }) === GENERIC_TURN_FAILED_MESSAGE_V1,
  "stack traces stay generic",
)

check(
  publicRuntimeCatchMessageV1(new Error("runtime_event_stream_incomplete"))
    .message === RUNTIME_STREAM_FAILED_MESSAGE_V1,
  "incomplete streams are classified as stream failures",
)
check(
  publicRuntimeCatchMessageV1(new Error("runtime_message_contains_private_reasoning"))
    .message === PRIVATE_REASONING_BLOCKED_MESSAGE_V1,
  "private reasoning in a delta is classified without leaking the text",
)
check(
  publicRuntimeCatchMessageV1(new Error("A turn stream must start with turn.accepted"))
    .message === RUNTIME_CONTRACT_FAILED_MESSAGE_V1,
  "contract validation errors are distinguished from generic invalid",
)

check(
  buildSuccessAssistantDeltaV1("") === CANNED_BUILD_SUCCESS_DELTA_V1,
  "empty build turns still fall back to the canned success line",
)
check(
  buildSuccessAssistantDeltaV1("Jag har byggt startsidan med hero.") ===
    SHORT_BUILD_SUCCESS_STATUS_DELTA_V1,
  "existing OpenClaw summary gets a short status instead of the canned wipe",
)

const accepted: AgentEventV1 = {
  schemaVersion: 1,
  sessionId: "session:abcdefghijklmnopqrstuvwxyzABCDEF",
  turnId: "turn:1234567890abcdef",
  eventId: "event:accepted00000001",
  sequence: 1,
  occurredAt: "2026-09-01T19:00:00.000Z",
  type: "turn.accepted",
  payload: { acceptedAt: "2026-09-01T19:00:00.000Z" },
}
const delta: AgentEventV1 = {
  ...accepted,
  eventId: "event:message000000001",
  sequence: 2,
  type: "message.delta",
  payload: { messageId: "message:one", delta: "Här är förklaringen." },
}
const question: AgentEventV1 = {
  ...accepted,
  eventId: "event:question00000001",
  sequence: 2,
  type: "question.requested",
  payload: {
    questionId: "site_style",
    header: "Stil",
    question: "Vilken stil?",
    options: [{ label: "Minimal" }],
  },
}
const tool: AgentEventV1 = {
  ...accepted,
  eventId: "event:toolstarted00001",
  sequence: 3,
  type: "tool.started",
  payload: {
    toolCallId: "tool:build",
    capability: "build.request",
    safeLabel: "Bygger",
  },
}

check(
  runtimeAssistantTextV1([accepted, delta]) === "Här är förklaringen.",
  "assistant text is joined from runtime message.delta events",
)
check(
  recoverableConversationOutcomeV1([accepted, delta]) === "answered",
  "an answer without a terminal recovers as answered",
)
check(
  recoverableConversationOutcomeV1([accepted, question]) === "awaiting_user",
  "a structured question without a terminal recovers as awaiting_user",
)
check(
  recoverableConversationOutcomeV1([accepted, delta, tool]) === null,
  "an open tool is not recovered as a conversation terminal",
)
check(
  recoverableConversationOutcomeV1([accepted]) === null,
  "accepted-only streams stay incomplete",
)

console.log(`Agent session public text: ${checks} checks passed.`)
