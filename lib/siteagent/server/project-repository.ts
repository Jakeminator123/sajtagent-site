import type { Pool, PoolClient } from "pg"

import type { BuildPrincipalV1 } from "./build-job-input.ts"

export type PersonalStarterProjectV1 = {
  projectId: string
  activeRevisionId: string
}

export interface PersonalProjectRepositoryV1 {
  ensurePersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1>
  resetPersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1>
}

export function personalStarterIdsV1(userId: string): PersonalStarterProjectV1 {
  return {
    projectId: `project:personal:${userId}`,
    activeRevisionId: `revision:initial:${userId}`,
  }
}

function starterOwnershipConflict(
  existing: { userId: string; tenantId: string },
  principal: BuildPrincipalV1,
): boolean {
  return existing.userId !== principal.userId || existing.tenantId !== principal.tenantId
}

async function ensurePersonalStarterOnClient(
  client: PoolClient,
  principal: BuildPrincipalV1,
): Promise<PersonalStarterProjectV1> {
  const ids = personalStarterIdsV1(principal.userId)
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
  return {
    projectId: ids.projectId,
    activeRevisionId: updated.rows[0].active_revision_id,
  }
}

async function wipePersonalStarterOnClient(
  client: PoolClient,
  principal: BuildPrincipalV1,
): Promise<void> {
  const ids = personalStarterIdsV1(principal.userId)
  const existing = await client.query<{ tenant_id: string; owner_user_id: string }>(
    `select tenant_id, owner_user_id
       from public.site_projects
      where id = $1
      for update`,
    [ids.projectId],
  )
  const row = existing.rows[0]
  if (!row) return
  if (starterOwnershipConflict({ userId: row.owner_user_id, tenantId: row.tenant_id }, principal)) {
    throw new Error("starter_project_ownership_conflict")
  }

  // Sessions first: agent_sessions/turns reference revisions with ON DELETE RESTRICT.
  await client.query(
    `delete from public.agent_sessions
      where project_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
    [ids.projectId, principal.tenantId, principal.userId],
  )
  // Versions before project delete: site_versions.preview_ref is ON DELETE RESTRICT.
  await client.query(
    `delete from public.site_versions
      where project_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
    [ids.projectId, principal.tenantId, principal.userId],
  )
  await client.query(
    `delete from public.site_projects
      where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
    [ids.projectId, principal.tenantId, principal.userId],
  )
}

export class PostgresPersonalProjectRepositoryV1 implements PersonalProjectRepositoryV1 {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async ensurePersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1> {
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const project = await ensurePersonalStarterOnClient(client, principal)
      await client.query("commit")
      return project
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }

  async resetPersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1> {
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      await wipePersonalStarterOnClient(client, principal)
      const project = await ensurePersonalStarterOnClient(client, principal)
      await client.query("commit")
      return project
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
      if (starterOwnershipConflict(existing.principal, principal)) {
        throw new Error("starter_project_ownership_conflict")
      }
      return structuredClone(existing.record)
    }
    this.projects.set(record.projectId, { principal, record })
    return structuredClone(record)
  }

  /** Test seam: simulate a verified build advancing the personal starter. */
  advanceActiveRevision(principal: BuildPrincipalV1, activeRevisionId: string): void {
    const ids = personalStarterIdsV1(principal.userId)
    const existing = this.projects.get(ids.projectId)
    if (!existing || starterOwnershipConflict(existing.principal, principal)) {
      throw new Error("starter_project_ownership_conflict")
    }
    existing.record = { ...existing.record, activeRevisionId }
  }

  async resetPersonalStarterProject(
    principal: BuildPrincipalV1,
  ): Promise<PersonalStarterProjectV1> {
    const ids = personalStarterIdsV1(principal.userId)
    const existing = this.projects.get(ids.projectId)
    if (existing) {
      if (starterOwnershipConflict(existing.principal, principal)) {
        throw new Error("starter_project_ownership_conflict")
      }
      this.projects.delete(ids.projectId)
    }
    return this.ensurePersonalStarterProject(principal)
  }
}
