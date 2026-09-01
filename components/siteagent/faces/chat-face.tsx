"use client"

// Användarens Chatt-kort. Här skrivs uppdraget; Sajtagent-kortet visar svaret.
// Browsern skickar endast produktavsikt via Site-controllern.

import React, { useEffect, useRef, useState } from "react"
import { ImageIcon, Loader2, Mic, Send, Square, Type } from "lucide-react"
import { useAudioTranscription } from "@/lib/use-audio-transcription"
import { cn } from "@/lib/utils"
import { useBuilder } from "../builder-store"

export function ChatFace() {
  const { agentProjection, messages, isStreaming, sendMessage, sessionStatus } = useBuilder()
  const userMessages = messages.filter((message) => message.role === "user")

  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const hasPendingQuestion = Boolean(agentProjection.pendingQuestion)
  const inputDisabled =
    isStreaming ||
    sessionStatus !== "ready" ||
    hasPendingQuestion ||
    agentProjection.status === "invalid"

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

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {userMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <p className="font-mono text-sm text-workflow-text">Ditt meddelande</p>
            <p className="text-xs text-workflow-text-muted leading-relaxed">
              Fråga vad som helst eller beskriv vad du vill bygga. Sajtagent svarar i sitt kort.
            </p>
            <p className="font-mono text-[10px] text-workflow-text-subtle">
              Byggval kan öppnas när du vill komplettera uppdraget.
            </p>
          </div>
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
      </div>

      <div className="border-t border-workflow-border-subtle p-2 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-workflow-text-subtle">
            {hasPendingQuestion
              ? "Svara på frågan i Sajtagent-kortet"
              : agentProjection.status === "invalid"
                ? "Starta en ny chatt efter integritetsfelet"
              : sessionStatus === "ready"
                ? "Sajtagentens policy styr modell och verktyg"
                : "Öppnar Sajtagent-session…"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              aria-label={isRecording ? "Stoppa inspelning" : "Spela in och transkribera"}
              aria-pressed={isRecording}
              title={isRecording ? "Stoppa inspelning" : "Spela in och transkribera"}
              className={cn(
                "flex items-center gap-1 px-1.5 py-1 rounded font-mono text-[11px] transition-colors duration-150 disabled:opacity-40",
                isRecording
                  ? "text-destructive bg-destructive/15"
                  : "text-workflow-text-subtle hover:text-workflow-text"
              )}
            >
              {isTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRecording ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  {Math.floor(recSeconds / 60)}:{(recSeconds % 60).toString().padStart(2, "0")}
                </>
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              disabled
              className="p-1.5 rounded text-workflow-text-subtle hover:text-workflow-text transition-colors duration-150"
              title="Media är inte anslutet ännu"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled
              className="p-1.5 rounded text-workflow-text-subtle hover:text-workflow-text transition-colors duration-150"
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
              hasPendingQuestion
                ? "Svara i Sajtagent-kortet…"
                : "Skriv till Sajtagent… (Enter för att skicka)"
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
