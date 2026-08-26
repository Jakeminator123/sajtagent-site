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
  const { sendMessage, isStreaming } = useBuilder()

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2">
        {BLOCKS.map((block) => (
          <button
            key={block}
            type="button"
            disabled={isStreaming}
            onClick={() => void sendMessage(`Lägg till ett ${block}-block på sajten.`)}
            className="rounded-lg border border-workflow-border-subtle p-3 font-mono text-xs text-workflow-text-muted hover:text-workflow-text hover:border-workflow-border hover:bg-workflow-surface-hover transition-colors duration-150 disabled:opacity-40 text-left"
          >
            {block}
          </button>
        ))}
      </div>
    </div>
  )
}
