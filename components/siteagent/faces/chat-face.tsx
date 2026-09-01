"use client"

// V1-dialogen mellan användaren och OpenClaw. Browsern skickar fortfarande
// endast produktavsikt via Site-controllern; inga runtimehemligheter finns här.

import React, { useEffect, useRef, useState } from "react"
import { FileText, ImageIcon, Loader2, Mic, Send, Square, Type } from "lucide-react"
import { useAudioTranscription } from "@/lib/use-audio-transcription"
import { cn } from "@/lib/utils"
import { useBuilder } from "../builder-store"

export function ChatFace() {
  const { messages, isStreaming, sendMessage } = useBuilder()

  const [input, setInput] = useState("")
  const [planMode, setPlanMode] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

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
    if (!input.trim() || isStreaming) return
    void sendMessage(input, { planMode })
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
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <p className="font-mono text-sm text-workflow-text">Du ↔ OpenClaw</p>
            <p className="text-xs text-workflow-text-muted leading-relaxed">
              Beskriv vad du vill bygga. Byggvalen bredvid kompletterar ditt uppdrag.
            </p>
            <p className="font-mono text-[10px] text-workflow-text-subtle">
              Anslutningen går via Sajtagents servercontroller och stänger vid overifierat resultat.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                m.role === "user"
                  ? "self-end bg-foreground text-background"
                  : "self-start bg-workflow-node-input text-workflow-text"
              )}
            >
              {m.content || <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-workflow-border-subtle p-2 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPlanMode((v) => !v)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border transition-colors duration-150",
              planMode
                ? "bg-foreground text-background border-transparent"
                : "text-workflow-text-muted border-workflow-border-subtle hover:text-workflow-text"
            )}
            title="Planläge"
          >
            <FileText className="w-3 h-3" />
            Plan
          </button>
          <span className="font-mono text-[10px] text-workflow-text-subtle">
            OpenClaws agentpolicy styr modell och verktyg
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
            placeholder="Skriv till OpenClaw… (Enter för att skicka)"
            rows={2}
            className="flex-1 resize-none rounded-md bg-workflow-node-input border border-workflow-border-subtle px-2.5 py-2 text-xs text-workflow-text placeholder:text-workflow-text-subtle focus:outline-none focus:ring-1 focus:ring-workflow-border"
          />
          <button
            type="button"
            onClick={submit}
            disabled={isStreaming || !input.trim()}
            className="p-2 rounded-md bg-foreground text-background disabled:opacity-40 transition-opacity duration-150"
            aria-label="Skicka till OpenClaw"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
