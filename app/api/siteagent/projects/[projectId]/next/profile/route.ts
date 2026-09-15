import { z } from "zod"
import { nextPreviewOwnerReadModel } from "../../../../../../../lib/siteagent/server/agent-build-profile.ts"
import { nextProfileFailureResponse } from "../../../../../../../lib/siteagent/server/next-preview-failure.ts"
import { nextPreviewConfig, privateHeaders } from "../../../../../../../lib/siteagent/server/next-preview-model.ts"
import { nextPreviewRepository } from "../../../../../../../lib/siteagent/server/next-preview-service.ts"
import { resolveBuildPrincipalV1 } from "../../../../../../../lib/siteagent/server/principal.ts"
import { readBoundedJsonV1 } from "../../../../../../../lib/siteagent/server/request-security.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Temporary owner preference for the HTML-sketch vs Next build profile.
 * Lives under `/next/` so a Next-off deployment returns 404
 * `next_preview_unavailable` (Site #37). The switch is meaningless then, and
 * this path cannot store `preference: "next"` while the deployment gate is closed.
 * Does not migrate artifacts, touch `next_publications_v2`, or change the published revision.
 */
const NextProfilePreferenceRequestSchema = z.object({
  preference: z.enum(["html", "next"]),
}).strict()

const json = (status: number, body: unknown) => Response.json(body, { status, headers: privateHeaders() })

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (request.headers.get("origin") !== process.env.SITEAGENT_SITE_ORIGIN) return json(403, { error: "origin_denied" })
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401, { error: "unauthenticated" })
  try {
    nextPreviewConfig()
    const body = NextProfilePreferenceRequestSchema.parse(await readBoundedJsonV1(request, 1024))
    const state = await (await nextPreviewRepository()).setProfilePreference(principal, (await params).projectId, body.preference)
    return json(200, nextPreviewOwnerReadModel(process.env, state))
  } catch (error) {
    const failure = nextProfileFailureResponse(error)
    return json(failure.status, failure.body)
  }
}
