import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server.ts"
import { resolveBuildPrincipalV1 } from "../../../../../../../lib/siteagent/server/principal.ts"
import { gatewayHost, privateHeaders } from "../../../../../../../lib/siteagent/server/next-preview-model.ts"
import { nextPreviewConfig, nextPreviewRepository } from "../../../../../../../lib/siteagent/server/next-preview-service.ts"
import { NextPreviewAccessBindingSchema } from "../../../../../../../lib/siteagent/server/next-preview-access-binding.ts"
import { nextAccessFailureResponse } from "../../../../../../../lib/siteagent/server/next-preview-failure.ts"
import { readBoundedJsonV1 } from "../../../../../../../lib/siteagent/server/request-security.ts"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}) {
  const headers = privateHeaders()
  const json = (status:number,body:unknown) => Response.json(body,{status,headers})
  if (request.headers.get("origin") !== process.env.SITEAGENT_SITE_ORIGIN) return json(403,{error:"origin_denied"})
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401,{error:"unauthenticated"})
  try {
    const config = nextPreviewConfig(), projectId = (await params).projectId
    // On Vercel a body-less POST still exposes an empty stream, so `request.body` alone cannot mean "binding supplied".
    const hasBody = Number(request.headers.get("content-length") ?? 0) > 0 || (request.headers.get("transfer-encoding") ?? "").includes("chunked")
    const expected = hasBody ? NextPreviewAccessBindingSchema.parse(await readBoundedJsonV1(request,2048)) : undefined
    const supabase = await createSupabaseServerClient()
    const claims = await supabase?.auth.getClaims()
    const sessionId = claims?.data?.claims.session_id
    if (claims?.error || typeof sessionId!=="string" || claims?.data?.claims.sub!==principal.userId) return json(401,{error:"unauthenticated"})
    const hostname = gatewayHost(principal.tenantId,projectId,config.SITEAGENT_NEXT_PREVIEW_DOMAIN)
    const grant = await (await nextPreviewRepository()).issueGrant(principal,projectId,sessionId,hostname,expected)
    return json(200,{schemaVersion:2,action:`https://${hostname}/api/siteagent/next-gateway/bootstrap`,grant,...(expected?{binding:expected}:{})})
  } catch (error) {
    const failure = nextAccessFailureResponse(error)
    return json(failure.status, failure.body)
  }
}
