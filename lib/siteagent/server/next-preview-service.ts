import "server-only"
import { randomBytes, randomUUID } from "node:crypto"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import { PostgresNextPreviewRepository } from "./next-preview-repository.ts"
import { NextRuntimeClient } from "./next-preview-runtime.ts"
import { StaticNextDeployer } from "./next-preview-deployer.ts"
import { nextPreviewConfig, sourceRevisionId, validateSourceFiles, type NextJob, type NextState, type SourceFile } from "./next-preview-model.ts"
import { persistedNextFailureCode } from "./next-preview-failure.ts"

export { nextPreviewConfig } from "./next-preview-model.ts"

export async function nextPreviewRepository(): Promise<PostgresNextPreviewRepository> {
  const {pool} = await import("../../db/client.ts")
  if (!pool) throw new Error("persistence_unavailable")
  return new PostgresNextPreviewRepository(pool)
}

export type NextPreviewBuildObserver = {
  latestStartAt?: string
  deadlineAt?: string
  expectedAcceptedJobId?: string | null
  onStarted?: (job: NextJob, createdAt: string) => Promise<void>
}

export async function buildNextPreview(principal: BuildPrincipalV1, projectId: string, input: SourceFile[], abort?: AbortSignal, expectedAcceptedJobId?: string | null, observer?: NextPreviewBuildObserver): Promise<NextState | null> {
  const config = nextPreviewConfig()
  const repo = await nextPreviewRepository()
  const files = validateSourceFiles(input)
  const createdAt = new Date().toISOString()
  const deadline = Math.min(Date.parse(createdAt)+600_000, observer?.deadlineAt ? Date.parse(observer.deadlineAt) : Infinity)
  if (!Number.isFinite(deadline) || deadline - Date.parse(createdAt) <= 120_000) throw new Error("turn_deadline_exceeded")
  const job: NextJob = {tenantId:principal.tenantId,projectId,jobId:`job:${randomUUID()}`,sourceRevisionId:sourceRevisionId(principal.tenantId,projectId,files),previewRef:`preview:${randomBytes(24).toString("base64url")}`,status:"building",expiresAt:new Date(deadline).toISOString()}
  const runtime = new NextRuntimeClient(config.SITEAGENT_RUNTIME_URL,config.SITEAGENT_RUNTIME_SIGNING_KEY)
  abort?.throwIfAborted()
  if (observer?.latestStartAt && Date.parse(createdAt) > Date.parse(observer.latestStartAt)) throw new Error("turn_policy_expired")
  await repo.begin(principal,job,files,expectedAcceptedJobId)
  const onAbort = () => { void repo.cancel(principal,projectId,job.jobId).then(()=>runtime.cancel(job)).catch(()=>{}) }
  abort?.addEventListener("abort",onAbort,{once:true})
  try {
    await observer?.onStarted?.(job,createdAt)
    abort?.throwIfAborted()
    const output = await runtime.build(job,files,createdAt,abort)
    abort?.throwIfAborted()
    const deployment = await new StaticNextDeployer({token:config.SITEAGENT_NEXT_VERCEL_TOKEN,teamId:config.SITEAGENT_NEXT_VERCEL_TEAM_ID,projectId:config.SITEAGENT_NEXT_VERCEL_PROJECT_ID,bypass:config.SITEAGENT_NEXT_VERCEL_BYPASS}).deploy(job,output,Date.parse(job.expiresAt))
    const binding={tenantId:job.tenantId,projectId:job.projectId,jobId:job.jobId,sourceRevisionId:job.sourceRevisionId,previewRef:job.previewRef}
    abort?.throwIfAborted()
    if (!await repo.finish(principal,job,{...binding,...deployment,files:output,acceptedAt:new Date().toISOString()})) throw new Error("stale_job_result")
  } catch (error) {
    await runtime.cancel(job).catch(()=>{})
    await repo.finish(principal,job,null,persistedNextFailureCode(error))
    throw error
  } finally {
    abort?.removeEventListener("abort",onAbort)
  }
  return repo.getState(principal,projectId)
}

export async function generateNextPreview(principal: BuildPrincipalV1, projectId: string, prompt: string, abort?: AbortSignal, observer?: NextPreviewBuildObserver): Promise<NextState | null> {
  const config=nextPreviewConfig(),repo=await nextPreviewRepository()
  const state=await repo.getState(principal,projectId)
  if(!state)throw new Error("project_not_found")
  if (observer?.expectedAcceptedJobId !== undefined && (state.accepted?.jobId ?? null) !== observer.expectedAcceptedJobId) throw new Error("stale_source_generation")
  if(state.current?.status==="building" && Date.parse(state.current.expiresAt)>Date.now())throw new Error("project_busy")
  const baseFiles=await repo.getAcceptedSource(principal,projectId)??[]
  const runtime=new NextRuntimeClient(config.SITEAGENT_RUNTIME_URL,config.SITEAGENT_RUNTIME_SIGNING_KEY)
  if (observer?.latestStartAt && Date.now() > Date.parse(observer.latestStartAt)) throw new Error("turn_policy_expired")
  const files=await runtime.generate({tenantId:principal.tenantId,projectId,prompt,baseFiles},abort)
  abort?.throwIfAborted()
  return buildNextPreview(principal,projectId,files,abort,state.accepted?.jobId??null,observer)
}
