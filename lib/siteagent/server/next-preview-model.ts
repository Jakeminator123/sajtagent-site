import { createHash } from "node:crypto"
import { z } from "zod"
import { SourceRevisionIdV2Schema, PreviewRefV2Schema } from "../../../contracts/deployment-v2.ts"

/**
 * Mirrors `NextBuildRequestV2Schema` in sajtagent-sprites (`src/next-worker-v2.ts`).
 * Site may stay stricter (file count 2–250 vs 1–256) but never looser. Change both repos together.
 */
export const NEXT_SOURCE_FILE_CONTENT_MAX = 512 * 1024
export const NEXT_SOURCE_PATH_MAX = 240
export const NEXT_SOURCE_FILE_COUNT_MIN = 2
export const NEXT_SOURCE_FILE_COUNT_MAX = 250
export const NEXT_SOURCE_BUNDLE_MAX = 2_000_000
/** Mirrors the controller source-path alphabet. Source only — not export output or gateway paths. */
export const NEXT_SOURCE_PATH_ALPHABET = /^[A-Za-z0-9_@.()[\] /-]+$/

export const SourceFileSchema = z.object({
  path: z.string().min(1).max(NEXT_SOURCE_PATH_MAX).regex(NEXT_SOURCE_PATH_ALPHABET),
  content: z.string().max(NEXT_SOURCE_FILE_CONTENT_MAX),
}).strict()
export const NextSourceRequestSchema = z.object({
  files: z.array(SourceFileSchema).min(NEXT_SOURCE_FILE_COUNT_MIN).max(NEXT_SOURCE_FILE_COUNT_MAX),
}).strict()
export type SourceFile = z.infer<typeof SourceFileSchema>
export type StaticFile = { path: string; content: string; encoding: "base64" }
export type NextBinding = { tenantId: string; projectId: string; jobId: string; sourceRevisionId: string; previewRef: string }
export type NextAccepted = NextBinding & { deploymentId: string; deploymentUrl: string; acceptedAt: string; outputSha256: string; files: StaticFile[] }
export type NextJob = NextBinding & { status: "building" | "accepted" | "failed"; expiresAt: string; failureCode?: string }
/** `profilePreference` is optional and owner-bound; absence means unset (effective next when Next is available). */
export type NextState = {
  current: NextJob | null
  accepted: NextAccepted | null
  profilePreference?: "html" | "next"
}

/** The deployer and operator preflight must accept exactly the same protection. */
export function supportedArtifactProtection(mode: unknown): boolean {
  return typeof mode === "string" && ["all", "preview", "all_except_custom_domains"].includes(mode)
}

