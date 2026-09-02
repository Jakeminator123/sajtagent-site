import { z, ZodError } from "zod"

import { AgentProfileV1Schema } from "../../../../../contracts/agent-profile-v1.ts"
import {
  AgentProfileActivationConflictV1,
  AgentProfileActivationPayloadTooLargeV1,
  createAgentProfileRuntimeClientFromEnvV1,
} from "../../../../../lib/siteagent/server/agent-profile-runtime-client.ts"
import { resolveBuildPrincipalV1 } from "../../../../../lib/siteagent/server/principal.ts"
import {
  isSameOriginMutation,
  readBoundedJsonV1,
} from "../../../../../lib/siteagent/server/request-security.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 64 * 1024

const AgentProfileActivationSiteRequestV1Schema = z
  .object({
    profile: AgentProfileV1Schema,
    expectedActiveRevision: z.number().int().positive().optional(),
  })
  .strict()

type AgentProfileActivationSiteRequestV1 = z.infer<
  typeof AgentProfileActivationSiteRequestV1Schema
>

function errorResponse(
  status: number,
  code: string,
  message: string,
  activeRevision?: number,
): Response {
  return Response.json(
    {
      schemaVersion: 1,
      error: {
        code,
        message,
        ...(activeRevision === undefined ? {} : { activeRevision }),
      },
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  )
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return errorResponse(
      403,
      "cross_origin_request",
      "Begäran måste komma från samma origin.",
    )
  }
  if (!(await resolveBuildPrincipalV1(request))) {
    return errorResponse(
      401,
      "unauthenticated",
      "Logga in för att aktivera en agentprofil.",
    )
  }

  let input: AgentProfileActivationSiteRequestV1
  try {
    input = AgentProfileActivationSiteRequestV1Schema.parse(
      await readBoundedJsonV1(request, MAX_BODY_BYTES),
    )
  } catch (error) {
    if (error instanceof Error && error.message === "payload_too_large") {
      return errorResponse(413, "payload_too_large", "Agentprofilen är för stor.")
    }
    if (error instanceof ZodError) {
      return errorResponse(
        400,
        "invalid_profile",
        "Agentprofilen matchar inte kontraktet.",
      )
    }
    return errorResponse(400, "invalid_json", "Begäran måste vara giltig JSON.")
  }

  try {
    const client = createAgentProfileRuntimeClientFromEnvV1()
    if (!client) {
      return errorResponse(503, "runtime_unavailable", "Runtime är inte konfigurerad.")
    }
    const projection = await client.activate(
      input.profile,
      input.expectedActiveRevision,
    )
    return Response.json(projection, {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof AgentProfileActivationConflictV1) {
      return errorResponse(
        409,
        error.code,
        "Den aktiva profilen ändrades före aktiveringen. Kontrollera läget och försök igen.",
        error.activeRevision,
      )
    }
    if (error instanceof AgentProfileActivationPayloadTooLargeV1) {
      return errorResponse(413, "payload_too_large", "Agentprofilen är för stor.")
    }
    return errorResponse(
      502,
      "runtime_unavailable",
      "Runtime kunde inte aktivera agentprofilen.",
    )
  }
}
