"use client"

// Tärningssida: Karta — litet sidträd över den visade sajten.

import React from "react"
import { Map } from "lucide-react"
import { cn } from "@/lib/utils"
import { CardEmpty } from "../card-states"
import { useBuilder } from "../builder-store"
import { NextPageRemoveButton, NextPagesAddForm } from "../next-pages-controls"

function routeDepth(route: string): number {
  return route === "/" ? 0 : route.split("/").filter(Boolean).length
}

export function SitemapFace() {
  const {
    previewStatus,
    sitemapRevision,
    previewKind,
    previewRoutes,
    previewRoute,
    setPreviewRoute,
    nextState,
    mutateNextPages,
    canMutateNextPages,
  } = useBuilder()
  const canSelect = previewKind === "next" && previewRoutes.length > 1
  const building = previewStatus === "building"
  const pagesDisabled = !canMutateNextPages
  const pagesReason = building
    ? "Ett bygge kör. Vänta tills det är klart innan du ändrar sidor."
    : !nextState?.accepted
      ? "Sidändringar finns när en React-export är accepterad."
      : undefined

  if (previewKind === "next") {
    if (!nextState?.accepted) {
      return (
        <div className="flex h-full flex-col overflow-y-auto p-4">
          <CardEmpty icon={<Map className="h-5 w-5 text-violet-500" />} title="Ingen karta ännu">
            Sidträdet visas när en React-export har accepterats.
          </CardEmpty>
        </div>
      )
    }
    if (previewRoutes.length === 0) {
      return (
        <div className="flex h-full flex-col overflow-y-auto p-3">
          <CardEmpty icon={<Map className="h-5 w-5 text-violet-500" />} title="Ingen karta ännu">
            Den accepterade exporten har inga HTML-sidor att visa.
          </CardEmpty>
          <NextPagesAddForm
            disabled={pagesDisabled}
            disabledReason={pagesReason}
            onAdd={route => mutateNextPages("add", route)}
          />
        </div>
      )
    }
    return (
      <div className="flex h-full flex-col overflow-y-auto p-3">
        <p className="mb-2 px-1 text-[10px] leading-relaxed text-workflow-text-subtle">
          Sidor i den accepterade exporten.
        </p>
        <ul className="flex flex-col gap-1">
          {previewRoutes.map((route) => (
            <li key={route} className="flex items-center gap-1">
              {canSelect ? (
                <button
                  type="button"
                  onClick={() => setPreviewRoute(route)}
                  aria-current={route === previewRoute ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center rounded-md border px-2 py-1 text-left font-mono text-[10px] transition-colors duration-150",
                    route === previewRoute
                      ? "border-workflow-text/40 bg-workflow-surface-hover text-workflow-text"
                      : "border-workflow-border-subtle bg-workflow-node-input text-workflow-text-muted hover:text-workflow-text",
                  )}
                  style={{ paddingLeft: 8 + routeDepth(route) * 12 }}
                >
                  {route}
                </button>
              ) : (
                <div
                  className="min-w-0 flex-1 rounded-md border border-workflow-border-subtle bg-workflow-node-input px-2 py-1 font-mono text-[10px] text-workflow-text"
                  style={{ paddingLeft: 8 + routeDepth(route) * 12 }}
                >
                  {route}
                </div>
              )}
              {route !== "/" ? (
                <NextPageRemoveButton route={route} disabled={pagesDisabled} onRemove={routeToRemove => mutateNextPages("remove", routeToRemove)} />
              ) : null}
            </li>
          ))}
        </ul>
        <NextPagesAddForm
          disabled={pagesDisabled}
          disabledReason={pagesReason}
          onAdd={route => mutateNextPages("add", route)}
        />
        {previewRoutes.length === 200 ? (
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-workflow-text-subtle">
            Högst 200 sidor visas.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {previewStatus !== "ready" || !sitemapRevision ? (
        <CardEmpty icon={<Map className="h-5 w-5 text-violet-500" />} title="Ingen karta ännu">
          Sajtkartan visas först när ett HTML-bygge har verifierats.
        </CardEmpty>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-workflow-border-subtle bg-workflow-node-input px-3 py-1.5 font-mono text-[10px] text-workflow-text">
            /
          </div>
          <p className="text-[10px] leading-relaxed text-workflow-text-subtle">
            HTML-skissen är en sida. Det här är inte en karta över flera sidor.
          </p>
          <p className="text-[10px] leading-relaxed text-workflow-text-subtle">
            Lägg till och ta bort sidor i React-läget, inte i HTML-skissen.
          </p>
        </div>
      )}
    </div>
  )
}
