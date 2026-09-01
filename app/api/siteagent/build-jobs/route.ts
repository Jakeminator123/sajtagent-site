import { ZodError } from "zod"

import { createBuildJobV1 } from "../../../../lib/siteagent/server/build-job-controller.ts"
import { CreateBuildJobRequestV1Schema } from "../../../../lib/siteagent/server/build-job-input.ts"
import {
  RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1,
  createBuildJobServerJoinV1,
} from "../../../../lib/siteagent/server/build-job-server-join.ts"
import { InlineSiteCandidatePreviewStoreV1 } from "../../../../lib/siteagent/server/candidate-preview-store.ts"
import { PostgresBuildJobRepositoryV1 } from "../../../../lib/siteagent/server/postgres-build-job-repository.ts"
import { resolveBuildPrincipalV1 } from "../../../../lib/siteagent/server/principal.ts"
import { isSameOriginMutation, readBoundedJsonV1 } from "../../../../lib/siteagent/server/request-security.ts"
import { createRuntimeClientFromEnvV1 } from "../../../../lib/siteagent/server/runtime-client.ts"
import { PostgresSiteVersionRepositoryV1 } from "../../../../lib/siteagent/server/version-repository.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 32 * 1024

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { schemaVersion: 1, error: { code, message } },
    { status },
  )
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return errorResponse(403, "cross_origin_request", "Begäran måste komma från samma origin.")
  }

  const principal = await resolveBuildPrincipalV1(request)
  if (!principal) {
    return errorResponse(
      401,
      "unauthenticated",
      "Logga in för att starta ett bygge.",
    )
  }

  let input: unknown
  try {
    input = await readBoundedJsonV1(request, MAX_BODY_BYTES)
    CreateBuildJobRequestV1Schema.parse(input)
  } catch (error) {
    if (error instanceof Error && error.message === "payload_too_large") {
      return errorResponse(413, "payload_too_large", "Build-begäran är för stor.")
    }
    if (error instanceof ZodError) {
      return errorResponse(400, "invalid_request", "Build-begäran matchar inte kontraktet.")
    }
    return errorResponse(400, "invalid_json", "Begäran måste vara giltig JSON.")
  }

  try {
    const { dbConfigured, pool } = await import("../../../../lib/db/client.ts")
    if (!dbConfigured || !pool) {
      return errorResponse(
        503,
        "persistence_unavailable",
        "Sajtagentens fristående databas är inte konfigurerad.",
      )
    }
    const repository = new PostgresBuildJobRepositoryV1(pool)
    const join = createBuildJobServerJoinV1({
      repository,
      runtime: createRuntimeClientFromEnvV1(),
      artifactTransfer: RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1,
      previewStore: new InlineSiteCandidatePreviewStoreV1(),
      successCommitter: new PostgresSiteVersionRepositoryV1(pool),
    })
    const result = await createBuildJobV1(input, principal, join.dependencies)
    return Response.json(
      {
        schemaVersion: 1,
        kind: result.kind,
        job: result.record?.job,
        status: result.record?.status,
        result: result.record?.result,
        events: result.record?.events,
        error: result.error,
      },
      { status: result.httpStatus },
    )
  } catch {
    return errorResponse(
      503,
      "persistence_unavailable",
      "Byggjobbet kunde inte sparas auktoritativt och startades därför inte.",
    )
  }
}
