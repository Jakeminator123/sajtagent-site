"use client"

// Sajtagent-kortet visar endast Site-validerade AgentEventV1-projektioner:
// strömmande svar, sanerade tool-labels, explicit ask_user och felsäkra fel.

import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Check, Loader2, ShieldCheck, TriangleAlert, Video, Wrench } from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import type { AgentQuestionProjectionV1 } from "@/lib/siteagent/agent-event-reducer"
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

export function AgentFace() {
  const {
    agentProjection,
    answerQuestion,
    isStreaming,
    messages,
  } = useBuilder()
  const assistantMessages = messages.filter((message) => message.role === "assistant")
  const activeTurn = agentProjection.activeTurnId
    ? agentProjection.turns[agentProjection.activeTurnId]
    : null
  const visibleTools = activeTurn
    ? activeTurn.toolCallIds.flatMap((toolCallId) => {
        const tool = agentProjection.tools[toolCallId]
        return tool ? [tool] : []
      })
    : []
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [agentProjection.lastSequence, messages])

  return (
    <div className="flex h-full flex-col">
      <div
        id="siteagent-did-slot"
        className="flex h-[72px] shrink-0 items-center justify-between gap-3 bg-workflow-node-input px-3"
      >
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-workflow-text-subtle" />
          <div>
            <p className="font-mono text-xs text-workflow-text">Sajtagent</p>
            <p className="text-[10px] text-workflow-text-subtle">OpenClaw-agenten</p>
          </div>
        </div>
        <span className="flex items-center gap-1 font-mono text-[10px] text-workflow-text-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> Serverstyrd
        </span>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {assistantMessages.length === 0 && !agentProjection.pendingQuestion ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <Bot className="h-6 w-6 text-rose-500" />
            <p className="font-mono text-sm text-workflow-text">{agentProjection.statusLabel}</p>
            <p className="text-xs leading-relaxed text-workflow-text-muted">
              Fråga vad som helst i Chatt-kortet. Sajtagent bygger bara när en godkänd turn begär det.
            </p>
          </div>
        ) : (
          assistantMessages.map((message) => (
            <div
              key={message.id}
              className="max-w-[94%] self-start rounded-lg bg-workflow-node-input px-3 py-2 text-xs leading-relaxed text-workflow-text"
            >
              <ReactMarkdown
                components={MARKDOWN_COMPONENTS}
                remarkPlugins={MARKDOWN_PLUGINS}
                skipHtml
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ))
        )}

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
                <span className="ml-auto">{tool.status}</span>
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

        {agentProjection.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{agentProjection.error}</span>
          </div>
        ) : null}
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
        {agentProjection.statusLabel}
      </div>
    </div>
  )
}
