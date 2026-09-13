// Delad konversationscopy för det sammanslagna Sajtagent-kortet.
// Ingen React, ingen persistens — AgentFace äger rendering.

export const CONVERSATION_WRITE_TITLE = "Skriv här"
export const CONVERSATION_WRITE_BODY = "Fråga eller beskriv sajten."
export const CONVERSATION_BUILD_CHOICES_HINT =
  "Byggval kan öppnas när du vill komplettera uppdraget."
export const CONVERSATION_BUILD_RULE =
  "Sajtagent bygger bara när en godkänd turn begär det."
export const CONVERSATION_PLACEHOLDER = "Skriv till Sajtagent…"
export const CONVERSATION_STATUS_READY = "Skriv här. Svaret syns i samma kort."
export const CONVERSATION_STATUS_STREAMING = "Sajtagent svarar…"
export const CONVERSATION_STATUS_QUESTION = "Svara på frågan i kortet"
export const CONVERSATION_QUESTION_PLACEHOLDER = "Svara på frågan i kortet…"
export const CONVERSATION_STATUS_OPENING = "Öppnar Sajtagent-session…"
export const CONVERSATION_STATUS_SESSION_ERROR =
  "Sessionen kunde inte öppnas. Logga in eller prova Ny chatt."
export const CONVERSATION_STATUS_INTEGRITY = "Ny chatt krävs efter integritetsfelet"

export const AGENT_LISTEN_TITLE = CONVERSATION_WRITE_TITLE
export const AGENT_LISTEN_BODY = CONVERSATION_BUILD_RULE

export function conversationComposerStatus(input: {
  hasPendingQuestion: boolean
  sessionStatus: "opening" | "ready" | "error"
  projectionInvalid: boolean
  isStreaming: boolean
  hasUserMessage: boolean
}): string | null {
  if (input.hasPendingQuestion) return CONVERSATION_STATUS_QUESTION
  if (input.sessionStatus === "error") return CONVERSATION_STATUS_SESSION_ERROR
  if (input.projectionInvalid) return CONVERSATION_STATUS_INTEGRITY
  if (input.sessionStatus === "opening") return CONVERSATION_STATUS_OPENING
  if (input.isStreaming) return CONVERSATION_STATUS_STREAMING
  if (!input.hasUserMessage) return null
  return CONVERSATION_STATUS_READY
}

export function conversationComposerPlaceholder(input: {
  hasPendingQuestion: boolean
  sessionStatus: "opening" | "ready" | "error"
  projectionInvalid: boolean
}): string {
  if (input.hasPendingQuestion) return CONVERSATION_QUESTION_PLACEHOLDER
  if (input.sessionStatus === "opening") return "Öppnar session…"
  if (input.sessionStatus === "error" || input.projectionInvalid) {
    return "Starta en ny chatt…"
  }
  return CONVERSATION_PLACEHOLDER
}

/** @deprecated Chat är absorberad; namnet finns kvar så äldre importer inte kraschar. */
export const CHAT_WRITE_HERE_TITLE = CONVERSATION_WRITE_TITLE
/** @deprecated Chat är absorberad. */
export const CHAT_WRITE_HERE_BODY = CONVERSATION_WRITE_BODY
/** @deprecated Chat är absorberad. */
export const CHAT_BUILD_CHOICES_HINT = CONVERSATION_BUILD_CHOICES_HINT
/** @deprecated Chat är absorberad. */
export const CHAT_ANSWER_PLACEHOLDER = CONVERSATION_PLACEHOLDER
/** @deprecated Chat är absorberad. */
export const CHAT_STATUS_READY = CONVERSATION_STATUS_READY
/** @deprecated Chat är absorberad. */
export const CHAT_STATUS_STREAMING = CONVERSATION_STATUS_STREAMING
/** @deprecated Chat är absorberad. */
export const CHAT_STATUS_QUESTION = CONVERSATION_STATUS_QUESTION
/** @deprecated Chat är absorberad. */
export const CHAT_QUESTION_PLACEHOLDER = CONVERSATION_QUESTION_PLACEHOLDER
/** @deprecated Chat är absorberad. */
export const CHAT_STATUS_OPENING = CONVERSATION_STATUS_OPENING
/** @deprecated Chat är absorberad. */
export const CHAT_STATUS_SESSION_ERROR = CONVERSATION_STATUS_SESSION_ERROR
/** @deprecated Chat är absorberad. */
export const CHAT_STATUS_INTEGRITY = CONVERSATION_STATUS_INTEGRITY
