"use client"

// Tärningssida: Siteagent (D-ID/openclaw-slot).
// Vid merge: montera dagens D-ID-embed i #siteagent-did-slot.

import React, { useState } from "react"
import { Send, Video } from "lucide-react"

const QUICK_REPLIES = [
  "Hur kan Siteagent hjälpa ett småföretag på sajten?",
  "Vad kan jag senare kundanpassa för ett specifikt företag?",
  "Hur fungerar Siteagent i studion i dag?",
]

export function AgentFace() {
  const [input, setInput] = useState("")

  return (
    <div className="flex flex-col h-full">
      <div
        id="siteagent-did-slot"
        className="h-[120px] shrink-0 bg-workflow-node-input flex flex-col items-center justify-center gap-1.5"
      >
        <Video className="w-6 h-6 text-workflow-text-subtle" />
        <span className="font-mono text-[10px] text-workflow-text-subtle">
          Videoavatar (D-ID monteras här)
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        <p className="text-xs text-workflow-text-muted leading-relaxed">
          Hej! Jag är Siteagent. Jag kan förklara hur agenten fungerar och hur du bygger vidare på
          din sajt.
        </p>
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            className="text-left rounded-lg border border-workflow-border-subtle px-2.5 py-1.5 text-[11px] text-workflow-text-muted hover:text-workflow-text hover:bg-workflow-surface-hover transition-colors duration-150 leading-relaxed"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-workflow-border-subtle p-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv ett meddelande…"
          className="flex-1 bg-workflow-node-input border border-workflow-border-subtle rounded-md px-2.5 py-1.5 text-xs text-workflow-text placeholder:text-workflow-text-subtle focus:outline-none focus:ring-1 focus:ring-workflow-border"
        />
        <button
          type="button"
          className="p-1.5 rounded-md bg-foreground text-background disabled:opacity-40"
          disabled={!input.trim()}
          aria-label="Skicka till Siteagent"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
