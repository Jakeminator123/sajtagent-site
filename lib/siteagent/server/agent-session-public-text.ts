import type { AgentEventV1 } from "../../../contracts/agent-session-v1.ts"

export const RAW_REASONING_MARKER_V1 =
  /<\s*\/?\s*(?:analysis|thinking|reasoning|chain[-_ ]of[-_ ]thought)\b|(?:^|\n)\s*(?:analysis|reasoning|chain[- ]of[- ]thought)\s*:/i

export const GENERIC_TURN_FAILED_MESSAGE_V1 =
  "Sajtagent kunde inte slutföra svaret."

export const RUNTIME_UNAVAILABLE_MESSAGE_V1 =
  "Sajtagentens privata runtime är inte ansluten. Inget svar eller bygge simulerades."

export const RUNTIME_INVALID_MESSAGE_V1 =
  "Sajtagentens runtime returnerade ett ogiltigt eller ofullständigt eventflöde. Inget resultat accepterades."

export const RUNTIME_STREAM_FAILED_MESSAGE_V1 =
  "Sajtagents runtime avslutade strömmen ofullständigt. Inget nytt resultat accepterades."

export const RUNTIME_CONTRACT_FAILED_MESSAGE_V1 =
  "Sajtagents runtime bröt AgentEvent-kontraktet. Inget resultat accepterades."

export const PRIVATE_REASONING_BLOCKED_MESSAGE_V1 =
  "Sajtagent stoppade ett svar som inte kunde visas."

export const CANNED_BUILD_SUCCESS_DELTA_V1 =
  "Klart — sidan är byggd och verifierad. Previewn är redo."

export const SHORT_BUILD_SUCCESS_STATUS_DELTA_V1 =
  "Previewn är verifierad och redo."

const SAFE_TURN_FAILED_BY_CODE_V1: Record<string, string> = {
  runtime_unavailable: RUNTIME_UNAVAILABLE_MESSAGE_V1,
  runtime_invalid: RUNTIME_INVALID_MESSAGE_V1,
  runtime_stream_incomplete: RUNTIME_STREAM_FAILED_MESSAGE_V1,
  runtime_contract_invalid: RUNTIME_CONTRACT_FAILED_MESSAGE_V1,
  runtime_message_private: PRIVATE_REASONING_BLOCKED_MESSAGE_V1,
  build_join_rejected:
    "Bygget kunde inte slutföras. Ingen preview accepterades.",
  openclaw_empty_answer:
    "Sajtagent slutförde turen utan ett visningsbart svar.",
  openclaw_run_timeout: "Sajtagent nådde tidsgränsen för den här turen.",
  openclaw_run_cancelled: "Sajtagent avbröt den här turen.",
  openclaw_run_failed: "Sajtagents runtime misslyckades med turen.",
  openclaw_run_error: "Sajtagents runtime avslutade körningen med ett fel.",
}

const STREAM_FAILURE_CODE_V1 =
  /(?:^|[._:-])(?:stream|incomplete|empty|timeout|cancelled)(?:$|[._:-])/i

const CONTRACT_FAILURE_CODE_V1 =
  /(?:^|[._:-])(?:contract|schema|invalid|mismatch|envelope)(?:$|[._:-])/i

const UNSAFE_PUBLIC_FAILURE_V1 =
  /\bat\s+\S+\s+\(|\b(?:Error|Exception|Traceback)\b|api[_-]?key|bearer\s|sk-[a-z0-9]|-----BEGIN/i

export function containsPrivateReasoningV1(text: string): boolean {
  return RAW_REASONING_MARKER_V1.test(text) || text.includes("\0")
}

export function isSafePublicFailureMessageV1(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length < 1 || trimmed.length > 240) return false
  if (containsPrivateReasoningV1(trimmed)) return false
  if (UNSAFE_PUBLIC_FAILURE_V1.test(trimmed)) return false
  return true
}

function toProductVoiceV1(message: string): string {
  return message.replace(/OpenClaw/gi, "Sajtagent")
}

