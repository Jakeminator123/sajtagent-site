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
      error: { code: "unauthenticated", message: "Logga in för att läsa versioner." },
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
        error: { code: "persistence_unavailable", message: "Versionerna är inte tillgängliga." },
      })
    }
    const repository = new PostgresSiteVersionRepositoryV1(pool)
    const project = await repository.getProjectState(principal, projectId)
    if (!project) {
      return jsonResponse(404, {
        schemaVersion: 1,
        error: { code: "project_not_found", message: "Projektet hittades inte." },
      })
    }
    const versions = await repository.listVersions(principal, projectId)
    return jsonResponse(200, { schemaVersion: 1, projectId, versions })
  } catch {
    return jsonResponse(503, {
      schemaVersion: 1,
      error: { code: "versions_unavailable", message: "Versionerna kunde inte läsas." },
    })
  }
}
