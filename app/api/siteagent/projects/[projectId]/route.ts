import { PROJECT_CONTRACT_VERSION_V2 } from "../../../../../contracts/project-v2.ts"
import { PostgresProjectRepositoryV2 } from "../../../../../lib/siteagent/server/project-v2-repository.ts"
import { resolveBuildPrincipalV1 } from "../../../../../lib/siteagent/server/principal.ts"
import { privateJsonHeadersV1 } from "../../../../../lib/siteagent/server/version-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: privateJsonHeadersV1(),
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, {
    schemaVersion: PROJECT_CONTRACT_VERSION_V2,
    error: { code, message },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return errorResponse(401, "unauthenticated", "Logga in för att öppna projektet.")
  }

  try {
    const { projectId } = await params
    const { dbConfigured, pool } = await import("../../../../../lib/db/client.ts")
    if (!dbConfigured || !pool) {
      return errorResponse(503, "persistence_unavailable", "Sajtagentens databas är inte konfigurerad.")
    }
    const project = await new PostgresProjectRepositoryV2(pool)
      .openProject(principal, projectId)
    if (!project) {
      return errorResponse(404, "project_not_found", "Projektet hittades inte.")
    }
    return jsonResponse(200, {
      schemaVersion: PROJECT_CONTRACT_VERSION_V2,
      project,
    })
  } catch {
    return errorResponse(503, "persistence_unavailable", "Projektet kunde inte öppnas.")
  }
}
