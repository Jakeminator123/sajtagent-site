import "server-only"

import { randomUUID } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import {
  BuildEventV1Schema,
  BuildJobV1Schema,
  BuildResultSuccessV1Schema,
  BuildResultV1Schema,
  CandidateRevisionIdV1Schema,
  WorkerCandidateReportV1Schema,
  WorkerReportV1Schema,
  type BuildJobV1,
} from "../../../contracts/builder-v1.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import type { StoredBuildJobV1 } from "./build-job-repository.ts"
import {
  CanonicalProjectStateV1Schema,
  CanonicalVersionSummaryV1Schema,
  SiteOpaqueIdV1Schema,
  buildJobsCanonicallyEqualV1,
  publicVerificationReceiptsV1,
  validateInlinePreviewArtifactV1,
  validatePreparedAcceptedCandidateV1,
  type CanonicalProjectStateV1,
  type CanonicalVersionSummaryV1,
  type PreparedAcceptedCandidateV1,
  type StoredInlinePreviewV1,
} from "./version-model.ts"

type VersionRow = {
  id: string
  project_id: string
  workspace_revision_id: string
  preview_ref: string
  sitemap_revision: string
  version_number: number
  sha256: string
  size_bytes: number
  verified_at: Date | string
  created_at: Date | string
}

type ExistingVersionRow = VersionRow & {
  base_revision_id: string | null
  source_run_id: string | null
}

type PreviewRow = {
  id: string
  media_type: string
  sha256: string
  size_bytes: number
  html_content: string
}

type VersionExportRow = VersionRow & Omit<PreviewRow, "id"> & {
  artifact_id: string
}

type BuildJobRow = {
  id: string
  tenant_id: string
  project_id: string
  base_revision_id: string
  idempotency_key: string
  request_hash: string
  intent: unknown
  execution_policy: unknown
  status: StoredBuildJobV1["status"]
  worker_report: unknown | null
  result: unknown | null
  created_at: Date | string
  expires_at: Date | string
}

function timestamp(value: Date | string): string {
  return new Date(value).toISOString()
}

function toVersionSummary(row: VersionRow): CanonicalVersionSummaryV1 {
  return CanonicalVersionSummaryV1Schema.parse({
    versionId: row.id,
    projectId: row.project_id,
    workspaceRevisionId: row.workspace_revision_id,
    previewRef: row.preview_ref,
    sitemapRevision: row.sitemap_revision,
    versionNumber: row.version_number,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    verifiedAt: timestamp(row.verified_at),
    createdAt: timestamp(row.created_at),
  })
}

async function findVersionByJob(
  client: PoolClient,
  principal: BuildPrincipalV1,
  sourceJobId: string,
): Promise<ExistingVersionRow | null> {
  const result = await client.query<ExistingVersionRow>(
    `select v.id, v.project_id, v.workspace_revision_id, v.preview_ref,
            v.sitemap_revision, v.version_number, a.sha256, a.size_bytes,
            v.verified_at, v.created_at, r.base_revision_id, r.source_run_id
       from public.site_versions v
       join public.site_preview_artifacts a
         on a.id = v.preview_ref
        and a.tenant_id = v.tenant_id
        and a.project_id = v.project_id
        and a.owner_user_id = v.owner_user_id
        and a.workspace_revision_id = v.workspace_revision_id
       join public.workspace_revisions r
         on r.id = v.workspace_revision_id
        and r.tenant_id = v.tenant_id
        and r.project_id = v.project_id
        and r.owner_user_id = v.owner_user_id
      where v.source_job_id = $1 and v.tenant_id = $2 and v.owner_user_id = $3::uuid`,
    [sourceJobId, principal.tenantId, principal.userId],
  )
  return result.rows[0] ?? null
}

