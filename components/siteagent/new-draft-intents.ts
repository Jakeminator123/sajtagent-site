export const NEW_DRAFT_TRIGGER_LABEL = "Ny…"
export const NEW_DRAFT_TRIGGER_ARIA_LABEL = "Ny chatt eller nytt projekt"
export const NEW_CHAT_LABEL = "Ny chatt"
export const NEW_PROJECT_LABEL = "Nytt projekt"
export const NEW_PROJECT_CONFIRM_TITLE = "Nytt projekt?"
export const NEW_PROJECT_CONFIRM_DESCRIPTION =
  "Versioner och preview för det här utkastet försvinner. Fortsätt?"
export const NEW_PROJECT_CONFIRM_CANCEL = "Avbryt"
export const NEW_PROJECT_CONFIRM_ACTION = "Fortsätt"

export const NEW_DRAFT_INTENTS = ["new-chat", "new-project"] as const
export type NewDraftIntent = (typeof NEW_DRAFT_INTENTS)[number]

export function newDraftResetsProject(intent: NewDraftIntent): boolean {
  return intent === "new-project"
}
