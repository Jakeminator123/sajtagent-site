import "server-only"

import type { Pool, PoolClient } from "pg"

import {
  BuildEventV1Schema,
  BuildJobV1Schema,
  BuildResultV1Schema,
  WorkerReportV1Schema,
  type BuildEventV1,
  type BuildJobV1,
  type BuildResultV1,
  type WorkerReportV1,
} from "../../../contracts/builder-v1.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import type {
  BuildJobRepositoryV1,
  CreateAcceptedBuildJobV1,
  StoredBuildJobV1,
} from "./build-job-repository.ts"

type BuildJobRow = {
  id: string
  tenant_id: string
  project_id: string
  owner_user_id: string
  base_revision_id: string
  idempotency_key: string
  request_hash: string
  intent: unknown
  execution_policy: unknown
  status: StoredBuildJobV1["status"]
  worker_report: unknown | null
  result: unknown | null
  created_at: Date
  expires_at: Date
}

async function loadStoredJob(
  client: PoolClient,
  principal: BuildPrincipalV1,
  jobId: string,
): Promise<StoredBuildJobV1> {
  const jobResult = await client.query<BuildJobRow>(
    `select id, tenant_id, project_id, owner_user_id, base_revision_id,
            idempotency_key, request_hash, intent, execution_policy, status,
            worker_report, result, created_at, expires_at
       from public.build_jobs
      where id = $1 and tenant_id = $2 and owner_user_id = $3`,
    [jobId, principal.tenantId, principal.userId],
  )
  const row = jobResult.rows[0]
  if (!row) throw new Error("build_job_not_found")
  const eventsResult = await client.query<{ event: unknown }>(
    `select event
       from public.build_events
      where job_id = $1 and tenant_id = $2 and owner_user_id = $3
      order by sequence asc`,
    [jobId, principal.tenantId, principal.userId],
  )
  return {
    job: BuildJobV1Schema.parse({
      schemaVersion: 1,
      jobId: row.id,
      tenantId: row.tenant_id,
      projectId: row.project_id,
      baseRevisionId: row.base_revision_id,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      intent: row.intent,
      executionPolicy: row.execution_policy,
    }),
    requestHash: row.request_hash,
    status: row.status,
    result: row.result ? BuildResultV1Schema.parse(row.result) : null,
    workerReport: row.worker_report ? WorkerReportV1Schema.parse(row.worker_report) : null,
    events: eventsResult.rows.map(({ event }) => BuildEventV1Schema.parse(event)),
  }
}

export class PostgresBuildJobRepositoryV1 implements BuildJobRepositoryV1 {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async hasProjectRevision(
    principal: BuildPrincipalV1,
    projectId: string,
    revisionId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `select 1
         from public.workspace_revisions
        where id = $1 and project_id = $2 and tenant_id = $3 and owner_user_id = $4
        limit 1`,
      [revisionId, projectId, principal.tenantId, principal.userId],
    )
    return (result.rowCount ?? 0) === 1
  }

  async createAccepted(
    principal: BuildPrincipalV1,
    job: BuildJobV1,
    requestHash: string,
    acceptedEvent: BuildEventV1,
    profile: { profileId: string; revision: number },
  ): Promise<CreateAcceptedBuildJobV1> {
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const inserted = await client.query<{ id: string }>(
        `insert into public.build_jobs (
           id, tenant_id, project_id, owner_user_id, base_revision_id,
           idempotency_key, request_hash, intent, execution_policy,
           agent_profile_id, agent_profile_revision, status, created_at, expires_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, 'accepted', $12, $13)
         on conflict (owner_user_id, project_id, idempotency_key) do nothing
         returning id`,
        [
          job.jobId,
          principal.tenantId,
          job.projectId,
          principal.userId,
          job.baseRevisionId,
          job.idempotencyKey,
          requestHash,
          JSON.stringify(job.intent),
          JSON.stringify(job.executionPolicy),
          profile.profileId,
          profile.revision,
          job.createdAt,
          job.expiresAt,
        ],
      )
      if ((inserted.rowCount ?? 0) === 1) {
        await client.query(
          `insert into public.build_events (
             job_id, sequence, tenant_id, owner_user_id, event, occurred_at
           ) values ($1, $2, $3, $4, $5::jsonb, $6)`,
          [
            job.jobId,
            acceptedEvent.sequence,
            principal.tenantId,
            principal.userId,
            JSON.stringify(acceptedEvent),
            acceptedEvent.occurredAt,
          ],
        )
        const record = await loadStoredJob(client, principal, job.jobId)
        await client.query("commit")
        return { kind: "created", record }
      }

      const existingId = await client.query<{ id: string; request_hash: string }>(
        `select id, request_hash
           from public.build_jobs
          where owner_user_id = $1 and project_id = $2 and idempotency_key = $3
          for update`,
        [principal.userId, job.projectId, job.idempotencyKey],
      )
      const existing = existingId.rows[0]
      if (!existing) throw new Error("idempotency_lookup_failed")
      const record = await loadStoredJob(client, principal, existing.id)
      await client.query("commit")
      return existing.request_hash === requestHash
        ? { kind: "existing", record }
        : { kind: "conflict", record }
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
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
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const locked = await client.query<{ status: string }>(
        `select status
           from public.build_jobs
          where id = $1 and tenant_id = $2 and owner_user_id = $3
          for update`,
        [jobId, principal.tenantId, principal.userId],
      )
      if (!locked.rows[0]) throw new Error("build_job_not_found")
      if (["succeeded", "failed", "cancelled", "timed_out"].includes(locked.rows[0].status)) {
        throw new Error("terminal_event_already_exists")
      }
      const previousSequence = await client.query<{ maximum: number }>(
        `select coalesce(max(sequence), 0)::integer as maximum
           from public.build_events
          where job_id = $1`,
        [jobId],
      )
      if (event.sequence !== (previousSequence.rows[0]?.maximum ?? 0) + 1) {
        throw new Error("invalid_event_sequence")
      }
      await client.query(
        `update public.build_jobs
            set status = $4,
                result = coalesce($5::jsonb, result),
                worker_report = coalesce($6::jsonb, worker_report),
                updated_at = now()
          where id = $1 and tenant_id = $2 and owner_user_id = $3`,
        [
          jobId,
          principal.tenantId,
          principal.userId,
          update.status,
          update.result ? JSON.stringify(update.result) : null,
          update.workerReport ? JSON.stringify(update.workerReport) : null,
        ],
      )
      await client.query(
        `insert into public.build_events (
           job_id, sequence, tenant_id, owner_user_id, event, occurred_at
         ) values ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          jobId,
          event.sequence,
          principal.tenantId,
          principal.userId,
          JSON.stringify(event),
          event.occurredAt,
        ],
      )
      const record = await loadStoredJob(client, principal, jobId)
      await client.query("commit")
      return record
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }
}
