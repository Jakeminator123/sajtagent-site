import type {
  BuildEventV1,
  BuildJobV1,
  BuildResultV1,
  WorkerReportV1,
} from "../../../contracts/builder-v1.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"

export type StoredBuildJobV1 = {
  job: BuildJobV1
  requestHash: string
  status: "accepted" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out"
  result: BuildResultV1 | null
  workerReport: WorkerReportV1 | null
  events: BuildEventV1[]
}

export type CreateAcceptedBuildJobV1 =
  | { kind: "created"; record: StoredBuildJobV1 }
  | { kind: "existing"; record: StoredBuildJobV1 }
  | { kind: "conflict"; record: StoredBuildJobV1 }

export interface BuildJobRepositoryV1 {
  hasProjectRevision(
    principal: BuildPrincipalV1,
    projectId: string,
    revisionId: string,
  ): Promise<boolean>
  createAccepted(
    principal: BuildPrincipalV1,
    job: BuildJobV1,
    requestHash: string,
    acceptedEvent: BuildEventV1,
    profile: { profileId: string; revision: number },
  ): Promise<CreateAcceptedBuildJobV1>
  appendEvent(
    principal: BuildPrincipalV1,
    jobId: string,
    event: BuildEventV1,
    update: {
      status: StoredBuildJobV1["status"]
      result?: BuildResultV1
      workerReport?: WorkerReportV1
    },
  ): Promise<StoredBuildJobV1>
}

function jobKey(principal: BuildPrincipalV1, projectId: string, idempotencyKey: string) {
  return `${principal.userId}\0${projectId}\0${idempotencyKey}`
}

function projectRevisionKey(
  principal: BuildPrincipalV1,
  projectId: string,
  revisionId: string,
) {
  return `${principal.userId}\0${principal.tenantId}\0${projectId}\0${revisionId}`
}

/** In-memory repository used only by focused contract tests. */
export class MemoryBuildJobRepositoryV1 implements BuildJobRepositoryV1 {
  private readonly jobsByIdempotency = new Map<string, StoredBuildJobV1>()
  private readonly jobsById = new Map<string, StoredBuildJobV1>()
  private readonly ownerUserIdByJobId = new Map<string, string>()
  private readonly projectRevisions = new Set<string>()

  addProjectRevision(
    principal: BuildPrincipalV1,
    projectId: string,
    revisionId: string,
  ): void {
    this.projectRevisions.add(projectRevisionKey(principal, projectId, revisionId))
  }

  async hasProjectRevision(
    principal: BuildPrincipalV1,
    projectId: string,
    revisionId: string,
  ): Promise<boolean> {
    return this.projectRevisions.has(projectRevisionKey(principal, projectId, revisionId))
  }

  async createAccepted(
    principal: BuildPrincipalV1,
    job: BuildJobV1,
    requestHash: string,
    acceptedEvent: BuildEventV1,
    profile: { profileId: string; revision: number },
  ): Promise<CreateAcceptedBuildJobV1> {
    void profile
    const key = jobKey(principal, job.projectId, job.idempotencyKey)
    const existing = this.jobsByIdempotency.get(key)
    if (existing) {
      return existing.requestHash === requestHash
        ? { kind: "existing", record: structuredClone(existing) }
        : { kind: "conflict", record: structuredClone(existing) }
    }
    const record: StoredBuildJobV1 = {
      job,
      requestHash,
      status: "accepted",
      result: null,
      workerReport: null,
      events: [acceptedEvent],
    }
    this.jobsByIdempotency.set(key, record)
    this.jobsById.set(job.jobId, record)
    this.ownerUserIdByJobId.set(job.jobId, principal.userId)
    return { kind: "created", record: structuredClone(record) }
  }

  async appendEvent(
    principal: BuildPrincipalV1,
    jobId: string,
    event: BuildEventV1,
    update: {
      status: StoredBuildJobV1["status"]
      result?: BuildResultV1
      workerReport?: WorkerReportV1
    },
  ): Promise<StoredBuildJobV1> {
    const record = this.jobsById.get(jobId)
    if (
      !record ||
      record.job.tenantId !== principal.tenantId ||
      this.ownerUserIdByJobId.get(jobId) !== principal.userId
    ) {
      throw new Error("build_job_not_found")
    }
    const terminalSeen = record.events.some(
      (existing) => existing.type === "job.succeeded" || existing.type === "job.failed",
    )
    if (terminalSeen) throw new Error("terminal_event_already_exists")
    const expectedSequence = record.events.length + 1
    if (event.sequence !== expectedSequence || event.jobId !== jobId) {
      throw new Error("invalid_event_sequence")
    }
    record.status = update.status
    record.result = update.result ?? record.result
    record.workerReport = update.workerReport ?? record.workerReport
    record.events.push(event)
    return structuredClone(record)
  }
}
