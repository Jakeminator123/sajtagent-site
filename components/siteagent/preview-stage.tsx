"use client"

// Preview-scenen: användarsajten som helskärmsbakgrund bakom alla plattor.
// Medvetet markant skild från kontrollytorna — ljust "browserfönster" med
// chrome-list, adress-pill och spotlight på mörk prickad scen.

import React, { useState } from "react"
import { ExternalLink, Globe, Loader2, Monitor, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { previewAddressLabel, previewStatusChip } from "./card-states"
import { useBuilder } from "./builder-store"
import { NextPreviewFrame } from "./next-preview-frame"

function PreviewFrame({ className }: { className?: string }) {
  const { previewUrl } = useBuilder()
  if (!previewUrl) return null
  return (
    <iframe
      src={previewUrl}
      title="HTML-förhandsvisning av sajten"
      sandbox=""
      className={cn("w-full h-full border-0 bg-white", className)}
    />
  )
}

export function PreviewStage() {
  const {
    previewStatus,
    previewUrl,
    previewKind,
    previewRoutes,
    previewRoute,
    setPreviewRoute,
    nextState,
    nextAvailability,
    nextError,
    refreshNextPreview,
    cancelNextBuild,
  } = useBuilder()
  const [refresh, setRefresh] = useState(0)
  const [actionError, setActionError] = useState("")
  const isNext = previewKind === "next"
  const accepted = isNext ? nextState?.accepted : null
  const hasContent = nextAvailability !== "loading" && Boolean(previewUrl || accepted)
  const chip = previewStatusChip(previewStatus, hasContent)
  const canSwitchRoutes = Boolean(accepted) && previewRoutes.length > 1
  const address = accepted ? "Privat · din verifierade React-sajt" : previewAddressLabel(previewStatus, previewUrl)

  async function refreshPreview() {
    try { await refreshNextPreview(); setRefresh(value => value + 1); setActionError("") }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "Previewn kunde inte uppdateras.") }
  }
  async function cancel() {
    try { await cancelNextBuild(); setActionError("") }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "Avbrottet kunde inte bekräftas.") }
  }

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
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="shrink-0 text-[11px] font-medium text-zinc-600">
              {nextAvailability === "loading" ? "Läser byggläge…" : nextAvailability === "error" && !hasContent ? "Byggläge saknas" : isNext ? "React · Next.js" : "HTML-preview"}
            </span>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1 max-w-[480px] w-full">
                <Globe className="w-3 h-3 shrink-0 text-zinc-400" />
                {canSwitchRoutes ? (
                  <select
                    aria-label="Sida"
                    value={previewRoutes.includes(previewRoute) ? previewRoute : (previewRoutes[0] ?? "/")}
                    onChange={(event) => setPreviewRoute(event.target.value)}
                    className="min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-zinc-600 outline-none"
                  >
                    {previewRoutes.map((route) => (
                      <option key={route} value={route}>
                        {route}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">
                    {address}
                  </span>
                )}
                <span
                  role="status"
                  aria-live="polite"
                  data-preview-status={previewStatus}
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] leading-none",
                    chip.className,
                  )}
                >
                  {chip.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {accepted && <button type="button" onClick={() => void refreshPreview()} className="rounded px-2 py-1 text-xs text-zinc-600" title="Förnya åtkomsten till din privata preview">Uppdatera</button>}
              {!accepted && nextAvailability !== "loading" && <button type="button" onClick={() => void refreshPreview()} className="rounded px-2 py-1 text-xs text-zinc-600">Läs byggläge igen</button>}
              {isNext && nextState?.current?.status === "building" && <button type="button" onClick={() => void cancel()} className="rounded px-2 py-1 text-xs text-zinc-600">Avbryt bygge</button>}
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 transition-colors duration-150"
                  title="Öppna i ny flik"
                  aria-label="Öppna preview i ny flik"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
          <p className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] text-zinc-600">
            {isNext
              ? nextAvailability === "unavailable" ? "React-flödet är tillfälligt avstängt. Tidigare HTML-sidor kan öppnas i Versioner."
                : "Bygg och ändra din React-sajt i Sajtagent-kortet. Förhandsvisningen är privat och interaktiv."
              : nextAvailability === "loading" ? "Läser projektets byggläge. Ditt utkast ligger kvar tills du kan skicka."
                : nextAvailability === "error" ? "Byggläget kunde inte bekräftas. Läs byggläget igen för att fortsätta. Ditt utkast ligger kvar."
                : nextAvailability === "available" ? "Visar HTML-historik. Nya byggbeställningar i Sajtagent använder React."
                  : "HTML-läge. React aktiveras när projektets byggmiljö är redo."}
          </p>
          {(nextError || actionError) && <p role="alert" className="shrink-0 bg-amber-50 px-3 py-2 text-xs text-amber-900">{actionError || nextError}</p>}

          {/* Innehåll */}
          <div className="flex-1 min-h-0 bg-white">
            {previewStatus === "idle" && !hasContent && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                <Monitor className="w-10 h-10 text-zinc-300" />
                <p className="font-mono text-base text-zinc-600">Din sajt visas här</p>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-sm text-pretty">
                  Skriv till Sajtagent. Frågor får svar utan bygge. En tydlig
                  sajtbeställning startar bygget. Previewn stannar här så du kan fortsätta prompta.
                </p>
              </div>
            )}
            {previewStatus === "building" && !hasContent && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
                <p className="font-mono text-sm text-zinc-500">Sajtagent bygger…</p>
                <p className="text-xs text-zinc-400">Preview öppnas först efter verifierad framgång.</p>
              </div>
            )}
            {previewStatus === "error" && !hasContent && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-8 text-center">
                <TriangleAlert className="h-7 w-7 text-amber-500" />
                <p className="font-mono text-sm text-zinc-500">Bygget stoppades — ingen preview accepterades.</p>
                <p className="max-w-sm text-xs leading-relaxed text-zinc-400">
                  Ingen sajt öppnades. Orsaken står i Sajtagent-kortet.
                </p>
              </div>
            )}
            {hasContent && (
              <div className="relative w-full h-full">
                {accepted ? (
                  <NextPreviewFrame
                    key={`${accepted.projectId}:${accepted.previewRef}`}
                    accepted={accepted}
                    refresh={refresh}
                    route={previewRoute}
                  />
                ) : (
                  <PreviewFrame />
                )}
                {previewStatus === "building" && (
                  <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-white/80 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    <p className="font-mono text-xs text-zinc-500">Ny version byggs — nuvarande preview stannar.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
