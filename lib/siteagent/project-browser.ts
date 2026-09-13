// Client routing is only a selector. Every project API still verifies its owner.
import {
  ProjectListResponseV2Schema,
  ProjectOpenResponseV2Schema,
  CreateProjectRequestV2Schema,
} from "../../contracts/project-v2.ts"

export function builderProjectHref(projectId: string): string {
  return `/builder?project=${encodeURIComponent(projectId)}`
}

async function payload(response: Response): Promise<unknown> {
  const value: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(response.status === 401
      ? "Logga in för att öppna dina projekt."
      : response.status === 404
        ? "Projektet finns inte eller tillhör ett annat konto."
        : "Projektbegäran misslyckades. Försök igen.")
  }
  return value
}

export async function listProjects(signal?: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl("/api/siteagent/projects", {
    cache: "no-store", signal,
  })
  return ProjectListResponseV2Schema.parse(await payload(response)).projects
}

export async function openProject(projectId: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`/api/siteagent/projects/${encodeURIComponent(projectId)}`, {
    cache: "no-store", signal,
  })
  const project = ProjectOpenResponseV2Schema.parse(await payload(response)).project
  if (project.projectId !== projectId) throw new Error("Servern returnerade fel projekt.")
  return project
}

export async function createProject(name?: string, fetchImpl: typeof fetch = fetch) {
  // Construct this envelope explicitly: no client/model-selected owner or worker.
  const request = CreateProjectRequestV2Schema.parse({ schemaVersion: 2, name })
  const response = await fetchImpl("/api/siteagent/projects", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
  })
  return ProjectOpenResponseV2Schema.parse(await payload(response)).project
}
