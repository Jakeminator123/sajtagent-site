"use client"

// Användarens Chatt-kort. Här skrivs uppdraget; Sajtagent-kortet visar svaret.
// Browsern skickar endast produktavsikt via Site-controllern.

import React, { useEffect, useRef, useState } from "react"
import { Loader2, Mic, Send, Square } from "lucide-react"
import { useAudioTranscription } from "@/lib/use-audio-transcription"
import { cn } from "@/lib/utils"
import { CardEmpty } from "../card-states"
import { useBuilder } from "../builder-store"

export function ChatFace() {
  const { agentProjection, canSendTurn, messages, isStreaming, sendMessage, sessionStatus } =
    useBuilder()
  const userMessages = messages.filter((message) => message.role === "user")

  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const hasPendingQuestion = Boolean(agentProjection.pendingQuestion)
  const inputDisabled = !canSendTurn
  const chatState =
    agentProjection.status === "invalid" || sessionStatus === "error"
      ? "error"
      : isStreaming
        ? "streaming"
        : sessionStatus === "opening"
          ? "opening"
          : hasPendingQuestion
            ? "awaiting"
            : userMessages.length === 0
              ? "empty"
              : "ready"

  // Diktering: transkriberad text läggs till i fältet i stället för att skickas direkt,
  // så användaren kan justera innan den skickas.
  const { status: recStatus, seconds: recSeconds, toggle: toggleRecording } =
    useAudioTranscription({
      onTranscript: (text) => setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
    })
  const isRecording = recStatus === "recording"
  const isTranscribing = recStatus === "transcribing"

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

  const statusLine = hasPendingQuestion
    ? "Svara på frågan i Sajtagent-kortet"
    : sessionStatus === "error"
      ? "Sessionen kunde inte öppnas. Logga in eller prova Ny chatt."
      : agentProjection.status === "invalid"
        ? "Starta en ny chatt efter integritetsfelet"
        : sessionStatus === "opening"
          ? "Öppnar Sajtagent-session…"
          : isStreaming
            ? "Sajtagent svarar i sitt kort…"
            : "Skriv här. Svaret syns till höger."

  return (
    <div className="flex h-full flex-col" data-card-state={chatState}>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {userMessages.length === 0 ? (
          <CardEmpty tone="idle" title="Ditt meddelande">
            <p>
              Fråga vad som helst eller beskriv vad du vill bygga. Sajtagent svarar i sitt kort. Previewn stannar kvar.
            </p>
            <p className="mt-2 font-mono text-[10px] text-workflow-text-subtle">
              Byggval kan öppnas när du vill komplettera uppdraget.
            </p>
          </CardEmpty>
        ) : (
          userMessages.map((message) => (
            <div
              key={message.id}
              className="max-w-[90%] self-end rounded-lg bg-foreground px-3 py-2 text-xs leading-relaxed text-background"
            >
              {message.content}
            </div>
          ))
        )}
        {isStreaming ? (
          <p
            data-chat-waiting=""
            className="self-end font-mono text-[10px] text-workflow-text-subtle"
          >
            Sajtagent svarar i sitt kort…
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-workflow-border-subtle p-2">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-mono text-[10px]",
              chatState === "error" ? "text-rose-700 dark:text-rose-300" : "text-workflow-text-subtle",
            )}
          >
            {statusLine}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing || inputDisabled}
              aria-label={isRecording ? "Stoppa inspelning" : "Spela in och transkribera"}
              aria-pressed={isRecording}
              title={isRecording ? "Stoppa inspelning" : "Spela in och transkribera"}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-1 font-mono text-[11px] transition-colors duration-150 disabled:opacity-40",
                isRecording
                  ? "bg-destructive/15 text-destructive"
                  : "text-workflow-text-subtle hover:text-workflow-text",
              )}
            >
              {isTranscribing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isRecording ? (
                <>
                  <Square className="h-3 w-3 fill-current" />
                  {Math.floor(recSeconds / 60)}:{(recSeconds % 60).toString().padStart(2, "0")}
                </>
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
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
              hasPendingQuestion
                ? "Svara i Sajtagent-kortet…"
                : sessionStatus === "opening"
                  ? "Öppnar session…"
                  : sessionStatus === "error" || agentProjection.status === "invalid"
                    ? "Starta en ny chatt…"
                    : "Svaret syns i Sajtagent-kortet"
            }
            rows={2}
            className="flex-1 resize-none rounded-md bg-workflow-node-input border border-workflow-border-subtle px-2.5 py-2 text-xs text-workflow-text placeholder:text-workflow-text-subtle focus:outline-none focus:ring-1 focus:ring-workflow-border"
          />
          <button
            type="button"
            onClick={submit}
            disabled={inputDisabled || !input.trim()}
            className="p-2 rounded-md bg-foreground text-background disabled:opacity-40 transition-opacity duration-150"
            aria-label="Skicka till Sajtagent"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
