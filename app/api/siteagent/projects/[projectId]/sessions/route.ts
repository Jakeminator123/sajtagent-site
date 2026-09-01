import { ZodError } from "zod"

import { openAgentSessionV1 } from "../../../../../../lib/siteagent/server/agent-session-controller.ts"
import { PostgresAgentSessionRepositoryV1 } from "../../../../../../lib/siteagent/server/postgres-agent-session-repository.ts"
import { resolveBuildPrincipalV1 } from "../../../../../../lib/siteagent/server/principal.ts"
import { isSameOriginMutation } from "../../../../../../lib/siteagent/server/request-security.ts"
import { privateJsonHeadersV1 } from "../../../../../../lib/siteagent/server/version-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: privateJsonHeadersV1(),
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
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
      error: { code: "unauthenticated", message: "Logga in för att öppna Sajtagent." },
    })
  }

  try {
    const { projectId } = await params
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
    const result = await openAgentSessionV1(projectId, principal, {
      repository: new PostgresAgentSessionRepositoryV1(pool),
      runtime: null,
    })
    if (result.kind === "project_not_found") {
      return jsonResponse(404, {
        schemaVersion: 1,
        error: { code: "project_not_found", message: "Projektet hittades inte." },
      })
    }
    return jsonResponse(200, result.session)
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonResponse(400, {
        schemaVersion: 1,
        error: { code: "invalid_project", message: "Projekt-id:t är ogiltigt." },
      })
    }
    return jsonResponse(503, {
      schemaVersion: 1,
      error: {
        code: "session_unavailable",
        message: "Sajtagent-sessionen kunde inte öppnas auktoritativt.",
      },
    })
  }
}
