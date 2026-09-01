"use client"

import { Download, Loader2, Pin, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuilder } from "./builder-store"

const PENDING_STATUSES = new Set(["submitting", "accepted", "running"])

export function VersionList() {
  const { activeJob, versions, activeVersionId, restoreVersion, togglePin } = useBuilder()
  const pending = activeJob ? PENDING_STATUSES.has(activeJob.status) : false
  const failed = activeJob?.status === "failed" || activeJob?.status === "invalid"

  return (
    <div className="flex flex-col gap-2">
      {pending && activeJob ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-mono text-[11px] text-workflow-text">Byggjobb pågår</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-workflow-text-muted">
              {activeJob.progressLabel} Ingen version skapas före verifierad framgång.
            </p>
          </div>
        </div>
      ) : null}

      {failed && activeJob ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="font-mono text-[11px] text-workflow-text">Inget resultat skapades</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-workflow-text-muted">
              {activeJob.error ?? "Byggjobbet stoppades felsäkert."}
            </p>
          </div>
        </div>
      ) : null}

      {versions.length === 0 ? (
        <p className="py-8 text-center text-xs leading-relaxed text-workflow-text-subtle">
          Inga verifierade versioner ännu.
          <br />
          Skriv till Sajtagent i Chatt-kortet för att skapa den första.
        </p>
      ) : (
        versions.map((version) => (
          <div
            key={version.id}
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border p-2.5 transition-colors duration-150",
              version.id === activeVersionId
                ? "border-workflow-text/40 bg-workflow-surface-hover"
                : "border-workflow-border-subtle",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-workflow-text">{version.label}</span>
              <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3 w-3" /> Verifierad
              </span>
              <button
                type="button"
                onClick={() => togglePin(version.id)}
                className={cn(
                  "ml-auto rounded p-1 transition-colors duration-150",
                  version.pinned
                    ? "text-amber-500"
                    : "text-workflow-text-subtle hover:text-workflow-text",
                )}
                title={version.pinned ? "Ta bort pin" : "Pinna"}
                aria-label={version.pinned ? `Ta bort pin från ${version.label}` : `Pinna ${version.label}`}
              >
                <Pin className="h-3 w-3" />
              </button>
            </div>
            <p className="truncate font-mono text-[9px] text-workflow-text-subtle">
              Revision {version.workspaceRevisionId}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => restoreVersion(version.id)}
                className="flex items-center gap-1 rounded border border-workflow-border-subtle px-2 py-1 font-mono text-[10px] text-workflow-text-muted transition-colors duration-150 hover:text-workflow-text"
              >
                <RotateCcw className="h-3 w-3" /> Visa
              </button>
              <button
                type="button"
                disabled
                title="ZIP-export är inte ansluten ännu"
                className="flex items-center gap-1 rounded border border-workflow-border-subtle px-2 py-1 font-mono text-[10px] text-workflow-text-muted opacity-40"
              >
                <Download className="h-3 w-3" /> ZIP
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
