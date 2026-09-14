"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseNextProjectState, type NextAvailability, type NextProjectState } from "@/lib/siteagent/next-preview-client"

/** One owner-bound read model shared by chat, preview, versions and publication. */
export function useNextProject(projectId: string | null) {
  const [snapshot, setSnapshot] = useState<{projectId: string | null; state: NextProjectState | null; availability: NextAvailability; hasNext: boolean; error: string}>({projectId: null, state: null, availability: "loading", hasNext: false, error: ""})
  const generation = useRef(0)
  const latestRead = useRef(0)
  const disabledProject = useRef<string | null>(null)
  const pollingEnabled = snapshot.projectId !== projectId || snapshot.availability !== "unavailable"

  const refresh = useCallback(async (signal?: AbortSignal): Promise<NextProjectState | null> => {
    if (!projectId) return null
    const startedGeneration = generation.current
    const read = ++latestRead.current
    const current = () => !signal?.aborted && startedGeneration === generation.current && read === latestRead.current
    try {
      const response = await fetch(`/api/siteagent/projects/${encodeURIComponent(projectId)}/next`, {cache: "no-store", signal})
      if (response.status === 404) {
        if (current()) { disabledProject.current = projectId; setSnapshot(previous => ({projectId, state: null, availability: "unavailable", hasNext: previous.projectId === projectId && previous.hasNext, error: ""})) }
        return null
      }
      if (!response.ok) throw new Error(response.status === 401 ? "Logga in igen för att öppna din React-preview." : "React-status kunde inte hämtas. Den senaste verifierade versionen behålls.")
      const state = parseNextProjectState(await response.json(), projectId)
      if (current()) { disabledProject.current = null; setSnapshot({projectId, state, availability: "available", hasNext: true, error: ""}) }
      return state
    } catch (reason) {
      if (current()) setSnapshot(previous => ({projectId, state: previous.projectId === projectId ? previous.state : null, availability: "error", hasNext: previous.projectId === projectId && previous.hasNext, error: reason instanceof Error ? reason.message : "React-status kunde inte hämtas."}))
      throw reason
    }
  }, [projectId])

  useEffect(() => {
    if (!pollingEnabled) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      try {
        const state = await refresh(abort.signal)
        if (!projectId || (!state && disabledProject.current === projectId)) return
      } catch { /* Error is visible; retry transient failures without erasing accepted output. */ }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 3000)
    }
    void poll()
    return () => { generation.current += 1; abort.abort(); if (timer) clearTimeout(timer) }
  }, [refresh, projectId, pollingEnabled])

  return snapshot.projectId === projectId
    ? {...snapshot, refresh}
    : {state: null, availability: "loading" as const, hasNext: false, error: "", refresh}
}
