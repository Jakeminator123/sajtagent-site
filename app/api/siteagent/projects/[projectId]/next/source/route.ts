import { resolveBuildPrincipalV1 } from "../../../../../../../lib/siteagent/server/principal.ts"
import { privateHeaders } from "../../../../../../../lib/siteagent/server/next-preview-model.ts"
import { nextPreviewRepository, nextPreviewConfig } from "../../../../../../../lib/siteagent/server/next-preview-service.ts"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}) {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return Response.json({error:"unauthenticated"},{status:401,headers:privateHeaders()})
  try {
    nextPreviewConfig()
    const repo = await nextPreviewRepository(), projectId = (await params).projectId
    const accepted = await repo.getAccepted(principal,projectId), files = await repo.getAcceptedSource(principal,projectId)
    if (!accepted || !files) return Response.json({error:"source_not_found"},{status:404,headers:privateHeaders()})
    return Response.json({schemaVersion:2,sourceRevisionId:accepted.sourceRevisionId,files},{headers:privateHeaders()})
  } catch { return Response.json({error:"source_unavailable"},{status:503,headers:privateHeaders()}) }
}
