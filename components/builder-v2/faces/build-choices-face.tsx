"use client"

// Tärningssida: Byggval. Samma logik som tidigare byggval-noden, utan xyflow.

import React from "react"
import { cn } from "@/lib/utils"
import { CHOICE_GROUPS, PAGE_COUNT } from "@/lib/builder-v2/build-choices"
import { useBuilder } from "../builder-store"

function Chip({
  active,
  onClick,
  children,
  swatch,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  swatch?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border transition-colors duration-150",
        active
          ? "bg-foreground text-background border-transparent"
          : "bg-workflow-node-input text-workflow-text-muted border-workflow-border-subtle hover:text-workflow-text hover:border-workflow-border"
      )}
    >
      {swatch && <span className={cn("w-2 h-2 rounded-full", swatch)} />}
      {children}
    </button>
  )
}

export function BuildChoicesFace() {
  const { choices, setChoice, setPageCount } = useBuilder()

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      {CHOICE_GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-workflow-text-subtle">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((opt) => (
              <Chip
                key={opt.value}
                active={choices[group.key] === opt.value}
                onClick={() => setChoice(group.key, opt.value)}
                swatch={opt.swatch}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-workflow-text-subtle">
            Antal sidor
          </span>
          <span className="font-mono text-xs text-workflow-text">
            {choices.pageCount === PAGE_COUNT.autoValue ? "Auto" : choices.pageCount}
          </span>
        </div>
        <input
          type="range"
          min={PAGE_COUNT.min}
          max={PAGE_COUNT.max}
          step={1}
          value={choices.pageCount}
          onChange={(e) => setPageCount(Number(e.target.value))}
          className="w-full accent-foreground"
          aria-label="Antal sidor"
        />
      </div>
    </div>
  )
}
