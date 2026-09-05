import { createHash, randomUUID } from "node:crypto"

import {
  DEFAULT_AGENT_PROFILE_V1,
  DEFAULT_LOCAL_AGENT_CEILING_V1,
  deriveEffectiveAgentPolicyV1,
} from "../../../contracts/agent-profile-v1.ts"
import {
  BuildEventV1Schema,
  BuildJobV1Schema,
  BuildResultFailureV1Schema,
  WorkerReportV1Schema,
  validateBuildEventStreamV1,
  type BuildEventV1,
  type BuildJobV1,
  type BuildResultV1,
  type EvidenceReceiptV1,
  type WorkerReportV1,
} from "../../../contracts/builder-v1.ts"
import {
  CreateBuildJobRequestV1Schema,
  type BuildPrincipalV1,
  type CreateBuildJobRequestV1,
} from "./build-job-input.ts"
import type {
  CandidateAcceptanceDecisionV1,
  CandidateAcceptanceV1,
  PreparedAcceptedCandidateV1,
} from "./candidate-acceptance.ts"
import type {
  BuildJobRepositoryV1,
  StoredBuildJobV1,
} from "./build-job-repository.ts"

export interface BuildRuntimeClientV1 {
  run(job: BuildJobV1): Promise<WorkerReportV1>
}

export interface AcceptedCandidateCommitterV1 {
  commitAcceptedCandidate(
    principal: BuildPrincipalV1,
    job: BuildJobV1,
    prepared: PreparedAcceptedCandidateV1,
    expectedSequence: number,
  ): Promise<StoredBuildJobV1>
}

type BuildResultFailureV1 = Extract<BuildResultV1, { status: "failed" }>

const SAFE_PERSISTENCE_ERROR_VALUE_V1 = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/

function safePersistenceErrorV1(error: unknown): {
  errorCode: string
  constraint?: string
} {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null
  const code = record?.code
  const constraint = record?.constraint
  const message = error instanceof Error ? error.message : null
  return {
    errorCode:
      typeof code === "string" && SAFE_PERSISTENCE_ERROR_VALUE_V1.test(code)
        ? code
        : message && SAFE_PERSISTENCE_ERROR_VALUE_V1.test(message)
          ? message
          : error instanceof Error
            ? error.name
            : "unknown",
    ...(typeof constraint === "string" &&
    SAFE_PERSISTENCE_ERROR_VALUE_V1.test(constraint)
      ? { constraint }
      : {}),
  }
}

export type CreateBuildJobControllerResultV1 = {
  httpStatus: number
  kind:
    | "created"
    | "existing"
    | "forbidden"
    | "idempotency_conflict"
    | "failed"
  record?: StoredBuildJobV1
  error?: { code: string; message: string }
}

export type BuildJobControllerDependenciesV1 = {
  repository: BuildJobRepositoryV1
  runtime: BuildRuntimeClientV1 | null
  acceptance?: CandidateAcceptanceV1 | null
  successCommitter?: AcceptedCandidateCommitterV1 | null
  runtimeUnavailableMessage?: string
  now?: () => Date
  createId?: () => string
}

