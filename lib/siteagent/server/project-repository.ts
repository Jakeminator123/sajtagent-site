import type { Pool } from "pg"

import type { BuildPrincipalV1 } from "./build-job-input.ts"

export type PersonalStarterProjectV1 = {
  projectId: string
  activeRevisionId: string
}

export interface PersonalProjectRepositoryV1 {
  ensurePersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1>
}

export function personalStarterIdsV1(userId: string): PersonalStarterProjectV1 {
  return {
    projectId: `project:personal:${userId}`,
    activeRevisionId: `revision:initial:${userId}`,
  }
}

export class PostgresPersonalProjectRepositoryV1 implements PersonalProjectRepositoryV1 {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async ensurePersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1> {
    const ids = personalStarterIdsV1(principal.userId)
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      await client.query(
        `insert into public.site_projects
           (id, tenant_id, owner_user_id, name)
         values ($1, $2, $3::uuid, $4)
         on conflict (id) do nothing`,
        [ids.projectId, principal.tenantId, principal.userId, "Min sajt"],
      )
      const project = await client.query<{ id: string }>(
        `select id
           from public.site_projects
          where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
          for update`,
        [ids.projectId, principal.tenantId, principal.userId],
      )
      if (project.rowCount !== 1) throw new Error("starter_project_ownership_conflict")

      await client.query(
        `insert into public.workspace_revisions
           (id, tenant_id, project_id, owner_user_id, manifest, verification_receipts)
         values ($1, $2, $3, $4::uuid, '{}'::jsonb, '[]'::jsonb)
         on conflict (id) do nothing`,
        [ids.activeRevisionId, principal.tenantId, ids.projectId, principal.userId],
      )
      const revision = await client.query<{ id: string }>(
        `select id
           from public.workspace_revisions
          where id = $1 and project_id = $2 and tenant_id = $3
            and owner_user_id = $4::uuid`,
        [ids.activeRevisionId, ids.projectId, principal.tenantId, principal.userId],
      )
      if (revision.rowCount !== 1) throw new Error("starter_revision_ownership_conflict")

      const updated = await client.query<{ active_revision_id: string }>(
        `update public.site_projects
            set active_revision_id = coalesce(active_revision_id, $1), updated_at = now()
          where id = $2 and tenant_id = $3 and owner_user_id = $4::uuid
          returning active_revision_id`,
        [ids.activeRevisionId, ids.projectId, principal.tenantId, principal.userId],
      )
      if (!updated.rows[0]?.active_revision_id) throw new Error("starter_project_update_failed")
      await client.query("commit")
      return {
        projectId: ids.projectId,
        activeRevisionId: updated.rows[0].active_revision_id,
      }
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }
}

/** In-memory implementation for the focused authorization and idempotency checks. */
export class MemoryPersonalProjectRepositoryV1 implements PersonalProjectRepositoryV1 {
  private readonly projects = new Map<string, { principal: BuildPrincipalV1; record: PersonalStarterProjectV1 }>()

  async ensurePersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1> {
    const record = personalStarterIdsV1(principal.userId)
    const existing = this.projects.get(record.projectId)
    if (existing) {
      if (
        existing.principal.userId !== principal.userId ||
        existing.principal.tenantId !== principal.tenantId
      ) {
        throw new Error("starter_project_ownership_conflict")
      }
      return structuredClone(existing.record)
    }
    this.projects.set(record.projectId, { principal, record })
    return structuredClone(record)
  }
}
