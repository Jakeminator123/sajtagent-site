"use client"

// Nod: Byggval (vänstra mörka kortet).
// Motsvarar PreviewPanelInitControls / init-build-choices.ts i sajtmaskin.

import React from "react"
import { Handle, Position } from "@xyflow/react"
import { SlidersHorizontal } from "lucide-react"
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

export function BuildChoicesNode() {
  const { choices, setChoice, setPageCount } = useBuilder()

  return (
    <div className="w-[340px] rounded-lg border-2 border-zinc-500/50 bg-workflow-node-bg shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-workflow-border-subtle text-zinc-600 dark:text-zinc-300">
        <SlidersHorizontal className="w-4 h-4" />
        <span className="font-mono text-sm font-medium text-workflow-text">Byggval</span>
        <span className="ml-auto font-mono text-[10px] text-workflow-text-subtle">styr första versionen</span>
      </div>

      <div className="p-3 flex flex-col gap-3 max-h-[420px] overflow-y-auto nowheel">
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
            className="w-full accent-foreground nodrag"
            aria-label="Antal sidor"
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-workflow-handle !border-2 !border-workflow-handle-border"
      />
    </div>
  )
}
