"use client"

// Sajtagent-kortet presenterar produktagentens identitet och säkerhetsgräns.
// Själva V1-dialogen med OpenClaw ligger i det separata Chat-kortet.

import React from "react"
import { Bot, ServerCog, ShieldCheck, Video } from "lucide-react"
import { useBuilder } from "../builder-store"

export function AgentFace() {
  const { isStreaming, previewStatus } = useBuilder()
  const status = isStreaming
    ? "OpenClaw arbetar"
    : previewStatus === "error"
      ? "Stoppad felsäkert"
      : "Väntar på uppdrag"

  return (
    <div className="flex h-full flex-col">
      <div
        id="siteagent-did-slot"
        className="h-[72px] shrink-0 bg-workflow-node-input flex items-center justify-between gap-3 px-3"
      >
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-workflow-text-subtle" />
          <div>
            <p className="font-mono text-xs text-workflow-text">Sajtagent</p>
            <p className="text-[10px] text-workflow-text-subtle">Videoavatar ansluts senare</p>
          </div>
        </div>
        <span className="flex items-center gap-1 font-mono text-[10px] text-workflow-text-muted">
          <ShieldCheck className="w-3.5 h-3.5" /> Serverstyrd
        </span>
      </div>
      <div className="flex-1 min-h-0 p-3 flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-md border border-workflow-border-subtle p-2.5">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div>
            <p className="font-mono text-xs text-workflow-text">{status}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-workflow-text-muted">
              Du skriver till OpenClaw i chattkortet. Sajtagent håller ihop projekt, versioner och
              verifierad preview.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 text-[11px] leading-relaxed text-workflow-text-muted">
          <ServerCog className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Browsern skickar bara produktavsikt till Site-controllern. OpenClaw och Sprite körs
            server-till-server och kan inte anropas direkt härifrån.
          </p>
        </div>
      </div>
    </div>
  )
}
