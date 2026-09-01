"use client"

// Sajtagent-kortet är OpenClaw-agentens svarsyta. Användaren skriver i det
// separata Chatt-kortet; svar och felsäkra runtimefel visas här.

import React, { useEffect, useRef } from "react"
import { Bot, Loader2, ShieldCheck, Video } from "lucide-react"
import { useBuilder } from "../builder-store"

export function AgentFace() {
  const { activeJob, isStreaming, messages } = useBuilder()
  const assistantMessages = messages.filter((message) => message.role === "assistant")
  const listRef = useRef<HTMLDivElement>(null)
  const status = activeJob?.progressLabel ?? "Väntar på uppdrag"

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  return (
    <div className="flex h-full flex-col">
      <div
        id="siteagent-did-slot"
        className="h-[72px] shrink-0 bg-workflow-node-input flex items-center justify-between gap-3 px-3"
      >
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-workflow-text-subtle" />
          <div>
            <p className="font-mono text-xs text-workflow-text">Sajtagent</p>
            <p className="text-[10px] text-workflow-text-subtle">OpenClaw-agenten</p>
          </div>
        </div>
        <span className="flex items-center gap-1 font-mono text-[10px] text-workflow-text-muted">
          <ShieldCheck className="w-3.5 h-3.5" /> Serverstyrd
        </span>
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {assistantMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <Bot className="h-6 w-6 text-rose-500" />
            <p className="font-mono text-sm text-workflow-text">{status}</p>
            <p className="text-xs leading-relaxed text-workflow-text-muted">
              Skriv i Chatt-kortet. Sajtagents svar visas här.
            </p>
          </div>
        ) : (
          assistantMessages.map((message) => (
            <div
              key={message.id}
              className="max-w-[90%] self-start rounded-lg bg-workflow-node-input px-3 py-2 text-xs leading-relaxed text-workflow-text"
            >
              {message.content || <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
          ))
        )}
      </div>
      <div
        aria-live="polite"
        className="flex items-center gap-1.5 border-t border-workflow-border-subtle px-3 py-2 font-mono text-[10px] text-workflow-text-subtle"
      >
        {isStreaming ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        {status}
      </div>
    </div>
  )
}
