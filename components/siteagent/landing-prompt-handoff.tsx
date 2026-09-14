"use client"

import { useBuilder } from "./builder-store"

/** A brief stays editable and unsent even after restoring an existing chat. */
export function LandingPromptHandoff() {
  const { landingDraft, projectName, sessionStatus } = useBuilder()
  if (!landingDraft) return null
  return (
    <p className="rounded-md border border-workflow-border-subtle bg-workflow-node-input px-2.5 py-2 text-[11px] leading-relaxed text-workflow-text-muted" role="status">
      Din beskrivning är inte skickad. {sessionStatus === "ready" && projectName
        ? <>Den skickas till <strong>{projectName}</strong>. Välj ett annat projekt eller Nytt projekt i menyn om det gäller en annan sajt.</>
        : "Den finns kvar medan projektet öppnas."}
    </p>
  )
}
