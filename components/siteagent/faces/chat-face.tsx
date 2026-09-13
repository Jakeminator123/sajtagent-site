"use client"

// Användarens Chatt-kort. Här skrivs uppdraget; Sajtagent-kortet visar svaret.
// Browsern skickar endast produktavsikt via Site-controllern.

import React, { useEffect, useRef, useState } from "react"
import { Loader2, Mic, Send, Square } from "lucide-react"
import { useAudioTranscription } from "@/lib/use-audio-transcription"
import { cn } from "@/lib/utils"
import { CardEmpty } from "../card-states"
import {
  CHAT_ANSWER_PLACEHOLDER,
  CHAT_BUILD_CHOICES_HINT,
  CHAT_QUESTION_PLACEHOLDER,
  CHAT_STATUS_INTEGRITY,
  CHAT_STATUS_OPENING,
  CHAT_STATUS_QUESTION,
  CHAT_STATUS_READY,
  CHAT_STATUS_SESSION_ERROR,
  CHAT_STATUS_STREAMING,
  CHAT_WRITE_HERE_BODY,
  CHAT_WRITE_HERE_TITLE,
  isChatComposerCompact,
} from "../conversation-handoff"
import { useBuilder } from "../builder-store"

export function ChatFace() {
  const { agentProjection, canSendTurn, messages, isStreaming, sendMessage, sessionStatus } =
    useBuilder()
  const userMessages = messages.filter((message) => message.role === "user")

  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const hasPendingQuestion = Boolean(agentProjection.pendingQuestion)
  const inputDisabled = !canSendTurn
  const compact = isChatComposerCompact({ isStreaming, hasPendingQuestion })
  const lastUserMessage = userMessages.at(-1)
  const chatState =
    agentProjection.status === "invalid" || sessionStatus === "error"
      ? "error"
      : compact
        ? isStreaming
          ? "streaming"
          : "awaiting"
        : sessionStatus === "opening"
          ? "opening"
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
    ? CHAT_STATUS_QUESTION
    : sessionStatus === "error"
      ? CHAT_STATUS_SESSION_ERROR
      : agentProjection.status === "invalid"
        ? CHAT_STATUS_INTEGRITY
        : sessionStatus === "opening"
          ? CHAT_STATUS_OPENING
          : isStreaming
            ? CHAT_STATUS_STREAMING
            : userMessages.length === 0
              ? null
              : CHAT_STATUS_READY

  return (
    <div
      className="flex h-full flex-col"
      data-card-state={chatState}
      data-chat-compact={compact ? "" : undefined}
      aria-busy={isStreaming}
    >
      {compact ? (
        lastUserMessage ? (
          <div className="shrink-0 border-b border-workflow-border-subtle px-3 py-2">
            <p className="truncate rounded-md bg-foreground px-2.5 py-1.5 text-right text-[11px] leading-snug text-background">
              {lastUserMessage.content}
            </p>
          </div>
        ) : null
      ) : (
        <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {userMessages.length === 0 ? (
            <CardEmpty tone="idle" title={CHAT_WRITE_HERE_TITLE}>
              <p>{CHAT_WRITE_HERE_BODY}</p>
              <p className="mt-2 font-mono text-[10px] text-workflow-text-subtle">
                {CHAT_BUILD_CHOICES_HINT}
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
        </div>
      )}

      <div className={cn("flex flex-col gap-2 p-2", compact ? "flex-1 justify-end" : "border-t border-workflow-border-subtle")}>
        <div className="flex items-center gap-1.5">
          <span
            data-chat-waiting={isStreaming ? "" : undefined}
            aria-live="polite"
            className={cn(
              "min-h-4 font-mono text-[10px]",
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
                ? CHAT_QUESTION_PLACEHOLDER
                : sessionStatus === "opening"
                  ? "Öppnar session…"
                  : sessionStatus === "error" || agentProjection.status === "invalid"
                    ? "Starta en ny chatt…"
                    : CHAT_ANSWER_PLACEHOLDER
            }
            rows={compact ? 1 : 2}
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
