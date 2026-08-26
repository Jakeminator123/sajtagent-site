"use client"

// Flytande widget nere till höger (ersätter minimappen):
// flik 1: Siteagent (D-ID/openclaw-slot), flik 2: Karta (sajtkarta).

import React, { useState } from "react"
import { Bot, ChevronDown, Map, Send, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuilder } from "./builder-store"

const QUICK_REPLIES = [
  "Hur kan Siteagent hjälpa ett småföretag på sajten?",
  "Vad kan jag senare kundanpassa för ett specifikt företag?",
  "Hur fungerar Siteagent i studion i dag?",
]

export function AgentWidget() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"agent" | "map">("agent")
  const [input, setInput] = useState("")
  const { previewPages, previewStatus } = useBuilder()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-4 right-4 z-10 flex items-center gap-2 px-4 py-2.5 rounded-full bg-workflow-surface border border-workflow-border shadow-lg font-mono text-sm text-workflow-text hover:bg-workflow-surface-hover transition-colors duration-200"
      >
        <Bot className="w-4 h-4" />
        Siteagent
      </button>
    )
  }

  return (
    <div className="absolute bottom-4 right-4 z-10 w-[320px] rounded-xl bg-workflow-surface border border-workflow-border shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-workflow-border">
        <div className="flex items-center bg-workflow-node-input rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setTab("agent")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-xs transition-colors duration-150",
              tab === "agent" ? "bg-workflow-surface text-workflow-text shadow" : "text-workflow-text-muted"
            )}
          >
            <Bot className="w-3.5 h-3.5" /> Siteagent
          </button>
          <button
            type="button"
            onClick={() => setTab("map")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-xs transition-colors duration-150",
              tab === "map" ? "bg-workflow-surface text-workflow-text shadow" : "text-workflow-text-muted"
            )}
          >
            <Map className="w-3.5 h-3.5" /> Karta
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto p-1 rounded text-workflow-text-muted hover:text-workflow-text transition-colors duration-150"
          aria-label="Minimera"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {tab === "agent" ? (
        <div className="flex flex-col">
          {/* Monteringsslot för D-ID/openclaw-videoavataren.
              Vid merge: montera dagens D-ID-embed i denna container. */}
          <div
            id="siteagent-did-slot"
            className="h-[140px] bg-workflow-node-input flex flex-col items-center justify-center gap-1.5"
          >
            <Video className="w-6 h-6 text-workflow-text-subtle" />
            <span className="font-mono text-[10px] text-workflow-text-subtle">
              Videoavatar (D-ID monteras här)
            </span>
          </div>

          <div className="p-3 flex flex-col gap-2">
            <p className="text-xs text-workflow-text-muted leading-relaxed">
              Hej! Jag är Siteagent. Jag kan förklara hur agenten fungerar och hur du bygger vidare
              på din sajt.
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

          <div className="flex items-center gap-2 border-t border-workflow-border p-2">
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
      ) : (
        <div className="p-4 min-h-[220px]">
          {previewStatus !== "ready" || previewPages.length === 0 ? (
            <p className="text-xs text-workflow-text-subtle text-center py-12 leading-relaxed">
              Sajtkartan visas när en version har genererats.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-0">
              <div className="rounded-lg border-2 border-foreground/60 bg-workflow-node-input px-4 py-2 font-mono text-xs text-workflow-text">
                Start
              </div>
              <div className="w-px h-4 bg-workflow-border" />
              <div className="flex items-start justify-center gap-3">
                {previewPages.map((page) => (
                  <div key={page} className="flex flex-col items-center gap-0">
                    <div className="w-px h-3 bg-workflow-border" />
                    <div className="rounded-md border border-workflow-border-subtle bg-workflow-node-input px-3 py-1.5 font-mono text-[10px] text-workflow-text-muted">
                      {page}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
