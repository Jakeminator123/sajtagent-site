export const NEW_DRAFT_TRIGGER_LABEL = "Ny…"
export const NEW_DRAFT_TRIGGER_ARIA_LABEL = "Ny chatt eller nytt projekt"
export const NEW_CHAT_LABEL = "Ny chatt"
export const NEW_PROJECT_LABEL = "Nytt projekt"
export const NEW_PROJECT_CONFIRM_TITLE = "Skapa nytt projekt"
export const NEW_PROJECT_CONFIRM_DESCRIPTION =
  "Ett separat projekt skapas. Dina tidigare projekt, versioner och previews finns kvar."
export const NEW_PROJECT_CONFIRM_CANCEL = "Avbryt"
export const NEW_PROJECT_CONFIRM_ACTION = "Skapa projekt"

export const NEW_DRAFT_INTENTS = ["new-chat", "new-project"] as const
export type NewDraftIntent = (typeof NEW_DRAFT_INTENTS)[number]

export function newDraftResetsProject(_intent: NewDraftIntent): boolean {
  return false
}
