"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"

function normalizeRouteInput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

export function NextPagesAddForm({
  disabled,
  disabledReason,
  compact,
  onAdd,
}: {
  disabled: boolean
  disabledReason?: string
  compact?: boolean
  onAdd: (route: string) => Promise<void>
}) {
  const [route, setRoute] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = normalizeRouteInput(route)
    if (!next || disabled || busy) return
    setBusy(true)
    setError("")
    try {
      await onAdd(next)
      setRoute("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sidan kunde inte läggas till.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={event => void submit(event)} className={cn("flex flex-col gap-1", compact ? "" : "mt-2")}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={route}
          onChange={event => setRoute(event.target.value)}
          disabled={disabled || busy}
          placeholder="/kontakt"
          aria-label="Ny sidadress"
          className={cn(
            "min-w-0 flex-1 rounded-md border border-workflow-border-subtle bg-workflow-node-input px-2 py-1 font-mono text-[10px] text-workflow-text outline-none",
            (disabled || busy) && "opacity-50",
          )}
        />
        <button
          type="submit"
          disabled={disabled || busy || !normalizeRouteInput(route)}
          className="shrink-0 rounded-md border border-workflow-border-subtle px-2 py-1 font-mono text-[10px] text-workflow-text disabled:opacity-50"
        >
          {busy ? "Lägger till…" : "Lägg till"}
        </button>
      </div>
      {disabled && disabledReason ? (
        <p className="text-[10px] leading-relaxed text-workflow-text-subtle">{disabledReason}</p>
      ) : (
        <p className="text-[10px] leading-relaxed text-workflow-text-subtle">
          Adress som /kontakt. En länkrad i sajten uppdateras med sidan.
        </p>
      )}
      {error ? <p role="alert" className="text-[10px] text-amber-800">{error}</p> : null}
    </form>
  )
}

export function NextPageRemoveButton({
  route,
  disabled,
  onRemove,
}: {
  route: string
  disabled: boolean
  onRemove: (route: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function remove() {
    if (disabled || busy || route === "/") return
    setBusy(true)
    setError("")
    try {
      await onRemove(route)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sidan kunde inte tas bort.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void remove()}
        disabled={disabled || busy}
        className="rounded px-1.5 py-0.5 font-mono text-[10px] text-workflow-text-muted hover:text-workflow-text disabled:opacity-50"
        aria-label={`Ta bort ${route}`}
      >
        {busy ? "Tar bort…" : "Ta bort"}
      </button>
      {error ? <span role="alert" className="text-[10px] text-amber-800">{error}</span> : null}
    </span>
  )
}
