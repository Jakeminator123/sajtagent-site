import "server-only"

import { BuildPrincipalV1Schema, type BuildPrincipalV1 } from "./build-job-input.ts"

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}

/**
 * Supabase Auth is not connected to this prototype yet, so production must
 * remain unauthenticated-by-default. An explicit development-only header mode
 * exists for local controller testing and cannot activate on a non-loopback URL.
 */
export async function resolveBuildPrincipalV1(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BuildPrincipalV1 | null> {
  const requestUrl = new URL(request.url)
  const devHeaderMode =
    env.NODE_ENV !== "production" &&
    env.SITEAGENT_DEV_IDENTITY_MODE === "header" &&
    isLoopbackHostname(requestUrl.hostname)

  if (!devHeaderMode) return null

  const parsed = BuildPrincipalV1Schema.safeParse({
    userId: request.headers.get("x-siteagent-dev-user-id"),
    tenantId: request.headers.get("x-siteagent-dev-tenant-id"),
  })
  return parsed.success ? parsed.data : null
}
