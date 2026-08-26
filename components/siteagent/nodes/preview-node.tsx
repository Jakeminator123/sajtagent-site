"use client"

// Nod: Preview (röda/accent-kortet, störst).
// Motsvarar PreviewPanel i sajtmaskin (iframe med preview-sessionen).

import React, { useState } from "react"
import { Handle, Position } from "@xyflow/react"
import { ExternalLink, Loader2, Maximize2, Monitor, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useBuilder } from "../builder-store"

function PreviewFrame({ className }: { className?: string }) {
  const { previewUrl, previewSrcDoc } = useBuilder()
  if (previewUrl) {
    return <iframe src={previewUrl} title="Förhandsvisning av sajten" className={cn("w-full h-full border-0 bg-white", className)} />
  }
  if (previewSrcDoc) {
    return <iframe srcDoc={previewSrcDoc} title="Förhandsvisning av sajten" className={cn("w-full h-full border-0 bg-white", className)} />
  }
  return null
}

export function PreviewNode() {
  const { previewStatus, previewUrl, previewPages } = useBuilder()
  const [fullscreen, setFullscreen] = useState(false)
  const [activePage, setActivePage] = useState(0)

  const hasContent = previewStatus === "ready"

  return (
    <div className="w-[560px] rounded-lg border-2 border-rose-500/50 bg-workflow-node-bg shadow-lg flex flex-col">
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-workflow-handle !border-2 !border-workflow-handle-border"
      />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-workflow-border-subtle text-rose-600 dark:text-rose-400">
        <Monitor className="w-4 h-4" />
        <span className="font-mono text-sm font-medium text-workflow-text">Preview</span>

        {previewPages.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            {previewPages.map((page, i) => (
              <button
                key={page}
                type="button"
                onClick={() => setActivePage(i)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono border transition-colors duration-150",
                  activePage === i
                    ? "bg-foreground text-background border-transparent"
                    : "text-workflow-text-muted border-workflow-border-subtle hover:text-workflow-text"
                )}
              >
                {page}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded text-workflow-text-muted hover:text-workflow-text transition-colors duration-150"
              title="Öppna i ny flik"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            disabled={!hasContent}
            className="p-1.5 rounded text-workflow-text-muted hover:text-workflow-text transition-colors duration-150 disabled:opacity-40"
            title="Expandera till fullskärm"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="h-[380px] bg-workflow-node-input rounded-b-md overflow-hidden">
        {previewStatus === "idle" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-8">
            <Monitor className="w-8 h-8 text-workflow-text-subtle" />
            <p className="font-mono text-sm text-workflow-text-muted">Ingen preview ännu</p>
            <p className="text-xs text-workflow-text-subtle leading-relaxed">
              Skriv i chatten för att starta. Första versionen visas här.
            </p>
          </div>
        )}
        {previewStatus === "starting" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-workflow-text-muted" />
            <p className="font-mono text-xs text-workflow-text-muted">Preview startar…</p>
          </div>
        )}
        {previewStatus === "error" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <TriangleAlert className="w-6 h-6 text-amber-500" />
            <p className="font-mono text-xs text-workflow-text-muted">Något gick fel — reparerar…</p>
          </div>
        )}
        {hasContent && <PreviewFrame />}
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[92vw] w-[92vw] h-[88vh] p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Förhandsvisning i fullskärm</DialogTitle>
          <PreviewFrame className="h-[88vh]" />
        </DialogContent>
      </Dialog>
    </div>
  )
}
