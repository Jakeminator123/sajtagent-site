import { createHash } from "node:crypto"
import { z } from "zod"
import { SourceRevisionIdV2Schema } from "../../../contracts/deployment-v2.ts"

export const PublishNextRequestSchema = z.object({
  sourceRevisionId: SourceRevisionIdV2Schema,
  jobId: z.string().min(1).max(160),
}).strict()

export type PublishedFile = { path: string; content: string; encoding: "base64" }
export type PublishedNext = {
  tenantId: string
  projectId: string
  sourceRevisionId: string
  jobId: string
  previewRef: string
  deploymentId: string
  outputSha256: string
  publishedAt: string
  files: PublishedFile[]
}

export function publicationBasePath(previewRef: string): string {
  if (!/^preview:[A-Za-z0-9_-]{16,128}$/.test(previewRef)) throw new Error("invalid_preview_ref")
  return `/api/siteagent/next-previews/${encodeURIComponent(previewRef)}/content`
}

/** A public hostname is server-owned, never an alias supplied by a customer. */
export function publicationHost(tenantId: string, projectId: string, domain: string): string {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain) || domain.endsWith(".vercel.app")) {
    throw new Error("invalid_publication_domain")
  }
  const project = createHash("sha256").update(JSON.stringify([tenantId, projectId])).digest("hex").slice(0, 32)
  return `${project}.${domain}`
}

export function publicationDomain(env: NodeJS.ProcessEnv): string | null {
  const domain = env.SITEAGENT_PUBLISHED_DOMAIN
  const preview = env.SITEAGENT_NEXT_PREVIEW_DOMAIN
  if (!domain || !preview || domain === preview || domain.endsWith(`.${preview}`) || preview.endsWith(`.${domain}`)) return null
  try {
    publicationHost("check", "check", domain)
    const site = new URL(env.SITEAGENT_SITE_ORIGIN ?? "")
    if (site.protocol !== "https:" || site.hostname === domain || site.hostname.endsWith(`.${domain}`)) return null
    return domain
  } catch {
    return null
  }
}

export function publicationPath(rawPath: string): string | null {
  let path: string
  try { path = decodeURIComponent(rawPath) } catch { return null }
  if (!path.startsWith("/") || /[\\\x00-\x20?#%]/.test(path)) return null
  const segments = path.slice(1).split("/")
  if (segments.some((part, index) => part === "." || part === ".." || part.startsWith(".") || (!part && index < segments.length - 1))) return null
  return path.slice(1)
}

export async function publicationGatewayReachable(hostname: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`https://${hostname}/__siteagent_publication_health`, {
      method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(5000),
    })
    return response.status === 204 && response.headers.get("x-siteagent-publication-gateway") === "v2"
  } catch { return false }
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf",
}

/** Serve only the frozen published bundle; never fall through to product routes. */
export function publishedResponse(request: Request, publication: PublishedNext, rawPath: string): Response {
  const headers = {
    "cache-control": "no-store", "cdn-cache-control": "no-store", "vercel-cdn-cache-control": "no-store",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  }
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, allow: "GET, HEAD" } })
  if (request.headers.get("service-worker") === "script") return new Response(null, { status: 403, headers })
  const base = publicationBasePath(publication.previewRef)
  if (rawPath === "/") return new Response(null, { status: 307, headers: { ...headers, location: `${base}/` } })
  if (rawPath !== base && !rawPath.startsWith(`${base}/`)) return new Response(null, { status: 404, headers })
  const path = publicationPath(rawPath.slice(base.length) || "/")
  if (path === null) return new Response(null, { status: 404, headers })
  const candidates = path === "" ? ["index.html"] : path.endsWith("/") ? [`${path}index.html`] : [path, `${path}.html`, `${path}/index.html`]
  const file = candidates.map(p => publication.files.find(f => f.path === p)).find(Boolean)
  if (!file) return new Response(null, { status: 404, headers })
  const body = Buffer.from(file.content, "base64")
  const extension = file.path.split(".").at(-1) ?? ""
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: { ...headers, "content-type": MIME[extension] ?? "application/octet-stream", "content-length": String(body.length) },
  })
}
