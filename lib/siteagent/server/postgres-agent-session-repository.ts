import "server-only"

import type { Pool, PoolClient } from "pg"

import {
  AgentEventV1Schema,
  AgentSessionV1Schema,
  AgentTurnPolicyV1Schema,
  AgentTurnRequestV1Schema,
  validateAgentEventBatchV1,
  validateAgentTurnAgainstPolicyV1,
  type AgentEventV1,
  type AgentSessionV1,
  type AgentTurnPolicyV1,
  type AgentTurnRequestV1,
} from "../../../contracts/agent-session-v1.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import {
  acceptedBuildRevisionV1,
  type AgentSessionRepositoryV1,
  type ReserveAgentTurnV1,
  type ReadAgentEventsV1,
  type StoredAgentSessionV1,
  type StoredAgentTurnV1,
} from "./agent-session-repository.ts"
type SessionRow = {
  id: string
  project_id: string
  active_base_revision_id: string
  status: "active" | "closed"
  last_sequence: number
  created_at: Date | string
  updated_at: Date | string
}

type LockedSessionRow = SessionRow & {
  project_active_revision_id: string | null
}

type TurnRow = {
  id: string
  session_id: string
  base_sequence: number
  request_hash: string
  request_payload: unknown
  status: "running" | "completed" | "failed"
  outcome: StoredAgentTurnV1["outcome"]
  created_at: Date | string
  terminal_at: Date | string | null
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toSession(row: SessionRow): AgentSessionV1 {
  return AgentSessionV1Schema.parse({
    schemaVersion: 1,
    sessionId: row.id,
    projectId: row.project_id,
    activeBaseRevisionId: row.active_base_revision_id,
    status: row.status,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  })
}

async function loadTurn(
  client: PoolClient,
  principal: BuildPrincipalV1,
  turnId: string,
): Promise<StoredAgentTurnV1> {
  const turnResult = await client.query<TurnRow>(
    `select id, session_id, base_sequence, request_hash, request_payload,
            status, outcome, created_at, terminal_at
       from public.agent_turns
      where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
    [turnId, principal.tenantId, principal.userId],
  )
  const row = turnResult.rows[0]
  if (!row) throw new Error("agent_turn_not_found")
  const policyResult = await client.query<{ policy: unknown }>(
    `select policy
       from public.agent_turn_policies
      where turn_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
    [turnId, principal.tenantId, principal.userId],
  )
  const policy = policyResult.rows[0]?.policy
  if (!policy) throw new Error("agent_turn_policy_not_found")
  const eventsResult = await client.query<{ event: unknown }>(
    `select event
       from public.agent_events
      where turn_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
      order by sequence asc`,
    [turnId, principal.tenantId, principal.userId],
  )
  return {
    request: AgentTurnRequestV1Schema.parse(row.request_payload),
    requestHash: row.request_hash,
    policy: AgentTurnPolicyV1Schema.parse(policy),
    baseSequence: row.base_sequence,
    status: row.status,
    outcome: row.outcome,
    createdAt: timestamp(row.created_at),
    terminalAt: row.terminal_at ? timestamp(row.terminal_at) : null,
    events: eventsResult.rows.map(({ event }) => AgentEventV1Schema.parse(event)),
  }
}

export class PostgresAgentSessionRepositoryV1
  implements AgentSessionRepositoryV1
{
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async ensureActiveSession(
    principal: BuildPrincipalV1,
    input: { sessionId: string; projectId: string; now: string },
  ): Promise<StoredAgentSessionV1 | null> {
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const project = await client.query<{ active_revision_id: string | null }>(
        `select active_revision_id
           from public.site_projects
          where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
          for update`,
        [input.projectId, principal.tenantId, principal.userId],
      )
      const activeRevisionId = project.rows[0]?.active_revision_id
      if (!activeRevisionId) {
        await client.query("rollback")
        return null
      }

      const existingResult = await client.query<SessionRow>(
        `select id, project_id, active_base_revision_id, status, last_sequence,
                created_at, updated_at
           from public.agent_sessions
          where project_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
            and status = 'active'
          for update`,
        [input.projectId, principal.tenantId, principal.userId],
      )
      let row = existingResult.rows[0]
      if (row) {
        if (row.active_base_revision_id !== activeRevisionId) {
          const running = await client.query(
            `select 1
               from public.agent_turns
              where session_id = $1 and status = 'running'
              limit 1`,
            [row.id],
          )
          if ((running.rowCount ?? 0) === 0) {
            const refreshed = await client.query<SessionRow>(
              `update public.agent_sessions
                  set active_base_revision_id = $1, updated_at = $2
                where id = $3 and tenant_id = $4 and owner_user_id = $5::uuid
                returning id, project_id, active_base_revision_id, status,
                          last_sequence, created_at, updated_at`,
              [
                activeRevisionId,
                input.now,
                row.id,
                principal.tenantId,
                principal.userId,
              ],
            )
            row = refreshed.rows[0]
          }
        }
        if (!row) throw new Error("agent_session_refresh_failed")
        await client.query("commit")
        return { session: toSession(row), lastSequence: row.last_sequence }
      }

      const session = AgentSessionV1Schema.parse({
        schemaVersion: 1,
        sessionId: input.sessionId,
        projectId: input.projectId,
        activeBaseRevisionId: activeRevisionId,
        status: "active",
        createdAt: input.now,
        updatedAt: input.now,
      })
      const inserted = await client.query<SessionRow>(
        `insert into public.agent_sessions (
           id, tenant_id, project_id, owner_user_id, active_base_revision_id,
           status, last_sequence, created_at, updated_at
         ) values ($1, $2, $3, $4::uuid, $5, 'active', 0, $6, $6)
         returning id, project_id, active_base_revision_id, status,
                   last_sequence, created_at, updated_at`,
        [
          session.sessionId,
          principal.tenantId,
          session.projectId,
          principal.userId,
          session.activeBaseRevisionId,
          input.now,
        ],
      )
      row = inserted.rows[0]
      if (!row) throw new Error("agent_session_insert_failed")
      await client.query("commit")
      return { session: toSession(row), lastSequence: row.last_sequence }
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }

  async getSession(
    principal: BuildPrincipalV1,
    sessionId: string,
  ): Promise<StoredAgentSessionV1 | null> {
    const result = await this.pool.query<SessionRow>(
      `select id, project_id, active_base_revision_id, status, last_sequence,
              created_at, updated_at
         from public.agent_sessions
        where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
      [sessionId, principal.tenantId, principal.userId],
    )
    const row = result.rows[0]
    return row
      ? { session: toSession(row), lastSequence: row.last_sequence }
      : null
  }

  async reserveTurn(
    principal: BuildPrincipalV1,
    input: {
      request: AgentTurnRequestV1
      requestHash: string
      policy: AgentTurnPolicyV1
      createdAt: string
    },
  ): Promise<ReserveAgentTurnV1> {
    const request = AgentTurnRequestV1Schema.parse(input.request)
    const policy = AgentTurnPolicyV1Schema.parse(input.policy)
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const sessionResult = await client.query<LockedSessionRow>(
        `select s.id, s.project_id, s.active_base_revision_id, s.status,
                s.last_sequence, s.created_at, s.updated_at,
                p.active_revision_id as project_active_revision_id
           from public.agent_sessions s
           join public.site_projects p
             on p.id = s.project_id and p.tenant_id = s.tenant_id
            and p.owner_user_id = s.owner_user_id
          where s.id = $1 and s.tenant_id = $2 and s.owner_user_id = $3::uuid
          for update of s, p`,
        [request.sessionId, principal.tenantId, principal.userId],
      )
      const sessionRow = sessionResult.rows[0]
      if (!sessionRow) {
        await client.query("rollback")
        return { kind: "session_not_found" }
      }

      const existingResult = await client.query<{
        id: string
        request_hash: string
      }>(
        `select id, request_hash
           from public.agent_turns
          where session_id = $1 and idempotency_key = $2
          for update`,
        [request.sessionId, request.idempotencyKey],
      )
      const existing = existingResult.rows[0]
      if (existing) {
        const record = await loadTurn(client, principal, existing.id)
        await client.query("commit")
        return existing.request_hash === input.requestHash
          ? { kind: "existing", record }
          : { kind: "idempotency_conflict", record }
      }

      if (
        sessionRow.status !== "active" ||
        !sessionRow.project_active_revision_id ||
        sessionRow.project_active_revision_id !==
          sessionRow.active_base_revision_id ||
        request.uiContext.selectedBaseRevisionId !==
          sessionRow.active_base_revision_id
      ) {
        await client.query("rollback")
        return { kind: "stale_revision" }
      }
      const activeTurn = await client.query(
        `select 1
           from public.agent_turns
          where session_id = $1 and status = 'running'
          limit 1`,
        [request.sessionId],
      )
      if ((activeTurn.rowCount ?? 0) > 0) {
        await client.query("rollback")
        return { kind: "active_turn_conflict" }
      }

      const session = toSession(sessionRow)
      if (
        policy.sessionId !== session.sessionId ||
        policy.turnId !== request.turnId ||
        policy.projectId !== session.projectId ||
        policy.baseRevisionId !== session.activeBaseRevisionId ||
        Date.parse(input.createdAt) < Date.parse(policy.issuedAt) ||
        Date.parse(input.createdAt) > Date.parse(policy.expiresAt)
      ) {
        throw new Error("agent_turn_policy_binding_mismatch")
      }

      await client.query(
        `insert into public.agent_turns (
           id, session_id, tenant_id, project_id, owner_user_id,
           base_revision_id, base_sequence, idempotency_key, request_hash,
           request_payload, status, created_at
         ) values (
           $1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10::jsonb, 'running', $11
         )`,
        [
          request.turnId,
          request.sessionId,
          principal.tenantId,
          session.projectId,
          principal.userId,
          policy.baseRevisionId,
          sessionRow.last_sequence,
          request.idempotencyKey,
          input.requestHash,
          JSON.stringify(request),
          input.createdAt,
        ],
      )
      await client.query(
        `insert into public.agent_turn_policies (
           turn_id, session_id, tenant_id, project_id, owner_user_id,
           policy, issued_at, expires_at
         ) values ($1, $2, $3, $4, $5::uuid, $6::jsonb, $7, $8)`,
        [
          request.turnId,
          request.sessionId,
          principal.tenantId,
          session.projectId,
          principal.userId,
          JSON.stringify(policy),
          policy.issuedAt,
          policy.expiresAt,
        ],
      )
      const record = await loadTurn(client, principal, request.turnId)
      await client.query("commit")
      return { kind: "created", record }
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }

  async appendTerminalEvents(
    principal: BuildPrincipalV1,
    sessionId: string,
    turnId: string,
    values: AgentEventV1[],
  ): Promise<StoredAgentTurnV1> {
    const client = await this.pool.connect()
    try {
      await client.query("begin")
      const sessionResult = await client.query<SessionRow>(
        `select id, project_id, active_base_revision_id, status, last_sequence,
                created_at, updated_at
           from public.agent_sessions
          where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
          for update`,
        [sessionId, principal.tenantId, principal.userId],
      )
      const sessionRow = sessionResult.rows[0]
      if (!sessionRow) throw new Error("agent_session_not_found")
      const turnLock = await client.query<{ status: string }>(
        `select status
           from public.agent_turns
          where id = $1 and session_id = $2 and tenant_id = $3
            and owner_user_id = $4::uuid
          for update`,
        [turnId, sessionId, principal.tenantId, principal.userId],
      )
      if (!turnLock.rows[0]) throw new Error("agent_turn_not_found")
      if (turnLock.rows[0].status !== "running") {
        throw new Error("agent_turn_terminal")
      }

      const record = await loadTurn(client, principal, turnId)
      if (sessionRow.last_sequence !== record.baseSequence) {
        throw new Error("agent_turn_base_sequence_changed")
      }
      const batch = validateAgentEventBatchV1(values, {
        afterSequence: sessionRow.last_sequence,
        expectedSessionId: sessionId,
      })
      if (!batch.success) throw new Error(batch.error)
      const complete = [...record.events, ...batch.events]
      const validated = validateAgentTurnAgainstPolicyV1(
        toSession(sessionRow),
        record.policy,
        complete,
        {
          baseSequence: record.baseSequence,
          requireTerminal: true,
        },
      )
      if (!validated.success) throw new Error(validated.error)

      for (const event of batch.events) {
        await client.query(
          `insert into public.agent_events (
             session_id, sequence, event_id, turn_id, tenant_id, project_id,
             owner_user_id, event, occurred_at
           ) values ($1, $2, $3, $4, $5, $6, $7::uuid, $8::jsonb, $9)`,
          [
            event.sessionId,
            event.sequence,
            event.eventId,
            event.turnId,
            principal.tenantId,
            sessionRow.project_id,
            principal.userId,
            JSON.stringify(event),
            event.occurredAt,
          ],
        )
      }
      const terminal = complete.at(-1)
      if (!terminal) throw new Error("agent_turn_empty")
      const status = terminal.type === "turn.completed" ? "completed" : "failed"
      const outcome =
        terminal.type === "turn.completed" ? terminal.payload.outcome : null
      const terminalUpdate = await client.query(
        `update public.agent_turns
            set status = $1, outcome = $2, terminal_at = $3
          where id = $4 and session_id = $5 and tenant_id = $6
            and owner_user_id = $7::uuid and status = 'running'`,
        [
          status,
          outcome,
          terminal.occurredAt,
          turnId,
          sessionId,
          principal.tenantId,
          principal.userId,
        ],
      )
      if ((terminalUpdate.rowCount ?? 0) !== 1) {
        throw new Error("agent_turn_terminal_update_failed")
      }
      const acceptedRevision = acceptedBuildRevisionV1(complete)
      if (acceptedRevision) {
        if (
          acceptedRevision.baseRevisionId !==
          sessionRow.active_base_revision_id
        ) {
          throw new Error("agent_session_accepted_revision_mismatch")
        }
        const advanced = await client.query(
          `update public.agent_sessions s
              set active_base_revision_id = $1, updated_at = $2
            where s.id = $3 and s.tenant_id = $4
              and s.owner_user_id = $5::uuid
              and s.active_base_revision_id = $6
              and exists (
                select 1
                  from public.site_projects p
                 where p.id = s.project_id
                   and p.tenant_id = s.tenant_id
                   and p.owner_user_id = s.owner_user_id
                   and p.active_revision_id = $1
              )`,
          [
            acceptedRevision.workspaceRevisionId,
            terminal.occurredAt,
            sessionId,
            principal.tenantId,
            principal.userId,
            acceptedRevision.baseRevisionId,
          ],
        )
        if ((advanced.rowCount ?? 0) !== 1) {
          throw new Error("agent_session_accepted_revision_mismatch")
        }
      }
      const stored = await loadTurn(client, principal, turnId)
      await client.query("commit")
      return stored
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }

  async readEvents(
    principal: BuildPrincipalV1,
    sessionId: string,
    afterSequence: number,
    limit = 500,
  ): Promise<ReadAgentEventsV1> {
    const sessionResult = await this.pool.query<SessionRow>(
      `select id, project_id, active_base_revision_id, status, last_sequence,
              created_at, updated_at
         from public.agent_sessions
        where id = $1 and tenant_id = $2 and owner_user_id = $3::uuid`,
      [sessionId, principal.tenantId, principal.userId],
    )
    const row = sessionResult.rows[0]
    if (!row) return { kind: "session_not_found" }
    if (afterSequence > row.last_sequence) {
      return { kind: "invalid_cursor", lastSequence: row.last_sequence }
    }
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
    const eventsResult = await this.pool.query<{ event: unknown }>(
      `select event
         from public.agent_events
        where session_id = $1 and tenant_id = $2 and owner_user_id = $3::uuid
          and sequence > $4
        order by sequence asc
        limit $5`,
      [
        sessionId,
        principal.tenantId,
        principal.userId,
        afterSequence,
        boundedLimit,
      ],
    )
    const events = eventsResult.rows.map(({ event }) =>
      AgentEventV1Schema.parse(event),
    )
    const validated = validateAgentEventBatchV1(events, {
      afterSequence,
      expectedSessionId: sessionId,
    })
    if (!validated.success) throw new Error(validated.error)
    return {
      kind: "found",
      session: toSession(row),
      lastSequence: row.last_sequence,
      events: validated.events,
    }
  }
}
