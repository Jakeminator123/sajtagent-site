"use client"

// Höger-drawer: Versioner (kompakt), Blocks, Test.
// Smalare än dagens versionsspalt (300px), kollapsbar via toppbaren.

import React, { useState } from "react"
import { Blocks, Clock, Download, FlaskConical, Loader2, Pin, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuilder } from "./builder-store"

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
  const { versions, activeVersionId, restoreVersion, togglePin, downloadZip, sendMessage, isStreaming } =
    useBuilder()
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
          <div className="flex flex-col gap-2">
            {versions.length === 0 ? (
              <p className="text-xs text-workflow-text-subtle text-center py-8 leading-relaxed">
                Inga versioner ännu.
                <br />
                Skriv till Sajtagent i Chatt-kortet för att skapa den första.
              </p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "rounded-lg border p-2.5 flex flex-col gap-1.5 transition-colors duration-150",
                    v.id === activeVersionId
                      ? "border-workflow-text/40 bg-workflow-surface-hover"
                      : "border-workflow-border-subtle"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-workflow-text">{v.label}</span>
                    <span
                      className={cn(
                        "font-mono text-[10px] px-1.5 py-0.5 rounded",
                        v.status === "ready" && "bg-brand-teal/15 text-brand-teal",
                        v.status === "building" && "bg-brand-amber/15 text-brand-amber",
                        v.status === "error" && "bg-destructive/15 text-destructive"
                      )}
                    >
                      {v.status === "ready" ? "Klar" : v.status === "building" ? "Bygger" : "Fel"}
                    </span>
                    {v.status === "building" && (
                      <Loader2 className="w-3 h-3 animate-spin text-workflow-text-muted" />
                    )}
                    <button
                      type="button"
                      onClick={() => togglePin(v.id)}
                      className={cn(
                        "ml-auto p-1 rounded transition-colors duration-150",
                        v.pinned
                          ? "text-brand-amber"
                          : "text-workflow-text-subtle hover:text-workflow-text"
                      )}
                      title={v.pinned ? "Ta bort pin" : "Pinna"}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => restoreVersion(v.id)}
                      disabled={v.status !== "ready"}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border border-workflow-border-subtle text-workflow-text-muted hover:text-workflow-text transition-colors duration-150 disabled:opacity-40"
                    >
                      <RotateCcw className="w-3 h-3" /> Återställ
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadZip(v.id)}
                      disabled={v.status !== "ready"}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border border-workflow-border-subtle text-workflow-text-muted hover:text-workflow-text transition-colors duration-150 disabled:opacity-40"
                    >
                      <Download className="w-3 h-3" /> ZIP
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
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
