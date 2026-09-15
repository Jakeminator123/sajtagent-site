import { createHmac, randomUUID } from "node:crypto"
import { z } from "zod"
import { runtimeSignaturePayloadV1 } from "./runtime-protocol-v1.ts"
import { sourceRevisionId, validateSourceFiles, validateStaticFiles, type NextJob, type SourceFile, type StaticFile } from "./next-preview-model.ts"

export class NextRuntimeClient {
  constructor(private readonly baseUrl: string, private readonly key: string) {
    const url = new URL(baseUrl)
    if (url.protocol !== "https:" || url.username || url.password || key.length < 32) throw new Error("invalid_next_runtime_config")
  }
  private async post(path: string, value: unknown, deadline: number, abort?: AbortSignal): Promise<Response> {
    const body = JSON.stringify(value), timestamp = new Date().toISOString(), nonce = randomUUID()
    const endpoint = new URL(path,this.baseUrl)
    const signature = createHmac("sha256",this.key).update(runtimeSignaturePayloadV1("POST",path,timestamp,nonce,body)).digest("hex")
    const timeout = AbortSignal.timeout(Math.max(1,deadline-Date.now()))
    try {
      return await fetch(endpoint,{ method:"POST", body, headers:{"content-type":"application/json","x-siteagent-timestamp":timestamp,"x-siteagent-nonce":nonce,"x-siteagent-signature":signature},redirect:"error",cache:"no-store",signal:abort?AbortSignal.any([abort,timeout]):timeout })
    } catch (error) {
      if (abort?.aborted) throw error
      throw new Error("runtime_transport_failed")
    }
  }
  private rejectFailedRuntime(response: Response): void {
    if (response.ok) return
    void response.body?.cancel()
    throw new Error(response.status >= 500 ? "runtime_transport_5xx" : response.status >= 400 ? "runtime_transport_4xx" : "runtime_transport_failed")
  }
  async build(job: NextJob, files: SourceFile[], createdAt: string, abort?: AbortSignal): Promise<StaticFile[]> {
    const binding = {tenantId:job.tenantId,projectId:job.projectId,jobId:job.jobId,sourceRevisionId:job.sourceRevisionId,previewRef:job.previewRef,expiresAt:job.expiresAt}
    const response = await this.post("/v2/next-builds",{schemaVersion:2,...binding,createdAt,files},Date.parse(job.expiresAt)-120_000,abort)
    this.rejectFailedRuntime(response)
    try {
      const value = z.object({schemaVersion:z.literal(2),status:z.literal("built"),jobId:z.string(),tenantId:z.string(),projectId:z.string(),sourceRevisionId:z.string(),previewRef:z.string(),sourceSnapshotSha256:z.string(),workerBinding:z.object({tenantId:z.string(),projectId:z.string(),workerId:z.string().regex(/^sajtagent-v2-[a-f0-9]{32}$/),isolation:z.literal("sprite")}).strict(),files:z.unknown()}).passthrough().parse(await response.json())
      if ((["jobId","tenantId","projectId","sourceRevisionId","previewRef"] as const).some(k=>value[k]!==job[k]) || value.workerBinding.tenantId!==job.tenantId || value.workerBinding.projectId!==job.projectId || value.sourceSnapshotSha256!==job.sourceRevisionId.slice("revision:sha256:".length)) throw new Error("worker_binding_mismatch")
      return validateStaticFiles(value.files)
    } catch (error) {
      if (error instanceof Error && ["worker_binding_mismatch","invalid_static_output","invalid_static_encoding","invalid_next_output"].includes(error.message)) throw error
      throw new Error("worker_build_failed")
    }
  }
  async cancel(job: NextJob): Promise<void> {
    const response=await this.post("/v2/next-builds/cancel",{schemaVersion:2,jobId:job.jobId,tenantId:job.tenantId,projectId:job.projectId},Date.now()+10_000)
    if(!response.ok)throw new Error("runtime_cancel_unconfirmed")
  }
  async generate(input: {tenantId:string;projectId:string;prompt:string;baseFiles:SourceFile[]}, abort?: AbortSignal): Promise<SourceFile[]> {
    // A separate preparation job: the eventual build revision never mutates.
    const jobId=`source:${randomUUID()}`,createdAt=new Date().toISOString()
    if (JSON.stringify([input.prompt,input.baseFiles]).length>18_000) throw new Error("source_context_too_large")
    const expiresAt=new Date(Date.parse(createdAt)+120_000).toISOString()
    const response=await this.post("/v2/next-source",{schemaVersion:2,...input,jobId,createdAt,expiresAt},Date.parse(expiresAt),abort)
    this.rejectFailedRuntime(response)
    try {
      const value=z.object({schemaVersion:z.literal(2),tenantId:z.string(),projectId:z.string(),jobId:z.string(),sourceRevisionId:z.string(),files:z.array(z.object({path:z.string(),content:z.string()}).strict())}).passthrough().parse(await response.json())
      const files=validateSourceFiles(value.files)
      if(value.tenantId!==input.tenantId || value.projectId!==input.projectId || value.jobId!==jobId || value.sourceRevisionId!==sourceRevisionId(input.tenantId,input.projectId,files))throw new Error("source_binding_mismatch")
      return files
    } catch (error) {
      if (error instanceof Error && ["source_binding_mismatch","invalid_source_path","invalid_source_bundle"].includes(error.message)) throw error
      throw new Error("worker_build_failed")
    }
  }
}
