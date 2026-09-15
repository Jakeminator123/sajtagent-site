"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { acceptedPreviewableRoutes, nextPreviewFramePropsEqual, previewContentUrl, type AcceptedNextPreview } from "@/lib/siteagent/next-preview-client"
import { previewRouteFromFrameMessage } from "@/lib/siteagent/preview-route-tree"

/** Customer code only runs on the owner-bound, separate-origin gateway. */
export const NextPreviewFrame = React.memo(function NextPreviewFrame({
  accepted,
  refresh,
  route,
  onRoute,
}: {
  accepted: AcceptedNextPreview
  refresh: number
  route: string
  onRoute?: (route: string) => void
}) {
  const form = useRef<HTMLFormElement>(null)
  const iframe = useRef<HTMLIFrameElement>(null)
  const previewOrigin = useRef<string | null>(null)
  const [error, setError] = useState("")
  const [bootstrapped, setBootstrapped] = useState(false)
  const {projectId, jobId, sourceRevisionId, previewRef} = accepted
  const previewable = useMemo(() => acceptedPreviewableRoutes(accepted), [accepted])
  const allowedRoute = previewable.includes(route) ? route : "/"

  useEffect(() => {
    const abort = new AbortController()
    previewOrigin.current = null
    setBootstrapped(false)
    iframe.current?.removeAttribute("src")
    async function open() {
      try {
        const response = await fetch(`/api/siteagent/projects/${encodeURIComponent(projectId)}/next/access`, {
          method: "POST", headers: {"content-type": "application/json"},
          body: JSON.stringify({jobId, sourceRevisionId, previewRef}), signal: abort.signal,
        })
        if (!response.ok) throw new Error("Previewåtkomsten kunde inte bekräftas. Uppdatera previewn och försök igen.")
        const access = await response.json()
        if (abort.signal.aborted || !form.current) return
        const action = new URL(access.action)
        if (action.protocol !== "https:" || action.origin === window.location.origin || action.username || action.password ||
          action.pathname !== "/api/siteagent/next-gateway/bootstrap" || action.search || action.hash ||
          typeof access.grant !== "string" || !access.grant ||
          access.binding?.jobId !== jobId || access.binding?.sourceRevisionId !== sourceRevisionId || access.binding?.previewRef !== previewRef) {
          throw new Error("Previewåtkomsten matchade inte den visade versionen.")
        }
        form.current.action = action.href
        const grant = form.current.elements.namedItem("grant") as HTMLInputElement
        grant.value = access.grant
        previewOrigin.current = action.origin
        form.current.submit()
        grant.value = ""
        setError("")
      } catch (reason) {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Previewn kunde inte öppnas.")
      }
    }
    void open()
    return () => abort.abort()
  }, [projectId, jobId, sourceRevisionId, previewRef, refresh])

  useEffect(() => {
    const frame = iframe.current
    const origin = previewOrigin.current
    if (!bootstrapped || !frame || !origin) return
    if (allowedRoute === "/" && !frame.getAttribute("src")) return
    const next = previewContentUrl(origin, previewRef, allowedRoute)
    const parsed = new URL(next)
    if (parsed.origin !== origin || parsed.protocol !== "https:" || parsed.search || parsed.hash) return
    if (frame.src !== next) frame.src = next
  }, [bootstrapped, allowedRoute, previewRef])

  useEffect(() => {
    const origin = previewOrigin.current
    if (!bootstrapped || !origin || !onRoute) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return
      const next = previewRouteFromFrameMessage(event.data, previewable)
      if (next) onRoute(next)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [bootstrapped, onRoute, previewable])

  return <div className="relative h-full w-full">
    {error && <p role="alert" className="absolute inset-x-0 top-0 z-10 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    <form ref={form} method="POST" target="sajtagent-next-preview" className="hidden">
      <input type="hidden" name="grant" />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="sourceRevisionId" value={sourceRevisionId} />
      <input type="hidden" name="previewRef" value={previewRef} />
    </form>
    <iframe
      ref={iframe}
      name="sajtagent-next-preview"
      title="Interaktiv React/Next.js-preview"
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      className="h-full w-full border-0 bg-white"
      onLoad={() => {
        try {
          if (iframe.current?.contentWindow?.location.href === "about:blank") return
        } catch {
          // Preview-hosten är ett annat origin; cookie är satt efter bootstrap.
        }
        if (previewOrigin.current) setBootstrapped(true)
      }}
    />
  </div>
}, nextPreviewFramePropsEqual)
