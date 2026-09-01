import "server-only"

import { BuildPrincipalV1Schema, type BuildPrincipalV1 } from "./build-job-input.ts"
import { buildPrincipalFromClaimsV1 } from "./principal-claims.ts"
import { createSupabaseServerClient } from "../../supabase/server.ts"

export { buildPrincipalFromClaimsV1 } from "./principal-claims.ts"

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}

/** Resolve an authenticated server principal; local header mode is loopback-only. */
export async function resolveBuildPrincipalV1(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BuildPrincipalV1 | null> {
  const requestUrl = new URL(request.url)
  const devHeaderMode =
    env.NODE_ENV !== "production" &&
    env.SITEAGENT_DEV_IDENTITY_MODE === "header" &&
    isLoopbackHostname(requestUrl.hostname)

  if (devHeaderMode) {
    const parsed = BuildPrincipalV1Schema.safeParse({
      userId: request.headers.get("x-siteagent-dev-user-id"),
      tenantId: request.headers.get("x-siteagent-dev-tenant-id"),
    })
    return parsed.success ? parsed.data : null
  }

  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return null
    const { data, error } = await supabase.auth.getClaims()
    if (error) return null
    return buildPrincipalFromClaimsV1(data?.claims)
  } catch {
    return null
  }
}
