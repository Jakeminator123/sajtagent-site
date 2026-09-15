import { nextPreviewOwnerReadModel } from "../../../../../../../lib/siteagent/server/agent-build-profile.ts"
import { nextPagesFailureResponse } from "../../../../../../../lib/siteagent/server/next-preview-failure.ts"
import { nextPreviewConfig, privateHeaders } from "../../../../../../../lib/siteagent/server/next-preview-model.ts"
import { NextPageMutationRequestSchema } from "../../../../../../../lib/siteagent/server/next-preview-pages.ts"
import { mutateNextPreviewPages } from "../../../../../../../lib/siteagent/server/next-preview-service.ts"
import { resolveBuildPrincipalV1 } from "../../../../../../../lib/siteagent/server/principal.ts"
import { readBoundedJsonV1 } from "../../../../../../../lib/siteagent/server/request-security.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 800

/**
 * Owner-bound add/remove of a Next page. Browser sends only op + route + CAS.
 * Source files stay server-side; the mutation rebuilds via `buildNextPreview`.
 */
const json = (status: number, body: unknown) => Response.json(body, { status, headers: privateHeaders() })

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (request.headers.get("origin") !== process.env.SITEAGENT_SITE_ORIGIN) return json(403, { error: "origin_denied" })
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401, { error: "unauthenticated" })
  try {
    nextPreviewConfig()
    const body = NextPageMutationRequestSchema.parse(await readBoundedJsonV1(request, 1024))
    const state = await mutateNextPreviewPages(principal, (await params).projectId, body, request.signal)
    if (!state) return json(404, { error: "project_not_found" })
    return json(200, nextPreviewOwnerReadModel(process.env, state))
  } catch (error) {
    const failure = nextPagesFailureResponse(error)
    return json(failure.status, failure.body)
  }
}
