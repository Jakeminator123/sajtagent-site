import { type NextAccepted, privateHeaders, safeFilePath } from "./next-preview-model.ts"

export function isNextGatewayHost(hostname: string, domain: string | undefined): boolean {
  return !!domain && hostname.endsWith(`.${domain}`)
}

export function gatewayHostnameAllowed(hostname: string, domain: string | undefined): boolean {
  return !!domain && /^[a-f0-9]{32}$/.test(hostname.slice(0,-domain.length-1)) && isNextGatewayHost(hostname,domain)
}

/** Serve only the exact bytes verified against the protected real deployment.
 * No upstream request => no bypass/auth/cookie can ever enter customer code. */
export function serveAcceptedStatic(accepted: NextAccepted, segments: string[], request: Request, siteOrigin: string): Response {
  const headers = privateHeaders()
  headers["content-security-policy"] = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${siteOrigin}`
  headers["permissions-policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
  if (request.headers.get("service-worker") === "script" || !["GET","HEAD"].includes(request.method)) return new Response(null,{status:403,headers})
  const path = segments.join("/") || "index.html"
  if (!safeFilePath(path)) return new Response(null,{status:404,headers})
  const file = accepted.files.find(f => f.path === path) ?? accepted.files.find(f => f.path === `${path}/index.html`) ?? accepted.files.find(f => f.path === `${path}.html`)
  if (!file) return new Response(null,{status:404,headers})
  const extension = file.path.split(".").at(-1) ?? ""
  const types: Record<string,string> = {html:"text/html; charset=utf-8",js:"text/javascript; charset=utf-8",css:"text/css; charset=utf-8",json:"application/json",txt:"text/plain; charset=utf-8",svg:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",ico:"image/x-icon",woff:"font/woff",woff2:"font/woff2"}
  headers["content-type"] = types[extension] ?? "application/octet-stream"
  const bytes = Buffer.from(file.content,"base64")
  headers["content-length"] = String(bytes.length)
  return new Response(request.method === "HEAD" ? null : bytes,{status:200,headers})
}
