"use client"

// Toppbar i mallens toolbar-stil, med sajtmaskins funktioner.

import React from "react"
import {
  Check,
  ChevronDown,
  Clock,
  Cpu,
  Download,
  FileCog,
  Import,
  Loader2,
  MoreHorizontal,
  Plus,
  Rocket,
  Save,
  SlidersHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useBuilder } from "./builder-store"

interface BuilderHeaderProps {
  showDrawer: boolean
  onToggleDrawer: () => void
}

export function BuilderHeader({ showDrawer, onToggleDrawer }: BuilderHeaderProps) {
  const { newChat, publish, publishState } = useBuilder()

  // Merge-notering: menyalternativen nedan pekas mot befintliga dialoger/
  // åtgärder i sajtmaskin (Spara, Byggmodell, Scaffold, Egna instruktioner,
  // Importera, Ladda ner ZIP).
  const menuStub = (label: string) => () => console.log("[siteagent] menyval:", label)

  return (
    <header className="h-14 bg-workflow-bg border-b border-workflow-border flex items-center justify-between px-4 transition-colors duration-200">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-foreground text-background flex items-center justify-center font-mono text-sm font-bold">
          S
        </div>
        <span className="font-mono font-semibold text-workflow-text tracking-tight text-sm">
          Siteagent
        </span>
        <span className="font-mono text-[10px] text-workflow-text-subtle border border-workflow-border-subtle rounded px-1.5 py-0.5">
          studio
        </span>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-sm bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text hover:bg-workflow-surface-hover transition-colors duration-200"
            >
              <MoreHorizontal className="w-4 h-4" />
              Mer
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="font-mono text-xs">
            <DropdownMenuItem onClick={menuStub("Spara")}>
              <Save className="w-3.5 h-3.5 mr-2" /> Spara
            </DropdownMenuItem>
            <DropdownMenuItem onClick={menuStub("Byggmodell")}>
              <Cpu className="w-3.5 h-3.5 mr-2" /> Byggmodell
            </DropdownMenuItem>
            <DropdownMenuItem onClick={menuStub("Scaffold")}>
              <FileCog className="w-3.5 h-3.5 mr-2" /> Scaffold
            </DropdownMenuItem>
            <DropdownMenuItem onClick={menuStub("Egna instruktioner")}>
              <SlidersHorizontal className="w-3.5 h-3.5 mr-2" /> Egna instruktioner
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={menuStub("Importera")}>
              <Import className="w-3.5 h-3.5 mr-2" /> Importera
            </DropdownMenuItem>
            <DropdownMenuItem onClick={menuStub("Ladda ner ZIP")}>
              <Download className="w-3.5 h-3.5 mr-2" /> Ladda ner ZIP
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={newChat}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-sm bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text hover:bg-workflow-surface-hover transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          Ny chat
        </button>

        <button
          type="button"
          onClick={onToggleDrawer}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-sm border transition-colors duration-200",
            showDrawer
              ? "bg-workflow-surface-hover border-workflow-border text-workflow-text"
              : "bg-workflow-surface border-workflow-border text-workflow-text-muted hover:text-workflow-text hover:bg-workflow-surface-hover"
          )}
        >
          <Clock className="w-4 h-4" />
          Versioner
        </button>

        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishState === "publishing"}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all duration-200",
            publishState === "publishing"
              ? "bg-workflow-surface text-workflow-text-muted cursor-not-allowed"
              : publishState === "published"
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {publishState === "publishing" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : publishState === "published" ? (
            <Check className="w-4 h-4" />
          ) : (
            <Rocket className="w-4 h-4" />
          )}
          {publishState === "publishing" ? "Bygger…" : publishState === "published" ? "Publicerad" : "Publicera"}
        </button>
      </div>
    </header>
  )
}
