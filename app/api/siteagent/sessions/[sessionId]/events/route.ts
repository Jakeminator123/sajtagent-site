import { agentEventsSseResponseV1 } from "../../../../../../lib/siteagent/server/agent-session-sse.ts"
import { PostgresAgentSessionRepositoryV1 } from "../../../../../../lib/siteagent/server/postgres-agent-session-repository.ts"
import { resolveBuildPrincipalV1 } from "../../../../../../lib/siteagent/server/principal.ts"
import { privateJsonHeadersV1 } from "../../../../../../lib/siteagent/server/version-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SESSION_ID_PATTERN = /^session:[A-Za-z0-9_-]{32,128}$/
const CURSOR_PATTERN = /^(0|[1-9][0-9]*)$/

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: privateJsonHeadersV1(),
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return jsonResponse(401, {
      schemaVersion: 1,
      error: { code: "unauthenticated", message: "Logga in för att läsa Sajtagent." },
    })
  }
  const { sessionId } = await params
  const url = new URL(request.url)
  const cursorValues = url.searchParams.getAll("afterSequence")
  const cursorValue = cursorValues.length === 0 ? "0" : cursorValues[0]!
  if (
    !SESSION_ID_PATTERN.test(sessionId) ||
    cursorValues.length > 1 ||
    !CURSOR_PATTERN.test(cursorValue)
  ) {
    return jsonResponse(400, {
      schemaVersion: 1,
      error: { code: "invalid_cursor", message: "Resume-cursorn är ogiltig." },
    })
  }
  const afterSequence = Number(cursorValue)
  if (!Number.isSafeInteger(afterSequence)) {
    return jsonResponse(400, {
      schemaVersion: 1,
      error: { code: "invalid_cursor", message: "Resume-cursorn är ogiltig." },
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
          message: "Sajtagentens eventhistorik är inte tillgänglig.",
        },
      })
    }
    const result = await new PostgresAgentSessionRepositoryV1(pool).readEvents(
      principal,
      sessionId,
      afterSequence,
    )
    if (result.kind === "session_not_found") {
      return jsonResponse(404, {
        schemaVersion: 1,
        error: { code: "session_not_found", message: "Sessionen hittades inte." },
      })
    }
    if (result.kind === "invalid_cursor") {
      return jsonResponse(409, {
        schemaVersion: 1,
        error: {
          code: "invalid_cursor",
          message: "Resume-cursorn ligger efter sessionens senaste event.",
          lastSequence: result.lastSequence,
        },
      })
    }
    return agentEventsSseResponseV1(result.events)
  } catch {
    return jsonResponse(503, {
      schemaVersion: 1,
      error: {
        code: "events_unavailable",
        message: "Sajtagentens eventhistorik kunde inte verifieras.",
      },
    })
  }
}
