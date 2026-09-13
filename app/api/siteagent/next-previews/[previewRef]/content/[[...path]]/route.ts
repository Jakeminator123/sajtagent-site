import { gatewayHostnameAllowed, serveAcceptedStatic } from "../../../../../../../lib/siteagent/server/next-preview-gateway.ts"
import { privateHeaders } from "../../../../../../../lib/siteagent/server/next-preview-model.ts"
import { nextPreviewConfig, nextPreviewRepository } from "../../../../../../../lib/siteagent/server/next-preview-service.ts"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request:Request,{params}:{params:Promise<{previewRef:string;path?:string[]}>}) {
  const headers = privateHeaders()
  try {
    const config = nextPreviewConfig(), hostname = new URL(request.url).hostname
    if (!gatewayHostnameAllowed(hostname,config.SITEAGENT_NEXT_PREVIEW_DOMAIN)) return new Response(null,{status:404,headers})
    const {previewRef,path=[]}=await params
    const token = request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith("__Host-sajtagent-preview="))?.slice("__Host-sajtagent-preview=".length)??""
    const accepted = await (await nextPreviewRepository()).authorizeGateway(token,hostname,previewRef)
    if (!accepted) return new Response(null,{status:401,headers})
    return serveAcceptedStatic(accepted,path,request,config.SITEAGENT_SITE_ORIGIN)
  } catch { return new Response(null,{status:503,headers}) }
}
export const HEAD=GET
