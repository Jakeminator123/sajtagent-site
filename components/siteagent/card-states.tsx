"use client"

// Delad tom-/status-yta för Builder-korten. Ingen ny designlinje — samma
// typografi och workflow-färger som FaceCard redan använder.

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { AgentToolProjectionV1 } from "@/lib/siteagent/agent-event-reducer"
import type { PreviewStatus } from "@/lib/siteagent/types"

export function CardEmpty({
  icon,
  title,
  children,
  tone = "idle",
}: {
  icon?: ReactNode
  title: string
  children: ReactNode
  tone?: "idle" | "live" | "error"
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      {icon ? (
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            tone === "error" && "bg-rose-500/10 text-rose-600 dark:text-rose-300",
            tone === "live" && "bg-rose-500/10 text-rose-500",
            tone === "idle" && "text-current",
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className="font-mono text-sm text-workflow-text">{title}</p>
      <div className="max-w-prose text-xs leading-relaxed text-workflow-text-muted">{children}</div>
    </div>
  )
}

export function StatusDot({
  tone,
  label,
}: {
  tone: "idle" | "live" | "wait" | "ok" | "error"
  label: string
}) {
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        tone === "live" && "animate-pulse bg-rose-500",
        tone === "wait" && "animate-pulse bg-amber-500",
        tone === "ok" && "bg-emerald-500",
        tone === "error" && "bg-rose-600",
        tone === "idle" && "bg-workflow-text-subtle/50",
      )}
    />
  )
}

export function toolStatusLabel(status: AgentToolProjectionV1["status"]): string {
  if (status === "running") return "Pågår"
  if (status === "passed") return "Klart"
  if (status === "failed") return "Stoppades"
  return "Avbröts"
}

export function previewAddressLabel(
  previewStatus: PreviewStatus,
  previewUrl: string | null,
): string {
  if (previewUrl) return previewUrl
  if (previewStatus === "building") return "Bygger — väntar på verifiering"
  if (previewStatus === "error") return "Ingen preview accepterades"
  return "Ingen verifierad sajt ännu"
}

export function previewStatusChip(
  previewStatus: PreviewStatus,
  hasContent: boolean,
): { label: string; className: string } {
  if (previewStatus === "building") {
    return {
      label: hasContent ? "Ny version" : "Bygger",
      className: "bg-amber-100 text-amber-800",
    }
  }
  if (previewStatus === "ready" && hasContent) {
    return {
      label: "Verifierad",
      className: "bg-emerald-100 text-emerald-800",
    }
  }
  if (previewStatus === "error" && !hasContent) {
    return {
      label: "Stoppad",
      className: "bg-rose-100 text-rose-800",
    }
  }
  return {
    label: "Tom",
    className: "bg-zinc-200 text-zinc-600",
  }
}
