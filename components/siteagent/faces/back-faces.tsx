"use client"

// Baksidor för flippbara kort.
// - LogBack: chatkortets baksida — hela loggen strömmar här.
// - EngineBack: Byggval-kortets baksida visar bara verifierade build- och
//   tool-events. Vanliga assistentsvar tillhör Sajtagent-kortet.
// - BlankBack: Blocks-kortets baksida — avsiktligt tom, reserverad
//   för kommande undermenyer från sajtmaskins builder ("+"-flödet).

import { useEffect, useRef } from "react"
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
  const { agentProjection } = useBuilder()
  const activeTurn = agentProjection.activeTurnId
    ? agentProjection.turns[agentProjection.activeTurnId]
    : null
  const tools = (activeTurn?.toolCallIds ?? []).flatMap((toolCallId) => {
    const tool = agentProjection.tools[toolCallId]
    return tool ? [tool] : []
  })
  const buildStarted = Boolean(activeTurn?.buildJobId)

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-workflow-text-subtle">
          Byggstatus
        </span>
        <div className="rounded-md bg-workflow-node-input p-2.5">
          <p className="text-xs text-workflow-text-muted">
            {buildStarted
              ? "Ett verifierat build-event har startat ett bygge."
              : "Inget bygge har startats i den här chatten."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-workflow-text-subtle">
          Verktygshändelser
        </span>
        {tools.length === 0 ? (
          <p className="font-mono text-[10px] text-workflow-text-subtle">
            Inga verifierade verktygshändelser ännu.
          </p>
        ) : (
          tools.map((tool) => (
            <p key={tool.toolCallId} className="font-mono text-[10px] text-workflow-text-muted leading-relaxed">
              {tool.safeLabel}: {tool.status}
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