export function publicTurnFailedMessageV1(input: {
  code: string
  message: string
}): string {
  if (containsPrivateReasoningV1(input.message)) {
    return GENERIC_TURN_FAILED_MESSAGE_V1
  }
  const known = SAFE_TURN_FAILED_BY_CODE_V1[input.code]
  if (known) return known
  if (STREAM_FAILURE_CODE_V1.test(input.code)) {
    return RUNTIME_STREAM_FAILED_MESSAGE_V1
  }
  if (CONTRACT_FAILURE_CODE_V1.test(input.code)) {
    return RUNTIME_CONTRACT_FAILED_MESSAGE_V1
  }
  if (isSafePublicFailureMessageV1(input.message)) {
    return toProductVoiceV1(input.message.trim())
  }
  return GENERIC_TURN_FAILED_MESSAGE_V1
}

export function publicRuntimeCatchMessageV1(error: unknown): {
  code: "runtime_unavailable" | "runtime_invalid"
  message: string
} {
  const raw = error instanceof Error ? error.message : ""
  if (raw === "runtime_unavailable") {
    return { code: "runtime_unavailable", message: RUNTIME_UNAVAILABLE_MESSAGE_V1 }
  }
  if (raw === "runtime_message_contains_private_reasoning") {
    return { code: "runtime_invalid", message: PRIVATE_REASONING_BLOCKED_MESSAGE_V1 }
  }
  if (
    raw === "runtime_event_stream_incomplete" ||
    raw === "runtime_event_stream_empty" ||
    raw === "runtime_sse_incomplete_frame" ||
    raw === "runtime_event_limit_exceeded" ||
    raw === "runtime_event_bytes_exceeded" ||
    raw === "runtime_sse_event_limit"
  ) {
    return { code: "runtime_invalid", message: RUNTIME_STREAM_FAILED_MESSAGE_V1 }
  }
  if (
    (error instanceof Error && error.name === "ZodError") ||
    raw === "runtime_event_after_terminal" ||
    raw.includes("runtime_sse_") ||
    raw.includes("AgentEvent") ||
    raw.includes("Invalid") ||
    raw.includes("must start with") ||
    raw.includes("turn stream") ||
    /(?:^|[._:-])(?:schema|contract|mismatch|invalid)(?:$|[._:-])/i.test(raw)
  ) {
    return { code: "runtime_invalid", message: RUNTIME_CONTRACT_FAILED_MESSAGE_V1 }
  }
  return { code: "runtime_invalid", message: RUNTIME_INVALID_MESSAGE_V1 }
}

export function runtimeAssistantTextV1(events: readonly AgentEventV1[]): string {
  return events
    .filter(
      (event): event is Extract<AgentEventV1, { type: "message.delta" }> =>
        event.type === "message.delta",
    )
    .map((event) => event.payload.delta)
    .join("")
    .trim()
}

export function buildSuccessAssistantDeltaV1(
  existingAssistantText: string,
): string {
  return existingAssistantText.trim().length > 0
    ? SHORT_BUILD_SUCCESS_STATUS_DELTA_V1
    : CANNED_BUILD_SUCCESS_DELTA_V1
}

export function recoverableConversationOutcomeV1(
  events: readonly AgentEventV1[],
): "answered" | "awaiting_user" | null {
  let hasMessage = false
  let hasQuestion = false
  let hasTool = false
  let hasBuild = false
  for (const event of events) {
    if (event.type === "turn.completed" || event.type === "turn.failed") {
      return null
    }
    if (event.type === "message.delta") hasMessage = true
    if (event.type === "question.requested") hasQuestion = true
    if (event.type === "tool.started") hasTool = true
    if (event.type === "build.started" || event.type === "preview.ready") {
      hasBuild = true
    }
  }
  if (hasTool || hasBuild) return null
  if (hasQuestion) return "awaiting_user"
  if (hasMessage) return "answered"
  return null
}