export type CreateBuildJobOptionsV1 = {
  onStarted?: (record: StoredBuildJobV1) => Promise<void>
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function requestHash(
  principal: BuildPrincipalV1,
  request: CreateBuildJobRequestV1,
): string {
  return createHash("sha256")
    .update(canonicalJson({ principal, request }))
    .digest("hex")
}

function failureResult(
  job: BuildJobV1,
  code: BuildResultFailureV1["code"],
  message: string,
  retryable: boolean,
  failedAt: string,
  receipts: EvidenceReceiptV1[] = [],
): BuildResultFailureV1 {
  return BuildResultFailureV1Schema.parse({
    schemaVersion: 1,
    status: "failed",
    jobId: job.jobId,
    baseRevisionId: job.baseRevisionId,
    code,
    message,
    retryable,
    failedAt,
    receipts,
  })
}

function terminalFailureEvent(
  job: BuildJobV1,
  sequence: number,
  result: BuildResultFailureV1,
  sourceRunId?: string,
): BuildEventV1 {
  return BuildEventV1Schema.parse({
    schemaVersion: 1,
    jobId: job.jobId,
    sequence,
    occurredAt: result.failedAt,
    sourceRunId,
    type: "job.failed",
    payload: { result },
  })
}

async function persistRuntimeFailure(
  dependencies: BuildJobControllerDependenciesV1,
  principal: BuildPrincipalV1,
  job: BuildJobV1,
  sequence: number,
  result: BuildResultFailureV1,
  options: {
    workerReport?: WorkerReportV1
    status?: StoredBuildJobV1["status"]
  } = {},
): Promise<StoredBuildJobV1> {
  return dependencies.repository.appendEvent(
    principal,
    job.jobId,
    terminalFailureEvent(
      job,
      sequence,
      result,
      options.workerReport?.sourceRunId,
    ),
    {
      status: options.status ?? "failed",
      result,
      workerReport: options.workerReport,
    },
  )
}

export async function createBuildJobV1(
  requestInput: unknown,
  principal: BuildPrincipalV1,
  dependencies: BuildJobControllerDependenciesV1,
  options: CreateBuildJobOptionsV1 = {},
): Promise<CreateBuildJobControllerResultV1> {
  const request = CreateBuildJobRequestV1Schema.parse(requestInput)
  const ownsRevision = await dependencies.repository.hasProjectRevision(
    principal,
    request.projectId,
    request.baseRevisionId,
  )
  if (!ownsRevision) {
    return {
      httpStatus: 403,
      kind: "forbidden",
      error: {
        code: "forbidden",
        message: "Projektet eller basrevisionen är inte tillgänglig för användaren.",
      },
    }
  }

  const now = (dependencies.now ?? (() => new Date()))()
  const createdAt = now.toISOString()
  const deadlineAt = new Date(now.getTime() + 4 * 60_000).toISOString()
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString()
  const profilePolicy = deriveEffectiveAgentPolicyV1(
    DEFAULT_AGENT_PROFILE_V1,
    DEFAULT_LOCAL_AGENT_CEILING_V1,
  )
  const runtimeCapabilities = profilePolicy.capabilities.filter(
    (capability) =>
      capability !== "command.execute" && capability !== "packages.install",
  )
  const job = BuildJobV1Schema.parse({
    schemaVersion: 1,
    jobId: `job:${(dependencies.createId ?? randomUUID)()}`,
    tenantId: principal.tenantId,
    projectId: request.projectId,
    baseRevisionId: request.baseRevisionId,
    idempotencyKey: request.idempotencyKey,
    createdAt,
    expiresAt,
    intent: request.intent,
    executionPolicy: {
      deadlineAt,
      maxSteps: profilePolicy.budgets.maxSteps,
      maxToolCalls: profilePolicy.budgets.maxToolCalls,
      maxModelTokens: profilePolicy.budgets.maxModelTokens,
      maxCostMicros: profilePolicy.budgets.maxCostMicros,
      capabilities: runtimeCapabilities,
      network: profilePolicy.network,
      packages: profilePolicy.packages,
    },
  })
  const acceptedEvent = BuildEventV1Schema.parse({
    schemaVersion: 1,
    jobId: job.jobId,
    sequence: 1,
    occurredAt: createdAt,
    type: "job.accepted",
    payload: { acceptedAt: createdAt },
  })
  const created = await dependencies.repository.createAccepted(
    principal,
    job,
    requestHash(principal, request),
    acceptedEvent,
    {
      profileId: DEFAULT_AGENT_PROFILE_V1.profileId,
      revision: DEFAULT_AGENT_PROFILE_V1.revision,
    },
  )

  if (created.kind === "conflict") {
    return {
      httpStatus: 409,
      kind: "idempotency_conflict",
      record: created.record,
      error: {
        code: "idempotency_conflict",
        message: "Samma idempotency key har redan använts med ett annat innehåll.",
      },
    }
  }
  if (created.kind === "existing") {
    return {
      httpStatus: created.record.result ? 200 : 202,
      kind: "existing",
      record: created.record,
    }
  }

  await options.onStarted?.(created.record)

  if (!dependencies.runtime) {
    const result = failureResult(
      job,
      "runtime_unavailable",
      dependencies.runtimeUnavailableMessage ??
        "Sajtagentens runtime är inte konfigurerad. Ingen simulerad preview skapades.",
      true,
      createdAt,
    )
    const record = await persistRuntimeFailure(
      dependencies,
      principal,
      job,
      2,
      result,
    )
    return { httpStatus: 503, kind: "failed", record }
  }

  const runningAt = (dependencies.now ?? (() => new Date()))().toISOString()
  await dependencies.repository.appendEvent(
    principal,
    job.jobId,
    BuildEventV1Schema.parse({
      schemaVersion: 1,
      jobId: job.jobId,
      sequence: 2,
      occurredAt: runningAt,
      type: "job.running",
      payload: { phase: "build", label: "OpenClaw runtime" },
    }),
    { status: "running" },
  )

  let workerReportInput: unknown
  try {
    workerReportInput = await dependencies.runtime.run(job)
  } catch {
    const failedAt = (dependencies.now ?? (() => new Date()))().toISOString()
    const result = failureResult(
      job,
      "runtime_unavailable",
      "Runtime-anropet kunde inte slutföras. Ingen preview eller version skapades.",
      true,
      failedAt,
    )
    const record = await persistRuntimeFailure(
      dependencies,
      principal,
      job,
      3,
      result,
    )
    return { httpStatus: 503, kind: "failed", record }
  }

  const parsedWorkerReport = WorkerReportV1Schema.safeParse(workerReportInput)
  if (!parsedWorkerReport.success) {
    const failedAt = (dependencies.now ?? (() => new Date()))().toISOString()
    const result = failureResult(
      job,
      "verification_failed",
      "Runtime returnerade en rapport som inte matchar WorkerReportV1.",
      false,
      failedAt,
    )
    const record = await persistRuntimeFailure(
      dependencies,
      principal,
      job,
      3,
      result,
    )
    return { httpStatus: 422, kind: "failed", record }
  }

  const workerReport = parsedWorkerReport.data
  const terminalAt = (dependencies.now ?? (() => new Date()))().toISOString()
  if (workerReport.status === "candidate") {
    if (!dependencies.acceptance) {
      const result = failureResult(
        job,
        "verification_failed",
        "Runtime returnerade en kandidat, men Site-ägd acceptans är inte konfigurerad.",
        true,
        terminalAt,
        workerReport.receipts,
      )
      const record = await persistRuntimeFailure(
        dependencies,
        principal,
        job,
        3,
        result,
        { workerReport },
      )
      return { httpStatus: 422, kind: "failed", record }
    }
    if (!dependencies.successCommitter) {
      const result = failureResult(
        job,
        "persistence_failed",
        "Atomisk commit för revision, version och terminalt event är inte konfigurerad.",
        true,
        terminalAt,
        workerReport.receipts,
      )
      const record = await persistRuntimeFailure(
        dependencies,
        principal,
        job,
        3,
        result,
        { workerReport },
      )
      return { httpStatus: 503, kind: "failed", record }
    }

    let decision: CandidateAcceptanceDecisionV1
    try {
      decision = await dependencies.acceptance.accept({
        principal,
        job,
        report: workerReport,
      })
    } catch {
      const result = failureResult(
        job,
        "verification_failed",
        "Kandidatacceptansen kunde inte slutföras och stoppades felsäkert.",
        true,
        terminalAt,
        workerReport.receipts,
      )
      const record = await persistRuntimeFailure(
        dependencies,
        principal,
        job,
        3,
        result,
        { workerReport },
      )
      return { httpStatus: 422, kind: "failed", record }
    }

    if (!decision.accepted) {
      const result = failureResult(
        job,
        decision.code,
        decision.message,
        decision.retryable,
        terminalAt,
        decision.receipts,
      )
      const record = await persistRuntimeFailure(
        dependencies,
        principal,
        job,
        3,
        result,
        { workerReport },
      )
      const httpStatus =
        decision.code === "stale_revision" || decision.code === "expired"
          ? 409
          : decision.code === "persistence_failed"
            ? 503
            : decision.code === "preview_unhealthy"
              ? 502
              : 422
      return { httpStatus, kind: "failed", record }
    }

    let record: StoredBuildJobV1
    try {
      record = await dependencies.successCommitter.commitAcceptedCandidate(
        principal,
        job,
        decision.prepared,
        3,
      )
    } catch (error) {
      console.error(
        "[siteagent/build-job] accepted candidate persistence failed",
        safePersistenceErrorV1(error),
      )
      const result = failureResult(
        job,
        "persistence_failed",
        "Verifierad kandidat kunde inte committas atomiskt som revision, version och terminalt event.",
        true,
        terminalAt,
        workerReport.receipts,
      )
      const failedRecord = await persistRuntimeFailure(
        dependencies,
        principal,
        job,
        3,
        result,
        { workerReport },
      )
      return { httpStatus: 503, kind: "failed", record: failedRecord }
    }
    const stream = validateBuildEventStreamV1(record.events)
    const terminal = record.events.at(-1)
    if (
      !stream.success ||
      record.status !== "succeeded" ||
      record.result?.status !== "succeeded" ||
      record.result.jobId !== job.jobId ||
      record.result.baseRevisionId !== job.baseRevisionId ||
      record.result.previewRef !== decision.prepared.preview.previewRef ||
      terminal?.type !== "job.succeeded" ||
      terminal.sequence !== 3
    ) {
      throw new Error("accepted_candidate_commit_invalid")
    }
    return { httpStatus: 201, kind: "created", record }
  }

  const code =
    workerReport.status === "cancelled"
      ? "cancelled"
      : workerReport.status === "timed_out"
        ? "timeout"
        : "worker_failed"
  const result = failureResult(
    job,
    code,
    workerReport.diagnostics[0]?.message ?? "Runtime-jobbet misslyckades.",
    workerReport.diagnostics.some((diagnostic) => diagnostic.retryable),
    terminalAt,
    workerReport.receipts,
  )
  const record = await persistRuntimeFailure(
    dependencies,
    principal,
    job,
    3,
    result,
    {
      workerReport,
      status:
        workerReport.status === "cancelled"
          ? "cancelled"
          : workerReport.status === "timed_out"
            ? "timed_out"
            : "failed",
    },
  )
  return { httpStatus: 502, kind: "failed", record }
}
