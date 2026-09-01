"use client"

// Sajtagent är den enda primära byggdialogen. Video är presentation; alla
// byggavsikter går genom ChatFace -> Site-controllern.

import React from "react"
import { ShieldCheck, Video } from "lucide-react"

import { ChatFace } from "./chat-face"

export function AgentFace() {
  return (
    <div className="flex flex-col h-full">
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
      <div className="flex-1 min-h-0"><ChatFace /></div>
    </div>
  )
}
