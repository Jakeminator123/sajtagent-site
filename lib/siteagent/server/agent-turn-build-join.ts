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
  AgentNextPreviewResultV2,
} from "../../../contracts/agent-session-v1.ts"
import { classifyAgentTurnModeV1 } from "../agent-turn-mode.ts"
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
import type { NextJob } from "./next-preview-model.ts"
import { PostgresNextPreviewRepository } from "./next-preview-repository.ts"
import { agentBuildProfile, readBuildProfilePreference } from "./agent-build-profile.ts"
import { isRetryableNextFailure, nextBuildFailureResponse } from "./next-preview-failure.ts"
import { classifyPageOnlyMutations, type PageOnlyMutation } from "./next-preview-pages.ts"

export type AgentTurnBuildPlanV1 = {
  intentType: BuilderIntentV1["intentType"]
  request: CreateBuildJobRequestV1
  profile?: "next"
  nextBaseJobId?: string | null
  pageMutations?: PageOnlyMutation[]
}

export type AgentBuildStartedV1 = { job: Pick<StoredBuildJobV1["job"], "jobId" | "createdAt"> }
export type AgentNextBuildResultV2 = {
  kind: "next"
  record: null
  httpStatus: number
  nextResult: AgentNextPreviewResultV2 | null
  failure?: { code: string; retryable: boolean; failedAt: string }
}

export interface AgentTurnBuildCoordinatorV1 {
  plan(input: {
    principal: BuildPrincipalV1
    session: AgentSessionV1
    request: AgentTurnRequestV1
  }): Promise<AgentTurnBuildPlanV1 | null>
  run(input: {
    principal: BuildPrincipalV1
    plan: AgentTurnBuildPlanV1
    onStarted?: (record: AgentBuildStartedV1) => Promise<void>
    latestStartAt?: string
    deadlineAt?: string
  }): Promise<CreateBuildJobControllerResultV1 | AgentNextBuildResultV2>
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
  private readonly nextPreviews: PostgresNextPreviewRepository
  private readonly env: NodeJS.ProcessEnv
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
    this.nextPreviews = new PostgresNextPreviewRepository(pool)
    this.env = env
    this.dependencies = join.dependencies
  }

  async plan(input: {
    principal: BuildPrincipalV1
    session: AgentSessionV1
    request: AgentTurnRequestV1
  }): Promise<AgentTurnBuildPlanV1 | null> {
    if (classifyAgentTurnModeV1(input.request) !== "build.request") {
      return null
    }
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
    const nextState = await this.nextPreviews.getState(input.principal, input.session.projectId)
    if (!nextState) throw new Error("project_not_found")
    const profile = agentBuildProfile(this.env, nextState, readBuildProfilePreference(nextState))
    const intentType = BuilderIntentTypeV1Schema.parse(
      (profile === "next" ? nextState.accepted : project.activeVersion) ? "site.change" : "site.create",
    )
    const sourceFiles = profile === "next" && nextState.accepted
      ? await this.nextPreviews.getAcceptedSource(input.principal, input.session.projectId)
      : null
    const pageMutations = sourceFiles
      ? classifyPageOnlyMutations(input.request.message, sourceFiles)
      : null
    return {
      intentType,
      ...(profile === "next" ? { profile, nextBaseJobId: nextState.accepted?.jobId ?? null } : {}),
      ...(pageMutations ? { pageMutations } : {}),
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
    onStarted?: (record: AgentBuildStartedV1) => Promise<void>
    latestStartAt?: string
    deadlineAt?: string
  }): Promise<CreateBuildJobControllerResultV1 | AgentNextBuildResultV2> {
    if (input.plan.profile === "next") {
      let started: NextJob | null = null
      try {
        const { generateNextPreview, mutateNextPreviewPagesFromPrompt } = await import("./next-preview-service.ts")
        const state = input.plan.pageMutations?.length
          ? await mutateNextPreviewPagesFromPrompt(
              input.principal,
              input.plan.request.projectId,
              input.plan.pageMutations,
              undefined,
              {
                latestStartAt: input.latestStartAt,
                deadlineAt: input.deadlineAt,
                expectedAcceptedJobId: input.plan.nextBaseJobId,
                onStarted: async (job, createdAt) => {
                  started = job
                  await input.onStarted?.({ job: { jobId: job.jobId, createdAt } })
                },
              },
            )
          : await generateNextPreview(
              input.principal,
              input.plan.request.projectId,
              input.plan.request.intent.message,
              undefined,
              {
                latestStartAt: input.latestStartAt,
                deadlineAt: input.deadlineAt,
                expectedAcceptedJobId: input.plan.nextBaseJobId,
                onStarted: async (job, createdAt) => {
                  started = job
                  await input.onStarted?.({ job: { jobId: job.jobId, createdAt } })
                },
              },
            )
        const accepted = state?.accepted
        const binding: NextJob | null = started
        if (!binding || !accepted ||
          (["tenantId", "projectId", "jobId", "sourceRevisionId", "previewRef"] as const)
            .some(key => accepted[key] !== binding[key])) throw new Error("stale_job_result")
        return {
          kind: "next", record: null, httpStatus: 201,
          nextResult: {
            schemaVersion: 2, status: "succeeded", projectId: accepted.projectId,
            jobId: accepted.jobId, sourceRevisionId: accepted.sourceRevisionId,
            previewRef: accepted.previewRef, verifiedAt: accepted.acceptedAt,
          },
        }
      } catch (error) {
        const named = error instanceof Error && ["project_busy", "stale_source_generation", "stale_job_result", "turn_policy_expired"].includes(error.message)
          ? error.message : null
        if (named) {
          return {
            kind: "next", record: null, httpStatus: 409,
            nextResult: null, failure: { code: named, retryable: true, failedAt: new Date().toISOString() },
          }
        }
        const mapped = nextBuildFailureResponse(error)
        return {
          kind: "next", record: null, httpStatus: mapped.status,
          nextResult: null, failure: {
            code: mapped.body.reason ?? mapped.body.error,
            retryable: isRetryableNextFailure(mapped),
            failedAt: new Date().toISOString(),
          },
        }
      }
    }
    return createBuildJobV1(
      input.plan.request,
      input.principal,
      this.dependencies,
      { onStarted: input.onStarted },
    )
  }
}
