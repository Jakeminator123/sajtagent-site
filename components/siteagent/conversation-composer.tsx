"use client"

import { type KeyboardEvent } from "react"
import { Loader2, Mic, Send, Square } from "lucide-react"
import { useAudioTranscription } from "@/lib/use-audio-transcription"
import { cn } from "@/lib/utils"

export function ConversationComposer({
  canSendTurn,
  isStreaming,
  statusLine,
  placeholder,
  cardState,
  onSend,
  input,
  onInputChange,
}: {
  canSendTurn: boolean
  isStreaming: boolean
  statusLine: string | null
  placeholder: string
  cardState: string
  onSend: () => void
  input: string
  onInputChange: (text: string) => void
}) {
  const inputDisabled = !canSendTurn
  const { status: recStatus, seconds: recSeconds, toggle: toggleRecording } =
    useAudioTranscription({
      onTranscript: (text) => onInputChange(input.trim() ? `${input.trim()} ${text}` : text),
    })
  const isRecording = recStatus === "recording"
  const isTranscribing = recStatus === "transcribing"

  const submit = () => {
    if (!input.trim() || inputDisabled) return
    onSend()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div
      data-conversation-composer=""
      className="flex flex-col gap-2 border-t border-workflow-border-subtle p-2"
    >
      <div className="flex items-center gap-1.5">
        <span
          data-chat-waiting={isStreaming ? "" : undefined}
          aria-live="polite"
          className={cn(
            "min-h-4 font-mono text-[10px]",
            cardState === "error" ? "text-rose-700 dark:text-rose-300" : "text-workflow-text-subtle",
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
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          aria-label="Meddelande till Sajtagent"
          placeholder={placeholder}
          rows={2}
          className="flex-1 resize-none rounded-md border border-workflow-border-subtle bg-workflow-node-input px-2.5 py-2 text-xs text-workflow-text placeholder:text-workflow-text-subtle focus:outline-none focus:ring-1 focus:ring-workflow-border"
        />
        <button
          type="button"
          onClick={submit}
          disabled={inputDisabled || !input.trim()}
          className="rounded-md bg-foreground p-2 text-background transition-opacity duration-150 disabled:opacity-40"
          aria-label="Skicka till Sajtagent"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
