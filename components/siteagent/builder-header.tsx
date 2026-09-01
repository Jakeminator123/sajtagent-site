"use client"

// Toppbar i mallens toolbar-stil, med sajtmaskins funktioner.

import Link from "next/link"
import React from "react"
import {
  Bot,
  ChevronDown,
  Clock,
  Cpu,
  Download,
  FileCog,
  Import,
  LogIn,
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
  const { newChat } = useBuilder()

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
        <Link
          href="/login"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-sm bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text hover:bg-workflow-surface-hover transition-colors duration-200"
        >
          <LogIn className="w-4 h-4" />
          Konto
        </Link>
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
            <DropdownMenuItem disabled>
              <Save className="w-3.5 h-3.5 mr-2" /> Spara
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Cpu className="w-3.5 h-3.5 mr-2" /> Byggmodell
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <FileCog className="w-3.5 h-3.5 mr-2" /> Scaffold
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <SlidersHorizontal className="w-3.5 h-3.5 mr-2" /> Egna instruktioner
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/agent-studio">
                <Bot className="w-3.5 h-3.5 mr-2" /> Agent Studio
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Import className="w-3.5 h-3.5 mr-2" /> Importera
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
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
          Nytt bygge
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
          disabled
          title="Publicering kräver först en verifierad version"
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm bg-workflow-surface text-workflow-text-muted cursor-not-allowed"
        >
          <Rocket className="w-4 h-4" />
          Publicera
        </button>
      </div>
    </header>
  )
}
