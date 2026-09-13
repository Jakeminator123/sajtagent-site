import { createHash } from "node:crypto"
import { z } from "zod"
import { outputDigest, type NextBinding, type StaticFile } from "./next-preview-model.ts"

const DeploymentSchema = z.object({ id: z.string().regex(/^dpl_/), url: z.string(), readyState: z.string(), projectId: z.string(), meta: z.record(z.string()).optional() }).passthrough()
export type DeploymentReceipt = { deploymentId: string; deploymentUrl: string; outputSha256: string }

/** Site uploads already-built bytes. This never invokes npm or customer code. */
export class StaticNextDeployer {
  constructor(private readonly config: { token: string; teamId: string; projectId: string; bypass: string }, private readonly fetchImpl: typeof fetch = fetch) {}

  private async api(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImpl(`https://api.vercel.com${path}?teamId=${encodeURIComponent(this.config.teamId)}`, {
      ...init, headers: { authorization: `Bearer ${this.config.token}`, "content-type": "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error("vercel_api_failed")
    return response.json()
  }

  async deploy(binding: NextBinding, files: StaticFile[], deadline: number): Promise<DeploymentReceipt> {
    const project = z.object({ id: z.string(), ssoProtection: z.object({ deploymentType: z.string() }).nullable().optional() }).passthrough().parse(await this.api(`/v9/projects/${encodeURIComponent(this.config.projectId)}`))
    if (project.id !== this.config.projectId || !["all", "preview", "all_except_custom_domains"].includes(project.ssoProtection?.deploymentType ?? "")) throw new Error("preview_protection_required")
    const digest = outputDigest(files)
    const meta = { sajtagentJob: binding.jobId, sajtagentRevision: binding.sourceRevisionId, sajtagentProject: binding.projectId, sajtagentOutput: digest }
    const started = z.object({ id: z.string().regex(/^dpl_/) }).parse(await this.api("/v13/deployments", {
      method: "POST", body: JSON.stringify({
        name: "sajtagent-next-artifacts", project: this.config.projectId, meta,
        // No package, config, API route or function can enter this deployment.
        files: files.map(file => ({ file: `public/${file.path}`, data: file.content, encoding: "base64" })),
        projectSettings: { framework: null, buildCommand: "", installCommand: "", outputDirectory: "public" },
      }),
    }))
    while (Date.now() < deadline) {
      const deployment = DeploymentSchema.parse(await this.api(`/v13/deployments/${encodeURIComponent(started.id)}`))
      if (["ERROR", "CANCELED"].includes(deployment.readyState)) throw new Error("deployment_failed")
      if (deployment.readyState === "READY") {
        if (deployment.projectId !== this.config.projectId || Object.entries(meta).some(([k,v]) => deployment.meta?.[k] !== v)) throw new Error("deployment_binding_mismatch")
        if (!/^[a-z0-9-]+\.vercel\.app$/.test(deployment.url)) throw new Error("invalid_deployment_origin")
        const origin = `https://${deployment.url}`
        // Require the original uncredentialed deployment URL to deny access.
        const direct = await this.fetchImpl(`${origin}/index.html`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) })
        let protectionRedirect = false
        if ([302,303,307,308].includes(direct.status)) {
          const location = direct.headers.get("location")
          if (location) { const target = new URL(location,origin); protectionRedirect = target.protocol === "https:" && (target.hostname === "vercel.com" || target.hostname.endsWith(".vercel.com")) }
        }
        if (![401,403].includes(direct.status) && !protectionRedirect) throw new Error("unprotected_preview_origin")
        await direct.body?.cancel()
        // Exact byte verification, including JS and every static route/asset.
        for (let start = 0; start < files.length; start += 4) {
          if (Date.now() >= deadline) throw new Error("deployment_timeout")
          await Promise.all(files.slice(start,start+4).map(async file => {
            const response = await this.fetchImpl(`${origin}/${file.path}`, { headers: { "x-vercel-protection-bypass": this.config.bypass }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) })
            if (response.status !== 200) throw new Error("deployment_verification_failed")
            const expected = Buffer.from(file.content,"base64")
            const actual = new Uint8Array(await response.arrayBuffer())
            if (actual.length !== expected.length || createHash("sha256").update(actual).digest("hex") !== createHash("sha256").update(expected).digest("hex")) throw new Error("deployment_bytes_mismatch")
          }))
        }
        return { deploymentId: deployment.id, deploymentUrl: origin, outputSha256: digest }
      }
      await new Promise(resolve => setTimeout(resolve,1000))
    }
    throw new Error("deployment_timeout")
  }
}
