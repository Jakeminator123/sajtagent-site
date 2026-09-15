"use client"

// Tärningssida: Karta — litet sidträd över den visade sajten.

import React, { useState } from "react"
import { Map } from "lucide-react"
import { cn } from "@/lib/utils"
import { CardEmpty } from "../card-states"
import { useBuilder } from "../builder-store"
import { NextPageAddUnderButton, NextPageRemoveButton, NextPagesAddForm } from "../next-pages-controls"
import { buildPreviewRouteTree, draftRouteUnderParent, previewRouteLabel, type PreviewRouteNode } from "@/lib/siteagent/preview-route-tree"

function sitemapRowNote(
  node: PreviewRouteNode,
  previewableRoutes: readonly string[],
): string | null {
  if (node.virtual) return "grupp"
  if (!previewableRoutes.includes(node.route)) return "inte i previewn ännu"
  return null
}

function SitemapBranch({
  nodes,
  canSelect,
  previewableRoutes,
  previewRoute,
  pagesDisabled,
  onSelect,
  onRemove,
  onAddUnder,
}: {
  nodes: PreviewRouteNode[]
  canSelect: boolean
  previewableRoutes: readonly string[]
  previewRoute: string
  pagesDisabled: boolean
  onSelect: (route: string) => void
  onRemove: (route: string) => Promise<void>
  onAddUnder: (parentRoute: string) => void
}) {
  return (
    <ul className="flex flex-col gap-1">
      {nodes.map((node) => {
        const note = sitemapRowNote(node, previewableRoutes)
        const selectable = canSelect && !node.virtual && previewableRoutes.includes(node.route)
        return (
        <li key={node.route}>
          <div className="flex items-center gap-1">
            {selectable ? (
              <button
                type="button"
                onClick={() => onSelect(node.route)}
                aria-current={node.route === previewRoute ? "page" : undefined}
                aria-label={node.route}
                title={node.route}
                className={cn(
                  "flex min-w-0 flex-1 items-center rounded-md border px-2 py-1 text-left font-mono text-[10px] transition-colors duration-150",
                  node.route === previewRoute
                    ? "border-workflow-text/40 bg-workflow-surface-hover text-workflow-text"
                    : "border-workflow-border-subtle bg-workflow-node-input text-workflow-text-muted hover:text-workflow-text",
                )}
              >
                {previewRouteLabel(node.route)}
              </button>
            ) : (
              <div
                title={node.route}
                className={cn(
                  "min-w-0 flex-1 rounded-md border border-workflow-border-subtle bg-workflow-node-input px-2 py-1 font-mono text-[10px]",
                  node.virtual || !previewableRoutes.includes(node.route)
                    ? "italic text-workflow-text-subtle"
                    : "text-workflow-text",
                )}
              >
                {previewRouteLabel(node.route)}
                {note ? <span className="ml-1 not-italic text-workflow-text-subtle">({note})</span> : null}
              </div>
            )}
            <NextPageAddUnderButton
              parentRoute={node.route}
              disabled={pagesDisabled}
              onAddUnder={onAddUnder}
            />
            {node.route !== "/" && !node.virtual ? (
              <NextPageRemoveButton route={node.route} disabled={pagesDisabled} onRemove={onRemove} />
            ) : null}
          </div>
          {node.children.length > 0 ? (
            <div className="mt-1 ml-3 border-l border-workflow-border-subtle pl-2">
              <SitemapBranch
                nodes={node.children}
                canSelect={canSelect}
                previewableRoutes={previewableRoutes}
                previewRoute={previewRoute}
                pagesDisabled={pagesDisabled}
                onSelect={onSelect}
                onRemove={onRemove}
                onAddUnder={onAddUnder}
              />
            </div>
          ) : null}
        </li>
        )
      })}
    </ul>
  )
}

export function SitemapFace() {
  const {
    previewStatus,
    sitemapRevision,
    previewKind,
    previewRoutes,
    previewableRoutes,
    previewRoute,
    setPreviewRoute,
    nextState,
    mutateNextPages,
    canMutateNextPages,
  } = useBuilder()
  const canSelect = previewKind === "next"
  const building = previewStatus === "building"
  const pagesDisabled = !canMutateNextPages
  const [routeDraft, setRouteDraft] = useState("")
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
            Den accepterade källan har inga sidor att visa.
          </CardEmpty>
          <NextPagesAddForm
            disabled={pagesDisabled}
            disabledReason={pagesReason}
            routeDraft={routeDraft}
            onRouteDraft={setRouteDraft}
            onAdd={route => mutateNextPages("add", route)}
          />
        </div>
      )
    }
    return (
      <div className="flex h-full flex-col overflow-y-auto p-3">
        <p className="mb-2 px-1 text-[10px] leading-relaxed text-workflow-text-subtle">
          Sidor i den accepterade React-källan. + lägger en undersida.
        </p>
        <SitemapBranch
          nodes={buildPreviewRouteTree(previewRoutes)}
          canSelect={canSelect}
          previewableRoutes={previewableRoutes}
          previewRoute={previewRoute}
          pagesDisabled={pagesDisabled}
          onSelect={setPreviewRoute}
          onRemove={routeToRemove => mutateNextPages("remove", routeToRemove)}
          onAddUnder={parent => setRouteDraft(draftRouteUnderParent(parent))}
        />
        <NextPagesAddForm
          disabled={pagesDisabled}
          disabledReason={pagesReason}
          routeDraft={routeDraft}
          onRouteDraft={setRouteDraft}
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
