"use client"

// Sajtagent-kortet visar endast Site-validerade AgentEventV1-projektioner:
// strömmande svar, sanerade tool-labels, explicit ask_user och felsäkra fel.

import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Check, Loader2, ShieldCheck, TriangleAlert, Wrench } from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import { SESSION_TURN_MISMATCH_MESSAGE_V1 } from "@/lib/siteagent/agent-event-stream-apply"
import type {
  AgentQuestionProjectionV1,
  AgentTurnProjectionV1,
} from "@/lib/siteagent/agent-event-reducer"
import { CardEmpty, toolStatusLabel } from "../card-states"
import { useBuilder } from "../builder-store"

const MARKDOWN_PLUGINS = [remarkGfm]
const MARKDOWN_COMPONENTS: Components = {
  a: ({ children, href }) => (
    <a href={href} rel="noreferrer noopener" target="_blank">
      {children}
    </a>
  ),
  img: ({ alt }) => <span>{alt ? `[Bild: ${alt}]` : "[Bild]"}</span>,
}

const MESSAGE_PROSE =
  "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/5 [&_pre]:p-2"

function StructuredQuestion({
  question,
  disabled,
  onAnswer,
}: {
  question: AgentQuestionProjectionV1
  disabled: boolean
  onAnswer: (questionId: string, selections: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [other, setOther] = useState("")

  const answers = useMemo(() => {
    const values = [...selected]
    if (question.isOther && other.trim()) values.push(other.trim())
    return values.slice(0, 4)
  }, [other, question.isOther, selected])

  const toggleOption = (label: string) => {
    if (question.multiSelect) {
      setSelected((current) =>
        current.includes(label)
          ? current.filter((value) => value !== label)
          : current.length < 4
            ? [...current, label]
            : current,
      )
      return
    }
    setOther("")
    setSelected([label])
  }

  return (
    <section
      aria-labelledby={`question-${question.questionId}`}
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
        {question.header}
      </p>
      <p id={`question-${question.questionId}`} className="mt-1 text-xs leading-relaxed text-workflow-text">
        {question.question}
      </p>
      {question.options.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {question.options.map((option) => {
            const checked = selected.includes(option.label)
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={checked}
                disabled={disabled}
                onClick={() => toggleOption(option.label)}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                  checked
                    ? "border-foreground/40 bg-workflow-surface text-workflow-text"
                    : "border-workflow-border-subtle text-workflow-text-muted hover:text-workflow-text",
                )}
              >
                <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-current">
                  {checked ? <Check className="h-3 w-3" /> : null}
                </span>
                <span>
                  <span className="block text-[11px] font-medium">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-[10px] leading-relaxed opacity-75">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      {question.isOther || question.options.length === 0 ? (
        <input
          value={other}
          disabled={disabled}
          onChange={(event) => {
            if (!question.multiSelect) setSelected([])
            setOther(event.target.value)
          }}
          placeholder="Skriv ett eget svar…"
          aria-label="Eget svar"
          className="mt-2 w-full rounded-md border border-workflow-border-subtle bg-workflow-node-input px-2.5 py-2 text-xs text-workflow-text placeholder:text-workflow-text-subtle focus:outline-none focus:ring-1 focus:ring-workflow-border"
        />
      ) : null}
      <button
        type="button"
        disabled={disabled || answers.length === 0}
        onClick={() => onAnswer(question.questionId, answers)}
        className="mt-2 rounded-md bg-foreground px-3 py-1.5 font-mono text-[10px] text-background disabled:opacity-40"
      >
        Skicka svar
      </button>
    </section>
  )
}

function StreamingPlaceholder({ label }: { label: string }) {
  return (
    <div
      data-agent-streaming="waiting"
      aria-live="polite"
      className="max-w-[94%] self-start rounded-lg border border-dashed border-rose-500/25 bg-workflow-node-input/80 px-3 py-2"
    >
      <p className="font-mono text-[10px] text-rose-600 dark:text-rose-300">{label}</p>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400/80" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400/50 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400/30 [animation-delay:300ms]" />
      </div>
    </div>
  )
}

function BuiltTurnNote() {
  return (
    <p className="flex items-center gap-1.5 px-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
      <ShieldCheck className="h-3 w-3 shrink-0" />
      Bygget är verifierat. Previewn stannar kvar.
    </p>
  )
}

function isBuiltTurn(turn: AgentTurnProjectionV1 | null | undefined): boolean {
  return turn?.terminal?.kind === "completed" && turn.terminal.outcome === "built"
}

function agentCardState(input: {
  sessionStatus: "opening" | "ready" | "error"
  projectionStatus: string
  isStreaming: boolean
  waitingForFirstDelta: boolean
  hasAssistant: boolean
  hasQuestion: boolean
}): string {
  if (input.projectionStatus === "invalid" || input.projectionStatus === "failed") return "error"
  if (input.sessionStatus === "error") return "error"
  if (input.hasQuestion) return "awaiting"
  if (input.isStreaming || input.waitingForFirstDelta || input.projectionStatus === "active") {
    return "streaming"
  }
  if (input.sessionStatus === "opening" && !input.hasAssistant) return "opening"
  if (!input.hasAssistant) return "empty"
  return "ready"
}

export function AgentFace() {
  const {
    agentProjection,
    answerQuestion,
    isStreaming,
    messages,
    sessionStatus,
  } = useBuilder()
  const assistantMessages = messages.filter((message) => message.role === "assistant")
  const activeTurn = agentProjection.activeTurnId
    ? agentProjection.turns[agentProjection.activeTurnId]
    : null
  const latestTurnId = agentProjection.turnOrder.at(-1) ?? null
  const latestTurn = latestTurnId ? agentProjection.turns[latestTurnId] ?? null : null
  const visibleTools = activeTurn
    ? activeTurn.toolCallIds.flatMap((toolCallId) => {
        const tool = agentProjection.tools[toolCallId]
        return tool ? [tool] : []
      })
    : []
  const waitingForFirstDelta =
    !agentProjection.pendingQuestion &&
    ((isStreaming && (!activeTurn || activeTurn.messageIds.length === 0)) ||
      Boolean(activeTurn && !activeTurn.terminal && activeTurn.messageIds.length === 0))
  const liveTurnId =
    isStreaming && activeTurn && !activeTurn.terminal ? activeTurn.turnId : null
  const retryableFailure =
    latestTurn?.terminal?.kind === "failed" && latestTurn.terminal.retryable
  const sessionOpenFailure = sessionStatus === "error"
  const integrityFailure =
    !sessionOpenFailure &&
    (agentProjection.status === "invalid" ||
      agentProjection.error === SESSION_TURN_MISMATCH_MESSAGE_V1)
  const cardState = agentCardState({
    sessionStatus,
    projectionStatus: agentProjection.status,
    isStreaming,
    waitingForFirstDelta,
    hasAssistant: assistantMessages.length > 0,
    hasQuestion: Boolean(agentProjection.pendingQuestion),
  })
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [agentProjection.lastSequence, messages])

  const emptyTitle =
    sessionStatus === "opening"
      ? "Öppnar session…"
      : agentProjection.statusLabel === "Redo" || !agentProjection.statusLabel
        ? "Sajtagent lyssnar"
        : agentProjection.statusLabel

  const errorHint = sessionOpenFailure
    ? "Logga in om du inte redan gjort det, eller prova Ny chatt."
    : integrityFailure
      ? "Starta en ny chatt i toppfältet. Den här sessionen kan inte fortsätta."
      : retryableFailure
        ? "Du kan skicka igen i Chatt-kortet."
        : "Sajtagent stoppade turen felsäkert."

  return (
    <div className="flex h-full flex-col" data-card-state={cardState} aria-busy={isStreaming}>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {assistantMessages.length === 0 &&
        !agentProjection.pendingQuestion &&
        !waitingForFirstDelta ? (
          agentProjection.error ? (
            <CardEmpty
              tone="error"
              icon={<TriangleAlert className="h-5 w-5" />}
              title={
                sessionOpenFailure
                  ? "Kunde inte öppna sessionen"
                  : integrityFailure
                    ? "Sessionen stoppades"
                    : "Sajtagent kunde inte svara"
              }
            >
              <p>{agentProjection.error}</p>
              <p className="mt-2 text-workflow-text-subtle">{errorHint}</p>
            </CardEmpty>
          ) : (
            <CardEmpty
              tone={sessionStatus === "opening" ? "live" : "idle"}
              icon={
                sessionStatus === "opening" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-rose-500" />
                ) : (
                  <Bot className="h-6 w-6 text-rose-500" />
                )
              }
              title={emptyTitle}
            >
              <p>
                Sajtagents svar visas i det här kortet. Skriv i Chatt-kortet — vanliga
                frågor får svar här. Sajtagent bygger bara när en godkänd turn begär det.
              </p>
            </CardEmpty>
          )
        ) : (
          assistantMessages.map((message, index) => {
            const previous = assistantMessages[index - 1]
            const showTurnBreak = Boolean(previous && previous.turnId !== message.turnId)
            const isLive = liveTurnId !== null && message.turnId === liveTurnId
            const turn = message.turnId ? agentProjection.turns[message.turnId] : null
            const showBuiltNote =
              isBuiltTurn(turn) &&
              turn?.messageIds[turn.messageIds.length - 1] === message.id
            return (
              <div key={message.id} className="flex flex-col gap-2">
                {showTurnBreak ? (
                  <div
                    aria-hidden
                    className="flex items-center gap-2 px-0.5"
                    data-turn-break=""
                  >
                    <span className="h-px flex-1 bg-workflow-border-subtle" />
                  </div>
                ) : null}
                <div
                  data-agent-streaming={isLive ? "live" : undefined}
                  className={cn(
                    "max-w-[94%] self-start rounded-lg bg-workflow-node-input px-3 py-2 text-xs leading-relaxed text-workflow-text",
                    isLive && "shadow-[inset_2px_0_0_0] shadow-rose-500/70",
                  )}
                >
                  <div className={MESSAGE_PROSE}>
                    <ReactMarkdown
                      components={MARKDOWN_COMPONENTS}
                      remarkPlugins={MARKDOWN_PLUGINS}
                      skipHtml
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {isLive ? (
                    <span
                      aria-hidden
                      className="mt-1 block h-3 w-1.5 animate-pulse rounded-sm bg-rose-500/80"
                    />
                  ) : null}
                </div>
                {showBuiltNote ? <BuiltTurnNote /> : null}
              </div>
            )
          })
        )}

        {waitingForFirstDelta ? (
          <StreamingPlaceholder
            label={
              agentProjection.statusLabel && agentProjection.statusLabel !== "Redo"
                ? agentProjection.statusLabel
                : "Sajtagent tänker…"
            }
          />
        ) : null}

        {visibleTools.length > 0 ? (
          <div className="flex flex-col gap-1" aria-label="Sajtagents verktyg">
            {visibleTools.map((tool) => (
              <div
                key={tool.toolCallId}
                className="flex items-center gap-1.5 rounded-md border border-workflow-border-subtle px-2 py-1.5 font-mono text-[10px] text-workflow-text-muted"
              >
                {tool.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wrench className="h-3 w-3" />
                )}
                <span className="truncate">{tool.safeLabel}</span>
                <span className="ml-auto">{toolStatusLabel(tool.status)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {agentProjection.pendingQuestion ? (
          <StructuredQuestion
            key={agentProjection.pendingQuestion.questionId}
            question={agentProjection.pendingQuestion}
            disabled={isStreaming}
            onAnswer={(questionId, selections) => {
              void answerQuestion(questionId, selections)
            }}
          />
        ) : null}

        {agentProjection.error && assistantMessages.length > 0 ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="block">{agentProjection.error}</span>
              <span className="mt-1 block text-[11px] text-rose-700/80 dark:text-rose-300/80">
                {errorHint}
              </span>
            </span>
          </div>
        ) : agentProjection.error && assistantMessages.length === 0 ? (
          <div role="alert" className="sr-only">
            {agentProjection.error}
          </div>
        ) : null}
      </div>

      <div
        aria-live="polite"
        className={cn(
          "flex items-center gap-1.5 border-t border-workflow-border-subtle px-3 py-2 font-mono text-[10px]",
          agentProjection.status === "invalid" || agentProjection.status === "failed"
            ? "text-rose-700 dark:text-rose-300"
            : agentProjection.status === "awaiting_user"
              ? "text-amber-700 dark:text-amber-300"
              : "text-workflow-text-subtle",
        )}
      >
        {isStreaming || waitingForFirstDelta ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : agentProjection.status === "invalid" || agentProjection.status === "failed" ? (
          <TriangleAlert className="h-3.5 w-3.5" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        <span className="min-w-0 truncate">
          {sessionOpenFailure
            ? "Kunde inte öppna sessionen · Ny chatt eller inloggning"
            : integrityFailure
              ? `${agentProjection.statusLabel} · Ny chatt krävs`
              : agentProjection.statusLabel}
        </span>
      </div>
    </div>
  )
}
