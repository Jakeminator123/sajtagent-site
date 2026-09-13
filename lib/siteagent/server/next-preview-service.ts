import "server-only"
import { randomBytes, randomUUID } from "node:crypto"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import { PostgresNextPreviewRepository } from "./next-preview-repository.ts"
import { NextRuntimeClient } from "./next-preview-runtime.ts"
import { StaticNextDeployer } from "./next-preview-deployer.ts"
import { gatewayHost, sourceRevisionId, validateSourceFiles, type NextJob, type NextState, type SourceFile } from "./next-preview-model.ts"

export function nextPreviewConfig(env = process.env) {
  const keys = ["SITEAGENT_NEXT_PREVIEW_DOMAIN","SITEAGENT_SITE_ORIGIN","SITEAGENT_RUNTIME_URL","SITEAGENT_RUNTIME_SIGNING_KEY","SITEAGENT_NEXT_VERCEL_TOKEN","SITEAGENT_NEXT_VERCEL_TEAM_ID","SITEAGENT_NEXT_VERCEL_PROJECT_ID","SITEAGENT_NEXT_VERCEL_BYPASS"] as const
  if (env.SITEAGENT_NEXT_ENABLED !== "true" || keys.some(key => !env[key])) throw new Error("next_preview_unavailable")
  const config = Object.fromEntries(keys.map(key => [key,env[key]!])) as Record<typeof keys[number],string>
  const origin = new URL(config.SITEAGENT_SITE_ORIGIN)
  if (origin.protocol !== "https:" || origin.origin !== config.SITEAGENT_SITE_ORIGIN || origin.hostname.endsWith(`.${config.SITEAGENT_NEXT_PREVIEW_DOMAIN}`)) throw new Error("invalid_site_origin")
  gatewayHost("check","check",config.SITEAGENT_NEXT_PREVIEW_DOMAIN)
  return config
}

export async function nextPreviewRepository(): Promise<PostgresNextPreviewRepository> {
  const {pool} = await import("../../db/client.ts")
  if (!pool) throw new Error("persistence_unavailable")
  return new PostgresNextPreviewRepository(pool)
}

export async function buildNextPreview(principal: BuildPrincipalV1, projectId: string, input: SourceFile[], abort?: AbortSignal, expectedAcceptedJobId?: string | null): Promise<NextState | null> {
  const config = nextPreviewConfig()
  const repo = await nextPreviewRepository()
  const files = validateSourceFiles(input)
  const createdAt = new Date().toISOString()
  const job: NextJob = {tenantId:principal.tenantId,projectId,jobId:`job:${randomUUID()}`,sourceRevisionId:sourceRevisionId(principal.tenantId,projectId,files),previewRef:`preview:${randomBytes(24).toString("base64url")}`,status:"building",expiresAt:new Date(Date.parse(createdAt)+600_000).toISOString()}
  const runtime = new NextRuntimeClient(config.SITEAGENT_RUNTIME_URL,config.SITEAGENT_RUNTIME_SIGNING_KEY)
  abort?.throwIfAborted()
  await repo.begin(principal,job,files,expectedAcceptedJobId)
  const onAbort = () => { void repo.cancel(principal,projectId,job.jobId).then(()=>runtime.cancel(job)).catch(()=>{}) }
  abort?.addEventListener("abort",onAbort,{once:true})
  try {
    abort?.throwIfAborted()
    const output = await runtime.build(job,files,createdAt,abort)
    abort?.throwIfAborted()
    const deployment = await new StaticNextDeployer({token:config.SITEAGENT_NEXT_VERCEL_TOKEN,teamId:config.SITEAGENT_NEXT_VERCEL_TEAM_ID,projectId:config.SITEAGENT_NEXT_VERCEL_PROJECT_ID,bypass:config.SITEAGENT_NEXT_VERCEL_BYPASS}).deploy(job,output,Date.parse(job.expiresAt))
    const binding={tenantId:job.tenantId,projectId:job.projectId,jobId:job.jobId,sourceRevisionId:job.sourceRevisionId,previewRef:job.previewRef}
    abort?.throwIfAborted()
    if (!await repo.finish(principal,job,{...binding,...deployment,files:output,acceptedAt:new Date().toISOString()})) throw new Error("stale_job_result")
  } catch (error) {
    await runtime.cancel(job).catch(()=>{})
    await repo.finish(principal,job,null,"build_or_verification_failed")
    throw error
  } finally {
    abort?.removeEventListener("abort",onAbort)
  }
  return repo.getState(principal,projectId)
}

export async function generateNextPreview(principal: BuildPrincipalV1, projectId: string, prompt: string, abort?: AbortSignal): Promise<NextState | null> {
  const config=nextPreviewConfig(),repo=await nextPreviewRepository()
  const state=await repo.getState(principal,projectId)
  if(!state)throw new Error("project_not_found")
  if(state.current?.status==="building" && Date.parse(state.current.expiresAt)>Date.now())throw new Error("project_busy")
  const baseFiles=await repo.getAcceptedSource(principal,projectId)??[]
  const runtime=new NextRuntimeClient(config.SITEAGENT_RUNTIME_URL,config.SITEAGENT_RUNTIME_SIGNING_KEY)
  const files=await runtime.generate({tenantId:principal.tenantId,projectId,prompt,baseFiles},abort)
  abort?.throwIfAborted()
  return buildNextPreview(principal,projectId,files,abort,state.accepted?.jobId??null)
}
