import { ZodError } from "zod"

import {
  AgentProfileV1Schema,
  type AgentProfileV1,
} from "../../../../../contracts/agent-profile-v1.ts"
import { createAgentProfileRuntimeClientFromEnvV1 } from "../../../../../lib/siteagent/server/agent-profile-runtime-client.ts"
import { resolveBuildPrincipalV1 } from "../../../../../lib/siteagent/server/principal.ts"
import { isSameOriginMutation, readBoundedJsonV1 } from "../../../../../lib/siteagent/server/request-security.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 64 * 1024

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { schemaVersion: 1, error: { code, message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  )
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return errorResponse(403, "cross_origin_request", "Begäran måste komma från samma origin.")
  }
  if (!(await resolveBuildPrincipalV1(request))) {
    return errorResponse(401, "unauthenticated", "Logga in för att prova en agentprofil.")
  }

  let profile: AgentProfileV1
  try {
    const input = await readBoundedJsonV1(request, MAX_BODY_BYTES)
    profile = AgentProfileV1Schema.parse(
      typeof input === "object" && input !== null && "profile" in input
        ? (input as { profile: unknown }).profile
        : undefined,
    )
  } catch (error) {
    if (error instanceof Error && error.message === "payload_too_large") {
      return errorResponse(413, "payload_too_large", "Agentprofilen är för stor.")
    }
    if (error instanceof ZodError) {
      return errorResponse(400, "invalid_profile", "Agentprofilen matchar inte kontraktet.")
    }
    return errorResponse(400, "invalid_json", "Begäran måste vara giltig JSON.")
  }

  try {
    const client = createAgentProfileRuntimeClientFromEnvV1()
    if (!client) {
      return errorResponse(503, "runtime_unavailable", "Runtime är inte konfigurerad.")
    }
    const projection = await client.compile(profile)
    return Response.json(projection, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    })
  } catch {
    return errorResponse(502, "runtime_unavailable", "Runtime kunde inte verifiera agentprofilen.")
  }
}
