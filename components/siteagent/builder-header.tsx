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
import { NewDraftMenu } from "./new-draft-menu"
import { ProjectSelector } from "./project-selector"
import { ResetStarterDialog } from "./reset-starter-dialog"
import { loginPath } from "@/lib/supabase/auth-paths"
import { withLandingDraft } from "@/lib/siteagent/landing-draft"
import { builderProjectHref } from "@/lib/siteagent/project-browser"
import { NextPublicationControl } from "./next-publication-control"

interface BuilderHeaderProps {
  showDrawer: boolean
  onToggleDrawer: () => void
}

export function BuilderHeader({ showDrawer, onToggleDrawer }: BuilderHeaderProps) {
  const { newChat, newProject, isResettingProject, isStreaming, projectId, landingDraft, nextState, nextAvailability, previewKind } = useBuilder()
  const [resetOpen, setResetOpen] = React.useState(false)

  return (
    <header className="h-14 bg-workflow-bg border-b border-workflow-border flex items-center justify-between px-4 transition-colors duration-200">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-foreground text-background flex items-center justify-center font-mono text-sm font-bold">
          S
        </div>
        <span className="font-mono font-semibold text-workflow-text tracking-tight text-sm">
          Sajtagent
        </span>
        <span className="font-mono text-[10px] text-workflow-text-subtle border border-workflow-border-subtle rounded px-1.5 py-0.5">
          studio
        </span>
        <ProjectSelector />
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={loginPath(withLandingDraft(projectId ? builderProjectHref(projectId) : "/builder", landingDraft))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-sm bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text hover:bg-workflow-surface-hover transition-colors duration-200"
        >
          <LogIn className="w-4 h-4" />
          Byt konto
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
            {projectId?.startsWith("project:personal:") ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={isResettingProject || isStreaming} className="text-destructive" onSelect={() => setResetOpen(true)}>
                  Återställ personligt startprojekt…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <ResetStarterDialog open={resetOpen} onOpenChange={setResetOpen} />

        <NewDraftMenu
          newChat={newChat}
          newProject={newProject}
          isResettingProject={isResettingProject}
          isStreaming={isStreaming}
        />

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

        {projectId && previewKind === "next" ? (
          <NextPublicationControl key={projectId} projectId={projectId} accepted={nextAvailability === "available" ? nextState?.accepted ?? null : null} />
        ) : <button
          type="button"
          disabled
          title="Publicering är inte tillgänglig för HTML-byggen. Hämta HTML-versionen som ZIP i Versioner."
          aria-label="Publicering är inte tillgänglig för HTML-byggen"
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm bg-workflow-surface text-workflow-text-muted cursor-not-allowed"
        >
          <Rocket className="w-4 h-4" />
          Publicera
        </button>}
      </div>
    </header>
  )
}
