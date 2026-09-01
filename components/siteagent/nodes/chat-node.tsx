"use client"

// Nod: Chat (mittenkortet).
// Motsvarar ChatInterface + MessageList i sajtmaskin.

import React, { useEffect, useRef, useState } from "react"
import { Handle, Position } from "@xyflow/react"
import { ImageIcon, Loader2, MessageSquare, Send, Sparkles, Type } from "lucide-react"
import { useBuilder } from "../builder-store"

export function ChatNode() {
  const { agentProjection, messages, isStreaming, sendMessage, sessionStatus } = useBuilder()
  const userMessages = messages.filter((message) => message.role === "user")
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const inputDisabled =
    isStreaming ||
    sessionStatus !== "ready" ||
    Boolean(agentProjection.pendingQuestion) ||
    agentProjection.status === "invalid"

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  const submit = () => {
    if (!input.trim() || inputDisabled) return
    void sendMessage(input)
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="w-[400px] rounded-lg border-2 border-blue-500/50 bg-workflow-node-bg shadow-lg flex flex-col">
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-workflow-handle !border-2 !border-workflow-handle-border"
      />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-workflow-border-subtle text-blue-600 dark:text-blue-400">
        <MessageSquare className="w-4 h-4" />
        <span className="font-mono text-sm font-medium text-workflow-text">Chat</span>
        {isStreaming && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />}
      </div>

      <div ref={listRef} className="h-[260px] overflow-y-auto p-3 flex flex-col gap-2 nowheel">
        {userMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <p className="font-mono text-sm text-workflow-text">Vad vill du fråga eller bygga?</p>
            <p className="text-xs text-workflow-text-muted leading-relaxed">
              Vanliga frågor blir svar. Sajtagent väljer byggverktyg först när det behövs.
            </p>
          </div>
        ) : (
          userMessages.map((m) => (
            <div
              key={m.id}
              className="max-w-[85%] self-end rounded-lg bg-foreground px-3 py-2 text-xs leading-relaxed text-background"
            >
              {m.content}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-workflow-border-subtle p-2 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border border-workflow-border-subtle text-workflow-text-muted opacity-40"
            title="Prompt-assist är inte ansluten ännu"
          >
            <Sparkles className="w-3 h-3" />
            Prompt-assist
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled
              className="p-1.5 rounded text-workflow-text-subtle opacity-40"
              title="Media är inte anslutet ännu"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled
              className="p-1.5 rounded text-workflow-text-subtle opacity-40"
              title="Textbilagor är inte anslutna ännu"
            >
              <Type className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={inputDisabled}
            aria-label="Meddelande till Sajtagent"
            placeholder={
              agentProjection.pendingQuestion
                ? "Svara i Sajtagent-kortet…"
                : "Skriv till Sajtagent… (Enter för att skicka)"
            }
            rows={2}
            className="flex-1 resize-none rounded-md bg-workflow-node-input border border-workflow-border-subtle px-2.5 py-2 text-xs text-workflow-text placeholder:text-workflow-text-subtle focus:outline-none focus:ring-1 focus:ring-workflow-border nodrag nowheel"
          />
          <button
            type="button"
            onClick={submit}
            disabled={inputDisabled || !input.trim()}
            className="p-2 rounded-md bg-foreground text-background disabled:opacity-40 transition-opacity duration-150"
            aria-label="Skicka"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-workflow-handle !border-2 !border-workflow-handle-border"
      />
    </div>
  )
}
