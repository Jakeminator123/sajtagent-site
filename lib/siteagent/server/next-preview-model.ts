import { createHash } from "node:crypto"
import { z } from "zod"
import { SourceRevisionIdV2Schema, PreviewRefV2Schema } from "../../../contracts/deployment-v2.ts"

export const SourceFileSchema = z.object({ path: z.string().min(1).max(240), content: z.string().max(1_000_000) }).strict()
export const NextSourceRequestSchema = z.object({ files: z.array(SourceFileSchema).min(2).max(250) }).strict()
export type SourceFile = z.infer<typeof SourceFileSchema>
export type StaticFile = { path: string; content: string; encoding: "base64" }
export type NextBinding = { tenantId: string; projectId: string; jobId: string; sourceRevisionId: string; previewRef: string }
export type NextAccepted = NextBinding & { deploymentId: string; deploymentUrl: string; acceptedAt: string; outputSha256: string; files: StaticFile[] }
export type NextJob = NextBinding & { status: "building" | "accepted" | "failed"; expiresAt: string; failureCode?: string }
export type NextState = { current: NextJob | null; accepted: NextAccepted | null }

export function safeFilePath(path: string): boolean {
  return path.length <= 240 && !path.startsWith("/") && !/[\\\x00-\x20?#%]/.test(path) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}

export function validateSourceFiles(files: SourceFile[]): SourceFile[] {
  const parsed = NextSourceRequestSchema.parse({ files }).files
  const names = new Set<string>()
  let bytes = 0
  for (const file of parsed) {
    if (!safeFilePath(file.path) || file.path.split("/").some(p => p.startsWith(".")) ||
      /(^|\/)(node_modules|out|dist|package-lock\.json)(\/|$)/.test(file.path) || names.has(file.path)) throw new Error("invalid_source_path")
    names.add(file.path)
    bytes += Buffer.byteLength(file.content)
  }
  // Runtime C owns the fixed build package. Generated source intentionally omits it.
  if (bytes > 2_000_000) throw new Error("invalid_source_bundle")
  return parsed.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

export function sourceRevisionId(tenantId: string, projectId: string, files: SourceFile[]): string {
  const sorted = validateSourceFiles(files)
  return `revision:sha256:${createHash("sha256").update(JSON.stringify([tenantId, projectId, sorted.map(f => [f.path, f.content])])).digest("hex")}`
}

export function validateStaticFiles(value: unknown): StaticFile[] {
  const files = z.array(z.object({ path: z.string(), content: z.string(), encoding: z.literal("base64") }).strict()).min(1).max(2000).parse(value)
  let size = 0
  const names = new Set<string>()
  for (const f of files) {
    if (!safeFilePath(f.path) || f.path.split("/").some(p => p.startsWith(".")) || names.has(f.path) ||
      /(^|\/)(package\.json|vercel\.json|api|functions)(\/|$)/.test(f.path)) throw new Error("invalid_static_output")
    const bytes = Buffer.from(f.content, "base64")
    if (bytes.toString("base64") !== f.content) throw new Error("invalid_static_encoding")
    size += bytes.length
    names.add(f.path)
  }
  if (size > 20_000_000 || !names.has("index.html") || !files.some(f => f.path.startsWith("_next/") && f.path.endsWith(".js"))) throw new Error("invalid_next_output")
  return files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

export function outputDigest(files: StaticFile[]): string {
  return createHash("sha256").update(JSON.stringify(files.map(f => [f.path, f.content]))).digest("hex")
}

export function canFinishJob(state: NextState, binding: NextBinding, now: number, failure = false): boolean {
  const current = state.current
  return !!current && current.status === "building" && (failure || Date.parse(current.expiresAt) > now) &&
    (["tenantId", "projectId", "jobId", "sourceRevisionId", "previewRef"] as const).every(k => current[k] === binding[k])
}

export function gatewayHost(tenantId: string, projectId: string, domain: string): string {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain) || domain.endsWith(".vercel.app")) throw new Error("invalid_gateway_domain")
  return `${createHash("sha256").update(JSON.stringify([tenantId, projectId])).digest("hex").slice(0, 32)}.${domain}`
}

export function assertPreviewSiteOrigin(siteOrigin: string, previewDomain: string): void {
  const origin = new URL(siteOrigin)
  if (origin.protocol !== "https:" || origin.origin !== siteOrigin ||
    origin.hostname === previewDomain || origin.hostname.endsWith(`.${previewDomain}`)) {
    throw new Error("invalid_site_origin")
  }
}

export function previewBasePath(previewRef: string): string {
  PreviewRefV2Schema.parse(previewRef)
  return `/api/siteagent/next-previews/${encodeURIComponent(previewRef)}/content`
}

export function assertBinding(binding: NextBinding): void {
  SourceRevisionIdV2Schema.parse(binding.sourceRevisionId)
  PreviewRefV2Schema.parse(binding.previewRef)
}

export function privateHeaders(): Record<string,string> {
  return { "cache-control": "private, no-store, max-age=0", "cdn-cache-control": "no-store", "vercel-cdn-cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" }
}
