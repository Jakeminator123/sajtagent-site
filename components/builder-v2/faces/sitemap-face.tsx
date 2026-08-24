"use client"

// Tärningssida: Karta — visuell/logisk sajtkarta över användarsajten.

import React from "react"
import { useBuilder } from "../builder-store"

export function SitemapFace() {
  const { previewPages, previewStatus } = useBuilder()

  return (
    <div className="h-full overflow-y-auto p-4">
      {previewStatus !== "ready" || previewPages.length === 0 ? (
        <p className="text-xs text-workflow-text-subtle text-center py-12 leading-relaxed">
          Sajtkartan visas när en version har genererats.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-0">
          <div className="rounded-lg border-2 border-foreground/60 bg-workflow-node-input px-4 py-2 font-mono text-xs text-workflow-text">
            Start
          </div>
          <div className="w-px h-4 bg-workflow-border" />
          <div className="flex items-start justify-center gap-3 flex-wrap">
            {previewPages.map((page) => (
              <div key={page} className="flex flex-col items-center gap-0">
                <div className="w-px h-3 bg-workflow-border" />
                <div className="rounded-md border border-workflow-border-subtle bg-workflow-node-input px-3 py-1.5 font-mono text-[10px] text-workflow-text-muted">
                  {page}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
