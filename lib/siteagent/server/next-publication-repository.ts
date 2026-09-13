import type { Pool } from "pg"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import { publicationHost, PublishNextRequestSchema, type PublishedNext } from "./next-publication-model.ts"
import { outputDigest, validateStaticFiles, type NextAccepted } from "./next-preview-model.ts"

export class PostgresNextPublicationRepository {
  readonly pool: Pool
  constructor(pool: Pool) { this.pool = pool }

  async publish(principal: BuildPrincipalV1, projectId: string, intent: unknown, domain: string): Promise<PublishedNext> {
    const expected = PublishNextRequestSchema.parse(intent)
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      // Shared lock order with D.begin: project first, then preview state.
      const owned = await client.query(`select id from public.site_projects
        where id=$1 and tenant_id=$2 and owner_user_id=$3::uuid for update`,
        [projectId, principal.tenantId, principal.userId])
      if (!owned.rowCount) throw new Error("project_not_found")
      const result = await client.query<{ state: { accepted: NextAccepted | null } }>(
        `select state from public.next_preview_states where project_id=$1 and tenant_id=$2 and owner_user_id=$3::uuid for update`,
        [projectId, principal.tenantId, principal.userId])
      const accepted = result.rows[0]?.state.accepted
      if (!accepted) throw new Error("accepted_revision_missing")
      if (accepted.projectId !== projectId || accepted.tenantId !== principal.tenantId ||
          accepted.sourceRevisionId !== expected.sourceRevisionId || accepted.jobId !== expected.jobId) throw new Error("accepted_revision_changed")
      const files = validateStaticFiles(accepted.files)
      if (outputDigest(files) !== accepted.outputSha256 || !accepted.deploymentId || !accepted.acceptedAt) throw new Error("accepted_output_invalid")
      const hostname = publicationHost(principal.tenantId, projectId, domain)
      const existing = await client.query<{ snapshot: PublishedNext; hostname: string }>(
        `select snapshot,hostname from public.next_publications_v2 where project_id=$1 and tenant_id=$2 and owner_user_id=$3::uuid`,
        [projectId, principal.tenantId, principal.userId])
      const old = existing.rows[0]?.snapshot
      if (old?.jobId === accepted.jobId && old.sourceRevisionId === accepted.sourceRevisionId && old.outputSha256 === accepted.outputSha256 && existing.rows[0].hostname === hostname) {
        await client.query("commit")
        return old
      }
      const snapshot: PublishedNext = {
        tenantId: principal.tenantId, projectId, sourceRevisionId: accepted.sourceRevisionId,
        jobId: accepted.jobId, deploymentId: accepted.deploymentId, outputSha256: accepted.outputSha256,
        previewRef: accepted.previewRef,
        publishedAt: new Date().toISOString(), files,
      }
      await client.query(`insert into public.next_publications_v2(project_id,tenant_id,owner_user_id,hostname,snapshot)
        values($1,$2,$3::uuid,$4,$5::jsonb) on conflict(project_id) do update
        set hostname=excluded.hostname,snapshot=excluded.snapshot,published_at=now()`,
        [projectId, principal.tenantId, principal.userId, hostname, JSON.stringify(snapshot)])
      await client.query("commit")
      return snapshot
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally { client.release() }
  }

  async getOwned(principal: BuildPrincipalV1, projectId: string): Promise<PublishedNext | null> {
    const result = await this.pool.query<{ snapshot: PublishedNext }>(`select n.snapshot from public.next_publications_v2 n
      join public.site_projects p on p.id=n.project_id and p.tenant_id=n.tenant_id and p.owner_user_id=n.owner_user_id
      where n.project_id=$1 and n.tenant_id=$2 and n.owner_user_id=$3::uuid`, [projectId, principal.tenantId, principal.userId])
    return result.rows[0]?.snapshot ?? null
  }

  async getPublic(hostname: string, domain: string): Promise<PublishedNext | null> {
    if (!hostname.endsWith(`.${domain}`) || hostname.slice(0, -(domain.length + 1)).includes(".")) return null
    const result = await this.pool.query<{ snapshot: PublishedNext }>(`select n.snapshot from public.next_publications_v2 n
      join public.site_projects p on p.id=n.project_id and p.tenant_id=n.tenant_id and p.owner_user_id=n.owner_user_id
      where n.hostname=$1`, [hostname])
    const snapshot = result.rows[0]?.snapshot
    if (!snapshot || publicationHost(snapshot.tenantId, snapshot.projectId, domain) !== hostname) return null
    return snapshot
  }
}
