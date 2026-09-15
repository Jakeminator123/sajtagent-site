"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import type { NextAvailability, NextBuildProfile } from "@/lib/siteagent/next-preview-client"

/**
 * Temporary sketch-mode switch. Platform doctrine leaves a fuller profile
 * decision open (who decides, artifact fate, publication on switch). This
 * control only stores an owner preference. It does not migrate HTML↔React
 * or change the published revision. HTML-skiss still cannot publish.
 */
export function BuildProfileSwitch({
  availability,
  profile,
  disabled,
  onChange,
}: {
  availability: NextAvailability
  profile: NextBuildProfile | null
  disabled?: boolean
  onChange: (preference: "html" | "next") => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  if (availability !== "available" || !profile) return null
  const effective = profile.effective
  const locked = Boolean(disabled) || busy

  async function select(preference: "html" | "next") {
    if (locked || preference === effective) return
    setBusy(true)
    try {
      await onChange(preference)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="group"
      aria-label="Tillfälligt byggläge"
      title="Tillfälligt val. Byter inte befintliga versioner eller publicerad sajt. HTML-skiss kan inte publiceras."
      className="flex items-center rounded-lg border border-workflow-border bg-workflow-surface p-0.5 font-mono text-xs"
    >
      <button
        type="button"
        aria-pressed={effective === "html"}
        disabled={locked}
        onClick={() => void select("html")}
        className={cn(
          "rounded-md px-2.5 py-1.5 transition-colors duration-150 disabled:opacity-50",
          effective === "html"
            ? "bg-workflow-surface-hover text-workflow-text"
            : "text-workflow-text-muted hover:text-workflow-text",
        )}
      >
        HTML-skiss
      </button>
      <button
        type="button"
        aria-pressed={effective === "next"}
        disabled={locked}
        onClick={() => void select("next")}
        className={cn(
          "rounded-md px-2.5 py-1.5 transition-colors duration-150 disabled:opacity-50",
          effective === "next"
            ? "bg-workflow-surface-hover text-workflow-text"
            : "text-workflow-text-muted hover:text-workflow-text",
        )}
      >
        React (Next)
      </button>
    </div>
  )
}
