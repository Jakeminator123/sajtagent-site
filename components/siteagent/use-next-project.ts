"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseNextProjectRead, type NextAvailability, type NextBuildProfile, type NextProjectState } from "@/lib/siteagent/next-preview-client"

type NextPageOp = "add" | "remove"

type NextProjectSnapshot = {
  projectId: string | null
  state: NextProjectState | null
  profile: NextBuildProfile | null
  availability: NextAvailability
  hasNext: boolean
  error: string
}

function pagesMutationError(status: number, code: string): string {
  if (status === 401) return "Logga in igen för att ändra sidor."
  if (status === 404 && code === "next_preview_unavailable") return "React är avstängt. Sidan sparades inte."
  if (code === "accepted_revision_changed") return "Sidträdet har ändrats. Läs om och försök igen."
  if (code === "project_busy") return "Ett bygge kör redan. Vänta tills det är klart."
  if (code === "home_page_reserved") return "Startsidan / kan inte tas bort."
  if (code === "invalid_page_route") return "Ogiltig sidadress. Använd /namn med a-z, 0-9 och bindestreck."
  if (code === "accepted_source_not_found") return "Ingen accepterad React-sajt att ändra ännu."
  return "Sidan kunde inte ändras. Den senaste verifierade versionen behålls."
}

/** One owner-bound read model shared by chat, preview, versions and publication. */
export function useNextProject(projectId: string | null) {
  const [snapshot, setSnapshot] = useState<NextProjectSnapshot>({projectId: null, state: null, profile: null, availability: "loading", hasNext: false, error: ""})
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
        if (current()) { disabledProject.current = projectId; setSnapshot(previous => ({projectId, state: null, availability: "unavailable", profile: null, hasNext: previous.projectId === projectId && previous.hasNext, error: ""})) }
        return null
      }
      if (!response.ok) throw new Error(response.status === 401 ? "Logga in igen för att öppna din React-preview." : "React-status kunde inte hämtas. Den senaste verifierade versionen behålls.")
      const parsed = parseNextProjectRead(await response.json(), projectId)
      if (current()) { disabledProject.current = null; setSnapshot({projectId, state: parsed.state, profile: parsed.profile, availability: "available", hasNext: true, error: ""}) }
      return parsed.state
    } catch (reason) {
      if (current()) setSnapshot(previous => ({
        projectId,
        state: previous.projectId === projectId ? previous.state : null,
        profile: previous.projectId === projectId ? previous.profile : null,
        availability: "error",
        hasNext: previous.projectId === projectId && previous.hasNext,
        error: reason instanceof Error ? reason.message : "React-status kunde inte hämtas.",
      }))
      throw reason
    }
  }, [projectId])

  const setProfilePreference = useCallback(async (preference: "html" | "next"): Promise<void> => {
    if (!projectId) return
    const startedGeneration = generation.current
    const current = () => startedGeneration === generation.current
    const response = await fetch(`/api/siteagent/projects/${encodeURIComponent(projectId)}/next/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preference }),
    })
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "React är avstängt. Valet sparades inte."
          : response.status === 401
            ? "Logga in igen för att byta byggläge."
            : "Byggläget kunde inte sparas. Utkastet ligger kvar.",
      )
    }
    const parsed = parseNextProjectRead(await response.json(), projectId)
    if (current()) {
      disabledProject.current = null
      setSnapshot({ projectId, state: parsed.state, profile: parsed.profile, availability: "available", hasNext: true, error: "" })
    }
  }, [projectId])

  const mutatePages = useCallback(async (op: NextPageOp, route: string): Promise<void> => {
    if (!projectId) return
    const accepted = snapshot.state?.accepted
    if (!accepted) throw new Error("Ingen accepterad React-sajt att ändra ännu.")
    const startedGeneration = generation.current
    const current = () => startedGeneration === generation.current
    const response = await fetch(`/api/siteagent/projects/${encodeURIComponent(projectId)}/next/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op,
        route,
        jobId: accepted.jobId,
        sourceRevisionId: accepted.sourceRevisionId,
      }),
    })
    if (!response.ok) {
      let code = ""
      try { code = String((await response.json() as { error?: string }).error ?? "") } catch { /* named body optional */ }
      throw new Error(pagesMutationError(response.status, code))
    }
    const parsed = parseNextProjectRead(await response.json(), projectId)
    if (current()) {
      disabledProject.current = null
      setSnapshot({ projectId, state: parsed.state, profile: parsed.profile, availability: "available", hasNext: true, error: "" })
    }
  }, [projectId, snapshot.state?.accepted])

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
    ? {...snapshot, refresh, setProfilePreference, mutatePages}
    : {state: null, profile: null, availability: "loading" as const, hasNext: false, error: "", refresh, setProfilePreference, mutatePages}
}
