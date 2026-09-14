import { resolveBuildPrincipalV1 } from "../../../../../../../lib/siteagent/server/principal.ts"
import { nextPreviewFailureStatus, privateHeaders } from "../../../../../../../lib/siteagent/server/next-preview-model.ts"
import { nextPreviewConfig, nextPreviewRepository } from "../../../../../../../lib/siteagent/server/next-preview-service.ts"
import { createAcceptedNextSourceArchive, NextSourceExportError, NextSourceExportRequestSchema } from "../../../../../../../lib/siteagent/server/next-source-export.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const json = (status: number, error: string) => Response.json({ error }, { status, headers: privateHeaders() })

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401, "unauthenticated")
  try {
    nextPreviewConfig()
    const search = new URL(request.url).searchParams
    const parsed = NextSourceExportRequestSchema.safeParse({
      sourceRevisionId: search.get("sourceRevisionId"), jobId: search.get("jobId"),
    })
    if (!parsed.success || search.getAll("sourceRevisionId").length !== 1 || search.getAll("jobId").length !== 1) {
      return json(400, "invalid_source_reference")
    }
    const repository = await nextPreviewRepository()
    const archive = await createAcceptedNextSourceArchive(repository.pool, principal, (await params).projectId, parsed.data)
    return new Response(Uint8Array.from(archive.bytes).buffer, {
      headers: {
        ...privateHeaders(),
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${archive.fileName}"`,
        "content-length": String(archive.bytes.byteLength),
        "cross-origin-resource-policy": "same-origin",
        "x-robots-tag": "noindex, nofollow, noarchive",
        vary: "Cookie",
      },
    })
  } catch (error) {
    if (error instanceof NextSourceExportError) return json(error.status, error.message)
    return json(nextPreviewFailureStatus(error), "source_unavailable")
  }
}
