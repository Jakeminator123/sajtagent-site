import { resolveBuildPrincipalV1 } from "../../../../../../lib/siteagent/server/principal.ts"
import { privateJsonHeadersV1 } from "../../../../../../lib/siteagent/server/version-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: privateJsonHeadersV1(),
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return jsonResponse(401, {
      schemaVersion: 1,
      error: { code: "unauthenticated", message: "Logga in för att läsa projektet." },
    })
  }

  try {
    const { projectId } = await params
    const [{ dbConfigured, pool }, { PostgresSiteVersionRepositoryV1 }] = await Promise.all([
      import("../../../../../../lib/db/client.ts"),
      import("../../../../../../lib/siteagent/server/version-repository.ts"),
    ])
    if (!dbConfigured || !pool) {
      return jsonResponse(503, {
        schemaVersion: 1,
        error: { code: "persistence_unavailable", message: "Projektläget är inte tillgängligt." },
      })
    }
    const project = await new PostgresSiteVersionRepositoryV1(pool)
      .getProjectState(principal, projectId)
    if (!project) {
      return jsonResponse(404, {
        schemaVersion: 1,
        error: { code: "project_not_found", message: "Projektet hittades inte." },
      })
    }
    return jsonResponse(200, { schemaVersion: 1, project })
  } catch {
    return jsonResponse(503, {
      schemaVersion: 1,
      error: { code: "project_state_unavailable", message: "Projektläget kunde inte läsas." },
    })
  }
}
