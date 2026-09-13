import { randomUUID } from "node:crypto"
import type { Pool, PoolClient } from "pg"

import {
  authorizeBindProjectWorkerV2,
  DEFAULT_PROJECT_NAME_V2,
  PROJECT_CONTRACT_VERSION_V2,
  parseCreateProjectRequestV2,
  principalOwnsProjectV2,
  projectOwnerFromPrincipalV2,
  type CreateProjectRequestV2,
  type ProjectOwnerV2,
  type ProjectPrincipalV2,
  type ProjectV2,
} from "../../../contracts/project-v2.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"

export function projectPrincipalFromBuildV1(
  principal: BuildPrincipalV1,
): ProjectPrincipalV2 {
  return {
    tenantId: principal.tenantId,
    principalId: principal.userId,
  }
}

export function projectFromRowV2(row: {
  id: string
  tenant_id: string
  owner_user_id: string
  name: string
  worker_sprite_id: string | null
}): ProjectV2 {
  return {
    schemaVersion: PROJECT_CONTRACT_VERSION_V2,
    projectId: row.id,
    name: row.name,
    owner: {
      tenantId: row.tenant_id,
      projectId: row.id,
      principalId: row.owner_user_id,
    },
    workerSpriteId: row.worker_sprite_id,
  }
}

export interface ProjectRepositoryV2 {
  listProjects(principal: BuildPrincipalV1): Promise<ProjectV2[]>
  openProject(principal: BuildPrincipalV1, projectId: string): Promise<ProjectV2 | null>
  createProject(
    principal: BuildPrincipalV1,
    request: CreateProjectRequestV2,
  ): Promise<ProjectV2>
  bindProjectWorker(
    principal: BuildPrincipalV1,
    projectId: string,
    workerSpriteId: string,
  ): Promise<ProjectV2>
}

function createProjectRecordV2(
  principal: BuildPrincipalV1,
  request: CreateProjectRequestV2,
  projectId = `project:${randomUUID()}`,
): ProjectV2 {
  return {
    schemaVersion: PROJECT_CONTRACT_VERSION_V2,
    projectId,
    name: request.name ?? DEFAULT_PROJECT_NAME_V2,
    owner: projectOwnerFromPrincipalV2(
      projectPrincipalFromBuildV1(principal),
      projectId,
    ),
    workerSpriteId: null,
  }
}

export class MemoryProjectRepositoryV2 implements ProjectRepositoryV2 {
  private readonly projects = new Map<string, ProjectV2>()

  async listProjects(principal: BuildPrincipalV1): Promise<ProjectV2[]> {
    const viewer = projectPrincipalFromBuildV1(principal)
    return [...this.projects.values()]
      .filter((project) => principalOwnsProjectV2(viewer, project.owner))
      .map((project) => structuredClone(project))
  }

  async openProject(
    principal: BuildPrincipalV1,
    projectId: string,
  ): Promise<ProjectV2 | null> {
    const project = this.projects.get(projectId)
    if (!project) return null
    if (!principalOwnsProjectV2(projectPrincipalFromBuildV1(principal), project.owner)) {
      return null
    }
    return structuredClone(project)
  }

  async createProject(
    principal: BuildPrincipalV1,
    request: CreateProjectRequestV2,
  ): Promise<ProjectV2> {
    const parsed = parseCreateProjectRequestV2(request)
    if (!parsed.success) throw new Error(parsed.error)
    const project = createProjectRecordV2(principal, parsed.request)
    this.projects.set(project.projectId, project)
    return structuredClone(project)
  }

  seed(project: ProjectV2): void {
    this.projects.set(project.projectId, structuredClone(project))
  }

  async bindProjectWorker(
    principal: BuildPrincipalV1,
    projectId: string,
    workerSpriteId: string,
  ): Promise<ProjectV2> {
    const project = this.projects.get(projectId)
    if (!project) throw new Error("project_not_found")
    const occupiedBy = this.ownerOfWorker(workerSpriteId)
    const decision = authorizeBindProjectWorkerV2({
      principal: projectPrincipalFromBuildV1(principal),
      project,
      workerSpriteId,
      occupiedBy,
    })
    if (!decision.success) throw new Error(decision.error)
    const next: ProjectV2 = {
      ...project,
      workerSpriteId: decision.workerSpriteId,
    }
    this.projects.set(projectId, next)
    return structuredClone(next)
  }

