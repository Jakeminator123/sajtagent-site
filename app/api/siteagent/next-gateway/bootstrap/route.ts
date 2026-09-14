import { gatewayHostnameAllowed } from "../../../../../lib/siteagent/server/next-preview-gateway.ts"
import { previewBasePath, privateHeaders } from "../../../../../lib/siteagent/server/next-preview-model.ts"
import { nextPreviewConfig, nextPreviewRepository } from "../../../../../lib/siteagent/server/next-preview-service.ts"
import { NextPreviewAccessBindingSchema } from "../../../../../lib/siteagent/server/next-preview-access-binding.ts"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request:Request) {
  const headers = privateHeaders()
  try {
    const config = nextPreviewConfig(), hostname = new URL(request.url).hostname
    if (!gatewayHostnameAllowed(hostname,config.SITEAGENT_NEXT_PREVIEW_DOMAIN) || request.headers.get("origin")!==config.SITEAGENT_SITE_ORIGIN) return new Response(null,{status:403,headers})
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response(null,{status:415,headers})
    // A fixed-size grant and bounded revision binding; no multipart/body expansion.
    const reader = request.body?.getReader()
    if (!reader) return new Response(null,{status:400,headers})
    let body="", length=0
    const decoder=new TextDecoder()
    while(true) { const {done,value}=await reader.read(); if(done)break; length+=value.length; if(length>2048){await reader.cancel();return new Response(null,{status:413,headers})}; body+=decoder.decode(value,{stream:true}) }
    body+=decoder.decode()
    const fields = new URLSearchParams(body)
    const hasBinding = ["jobId","sourceRevisionId","previewRef"].some(key=>fields.has(key))
    const parsed = hasBinding ? NextPreviewAccessBindingSchema.safeParse({jobId:fields.get("jobId"),sourceRevisionId:fields.get("sourceRevisionId"),previewRef:fields.get("previewRef")}) : null
    if (parsed && !parsed.success) return new Response(null,{status:400,headers})
    const result = await (await nextPreviewRepository()).exchangeGrant(fields.get("grant")??"",hostname,parsed?.success?parsed.data:undefined)
    if (!result) return new Response(null,{status:401,headers})
    return new Response(null,{status:303,headers:{...headers,location:`${previewBasePath(result.accepted.previewRef)}/`,"set-cookie":`__Host-sajtagent-preview=${result.token}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=900`}})
  } catch { return new Response(null,{status:503,headers}) }
}
