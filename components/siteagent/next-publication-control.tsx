"use client"

import { useEffect, useState } from "react"

type Accepted = { sourceRevisionId: string; jobId: string } | null

export function NextPublicationControl({ projectId, accepted }: { projectId: string; accepted: Accepted }) {
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const endpoint = `/api/siteagent/projects/${encodeURIComponent(projectId)}/publish`
  useEffect(() => {
    const abort = new AbortController()
    void fetch(endpoint, { cache: "no-store", signal: abort.signal }).then(async response => {
      if (!response.ok) return
      const body = await response.json()
      if (!abort.signal.aborted) { setConfigured(body.configured === true); setUrl(body.published?.url ?? null) }
    }).catch(() => {})
    return () => abort.abort()
  }, [endpoint])

  async function publish() {
    if (!accepted || busy) return
    setBusy(true); setError("")
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceRevisionId: accepted.sourceRevisionId, jobId: accepted.jobId }) })
      if (!response.ok) throw new Error(response.status === 409 ? "Godkänd version ändrades. Uppdatera och försök igen." : "Publiceringen kunde inte bekräftas. Ladda om för att läsa aktuell status.")
      const body = await response.json()
      setUrl(body.published.url)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Publiceringen misslyckades.") }
    finally { setBusy(false) }
  }

  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <button type="button" disabled={!configured || !accepted || busy} onClick={() => void publish()} className="rounded border px-3 py-1 disabled:opacity-50" title={!configured ? "Publiceringsdomän är inte konfigurerad" : !accepted ? "Bygg och verifiera en Next-preview innan du publicerar." : "Publicera exakt godkänd Next-revision"}>
      {busy ? "Publicerar…" : "Publicera Next"}
    </button>
    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="underline">Öppna publicerad sajt</a>}
    {error && <span role="alert" className="text-red-600">{error}</span>}
  </div>
}
