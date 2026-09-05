import { ZodError } from "zod"

import { AgentTurnRequestV1Schema } from "../../../../../../contracts/agent-session-v1.ts"
import { PostgresAgentTurnBuildCoordinatorV1 } from "../../../../../../lib/siteagent/server/agent-turn-build-join.ts"
import { prepareAgentTurnV1 } from "../../../../../../lib/siteagent/server/agent-session-controller.ts"
import { createAgentSessionRuntimeClientV1 } from "../../../../../../lib/siteagent/server/agent-session-runtime-env.ts"
import {
  agentEventStreamSseResponseV1,
  agentEventsSseResponseV1,
} from "../../../../../../lib/siteagent/server/agent-session-sse.ts"
import { PostgresAgentSessionRepositoryV1 } from "../../../../../../lib/siteagent/server/postgres-agent-session-repository.ts"
import { resolveBuildPrincipalV1 } from "../../../../../../lib/siteagent/server/principal.ts"
import {
  isSameOriginMutation,
  readBoundedJsonV1,
} from "../../../../../../lib/siteagent/server/request-security.ts"
import { privateJsonHeadersV1 } from "../../../../../../lib/siteagent/server/version-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_BODY_BYTES = 64 * 1024

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: privateJsonHeadersV1(),
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return jsonResponse(403, {
      schemaVersion: 1,
      error: {
        code: "cross_origin_request",
        message: "Begäran måste komma från samma origin.",
      },
    })
  }
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return jsonResponse(401, {
      schemaVersion: 1,
      error: { code: "unauthenticated", message: "Logga in för att skriva till Sajtagent." },
    })
  }

  let input: unknown
  try {
    input = await readBoundedJsonV1(request, MAX_BODY_BYTES)
    const parsed = AgentTurnRequestV1Schema.parse(input)
    const { sessionId } = await params
    if (parsed.sessionId !== sessionId) {
      return jsonResponse(400, {
        schemaVersion: 1,
        error: {
          code: "session_mismatch",
          message: "Sessionen i sökvägen och turn-begäran måste vara samma.",
        },
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === "payload_too_large") {
      return jsonResponse(413, {
        schemaVersion: 1,
        error: { code: "payload_too_large", message: "Meddelandet är för stort." },
      })
    }
    if (error instanceof ZodError) {
      return jsonResponse(400, {
        schemaVersion: 1,
        error: {
          code: "invalid_turn_request",
          message: "Meddelandet matchar inte AgentTurnRequestV1.",
        },
      })
    }
    return jsonResponse(400, {
      schemaVersion: 1,
      error: { code: "invalid_json", message: "Begäran måste vara giltig JSON." },
    })
  }

  try {
    const { dbConfigured, pool } = await import(
      "../../../../../../lib/db/client.ts"
    )
    if (!dbConfigured || !pool) {
      return jsonResponse(503, {
        schemaVersion: 1,
        error: {
          code: "persistence_unavailable",
          message: "Sajtagentens sessionsdatabas är inte konfigurerad.",
        },
      })
    }
    const result = await prepareAgentTurnV1(input, principal, {
      repository: new PostgresAgentSessionRepositoryV1(pool),
      runtime: createAgentSessionRuntimeClientV1(),
      buildCoordinator: new PostgresAgentTurnBuildCoordinatorV1(pool),
    })
    if (result.kind === "created") return agentEventStreamSseResponseV1(result.events)
    if (result.kind === "existing") return agentEventsSseResponseV1(result.events)
    if (result.kind === "session_not_found") {
      return jsonResponse(404, {
        schemaVersion: 1,
        error: { code: "session_not_found", message: "Sessionen hittades inte." },
      })
    }
    if (result.kind === "stale_revision") {
      return jsonResponse(409, {
        schemaVersion: 1,
        error: {
          code: "stale_revision",
          message: "Projektets aktiva revision har ändrats. Öppna sessionen igen.",
        },
      })
    }
    if (result.kind === "active_turn_conflict") {
      return jsonResponse(409, {
        schemaVersion: 1,
        error: {
          code: "active_turn_conflict",
          message: "Sessionen har redan en aktiv turn.",
        },
      })
    }
    return jsonResponse(409, {
      schemaVersion: 1,
      error: {
        code: "idempotency_conflict",
        message: "Idempotency key har redan använts med ett annat innehåll.",
      },
    })
  } catch {
    return jsonResponse(503, {
      schemaVersion: 1,
      error: {
        code: "turn_unavailable",
        message: "Turnen kunde inte sparas och startades därför inte.",
      },
    })
  }
}
