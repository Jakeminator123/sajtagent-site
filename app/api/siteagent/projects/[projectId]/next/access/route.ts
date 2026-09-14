import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server.ts"
import { resolveBuildPrincipalV1 } from "../../../../../../../lib/siteagent/server/principal.ts"
import { gatewayHost, privateHeaders } from "../../../../../../../lib/siteagent/server/next-preview-model.ts"
import { nextPreviewConfig, nextPreviewRepository } from "../../../../../../../lib/siteagent/server/next-preview-service.ts"
import { NextPreviewAccessBindingSchema } from "../../../../../../../lib/siteagent/server/next-preview-access-binding.ts"
import { readBoundedJsonV1 } from "../../../../../../../lib/siteagent/server/request-security.ts"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}) {
  const headers = privateHeaders()
  if (request.headers.get("origin") !== process.env.SITEAGENT_SITE_ORIGIN) return Response.json({error:"origin_denied"},{status:403,headers})
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return Response.json({error:"unauthenticated"},{status:401,headers})
  try {
    const config = nextPreviewConfig(), projectId = (await params).projectId
    const expected = request.body ? NextPreviewAccessBindingSchema.parse(await readBoundedJsonV1(request,2048)) : undefined
    const supabase = await createSupabaseServerClient()
    const claims = await supabase?.auth.getClaims()
    const sessionId = claims?.data?.claims.session_id
    if (claims?.error || typeof sessionId!=="string" || claims?.data?.claims.sub!==principal.userId) return Response.json({error:"unauthenticated"},{status:401,headers})
    const hostname = gatewayHost(principal.tenantId,projectId,config.SITEAGENT_NEXT_PREVIEW_DOMAIN)
    const grant = await (await nextPreviewRepository()).issueGrant(principal,projectId,sessionId,hostname,expected)
    return Response.json({schemaVersion:2,action:`https://${hostname}/api/siteagent/next-gateway/bootstrap`,grant,...(expected?{binding:expected}:{})},{headers})
  } catch { return Response.json({error:"preview_access_denied"},{status:403,headers}) }
}
