"use client"

// Tärningssida: Blocks. Klick skickar follow-up i chatten
// (motsvarar use-registry-insert i sajtmaskin).

import React from "react"
import { useBuilder } from "../builder-store"

const BLOCKS = [
  "Hero",
  "Tjänster",
  "Omdömen",
  "Prislista",
  "FAQ",
  "Kontaktformulär",
  "Galleri",
  "Team",
  "CTA-banner",
]

export function BlocksFace() {
  const { canSendTurn, sendMessage } = useBuilder()

  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="mb-3 text-xs leading-relaxed text-workflow-text-muted">
        Ett klick skickar en follow-up till Sajtagent. Previewn stannar kvar.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {BLOCKS.map((block) => (
          <button
            key={block}
            type="button"
            disabled={!canSendTurn}
            onClick={() => void sendMessage(`Lägg till ett ${block}-block på sajten.`)}
            className="rounded-lg border border-workflow-border-subtle p-3 text-left font-mono text-xs text-workflow-text-muted transition-colors duration-150 hover:border-workflow-border hover:bg-workflow-surface-hover hover:text-workflow-text disabled:opacity-40"
          >
            {block}
          </button>
        ))}
      </div>
    </div>
  )
}
