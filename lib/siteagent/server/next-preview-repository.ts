import type { Pool, PoolClient } from "pg"
import { createHash, randomBytes } from "node:crypto"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import { canFinishJob, type NextAccepted, type NextBinding, type NextJob, type NextState, type SourceFile } from "./next-preview-model.ts"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
type Row = { state: NextState; source_files: SourceFile[]; accepted_source_files: SourceFile[] }

export class PostgresNextPreviewRepository {
  constructor(readonly pool: Pool) {}

  async getState(principal: BuildPrincipalV1, projectId: string): Promise<NextState | null> {
    const result = await this.pool.query<{ state: NextState | null }>(
      `select n.state from public.site_projects p left join public.next_preview_states n on n.project_id=p.id
       where p.id=$1 and p.tenant_id=$2 and p.owner_user_id=$3::uuid`, [projectId, principal.tenantId, principal.userId])
    return result.rows.length ? result.rows[0].state ?? { current: null, accepted: null } : null
  }

  async getAccepted(principal: BuildPrincipalV1, projectId: string): Promise<NextAccepted | null> {
    return (await this.getState(principal, projectId))?.accepted ?? null
  }

  async getAcceptedSource(principal: BuildPrincipalV1, projectId: string): Promise<SourceFile[] | null> {
    const result = await this.pool.query<Row>(`select accepted_source_files from public.next_preview_states where project_id=$1 and tenant_id=$2 and owner_user_id=$3::uuid and state->'accepted' <> 'null'::jsonb`, [projectId, principal.tenantId, principal.userId])
    return result.rows[0]?.accepted_source_files ?? null
  }

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try { await client.query("begin"); const result = await fn(client); await client.query("commit"); return result }
    catch (error) { await client.query("rollback"); throw error }
    finally { client.release() }
  }

  async begin(principal: BuildPrincipalV1, job: NextJob, files: SourceFile[], expectedAcceptedJobId?: string | null): Promise<void> {
    await this.transaction(async client => {
      const project = await client.query(`select id from public.site_projects where id=$1 and tenant_id=$2 and owner_user_id=$3::uuid for update`, [job.projectId, principal.tenantId, principal.userId])
      if (!project.rowCount || job.tenantId !== principal.tenantId) throw new Error("project_not_found")
      const record = await client.query<Row>(`select state from public.next_preview_states where project_id=$1 for update`, [job.projectId])
      const state = record.rows[0]?.state ?? { current: null, accepted: null }
      if (expectedAcceptedJobId !== undefined && (state.accepted?.jobId ?? null) !== expectedAcceptedJobId) throw new Error("stale_source_generation")
      if (state.current?.status === "building" && Date.parse(state.current.expiresAt) > Date.now()) throw new Error("project_busy")
      // Only this server-initiated method may replace current.jobId. Finish never does.
      state.current = job
      await client.query(`insert into public.next_preview_states(project_id,tenant_id,owner_user_id,state,source_files)
        values($1,$2,$3::uuid,$4::jsonb,$5::jsonb) on conflict(project_id) do update set state=excluded.state, source_files=excluded.source_files,updated_at=now()`,
        [job.projectId, principal.tenantId, principal.userId, JSON.stringify(state), JSON.stringify(files)])
    })
  }

  async finish(principal: BuildPrincipalV1, binding: NextBinding, accepted: NextAccepted | null, failureCode = "worker_failed"): Promise<boolean> {
    return this.transaction(async client => {
      const record = await client.query<Row>(`select state,source_files from public.next_preview_states where project_id=$1 and tenant_id=$2 and owner_user_id=$3::uuid for update`, [binding.projectId, principal.tenantId, principal.userId])
      const row = record.rows[0]
      if (!row || !canFinishJob(row.state, binding, Date.now())) return false
      row.state.current = { ...row.state.current!, status: accepted ? "accepted" : "failed", ...(accepted ? {} : { failureCode }) }
      if (accepted) row.state.accepted = accepted
      await client.query(`update public.next_preview_states set state=$2::jsonb,accepted_source_files=case when $3 then source_files else accepted_source_files end,updated_at=now() where project_id=$1`, [binding.projectId, JSON.stringify(row.state), !!accepted])
      return true
    })
  }

  async cancel(principal: BuildPrincipalV1, projectId: string, jobId: string): Promise<boolean> {
    const result = await this.pool.query(`update public.next_preview_states set state=jsonb_set(jsonb_set(state,'{current,status}','"failed"'),'{current,failureCode}','"cancelled"'),updated_at=now()
      where project_id=$1 and tenant_id=$2 and owner_user_id=$3::uuid and state#>>'{current,jobId}'=$4 and state#>>'{current,status}'='building'`, [projectId, principal.tenantId, principal.userId, jobId])
    return result.rowCount === 1
  }

  async issueGrant(principal: BuildPrincipalV1, projectId: string, authSessionId: string, hostname: string): Promise<string> {
    const token = randomBytes(32).toString("base64url")
    const result = await this.pool.query(`insert into public.next_preview_access(token_sha256,kind,project_id,tenant_id,owner_user_id,auth_session_id,hostname,expires_at)
      select $1,'grant',n.project_id,n.tenant_id,n.owner_user_id,s.id,$5,now()+interval '60 seconds'
      from public.next_preview_states n join auth.sessions s on s.id=$4::uuid and s.user_id=n.owner_user_id
      where n.project_id=$2 and n.tenant_id=$3 and n.owner_user_id=$6::uuid and n.state->'accepted' <> 'null'::jsonb and (s.not_after is null or s.not_after>now())`,
      [hash(token),projectId,principal.tenantId,authSessionId,hostname,principal.userId])
    if (result.rowCount !== 1) throw new Error("preview_access_denied")
    return token
  }

  async exchangeGrant(grant: string, hostname: string): Promise<{ token: string; accepted: NextAccepted } | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(grant)) return null
    return this.transaction(async client => {
      const deleted = await client.query<{project_id:string;tenant_id:string;owner_user_id:string;auth_session_id:string}>(`delete from public.next_preview_access a using auth.sessions s where a.token_sha256=$1 and a.hostname=$2 and a.kind='grant' and a.expires_at>now() and s.id=a.auth_session_id and s.user_id=a.owner_user_id and (s.not_after is null or s.not_after>now()) returning a.project_id,a.tenant_id,a.owner_user_id,a.auth_session_id`, [hash(grant),hostname])
      const row = deleted.rows[0]
      if (!row) return null
      const state = await client.query<Row>(`select state from public.next_preview_states where project_id=$1 and tenant_id=$2 and owner_user_id=$3::uuid`, [row.project_id,row.tenant_id,row.owner_user_id])
      const accepted = state.rows[0]?.state.accepted
      if (!accepted) return null
      const token = randomBytes(32).toString("base64url")
      await client.query(`insert into public.next_preview_access(token_sha256,kind,project_id,tenant_id,owner_user_id,auth_session_id,hostname,expires_at) values($1,'session',$2,$3,$4::uuid,$5::uuid,$6,now()+interval '15 minutes')`, [hash(token),row.project_id,row.tenant_id,row.owner_user_id,row.auth_session_id,hostname])
      return { token, accepted }
    })
  }

  async authorizeGateway(token: string, hostname: string, previewRef: string): Promise<NextAccepted | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    const result = await this.pool.query<Row>(`select n.state from public.next_preview_access a
      join auth.sessions s on s.id=a.auth_session_id and s.user_id=a.owner_user_id
      join public.next_preview_states n on n.project_id=a.project_id and n.tenant_id=a.tenant_id and n.owner_user_id=a.owner_user_id
      where a.token_sha256=$1 and a.hostname=$2 and a.kind='session' and a.expires_at>now()
      and (s.not_after is null or s.not_after>now()) and n.state#>>'{accepted,previewRef}'=$3`, [hash(token),hostname,previewRef])
    return result.rows[0]?.state.accepted ?? null
  }
}
