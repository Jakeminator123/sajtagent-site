import type { BuilderEntryParams } from "../supabase/auth-paths.ts"
import type { AgentEventProjectionV1 } from "./agent-event-reducer.ts"

export type LandingDraft = { text: string; mode?: string }

/** A landing brief is an unsent draft, including when old chat history exists. */
export function landingDraftFromParams(params: BuilderEntryParams): LandingDraft | null {
  const text = typeof params.prompt === "string" ? params.prompt.trim() : ""
  if (!text) return null
  const mode = typeof params.mode === "string" ? params.mode : undefined
  return { text, mode }
}

export function withLandingDraft(path: string, draft: LandingDraft | null): string {
  const url = new URL(path, "https://sajtagent.invalid")
  url.searchParams.delete("prompt")
  url.searchParams.delete("mode")
  if (draft?.text.trim()) {
    url.searchParams.set("prompt", draft.text)
    if (draft.mode) url.searchParams.set("mode", draft.mode)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

/** Do not erase edited text, or a draft whose send was never accepted. */
export function draftAfterDelivery(current: string, sent: string, accepted: boolean): string {
  return accepted && current === sent ? "" : current
}

export function hasAcceptedDraftTurn(projection: AgentEventProjectionV1, sessionId: string, turnId: string): boolean {
  return projection.status !== "invalid" && projection.sessionId === sessionId &&
    Boolean(projection.turns[turnId]?.acceptedSequence > 0)
}
