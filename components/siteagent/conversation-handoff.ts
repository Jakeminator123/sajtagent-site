// Delad Chat ↔ Sajtagent-copy och kompakt-layout.
// Ingen React, ingen persistens — FaceCard/ChatFace äger rendering.

export const CHAT_WRITE_HERE_TITLE = "Skriv här"
export const CHAT_WRITE_HERE_BODY = "Fråga eller beskriv sajten."
export const CHAT_BUILD_CHOICES_HINT =
  "Byggval kan öppnas när du vill komplettera uppdraget."
export const CHAT_ANSWER_PLACEHOLDER = "Svaret syns i Sajtagent-kortet"
export const CHAT_STATUS_READY = "Skriv här. Svaret syns i Sajtagent-kortet."
export const CHAT_STATUS_STREAMING = "Sajtagent svarar i sitt kort…"
export const CHAT_STATUS_QUESTION = "Svara på frågan i Sajtagent-kortet"
export const CHAT_QUESTION_PLACEHOLDER = "Svara i Sajtagent-kortet…"
export const CHAT_STATUS_OPENING = "Öppnar Sajtagent-session…"
export const CHAT_STATUS_SESSION_ERROR =
  "Sessionen kunde inte öppnas. Logga in eller prova Ny chatt."
export const CHAT_STATUS_INTEGRITY = "Starta en ny chatt efter integritetsfelet"

export const AGENT_LISTEN_TITLE = "Sajtagent lyssnar"
export const AGENT_LISTEN_BODY =
  "Skriv i Chatt-kortet. Sajtagent bygger bara när en godkänd turn begär det."

/** Composer + senaste användarbubblan + header. Sparad höjd skrivs inte över. */
export const COMPACT_CHAT_HEIGHT = 216

export function isChatComposerCompact(state: {
  isStreaming: boolean
  hasPendingQuestion: boolean
}): boolean {
  return state.isStreaming || state.hasPendingQuestion
}

export function chatDisplayHeight(savedHeight: number, compact: boolean): number {
  if (!compact) return savedHeight
  return Math.min(savedHeight, COMPACT_CHAT_HEIGHT)
}
