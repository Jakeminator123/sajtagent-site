"use client"

// Preview-scenen: användarsajten som helskärmsbakgrund bakom alla plattor.
// Medvetet markant skild från kontrollytorna — ljust "browserfönster" med
// chrome-list, adress-pill och spotlight på mörk prickad scen.

import React, { useState } from "react"
import { ExternalLink, Globe, Loader2, Monitor, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBuilder } from "./builder-store"

function PreviewFrame({ className }: { className?: string }) {
  const { previewUrl, previewSrcDoc } = useBuilder()
  if (previewUrl) {
    return (
      <iframe
        src={previewUrl}
        title="Förhandsvisning av sajten"
        className={cn("w-full h-full border-0 bg-white", className)}
      />
    )
  }
  if (previewSrcDoc) {
    return (
      <iframe
        srcDoc={previewSrcDoc}
        title="Förhandsvisning av sajten"
        className={cn("w-full h-full border-0 bg-white", className)}
      />
    )
  }
  return null
}

export function PreviewStage() {
  const { previewStatus, previewUrl, previewPages } = useBuilder()
  const [activePage, setActivePage] = useState(0)
  const hasContent = previewStatus === "ready"

  return (
    <div className="absolute inset-0 bg-workflow-canvas transition-colors duration-200">
      {/* Prickmönster som i canvas-vyn */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, var(--workflow-dot, rgba(120,120,130,0.35)) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      {/* Spotlight bakom sajtfönstret */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(244,63,94,0.08), transparent 70%)",
        }}
      />

      {/* Själva sajtfönstret — ljust, upphöjt, med chrome-list */}
      <div className="absolute inset-x-0 top-6 bottom-6 flex items-stretch justify-center px-6">
        <div className="relative w-full max-w-[1100px] rounded-xl overflow-hidden shadow-2xl ring-1 ring-primary/30 flex flex-col bg-white dark:bg-zinc-100">
          {/* Chrome-list */}
          <div className="h-10 shrink-0 bg-zinc-100 dark:bg-zinc-200 border-b border-zinc-200 dark:border-zinc-300 flex items-center gap-3 px-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1 max-w-[420px] w-full justify-center">
                <Globe className="w-3 h-3 text-zinc-400" />
                <span className="font-mono text-[11px] text-zinc-500 truncate">
                  {previewUrl ?? "din-sajt.siteagent.app"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {previewPages.length > 0 && (
                <div className="flex items-center gap-1 mr-1">
                  {previewPages.map((page, i) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setActivePage(i)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono border transition-colors duration-150",
                        activePage === i
                          ? "bg-zinc-800 text-white border-transparent"
                          : "text-zinc-500 border-zinc-300 hover:text-zinc-800"
                      )}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              )}
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 transition-colors duration-150"
                  title="Öppna i ny flik"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Innehåll */}
          <div className="flex-1 min-h-0 bg-white">
            {previewStatus === "idle" && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                <Monitor className="w-10 h-10 text-zinc-300" />
                <p className="font-mono text-base text-zinc-600">Din sajt visas här</p>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-sm text-pretty">
                  Skriv till OpenClaw för att starta. Sajten fyller hela scenen — plattorna runt om kan
                  vikas ner till kuben nere till höger.
                </p>
              </div>
            )}
            {previewStatus === "starting" && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
                <p className="font-mono text-sm text-zinc-500">Preview startar…</p>
              </div>
            )}
            {previewStatus === "error" && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <TriangleAlert className="w-7 h-7 text-amber-500" />
                <p className="font-mono text-sm text-zinc-500">Bygget stoppades — inget resultat skapades.</p>
              </div>
            )}
            {hasContent && <PreviewFrame />}
          </div>
        </div>
      </div>
    </div>
  )
}