  private ownerOfWorker(workerSpriteId: string): ProjectOwnerV2 | null {
    for (const project of this.projects.values()) {
      if (project.workerSpriteId === workerSpriteId) return project.owner
    }
    return null
  }
}

type ProjectRow = {
  id: string
  tenant_id: string
  owner_user_id: string
  name: string
  worker_sprite_id: string | null
}

export class PostgresProjectRepositoryV2 implements ProjectRepositoryV2 {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async listProjects(principal: BuildPrincipalV1): Promise<ProjectV2[]> {
    const result = await this.pool.query<ProjectRow>(
      `select id, tenant_id, owner_user_id, name, worker_sprite_id
         from public.site_projects
        where tenant_id = $1 and owner_user_id = $2::uuid
        order by created_at desc, id desc`,
      [principal.tenantId, principal.userId],
    )
    return result.rows.map((row) => projectFromRowV2(row))
  }

  async openProject(
    principal: BuildPrincipalV1,
    projectId: string,
  ): Promise<ProjectV2 | null> {
    const result = await this.pool.query<ProjectRow>(
      `select id, tenant_id, owner_user_id, name, worker_sprite_id
         from public.site_projects
        where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
      [projectId, principal.tenantId, principal.userId],
    )
    const row = result.rows[0]
    return row ? projectFromRowV2(row) : null
  }

  async createProject(
    principal: BuildPrincipalV1,
    request: CreateProjectRequestV2,
  ): Promise<ProjectV2> {
    const parsed = parseCreateProjectRequestV2(request)
    if (!parsed.success) throw new Error(parsed.error)
    const project = createProjectRecordV2(principal, parsed.request)
    const revisionId = `revision:initial:${randomUUID()}`
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      await insertOwnedProject(client, principal, project, revisionId)
      await client.query("commit")
      return project
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }

  async bindProjectWorker(
    principal: BuildPrincipalV1,
    projectId: string,
    workerSpriteId: string,
  ): Promise<ProjectV2> {
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const current = await client.query<ProjectRow>(
        `select id, tenant_id, owner_user_id, name, worker_sprite_id
           from public.site_projects
          where id = $1
          for update`,
        [projectId],
      )
      const row = current.rows[0]
      if (!row) throw new Error("project_not_found")
      const project = projectFromRowV2(row)
      const occupied = await client.query<ProjectRow>(
        `select id, tenant_id, owner_user_id, name, worker_sprite_id
           from public.site_projects
          where worker_sprite_id = $1
          for update`,
        [workerSpriteId],
      )
      const occupiedBy = occupied.rows[0]
        ? projectFromRowV2(occupied.rows[0]).owner
        : null
      const decision = authorizeBindProjectWorkerV2({
        principal: projectPrincipalFromBuildV1(principal),
        project,
        workerSpriteId,
        occupiedBy,
      })
      if (!decision.success) throw new Error(decision.error)
      const updated = await client.query<ProjectRow>(
        `update public.site_projects
            set worker_sprite_id = $1, updated_at = now()
          where id = $2 and tenant_id = $3 and owner_user_id = $4::uuid
          returning id, tenant_id, owner_user_id, name, worker_sprite_id`,
        [decision.workerSpriteId, projectId, principal.tenantId, principal.userId],
      )
      if (updated.rowCount !== 1) throw new Error("project_ownership_conflict")
      await client.query("commit")
      return projectFromRowV2(updated.rows[0])
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }
}

async function insertOwnedProject(
  client: PoolClient,
  principal: BuildPrincipalV1,
  project: ProjectV2,
  revisionId: string,
): Promise<void> {
  await client.query(
    `insert into public.site_projects
       (id, tenant_id, owner_user_id, name, worker_sprite_id)
     values ($1, $2, $3::uuid, $4, null)`,
    [project.projectId, principal.tenantId, principal.userId, project.name],
  )
  await client.query(
    `insert into public.workspace_revisions
       (id, tenant_id, project_id, owner_user_id, manifest, verification_receipts)
     values ($1, $2, $3, $4::uuid, '{}'::jsonb, '[]'::jsonb)`,
    [revisionId, principal.tenantId, project.projectId, principal.userId],
  )
  await client.query(
    `update public.site_projects
        set active_revision_id = $1, updated_at = now()
      where id = $2 and tenant_id = $3 and owner_user_id = $4::uuid`,
    [revisionId, project.projectId, principal.tenantId, principal.userId],
  )
}
