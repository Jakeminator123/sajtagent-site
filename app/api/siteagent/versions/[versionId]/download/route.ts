import { resolveBuildPrincipalV1 } from "../../../../../../lib/siteagent/server/principal.ts"
import {
  privateJsonHeadersV1,
  SiteOpaqueIdV1Schema,
} from "../../../../../../lib/siteagent/server/version-model.ts"
import {
  createSingleHtmlZipV1,
  isSelfContainedPreviewHtmlV1,
  versionArchiveHeadersV1,
} from "../../../../../../lib/siteagent/server/version-archive.ts"

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
  { params }: { params: Promise<{ versionId: string }> },
): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return errorResponse(401, "unauthenticated", "Logga in för att hämta versionen.")
  }

  const { versionId } = await params
  if (!SiteOpaqueIdV1Schema.safeParse(versionId).success) {
    return errorResponse(404, "version_not_found", "Versionen hittades inte.")
  }

  try {
    const [{ dbConfigured, pool }, { PostgresSiteVersionRepositoryV1 }] = await Promise.all([
      import("../../../../../../lib/db/client.ts"),
      import("../../../../../../lib/siteagent/server/version-repository.ts"),
    ])
    if (!dbConfigured || !pool) {
      return errorResponse(503, "persistence_unavailable", "ZIP-exporten är inte tillgänglig.")
    }
    const stored = await new PostgresSiteVersionRepositoryV1(pool)
      .getVerifiedVersionExport(principal, versionId)
    if (!stored) {
      return errorResponse(404, "version_not_found", "Versionen hittades inte.")
    }
    if (!isSelfContainedPreviewHtmlV1(stored.preview.content)) {
      return errorResponse(
        409,
        "archive_requires_self_contained_preview",
        "Versionen använder externa filer och kan inte exporteras säkert som en fristående ZIP.",
      )
    }
    const archive = createSingleHtmlZipV1(
      stored.preview.content,
      stored.version.verifiedAt,
    )
    const body = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength,
    ) as ArrayBuffer
    return new Response(body, {
      status: 200,
      headers: versionArchiveHeadersV1(
        stored.version.versionNumber,
        archive.byteLength,
      ),
    })
  } catch {
    return errorResponse(503, "archive_unavailable", "ZIP-exporten kunde inte verifieras.")
  }
}