function assertExistingVersionMatches(
  row: ExistingVersionRow,
  job: BuildJobV1,
  prepared: PreparedAcceptedCandidateV1,
): CanonicalVersionSummaryV1 {
  if (
    row.project_id !== job.projectId ||
    row.base_revision_id !== job.baseRevisionId ||
    row.source_run_id !== prepared.report.sourceRunId ||
    row.preview_ref !== prepared.preview.previewRef ||
    row.sha256 !== prepared.preview.sha256 ||
    row.size_bytes !== prepared.preview.sizeBytes
  ) {
    throw new Error("version_persistence_conflict")
  }
  return toVersionSummary(row)
}

async function loadStoredBuildJob(
  client: PoolClient,
  principal: BuildPrincipalV1,
  jobId: string,
): Promise<StoredBuildJobV1> {
  const result = await client.query<BuildJobRow>(
    `select id, tenant_id, project_id, base_revision_id, idempotency_key,
            request_hash, intent, execution_policy, status, worker_report,
            result, created_at, expires_at
       from public.build_jobs
      where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
    [jobId, principal.tenantId, principal.userId],
  )
  const row = result.rows[0]
  if (!row) throw new Error("build_job_not_found")
  const events = await client.query<{ event: unknown }>(
    `select event
       from public.build_events
      where job_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
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
      createdAt: timestamp(row.created_at),
      expiresAt: timestamp(row.expires_at),
      intent: row.intent,
      executionPolicy: row.execution_policy,
    }),
    requestHash: row.request_hash,
    status: row.status,
    result: row.result ? BuildResultV1Schema.parse(row.result) : null,
    workerReport: row.worker_report ? WorkerReportV1Schema.parse(row.worker_report) : null,
    events: events.rows.map(({ event }) => BuildEventV1Schema.parse(event)),
  }
}

export interface SiteVersionRepositoryV1 {
  commitAcceptedCandidate(
    principal: BuildPrincipalV1,
    job: BuildJobV1,
    prepared: PreparedAcceptedCandidateV1,
    expectedSequence: number,
  ): Promise<StoredBuildJobV1>
  getProjectState(
    principal: BuildPrincipalV1,
    projectId: string,
  ): Promise<CanonicalProjectStateV1 | null>
  listVersions(
    principal: BuildPrincipalV1,
    projectId: string,
    limit?: number,
  ): Promise<CanonicalVersionSummaryV1[]>
  getPreview(
    principal: BuildPrincipalV1,
    previewRef: string,
  ): Promise<StoredInlinePreviewV1 | null>
  getVerifiedVersionExport(
    principal: BuildPrincipalV1,
    versionId: string,
  ): Promise<{
    version: CanonicalVersionSummaryV1
    preview: StoredInlinePreviewV1
  } | null>
}

export class PostgresSiteVersionRepositoryV1 implements SiteVersionRepositoryV1 {
  constructor(private readonly pool: Pool) {}

  async commitAcceptedCandidate(
    principal: BuildPrincipalV1,
    jobValue: BuildJobV1,
    preparedValue: PreparedAcceptedCandidateV1,
    expectedSequence: number,
  ): Promise<StoredBuildJobV1> {
    const { job, prepared, htmlContent } = validatePreparedAcceptedCandidateV1(
      jobValue,
      preparedValue,
    )
    if (job.tenantId !== principal.tenantId) throw new Error("tenant_mismatch")
    if (!CandidateRevisionIdV1Schema.safeParse(prepared.report.candidateRevisionId).success) {
      throw new Error("candidate_revision_projection_invalid")
    }
    if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 1) {
      throw new Error("invalid_event_sequence")
    }

    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const project = await client.query<{ active_revision_id: string | null }>(
        `select active_revision_id
           from public.site_projects
          where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
          for update`,
        [job.projectId, principal.tenantId, principal.userId],
      )
      const projectRow = project.rows[0]
      if (!projectRow) throw new Error("project_not_found")

      const existing = await findVersionByJob(client, principal, job.jobId)
      if (existing) {
        const summary = assertExistingVersionMatches(existing, job, prepared)
        const record = await loadStoredBuildJob(client, principal, job.jobId)
        const finalEvent = record.events.at(-1)
        if (
          record.status !== "succeeded" ||
          record.result?.status !== "succeeded" ||
          record.result.versionId !== summary.versionId ||
          finalEvent?.type !== "job.succeeded" ||
          finalEvent.sequence !== expectedSequence
        ) {
          throw new Error("version_persistence_conflict")
        }
        await client.query("commit")
        return record
      }
      if (projectRow.active_revision_id !== job.baseRevisionId) {
        throw new Error("stale_revision")
      }

