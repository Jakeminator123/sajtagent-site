import { PostgresPersonalProjectRepositoryV1 } from "../../../../../lib/siteagent/server/project-repository.ts"
import { resolveBuildPrincipalV1 } from "../../../../../lib/siteagent/server/principal.ts"
import { isSameOriginMutation } from "../../../../../lib/siteagent/server/request-security.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ schemaVersion: 1, error: { code, message } }, { status })
}

function safeErrorDiagnostic(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object") return { name: typeof error }

  const record = error as Record<string, unknown>
  const diagnostic: Record<string, string> = {
    name: error instanceof Error ? error.name : "UnknownError",
  }
  for (const key of ["code", "constraint", "table", "routine"] as const) {
    if (typeof record[key] === "string") diagnostic[key] = record[key]
  }
  const cause = record.cause
  if (cause && typeof cause === "object") {
    const causeCode = (cause as Record<string, unknown>).code
    if (typeof causeCode === "string") diagnostic.causeCode = causeCode
  }
  return diagnostic
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return errorResponse(403, "cross_origin_request", "Begäran måste komma från samma origin.")
  }

  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return errorResponse(401, "unauthenticated", "Logga in för att skapa eller öppna ett projekt.")
  }

  try {
    const { dbConfigured, pool } = await import("../../../../../lib/db/client.ts")
    if (!dbConfigured || !pool) {
      return errorResponse(503, "persistence_unavailable", "Sajtagentens databas är inte konfigurerad.")
    }
    const project = await new PostgresPersonalProjectRepositoryV1(pool)
      .ensurePersonalStarterProject(principal)
    return Response.json({ schemaVersion: 1, ...project })
  } catch (error) {
    console.error(
      "[siteagent/projects/default] project_open_failed",
      safeErrorDiagnostic(error),
    )
    return errorResponse(503, "persistence_unavailable", "Projektet kunde inte öppnas auktoritativt.")
  }
}
