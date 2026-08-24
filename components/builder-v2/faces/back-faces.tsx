"use client"

// Baksidor för flippbara kort.
// - LogBack: chatkortets baksida — hela loggen strömmar här.
// - EngineBack: Byggval-kortets baksida efter första genereringen —
//   visar vad motorn/LLM:erna gör, resonerar och bygger.
// - BlankBack: Blocks-kortets baksida — avsiktligt tom, reserverad
//   för kommande undermenyer från sajtmaskins builder ("+"-flödet).

import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"
import { useBuilder } from "../builder-store"

export function LogBack() {
  const { logs } = useBuilder()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [logs])

  return (
    <div ref={ref} className="h-full overflow-y-auto bg-workflow-node-input p-3 flex flex-col gap-1">
      {logs.length === 0 ? (
        <p className="font-mono text-[10px] text-workflow-text-subtle">
          Loggen är tom — skicka en prompt så strömmar motorns händelser här.
        </p>
      ) : (
        logs.map((line, i) => (
          <p key={i} className="font-mono text-[10px] text-workflow-text-muted leading-relaxed">
            {line}
          </p>
        ))
      )}
    </div>
  )
}

export function EngineBack() {
  const { logs, messages, isStreaming } = useBuilder()
  const ref = useRef<HTMLDivElement>(null)

  // Senaste assistentsvaret = vad motorn resonerar/bygger just nu
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [logs, lastAssistant?.content])

  return (
    <div ref={ref} className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-workflow-text-subtle">
          Motorn
        </span>
        <div className="rounded-md bg-workflow-node-input p-2.5">
          {lastAssistant?.content ? (
            <p className="text-xs text-workflow-text leading-relaxed whitespace-pre-wrap">
              {lastAssistant.content}
              {isStreaming && <Loader2 className="inline-block w-3 h-3 ml-1 animate-spin" />}
            </p>
          ) : (
            <p className="text-xs text-workflow-text-muted">Väntar på motorn…</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-workflow-text-subtle">
          Händelser
        </span>
        {logs.length === 0 ? (
          <p className="font-mono text-[10px] text-workflow-text-subtle">Inga händelser ännu.</p>
        ) : (
          logs.map((line, i) => (
            <p key={i} className="font-mono text-[10px] text-workflow-text-muted leading-relaxed">
              {line}
            </p>
          ))
        )}
      </div>
    </div>
  )
}

export function BlankBack() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <p className="font-mono text-[10px] text-workflow-text-subtle text-center leading-relaxed">
        Baksida — reserverad.
      </p>
    </div>
  )
}
