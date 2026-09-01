import {
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

export type StoredAgentSessionV1 = {
  session: AgentSessionV1
  lastSequence: number
}

export type StoredAgentTurnStatusV1 = "running" | "completed" | "failed"

export type StoredAgentTurnV1 = {
  request: AgentTurnRequestV1
  requestHash: string
  policy: AgentTurnPolicyV1
  baseSequence: number
  status: StoredAgentTurnStatusV1
  outcome: "answered" | "awaiting_user" | "built" | "no_change" | null
  createdAt: string
  terminalAt: string | null
  events: AgentEventV1[]
}

export type ReserveAgentTurnV1 =
  | { kind: "created"; record: StoredAgentTurnV1 }
  | { kind: "existing"; record: StoredAgentTurnV1 }
  | { kind: "idempotency_conflict"; record: StoredAgentTurnV1 }
  | { kind: "active_turn_conflict" }
  | { kind: "session_not_found" }
  | { kind: "stale_revision" }

export type ReadAgentEventsV1 =
  | {
      kind: "found"
      session: AgentSessionV1
      lastSequence: number
      events: AgentEventV1[]
    }
  | { kind: "session_not_found" }
  | { kind: "invalid_cursor"; lastSequence: number }

export interface AgentSessionRepositoryV1 {
  ensureActiveSession(
    principal: BuildPrincipalV1,
    input: {
      sessionId: string
      projectId: string
      now: string
    },
  ): Promise<StoredAgentSessionV1 | null>
  getSession(
    principal: BuildPrincipalV1,
    sessionId: string,
  ): Promise<StoredAgentSessionV1 | null>
  reserveTurn(
    principal: BuildPrincipalV1,
    input: {
      request: AgentTurnRequestV1
      requestHash: string
      policy: AgentTurnPolicyV1
      createdAt: string
    },
  ): Promise<ReserveAgentTurnV1>
  appendTerminalEvents(
    principal: BuildPrincipalV1,
    sessionId: string,
    turnId: string,
    events: AgentEventV1[],
  ): Promise<StoredAgentTurnV1>
  readEvents(
    principal: BuildPrincipalV1,
    sessionId: string,
    afterSequence: number,
    limit?: number,
  ): Promise<ReadAgentEventsV1>
}

type MemoryProject = {
  principal: BuildPrincipalV1
  projectId: string
  activeRevisionId: string
}

type MemorySession = StoredAgentSessionV1 & {
  principal: BuildPrincipalV1
}

type MemoryTurn = StoredAgentTurnV1 & {
  principal: BuildPrincipalV1
}

function ownerKey(principal: BuildPrincipalV1, value: string): string {
  return `${principal.tenantId}\0${principal.userId}\0${value}`
}

function activeProjectKey(
  principal: BuildPrincipalV1,
  projectId: string,
): string {
  return ownerKey(principal, projectId)
}

function idempotencyKey(sessionId: string, key: string): string {
  return `${sessionId}\0${key}`
}

function terminalState(events: AgentEventV1[]): {
  status: StoredAgentTurnStatusV1
  outcome: StoredAgentTurnV1["outcome"]
  terminalAt: string | null
} {
  const terminal = events.at(-1)
  if (terminal?.type === "turn.completed") {
    return {
      status: "completed",
      outcome: terminal.payload.outcome,
      terminalAt: terminal.occurredAt,
    }
  }
  if (terminal?.type === "turn.failed") {
    return { status: "failed", outcome: null, terminalAt: terminal.occurredAt }
  }
  return { status: "running", outcome: null, terminalAt: null }
}

/** Focused in-memory implementation used by the deterministic server verifier. */
export class MemoryAgentSessionRepositoryV1
  implements AgentSessionRepositoryV1
{
  private readonly projects = new Map<string, MemoryProject>()
  private readonly sessions = new Map<string, MemorySession>()
  private readonly activeSessionByProject = new Map<string, string>()
  private readonly turns = new Map<string, MemoryTurn>()
  private readonly turnByIdempotency = new Map<string, string>()

  addProject(
    principal: BuildPrincipalV1,
    projectId: string,
    activeRevisionId: string,
  ): void {
    this.projects.set(activeProjectKey(principal, projectId), {
      principal,
      projectId,
      activeRevisionId,
    })
  }

  setProjectRevision(
    principal: BuildPrincipalV1,
    projectId: string,
    activeRevisionId: string,
  ): void {
    this.addProject(principal, projectId, activeRevisionId)
  }

  async ensureActiveSession(
    principal: BuildPrincipalV1,
    input: { sessionId: string; projectId: string; now: string },
  ): Promise<StoredAgentSessionV1 | null> {
    const projectKey = activeProjectKey(principal, input.projectId)
    const project = this.projects.get(projectKey)
    if (!project) return null

    const existingId = this.activeSessionByProject.get(projectKey)
    if (existingId) {
      const existing = this.sessions.get(existingId)
      if (!existing) throw new Error("memory_session_index_corrupt")
      const activeTurn = [...this.turns.values()].some(
        (turn) =>
          turn.request.sessionId === existing.session.sessionId &&
          turn.status === "running",
      )
      if (!activeTurn) {
        existing.session.activeBaseRevisionId = project.activeRevisionId
        existing.session.updatedAt = input.now
      }
      return structuredClone({
        session: existing.session,
        lastSequence: existing.lastSequence,
      })
    }

    const session = AgentSessionV1Schema.parse({
      schemaVersion: 1,
      sessionId: input.sessionId,
      projectId: input.projectId,
      activeBaseRevisionId: project.activeRevisionId,
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    })
    const stored: MemorySession = {
      principal: structuredClone(principal),
      session,
      lastSequence: 0,
    }
    this.sessions.set(session.sessionId, stored)
    this.activeSessionByProject.set(projectKey, session.sessionId)
    return structuredClone({ session, lastSequence: 0 })
  }

  async getSession(
    principal: BuildPrincipalV1,
    sessionId: string,
  ): Promise<StoredAgentSessionV1 | null> {
    const stored = this.sessions.get(sessionId)
    if (
      !stored ||
      stored.principal.userId !== principal.userId ||
      stored.principal.tenantId !== principal.tenantId
    ) {
      return null
    }
    return structuredClone({
      session: stored.session,
      lastSequence: stored.lastSequence,
    })
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
    const sessionStored = this.sessions.get(request.sessionId)
    if (
      !sessionStored ||
      sessionStored.principal.userId !== principal.userId ||
      sessionStored.principal.tenantId !== principal.tenantId
    ) {
      return { kind: "session_not_found" }
    }

    const existingTurnId = this.turnByIdempotency.get(
      idempotencyKey(request.sessionId, request.idempotencyKey),
    )
    if (existingTurnId) {
      const existing = this.turns.get(existingTurnId)
      if (!existing) throw new Error("memory_turn_index_corrupt")
      return existing.requestHash === input.requestHash
        ? { kind: "existing", record: structuredClone(existing) }
        : { kind: "idempotency_conflict", record: structuredClone(existing) }
    }

    const project = this.projects.get(
      activeProjectKey(principal, sessionStored.session.projectId),
    )
    if (
      sessionStored.session.status !== "active" ||
      !project ||
      project.activeRevisionId !== sessionStored.session.activeBaseRevisionId ||
      request.uiContext.selectedBaseRevisionId !==
        sessionStored.session.activeBaseRevisionId
    ) {
      return { kind: "stale_revision" }
    }
    if (
      [...this.turns.values()].some(
        (turn) =>
          turn.request.sessionId === request.sessionId &&
          turn.status === "running",
      )
    ) {
      return { kind: "active_turn_conflict" }
    }

    if (
      policy.sessionId !== sessionStored.session.sessionId ||
      policy.turnId !== request.turnId ||
      policy.projectId !== sessionStored.session.projectId ||
      policy.baseRevisionId !== sessionStored.session.activeBaseRevisionId ||
      Date.parse(input.createdAt) < Date.parse(policy.issuedAt) ||
      Date.parse(input.createdAt) > Date.parse(policy.expiresAt)
    ) {
      throw new Error("agent_turn_policy_binding_mismatch")
    }

    const record: MemoryTurn = {
      principal: structuredClone(principal),
      request,
      requestHash: input.requestHash,
      policy,
      baseSequence: sessionStored.lastSequence,
      status: "running",
      outcome: null,
      createdAt: input.createdAt,
      terminalAt: null,
      events: [],
    }
    this.turns.set(request.turnId, record)
    this.turnByIdempotency.set(
      idempotencyKey(request.sessionId, request.idempotencyKey),
      request.turnId,
    )
    return { kind: "created", record: structuredClone(record) }
  }

  async appendTerminalEvents(
    principal: BuildPrincipalV1,
    sessionId: string,
    turnId: string,
    values: AgentEventV1[],
  ): Promise<StoredAgentTurnV1> {
    const sessionStored = this.sessions.get(sessionId)
    const turn = this.turns.get(turnId)
    if (
      !sessionStored ||
      !turn ||
      sessionStored.principal.userId !== principal.userId ||
      sessionStored.principal.tenantId !== principal.tenantId ||
      turn.principal.userId !== principal.userId ||
      turn.principal.tenantId !== principal.tenantId
    ) {
      throw new Error("agent_turn_not_found")
    }
    if (turn.status !== "running") throw new Error("agent_turn_terminal")

    const batch = validateAgentEventBatchV1(values, {
      afterSequence: sessionStored.lastSequence,
      expectedSessionId: sessionId,
    })
    if (!batch.success) throw new Error(batch.error)
    const complete = [...turn.events, ...batch.events]
    if (
      complete.length === 0 ||
      sessionStored.lastSequence !== turn.baseSequence
    ) {
      throw new Error("agent_turn_base_sequence_changed")
    }
    const validated = validateAgentTurnAgainstPolicyV1(
      sessionStored.session,
      turn.policy,
      complete,
      {
        baseSequence: turn.baseSequence,
        requireTerminal: true,
      },
    )
    if (!validated.success) throw new Error(validated.error)

    turn.events = complete
    const state = terminalState(complete)
    turn.status = state.status
    turn.outcome = state.outcome
    turn.terminalAt = state.terminalAt
    const final = complete.at(-1)!
    sessionStored.lastSequence = final.sequence
    sessionStored.session.updatedAt = final.occurredAt
    return structuredClone(turn)
  }

  async readEvents(
    principal: BuildPrincipalV1,
    sessionId: string,
    afterSequence: number,
    limit = 500,
  ): Promise<ReadAgentEventsV1> {
    const sessionStored = this.sessions.get(sessionId)
    if (
      !sessionStored ||
      sessionStored.principal.userId !== principal.userId ||
      sessionStored.principal.tenantId !== principal.tenantId
    ) {
      return { kind: "session_not_found" }
    }
    if (afterSequence > sessionStored.lastSequence) {
      return { kind: "invalid_cursor", lastSequence: sessionStored.lastSequence }
    }
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
    const events = [...this.turns.values()]
      .filter((turn) => turn.request.sessionId === sessionId)
      .flatMap((turn) => turn.events)
      .sort((left, right) => left.sequence - right.sequence)
      .filter((event) => event.sequence > afterSequence)
      .slice(0, boundedLimit)
    const validated = validateAgentEventBatchV1(events, {
      afterSequence,
      expectedSessionId: sessionId,
    })
    if (!validated.success) throw new Error(validated.error)
    return {
      kind: "found",
      session: structuredClone(sessionStored.session),
      lastSequence: sessionStored.lastSequence,
      events: validated.events,
    }
  }
}
