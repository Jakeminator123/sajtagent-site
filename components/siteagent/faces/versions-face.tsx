"use client"

// Tärningssida: Versioner (kompakt lista, samma logik som tidigare drawern).

import React from "react"
import { Download, Loader2, Pin, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuilder } from "../builder-store"

export function VersionsFace() {
  const { versions, activeVersionId, restoreVersion, togglePin, downloadZip } = useBuilder()

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">
      {versions.length === 0 ? (
        <p className="text-xs text-workflow-text-subtle text-center py-8 leading-relaxed">
          Inga versioner ännu.
          <br />
          Skriv till OpenClaw för att skapa den första.
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
                  v.status === "ready" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  v.status === "building" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  v.status === "error" && "bg-rose-500/15 text-rose-600 dark:text-rose-400"
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
                  v.pinned ? "text-amber-500" : "text-workflow-text-subtle hover:text-workflow-text"
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
  )
}