      const sourceJob = await client.query<BuildJobRow>(
        `select id, tenant_id, project_id, base_revision_id, idempotency_key,
                request_hash, intent, execution_policy, status, worker_report,
                result, created_at, expires_at
           from public.build_jobs
          where id = $1 and project_id = $2 and tenant_id = $3
            and owner_user_id = $4::uuid
          for update`,
        [job.jobId, job.projectId, principal.tenantId, principal.userId],
      )
      const sourceJobRow = sourceJob.rows[0]
      if (!sourceJobRow || sourceJobRow.base_revision_id !== job.baseRevisionId) {
        throw new Error("source_job_not_found")
      }
      if (!new Set(["accepted", "running"]).has(sourceJobRow.status)) {
        throw new Error("source_job_terminal")
      }
      const storedJob = BuildJobV1Schema.parse({
        schemaVersion: 1,
        jobId: sourceJobRow.id,
        tenantId: sourceJobRow.tenant_id,
        projectId: sourceJobRow.project_id,
        baseRevisionId: sourceJobRow.base_revision_id,
        idempotencyKey: sourceJobRow.idempotency_key,
        createdAt: timestamp(sourceJobRow.created_at),
        expiresAt: timestamp(sourceJobRow.expires_at),
        intent: sourceJobRow.intent,
        executionPolicy: sourceJobRow.execution_policy,
      })
      if (!buildJobsCanonicallyEqualV1(storedJob, job)) {
        throw new Error("source_job_mismatch")
      }
      const previousSequence = await client.query<{ maximum: number }>(
        `select coalesce(max(sequence), 0)::integer as maximum
           from public.build_events
          where job_id = $1`,
        [job.jobId],
      )
      if (expectedSequence !== (previousSequence.rows[0]?.maximum ?? 0) + 1) {
        throw new Error("invalid_event_sequence")
      }

      const idSuffix = randomUUID()
      const workspaceRevisionId = prepared.report.candidateRevisionId
      const versionId = `version:${idSuffix}`
      const previewRef = prepared.preview.previewRef
      const sitemapRevision = `sitemap:${idSuffix}`
      const receipts = publicVerificationReceiptsV1(prepared.receipts)
      const manifest = {
        schemaVersion: 1,
        candidateRevisionId: prepared.report.candidateRevisionId,
        changedPaths: prepared.report.changedPaths,
      }

