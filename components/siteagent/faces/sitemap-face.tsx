"use client"

// Tärningssida: Karta — visuell/logisk sajtkarta över användarsajten.

import React from "react"
import { GitBranch, ShieldCheck } from "lucide-react"
import { useBuilder } from "../builder-store"

export function SitemapFace() {
  const { previewStatus, sitemapRevision } = useBuilder()

  return (
    <div className="h-full overflow-y-auto p-4">
      {previewStatus !== "ready" || !sitemapRevision ? (
        <p className="text-xs text-workflow-text-subtle text-center py-12 leading-relaxed">
          Sajtkartan visas först när ett bygge har verifierats.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-0">
          <div className="flex items-center gap-1.5 rounded-lg border-2 border-foreground/60 bg-workflow-node-input px-4 py-2 font-mono text-xs text-workflow-text">
            <GitBranch className="h-3.5 w-3.5" /> Verifierad sajtkarta
          </div>
          <div className="w-px h-4 bg-workflow-border" />
          <div className="flex max-w-full items-center gap-1.5 rounded-md border border-workflow-border-subtle bg-workflow-node-input px-3 py-1.5 font-mono text-[10px] text-workflow-text-muted">
            <ShieldCheck className="h-3 w-3 shrink-0" />
            <span className="truncate">Revision {sitemapRevision}</span>
          </div>
          <p className="mt-3 max-w-[240px] text-center text-[10px] leading-relaxed text-workflow-text-subtle">
            Routeträdet hämtas från denna canonical revision när read-modellen är ansluten.
          </p>
        </div>
      )}
    </div>
  )
}
