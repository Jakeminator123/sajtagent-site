import { resolveBuildPrincipalV1 } from "../../../../../../lib/siteagent/server/principal.ts"
import { readBoundedJsonV1 } from "../../../../../../lib/siteagent/server/request-security.ts"
import { NextSourceRequestSchema, privateHeaders } from "../../../../../../lib/siteagent/server/next-preview-model.ts"
import { buildNextPreview, generateNextPreview, nextPreviewConfig, nextPreviewRepository } from "../../../../../../lib/siteagent/server/next-preview-service.ts"
import { NextRuntimeClient } from "../../../../../../lib/siteagent/server/next-preview-runtime.ts"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 800
type Context = { params: Promise<{projectId:string}> }
const json = (status:number,body:unknown) => Response.json(body,{status,headers:privateHeaders()})

export async function GET(request:Request,{params}:Context) {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401,{error:"unauthenticated"})
  try {
    nextPreviewConfig()
    const state = await (await nextPreviewRepository()).getState(principal,(await params).projectId)
    if (!state) return json(404,{error:"project_not_found"})
    // Do not send artifact bundles, original protected URLs or worker routing to clients.
    const a=state.accepted
    const accepted = a ? {tenantId:a.tenantId,projectId:a.projectId,jobId:a.jobId,sourceRevisionId:a.sourceRevisionId,previewRef:a.previewRef,deploymentId:a.deploymentId,acceptedAt:a.acceptedAt,outputSha256:a.outputSha256} : null
    return json(200,{schemaVersion:2,state:{current:state.current,accepted}})
  } catch { return json(503,{error:"next_preview_unavailable"}) }
}

export async function POST(request:Request,{params}:Context) {
  if (request.headers.get("origin") !== process.env.SITEAGENT_SITE_ORIGIN) return json(403,{error:"origin_denied"})
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401,{error:"unauthenticated"})
  try {
    const body = z.union([NextSourceRequestSchema,z.object({prompt:z.string().trim().min(1).max(8000)}).strict()]).parse(await readBoundedJsonV1(request,3_000_000))
    if("prompt" in body)await generateNextPreview(principal,(await params).projectId,body.prompt,request.signal)
    else await buildNextPreview(principal,(await params).projectId,body.files,request.signal)
    return GET(request,{params})
  } catch(error) {
    const code = error instanceof Error ? error.message : "failed"
    return json(code==="project_not_found"?404:["project_busy","stale_source_generation"].includes(code)?409:error instanceof z.ZodError || code.startsWith("invalid_source") || code==="source_context_too_large"?400:503,{error:["project_busy","source_context_too_large","stale_source_generation"].includes(code)?code:"next_build_failed"})
  }
}

export async function DELETE(request:Request,{params}:Context) {
  if (request.headers.get("origin") !== process.env.SITEAGENT_SITE_ORIGIN) return json(403,{error:"origin_denied"})
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) return json(401,{error:"unauthenticated"})
  try {
    const config = nextPreviewConfig(), repo = await nextPreviewRepository(), projectId = (await params).projectId
    const {jobId} = z.object({jobId:z.string().max(160)}).strict().parse(await readBoundedJsonV1(request,1024))
    const state = await repo.getState(principal,projectId)
    if (!state?.current || state.current.jobId!==jobId) return json(404,{error:"job_not_found"})
    const changed = await repo.cancel(principal,projectId,jobId)
    if (changed) await new NextRuntimeClient(config.SITEAGENT_RUNTIME_URL,config.SITEAGENT_RUNTIME_SIGNING_KEY).cancel(state.current)
    return json(200,{schemaVersion:2,cancelled:changed})
  } catch { return json(503,{error:"cancel_unconfirmed"}) }
}
