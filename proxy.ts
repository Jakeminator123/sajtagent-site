import { NextResponse, type NextRequest } from "next/server"

import { refreshSupabaseSession } from "./lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  const domain = process.env.SITEAGENT_NEXT_PREVIEW_DOMAIN
  const hostname = request.nextUrl.hostname
  if (domain && (hostname === domain || hostname.endsWith(`.${domain}`))) {
    const label = hostname.slice(0, -domain.length - 1)
    const path = request.nextUrl.pathname
    const bootstrap = path === "/api/siteagent/next-gateway/bootstrap" && request.method === "POST"
    const content = /^\/api\/siteagent\/next-previews\/[^/]+\/content(?:\/|$)/.test(path) && ["GET","HEAD"].includes(request.method)
    if (!/^[a-f0-9]{32}$/.test(label) || (!bootstrap && !content)) {
      return new NextResponse(null, {status:404,headers:{"cache-control":"no-store"}})
    }
    // Never refresh/forward Site Supabase cookies on untrusted customer origins.
    return NextResponse.next()
  }
  return refreshSupabaseSession(request)
}

export const config = {
  matcher: ["/:path*"],
}