      await client.query(
        `insert into public.workspace_revisions (
           id, tenant_id, project_id, owner_user_id, base_revision_id,
           source_job_id, source_run_id, manifest, verification_receipts, created_at
         ) values ($1, $2, $3, $4::uuid, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
        [
          workspaceRevisionId,
          principal.tenantId,
          job.projectId,
          principal.userId,
          job.baseRevisionId,
          job.jobId,
          prepared.report.sourceRunId,
          JSON.stringify(manifest),
          JSON.stringify(receipts),
          prepared.verifiedAt,
        ],
      )

      await client.query(
        `insert into public.site_preview_artifacts (
           id, tenant_id, project_id, owner_user_id, workspace_revision_id,
           source_job_id, media_type, sha256, size_bytes, html_content, verified_at
         ) values ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11)`,
        [
          previewRef,
          principal.tenantId,
          job.projectId,
          principal.userId,
          workspaceRevisionId,
          job.jobId,
          prepared.preview.mediaType,
          prepared.preview.sha256,
          prepared.preview.sizeBytes,
          htmlContent,
          prepared.verifiedAt,
        ],
      )

      const versionNumberResult = await client.query<{ next_number: number }>(
        `select (coalesce(max(version_number), 0) + 1)::integer as next_number
           from public.site_versions
          where project_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
        [job.projectId, principal.tenantId, principal.userId],
      )
      const versionNumber = versionNumberResult.rows[0]?.next_number ?? 1

      const inserted = await client.query<VersionRow>(
        `insert into public.site_versions (
           id, tenant_id, project_id, owner_user_id, workspace_revision_id,
           source_job_id, preview_ref, sitemap_revision, version_number,
           verification_receipts, verified_at
         ) values ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10::jsonb, $11)
         returning id, project_id, workspace_revision_id, preview_ref,
                   sitemap_revision, version_number, $12::text as sha256,
                   $13::integer as size_bytes, verified_at, created_at`,
        [
          versionId,
          principal.tenantId,
          job.projectId,
          principal.userId,
          workspaceRevisionId,
          job.jobId,
          previewRef,
          sitemapRevision,
          versionNumber,
          JSON.stringify(receipts),
          prepared.verifiedAt,
          prepared.preview.sha256,
          prepared.preview.sizeBytes,
        ],
      )

      const activated = await client.query(
        `update public.site_projects
            set active_revision_id = $1, updated_at = $2
          where id = $3 and tenant_id = $4 and owner_user_id = $5::uuid
            and active_revision_id = $6`,
        [
          workspaceRevisionId,
          prepared.verifiedAt,
          job.projectId,
          principal.tenantId,
          principal.userId,
          job.baseRevisionId,
        ],
      )
      if (activated.rowCount !== 1 || !inserted.rows[0]) {
        throw new Error("version_activation_failed")
      }
      const summary = toVersionSummary(inserted.rows[0])
      const result = BuildResultSuccessV1Schema.parse({
        schemaVersion: 1,
        status: "succeeded",
        jobId: job.jobId,
        baseRevisionId: job.baseRevisionId,
        workspaceRevisionId: summary.workspaceRevisionId,
        versionId: summary.versionId,
        previewRef: summary.previewRef,
        sitemapRevision: summary.sitemapRevision,
        verifiedAt: prepared.verifiedAt,
        receipts,
      })
      const publicWorkerReport = WorkerCandidateReportV1Schema.parse({
        ...prepared.report,
        artifacts: [],
        receipts,
        diagnostics: [],
      })
      const event = BuildEventV1Schema.parse({
        schemaVersion: 1,
        jobId: job.jobId,
        sequence: expectedSequence,
        occurredAt: prepared.verifiedAt,
        sourceRunId: prepared.report.sourceRunId,
        type: "job.succeeded",
        payload: { result },
      })
      const completed = await client.query(
        `update public.build_jobs
            set status = 'succeeded', result = $4::jsonb,
                worker_report = $5::jsonb, updated_at = $6
          where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
            and status in ('accepted', 'running')`,
        [
          job.jobId,
          principal.tenantId,
          principal.userId,
          JSON.stringify(result),
          JSON.stringify(publicWorkerReport),
          prepared.verifiedAt,
        ],
      )
      if (completed.rowCount !== 1) throw new Error("build_job_completion_failed")
      await client.query(
        `insert into public.build_events (
           job_id, sequence, tenant_id, owner_user_id, event, occurred_at
         ) values ($1, $2, $3, $4::uuid, $5::jsonb, $6)`,
        [
          job.jobId,
          expectedSequence,
          principal.tenantId,
          principal.userId,
          JSON.stringify(event),
          prepared.verifiedAt,
        ],
      )
      const record = await loadStoredBuildJob(client, principal, job.jobId)
      await client.query("commit")
      return record
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }

  async getProjectState(
    principal: BuildPrincipalV1,
    projectId: string,
  ): Promise<CanonicalProjectStateV1 | null> {
    SiteOpaqueIdV1Schema.parse(projectId)
    const result = await this.pool.query<
      {
        project_id: string
        name: string
        active_revision_id: string | null
        updated_at: Date | string
      } & Partial<VersionRow>
    >(
      `select p.id as project_id, p.name, p.active_revision_id, p.updated_at,
              v.id, v.workspace_revision_id, v.preview_ref, v.sitemap_revision,
              v.version_number, a.sha256, a.size_bytes,
              v.verified_at, v.created_at
         from public.site_projects p
         left join public.site_versions v
           on v.workspace_revision_id = p.active_revision_id
          and v.project_id = p.id and v.tenant_id = p.tenant_id
          and v.owner_user_id = p.owner_user_id
         left join public.site_preview_artifacts a
           on a.id = v.preview_ref and a.tenant_id = v.tenant_id
          and a.project_id = v.project_id and a.owner_user_id = v.owner_user_id
          and a.workspace_revision_id = v.workspace_revision_id
        where p.id = $1 and p.tenant_id = $2 and p.owner_user_id = $3::uuid`,
      [projectId, principal.tenantId, principal.userId],
    )
    const row = result.rows[0]
    if (!row) return null
    const activeVersion = row.id
      ? toVersionSummary(row as VersionRow)
      : null
    return CanonicalProjectStateV1Schema.parse({
      projectId: row.project_id,
      name: row.name,
      activeRevisionId: row.active_revision_id,
      updatedAt: timestamp(row.updated_at),
      activeVersion,
    })
  }

  async listVersions(
    principal: BuildPrincipalV1,
    projectId: string,
    limit = 50,
  ): Promise<CanonicalVersionSummaryV1[]> {
    SiteOpaqueIdV1Schema.parse(projectId)
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
    const result = await this.pool.query<VersionRow>(
      `select v.id, v.project_id, v.workspace_revision_id, v.preview_ref,
              v.sitemap_revision, v.version_number, a.sha256, a.size_bytes,
              v.verified_at, v.created_at
         from public.site_versions v
         join public.site_preview_artifacts a
           on a.id = v.preview_ref and a.tenant_id = v.tenant_id
          and a.project_id = v.project_id and a.owner_user_id = v.owner_user_id
          and a.workspace_revision_id = v.workspace_revision_id
        where v.project_id = $1 and v.tenant_id = $2 and v.owner_user_id = $3::uuid
        order by v.version_number desc
        limit $4`,
      [projectId, principal.tenantId, principal.userId, boundedLimit],
    )
    return result.rows.map(toVersionSummary)
  }

  async getPreview(
    principal: BuildPrincipalV1,
    previewRef: string,
  ): Promise<StoredInlinePreviewV1 | null> {
    SiteOpaqueIdV1Schema.parse(previewRef)
    const result = await this.pool.query<PreviewRow>(
      `select id, media_type, sha256, size_bytes, html_content
         from public.site_preview_artifacts
        where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
      [previewRef, principal.tenantId, principal.userId],
    )
    const row = result.rows[0]
    if (!row) return null
    const preview = validateInlinePreviewArtifactV1({
      mediaType: row.media_type,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      content: row.html_content,
    })
    return { previewRef: row.id, ...preview }
  }

  async getVerifiedVersionExport(
    principal: BuildPrincipalV1,
    versionId: string,
  ): Promise<{
    version: CanonicalVersionSummaryV1
    preview: StoredInlinePreviewV1
  } | null> {
    SiteOpaqueIdV1Schema.parse(versionId)
    const result = await this.pool.query<VersionExportRow>(
      `select v.id, v.project_id, v.workspace_revision_id, v.preview_ref,
              v.sitemap_revision, v.version_number, v.verified_at, v.created_at,
              a.id as artifact_id, a.media_type, a.sha256, a.size_bytes, a.html_content
         from public.site_versions v
         join public.site_preview_artifacts a
           on a.id = v.preview_ref and a.tenant_id = v.tenant_id
          and a.project_id = v.project_id and a.owner_user_id = v.owner_user_id
          and a.workspace_revision_id = v.workspace_revision_id
        where v.id = $1 and v.tenant_id = $2 and v.owner_user_id = $3::uuid`,
      [versionId, principal.tenantId, principal.userId],
    )
    const row = result.rows[0]
    if (!row) return null
    const preview = validateInlinePreviewArtifactV1({
      mediaType: row.media_type,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      content: row.html_content,
    })
    return {
      version: toVersionSummary(row),
      preview: { previewRef: row.artifact_id, ...preview },
    }
  }
}
