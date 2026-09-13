"use client"

import { useEffect, useState } from "react"
import type { ProjectV2 } from "@/contracts/project-v2"
import { builderProjectHref, listProjects } from "@/lib/siteagent/project-browser"
import { useBuilder } from "./builder-store"

export function ProjectSelector() {
  const { projectId, isResettingProject } = useBuilder()
  const [projects, setProjects] = useState<ProjectV2[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    // Wait for the default starter to exist before listing it.
    if (!projectId) return
    void listProjects(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) {
        setProjects(loaded)
        setError(null)
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError("Projektlistan kunde inte hämtas. Ladda om sidan.")
    })
    return () => controller.abort()
  }, [projectId])

  return (
    <div className="min-w-0 max-w-48">
      <label className="sr-only" htmlFor="builder-project">Öppna projekt</label>
      <select
        id="builder-project"
        value={projectId ?? ""}
        disabled={isResettingProject || projects.length === 0}
        onChange={(event) => {
          // Reload isolates card state, pending callbacks and chat projection.
          window.location.assign(builderProjectHref(event.target.value))
        }}
        className="w-full rounded-lg border border-workflow-border bg-workflow-surface px-2 py-2 font-mono text-sm text-workflow-text"
      >
        {!projects.some((project) => project.projectId === projectId) ? (
          <option value={projectId ?? ""}>{error ? "Projekt otillgängligt" : "Öppnar projekt…"}</option>
        ) : null}
        {projects.map((project) => (
          <option key={project.projectId} value={project.projectId}>{project.name}</option>
        ))}
      </select>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
