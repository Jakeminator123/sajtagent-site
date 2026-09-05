import "server-only"

import { createHash } from "node:crypto"

import type { Pool } from "pg"

import {
  BuilderIntentTypeV1Schema,
  type BuilderIntentV1,
} from "../../../contracts/builder-v1.ts"
import type {
  AgentSessionV1,
  AgentTurnRequestV1,
} from "../../../contracts/agent-session-v1.ts"
import type { StoredBuildJobV1 } from "./build-job-repository.ts"
import {
  createBuildJobV1,
  type CreateBuildJobControllerResultV1,
} from "./build-job-controller.ts"
import {
  CreateBuildJobRequestV1Schema,
  type BuildPrincipalV1,
  type CreateBuildJobRequestV1,
} from "./build-job-input.ts"
import {
  RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1,
  createBuildJobServerJoinV1,
} from "./build-job-server-join.ts"
import { InlineSiteCandidatePreviewStoreV1 } from "./candidate-preview-store.ts"
import { PostgresBuildJobRepositoryV1 } from "./postgres-build-job-repository.ts"
import { createRuntimeArtifactReaderFromEnvV1 } from "./runtime-artifact-reader.ts"
import { createRuntimeClientFromEnvV1 } from "./runtime-client.ts"
import { PostgresSiteVersionRepositoryV1 } from "./version-repository.ts"

export type AgentTurnBuildPlanV1 = {
  intentType: BuilderIntentV1["intentType"]
  request: CreateBuildJobRequestV1
}

export interface AgentTurnBuildCoordinatorV1 {
  plan(input: {
    principal: BuildPrincipalV1
    session: AgentSessionV1
    request: AgentTurnRequestV1
  }): Promise<AgentTurnBuildPlanV1>
  run(input: {
    principal: BuildPrincipalV1
    plan: AgentTurnBuildPlanV1
    onStarted?: (record: StoredBuildJobV1) => Promise<void>
  }): Promise<CreateBuildJobControllerResultV1>
}

function buildIdempotencyKey(request: AgentTurnRequestV1): string {
  const digest = createHash("sha256")
    .update(`${request.sessionId}\0${request.turnId}\0${request.idempotencyKey}`)
    .digest("hex")
  return `agent:${digest}`
}

function buildContext(request: AgentTurnRequestV1) {
  return {
    selectedBaseRevisionId: request.uiContext.selectedBaseRevisionId,
    ...(request.uiContext.selectedRouteId
      ? { selectedRouteId: request.uiContext.selectedRouteId }
      : {}),
    ...(request.uiContext.selectedElementRef
      ? { selectedElementRef: request.uiContext.selectedElementRef }
      : {}),
    ...(request.uiContext.buildChoices
      ? { buildChoices: request.uiContext.buildChoices }
      : {}),
    ...(request.uiContext.mode ? { mode: request.uiContext.mode } : {}),
  }
}

export class PostgresAgentTurnBuildCoordinatorV1
  implements AgentTurnBuildCoordinatorV1
{
  private readonly versions: PostgresSiteVersionRepositoryV1
  private readonly dependencies: ReturnType<
    typeof createBuildJobServerJoinV1
  >["dependencies"]

  constructor(pool: Pool, env: NodeJS.ProcessEnv = process.env) {
    const jobs = new PostgresBuildJobRepositoryV1(pool)
    const versions = new PostgresSiteVersionRepositoryV1(pool)
    const runtime = createRuntimeClientFromEnvV1(env)
    const artifactReader = createRuntimeArtifactReaderFromEnvV1(env)
    const join = createBuildJobServerJoinV1({
      repository: jobs,
      runtime,
      artifactTransfer: artifactReader
        ? { kind: "available", reader: artifactReader }
        : RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1,
      previewStore: new InlineSiteCandidatePreviewStoreV1(),
      successCommitter: versions,
    })
    this.versions = versions
    this.dependencies = join.dependencies
  }

  async plan(input: {
    principal: BuildPrincipalV1
    session: AgentSessionV1
    request: AgentTurnRequestV1
  }): Promise<AgentTurnBuildPlanV1> {
    const project = await this.versions.getProjectState(
      input.principal,
      input.session.projectId,
    )
    if (
      !project ||
      input.request.uiContext.selectedBaseRevisionId !==
        input.session.activeBaseRevisionId
    ) {
      throw new Error("agent_build_plan_stale_revision")
    }
    const intentType = BuilderIntentTypeV1Schema.parse(
      project.activeVersion ? "site.change" : "site.create",
    )
    return {
      intentType,
      request: CreateBuildJobRequestV1Schema.parse({
        schemaVersion: 1,
        projectId: input.session.projectId,
        baseRevisionId: input.session.activeBaseRevisionId,
        idempotencyKey: buildIdempotencyKey(input.request),
        intent: {
          schemaVersion: 1,
          intentType,
          message: input.request.message,
          context: buildContext(input.request),
        },
      }),
    }
  }

  async run(input: {
    principal: BuildPrincipalV1
    plan: AgentTurnBuildPlanV1
    onStarted?: (record: StoredBuildJobV1) => Promise<void>
  }): Promise<CreateBuildJobControllerResultV1> {
    return createBuildJobV1(
      input.plan.request,
      input.principal,
      this.dependencies,
      { onStarted: input.onStarted },
    )
  }
}
