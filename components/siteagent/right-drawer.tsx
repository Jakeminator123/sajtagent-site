"use client"

// Höger-drawer: Versioner (kompakt), Blocks, Test.
// Smalare än dagens versionsspalt (300px), kollapsbar via toppbaren.

import React, { useState } from "react"
import { Blocks, Clock, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuilder } from "./builder-store"
import { VersionList } from "./version-list"

type DrawerTab = "versions" | "blocks" | "test"

// Merge-notering: blocks-griden motsvarar use-registry-insert i sajtmaskin —
// klick skickar ett follow-up-meddelande i chatten.
const BLOCKS = [
  "Hero",
  "Tjänster",
  "Omdömen",
  "Prislista",
  "FAQ",
  "Kontaktformulär",
  "Galleri",
  "Team",
  "CTA-banner",
]

export function RightDrawer() {
  const [tab, setTab] = useState<DrawerTab>("versions")
  const { sendMessage, isStreaming } = useBuilder()
  const [scratch, setScratch] = useState("")

  return (
    <aside className="w-[300px] shrink-0 h-full bg-workflow-surface border-l border-workflow-border flex flex-col transition-colors duration-200">
      <div className="flex border-b border-workflow-border">
        {(
          [
            { key: "versions", label: "Versioner", icon: <Clock className="w-3.5 h-3.5" /> },
            { key: "blocks", label: "Blocks", icon: <Blocks className="w-3.5 h-3.5" /> },
            { key: "test", label: "Test", icon: <FlaskConical className="w-3.5 h-3.5" /> },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 font-mono text-xs border-b-2 transition-colors duration-150",
              tab === t.key
                ? "border-foreground text-workflow-text"
                : "border-transparent text-workflow-text-muted hover:text-workflow-text"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "versions" && (
          <VersionList />
        )}

        {tab === "blocks" && (
          <div className="grid grid-cols-2 gap-2">
            {BLOCKS.map((block) => (
              <button
                key={block}
                type="button"
                disabled={isStreaming}
                onClick={() => void sendMessage(`Lägg till ett ${block}-block på sajten.`)}
                className="rounded-lg border border-workflow-border-subtle p-3 font-mono text-xs text-workflow-text-muted hover:text-workflow-text hover:border-workflow-border hover:bg-workflow-surface-hover transition-colors duration-150 disabled:opacity-40 text-left"
              >
                {block}
              </button>
            ))}
          </div>
        )}

        {tab === "test" && (
          <div className="flex flex-col gap-2 h-full">
            <p className="text-[11px] text-workflow-text-subtle leading-relaxed">
              Friyta för anteckningar och test. Innehållet sparas inte.
            </p>
            <textarea
              value={scratch}
              onChange={(e) => setScratch(e.target.value)}
              placeholder="Skriv här…"
              className="flex-1 min-h-[200px] resize-none rounded-md bg-workflow-node-input border border-workflow-border-subtle px-2.5 py-2 text-xs text-workflow-text placeholder:text-workflow-text-subtle focus:outline-none focus:ring-1 focus:ring-workflow-border"
            />
          </div>
        )}
      </div>
    </aside>
  )
}
