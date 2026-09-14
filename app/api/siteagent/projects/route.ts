import {
  parseCreateProjectRequestV2,
  PROJECT_CONTRACT_VERSION_V2,
} from "../../../../contracts/project-v2.ts"
import { PostgresProjectRepositoryV2 } from "../../../../lib/siteagent/server/project-v2-repository.ts"
import { resolveBuildPrincipalV1 } from "../../../../lib/siteagent/server/principal.ts"
import {
  isSameOriginMutation,
  readBoundedJsonV1,
} from "../../../../lib/siteagent/server/request-security.ts"
import { privateJsonHeadersV1 } from "../../../../lib/siteagent/server/version-model.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CREATE_BODY_MAX_BYTES = 4_096

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: privateJsonHeadersV1(),
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, {
    schemaVersion: PROJECT_CONTRACT_VERSION_V2,
    error: { code, message },
  })
}

async function loadRepository(): Promise<PostgresProjectRepositoryV2 | Response> {
  const { dbConfigured, pool } = await import("../../../../lib/db/client.ts")
  if (!dbConfigured || !pool) {
    return errorResponse(503, "persistence_unavailable", "Sajtagentens databas är inte konfigurerad.")
  }
  return new PostgresProjectRepositoryV2(pool)
}

export async function GET(request: Request): Promise<Response> {
  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return errorResponse(401, "unauthenticated", "Logga in för att lista projekt.")
  }

  try {
    const repository = await loadRepository()
    if (repository instanceof Response) return repository
    const projects = await repository.listProjects(principal)
    return jsonResponse(200, {
      schemaVersion: PROJECT_CONTRACT_VERSION_V2,
      projects,
    })
  } catch {
    return errorResponse(503, "persistence_unavailable", "Projekten kunde inte listas.")
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return errorResponse(403, "cross_origin_request", "Begäran måste komma från samma origin.")
  }

  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return errorResponse(401, "unauthenticated", "Logga in för att skapa ett projekt.")
  }

  try {
    const contentType = request.headers.get("content-type")
    const raw = contentType
      ? await readBoundedJsonV1(request, CREATE_BODY_MAX_BYTES)
      : { schemaVersion: PROJECT_CONTRACT_VERSION_V2 }
    const parsed = parseCreateProjectRequestV2(raw)
    if (!parsed.success) {
      const forbidden = parsed.error === "worker_sprite_id_client_forbidden"
      return errorResponse(
        forbidden ? 403 : 400,
        parsed.error,
        forbidden
          ? "Servern äger worker-bindningen. Klienten får inte välja workerSpriteId."
          : "Ogiltig projektbegäran.",
      )
    }

    const repository = await loadRepository()
    if (repository instanceof Response) return repository
    const project = await repository.createProject(principal, parsed.request)
    return jsonResponse(201, {
      schemaVersion: PROJECT_CONTRACT_VERSION_V2,
      project,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "payload_too_large") {
      return errorResponse(413, "payload_too_large", "Begäran är för stor.")
    }
    if (error instanceof Error && error.message === "invalid_json") {
      return errorResponse(400, "invalid_json", "Ogiltig JSON.")
    }
    return errorResponse(503, "persistence_unavailable", "Projektet kunde inte skapas.")
  }
}