/** Path safety for stored/served bytes. Not the controller source alphabet. */
export function safeFilePath(path: string): boolean {
  return path.length <= 240 && !path.startsWith("/") && !/[\\\x00-\x20?#%]/.test(path) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}

export const PREVIEW_ROUTE_LIMIT = 200

function isNextAssetPath(path: string): boolean {
  return path === "_next" || path.startsWith("_next/") || path.split("/").includes("_next")
}

/** Inverse of `serveAcceptedStatic` file lookup: HTML the gateway can serve as a page. */
export function filePathToPreviewRoute(path: string): string | null {
  if (!path.endsWith(".html") || isNextAssetPath(path) || !safeFilePath(path)) return null
  // Next export fallbacks, not pages in the site tree.
  if (path === "404.html" || path === "500.html") return null
  const route = path === "index.html"
    ? "/"
    : path.endsWith("/index.html")
      ? `/${path.slice(0, -"/index.html".length)}`
      : `/${path.slice(0, -".html".length)}`
  if (route !== "/" && (route.endsWith("/") || route.includes("//") ||
    route.slice(1).split("/").some((part) => part === "" || part === "." || part === ".."))) {
    return null
  }
  return route
}

export function deriveAcceptedPreviewRoutes(files: readonly { path: string }[]): string[] {
  const routes = new Set<string>()
  for (const file of files) {
    const route = filePathToPreviewRoute(file.path)
    if (route) routes.add(route)
  }
  return [...routes]
    .sort((left, right) => {
      if (left === "/") return -1
      if (right === "/") return 1
      return left < right ? -1 : left > right ? 1 : 0
    })
    .slice(0, PREVIEW_ROUTE_LIMIT)
}

export function validateSourceFiles(files: SourceFile[]): SourceFile[] {
  if (files.length < NEXT_SOURCE_FILE_COUNT_MIN || files.length > NEXT_SOURCE_FILE_COUNT_MAX) throw new Error("invalid_source_count")
  for (const file of files) {
    if (file.content.length > NEXT_SOURCE_FILE_CONTENT_MAX) throw new Error("invalid_source_file_size")
    if (!NEXT_SOURCE_PATH_ALPHABET.test(file.path) || file.path.length > NEXT_SOURCE_PATH_MAX) throw new Error("invalid_source_path")
  }
  const parsed = NextSourceRequestSchema.parse({ files }).files
  const names = new Set<string>()
  let bytes = 0
  for (const file of parsed) {
    if (!safeFilePath(file.path) || file.path.split("/").some(p => p.startsWith(".")) ||
      /(^|\/)(node_modules|out|dist|package-lock\.json)(\/|$)/.test(file.path) || names.has(file.path)) throw new Error("invalid_source_path")
    names.add(file.path)
    bytes += Buffer.byteLength(file.content)
  }
  // Runtime owns the toolchain. Site rewrites package.json from the merged source.
  if (bytes > NEXT_SOURCE_BUNDLE_MAX) throw new Error("invalid_source_bundle")
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

export const NEXT_PREVIEW_UNAVAILABLE = "next_preview_unavailable"
const NEXT_PREVIEW_ENV_KEYS = [
  "SITEAGENT_NEXT_PREVIEW_DOMAIN",
  "SITEAGENT_SITE_ORIGIN",
  "SITEAGENT_RUNTIME_URL",
  "SITEAGENT_RUNTIME_SIGNING_KEY",
  "SITEAGENT_NEXT_VERCEL_TOKEN",
  "SITEAGENT_NEXT_VERCEL_TEAM_ID",
  "SITEAGENT_NEXT_VERCEL_PROJECT_ID",
  "SITEAGENT_NEXT_VERCEL_BYPASS",
] as const

export type NextPreviewConfig = Record<(typeof NEXT_PREVIEW_ENV_KEYS)[number], string>

/** V2 off or incomplete config is fail-closed, not an outage. */
export function isNextPreviewUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message === NEXT_PREVIEW_UNAVAILABLE
}

/** 404 avoids Vercel 5xx alerts; unexpected runtime failures stay 503. */
export function nextPreviewFailureStatus(error: unknown): 404 | 503 {
  return isNextPreviewUnavailableError(error) ? 404 : 503
}

export function nextPreviewConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): NextPreviewConfig {
  try {
    if (env.SITEAGENT_NEXT_ENABLED !== "true" || NEXT_PREVIEW_ENV_KEYS.some(key => !env[key])) {
      throw new Error(NEXT_PREVIEW_UNAVAILABLE)
    }
    const config = Object.fromEntries(NEXT_PREVIEW_ENV_KEYS.map(key => [key, env[key]!])) as NextPreviewConfig
    assertPreviewSiteOrigin(config.SITEAGENT_SITE_ORIGIN, config.SITEAGENT_NEXT_PREVIEW_DOMAIN)
    gatewayHost("check", "check", config.SITEAGENT_NEXT_PREVIEW_DOMAIN)
    return config
  } catch (error) {
    if (isNextPreviewUnavailableError(error)) throw error
    throw new Error(NEXT_PREVIEW_UNAVAILABLE)
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
