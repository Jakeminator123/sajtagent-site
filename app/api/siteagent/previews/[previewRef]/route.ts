import { resolveBuildPrincipalV1 } from "../../../../../lib/siteagent/server/principal.ts"
import {
  previewResponseHeadersV1,
  privateJsonHeadersV1,
} from "../../../../../lib/siteagent/server/version-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ schemaVersion: 1, error: { code, message } }), {
    status,
    headers: privateJsonHeadersV1(),
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ previewRef: string }> },
): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return errorResponse(401, "unauthenticated", "Logga in för att öppna previewn.")
  }

  try {
    const { previewRef } = await params
    const [{ dbConfigured, pool }, { PostgresSiteVersionRepositoryV1 }] = await Promise.all([
      import("../../../../../lib/db/client.ts"),
      import("../../../../../lib/siteagent/server/version-repository.ts"),
    ])
    if (!dbConfigured || !pool) {
      return errorResponse(503, "persistence_unavailable", "Previewn är inte tillgänglig.")
    }
    const preview = await new PostgresSiteVersionRepositoryV1(pool)
      .getPreview(principal, previewRef)
    if (!preview) {
      return errorResponse(404, "preview_not_found", "Previewn hittades inte.")
    }
    return new Response(preview.content, {
      status: 200,
      headers: previewResponseHeadersV1(preview.sizeBytes),
    })
  } catch {
    return errorResponse(503, "preview_unavailable", "Previewn kunde inte verifieras och visas inte.")
  }
}
