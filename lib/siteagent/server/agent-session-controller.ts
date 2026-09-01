import { createHash, randomBytes, randomUUID } from "node:crypto"

import { z } from "zod"

import {
  AgentEventV1Schema,
  AgentTurnPolicyV1Schema,
  AgentTurnRequestV1Schema,
  type AgentEventV1,
  type AgentSessionV1,
  type AgentTurnPolicyV1,
  type AgentTurnRequestV1,
} from "../../../contracts/agent-session-v1.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import type {
  AgentSessionRepositoryV1,
  StoredAgentTurnV1,
} from "./agent-session-repository.ts"
import type { AgentSessionRuntimeClientV1 } from "./agent-session-runtime-client.ts"

const ProjectIdV1Schema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)

const MAX_RUNTIME_EVENTS_V1 = 4_096
const MAX_RUNTIME_EVENT_BYTES_V1 = 32 * 1024
const MAX_RUNTIME_STREAM_BYTES_V1 = 4 * 1024 * 1024

export type AgentTurnPolicyIssuerV1 = (input: {
  session: AgentSessionV1
  request: AgentTurnRequestV1
  issuedAt: string
}) => AgentTurnPolicyV1

export type AgentSessionControllerDependenciesV1 = {
  repository: AgentSessionRepositoryV1
  runtime: AgentSessionRuntimeClientV1 | null
  now?: () => Date
  createId?: () => string
  createSessionSecret?: () => string
  issuePolicy?: AgentTurnPolicyIssuerV1
}

export type OpenAgentSessionResultV1 =
  | { kind: "opened"; session: AgentSessionV1 }
  | { kind: "project_not_found" }

export type StartAgentTurnResultV1 =
  | {
      kind: "created" | "existing"
      events: AgentEventV1[]
    }
  | { kind: "session_not_found" }
  | { kind: "stale_revision" }
  | { kind: "active_turn_conflict" }
  | { kind: "idempotency_conflict" }

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function hashTurnRequest(
  principal: BuildPrincipalV1,
  request: AgentTurnRequestV1,
): string {
  return createHash("sha256")
    .update(canonicalJson({ principal, request }))
    .digest("hex")
}

function createEventId(dependencies: AgentSessionControllerDependenciesV1): string {
  return `event:${(dependencies.createId ?? randomUUID)()}`
}

export function mintDefaultAgentTurnPolicyV1(input: {
  session: AgentSessionV1
  request: AgentTurnRequestV1
  issuedAt: string
}): AgentTurnPolicyV1 {
  if (
    input.request.sessionId !== input.session.sessionId ||
    input.request.uiContext.selectedBaseRevisionId !==
      input.session.activeBaseRevisionId
  ) {
    throw new Error("agent_turn_binding_mismatch")
  }
  return AgentTurnPolicyV1Schema.parse({
    schemaVersion: 1,
    sessionId: input.session.sessionId,
    turnId: input.request.turnId,
    projectId: input.session.projectId,
    baseRevisionId: input.session.activeBaseRevisionId,
    issuedAt: input.issuedAt,
    expiresAt: new Date(Date.parse(input.issuedAt) + 5 * 60_000).toISOString(),
    capabilities: ["conversation.respond"],
    allowedMutationIntents: [],
    maxToolCalls: 0,
    maxModelTokens: 32_000,
    maxCostMicros: 250_000,
  })
}

export async function openAgentSessionV1(
  projectIdInput: unknown,
  principal: BuildPrincipalV1,
  dependencies: AgentSessionControllerDependenciesV1,
): Promise<OpenAgentSessionResultV1> {
  const projectId = ProjectIdV1Schema.parse(projectIdInput)
  const now = (dependencies.now ?? (() => new Date()))().toISOString()
  const secret = (
    dependencies.createSessionSecret ??
    (() => randomBytes(32).toString("base64url"))
  )()
  const record = await dependencies.repository.ensureActiveSession(principal, {
    sessionId: `session:${secret}`,
    projectId,
    now,
  })
  return record
    ? { kind: "opened", session: record.session }
    : { kind: "project_not_found" }
}

function localFailureEvents(
  record: StoredAgentTurnV1,
  acceptedAt: string,
  failedAt: string,
  dependencies: AgentSessionControllerDependenciesV1,
  code: "runtime_unavailable" | "runtime_invalid",
): AgentEventV1[] {
  const message =
    code === "runtime_unavailable"
      ? "Sajtagentens privata runtime är inte ansluten. Inget svar eller bygge simulerades."
      : "Sajtagentens runtime returnerade ett ogiltigt eller ofullständigt eventflöde. Inget resultat accepterades."
  return [
    AgentEventV1Schema.parse({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      eventId: createEventId(dependencies),
      sequence: record.baseSequence + 1,
      occurredAt: acceptedAt,
      type: "turn.accepted",
      payload: { acceptedAt },
    }),
    AgentEventV1Schema.parse({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      eventId: createEventId(dependencies),
      sequence: record.baseSequence + 2,
      occurredAt: failedAt,
      type: "turn.failed",
      payload: { code, message, retryable: true },
    }),
  ]
}

async function persistRuntimeFailure(
  principal: BuildPrincipalV1,
  record: StoredAgentTurnV1,
  dependencies: AgentSessionControllerDependenciesV1,
  code: "runtime_unavailable" | "runtime_invalid",
): Promise<StoredAgentTurnV1> {
  const acceptedAt = (dependencies.now ?? (() => new Date()))().toISOString()
  const failedAt = (dependencies.now ?? (() => new Date()))().toISOString()
  const events = localFailureEvents(
    record,
    acceptedAt,
    failedAt,
    dependencies,
    code,
  )
  return dependencies.repository.appendTerminalEvents(
    principal,
    record.request.sessionId,
    record.request.turnId,
    events,
  )
}

async function collectRuntimeEvents(
  principal: BuildPrincipalV1,
  session: AgentSessionV1,
  record: StoredAgentTurnV1,
  dependencies: AgentSessionControllerDependenciesV1,
): Promise<StoredAgentTurnV1> {
  if (!dependencies.runtime) {
    return persistRuntimeFailure(
      principal,
      record,
      dependencies,
      "runtime_unavailable",
    )
  }

  try {
    const events: AgentEventV1[] = []
    let bytes = 0
    for await (const value of dependencies.runtime.streamTurn({
      session,
      request: record.request,
      policy: record.policy,
      baseSequence: record.baseSequence,
    })) {
      if (events.length >= MAX_RUNTIME_EVENTS_V1) {
        throw new Error("runtime_event_limit_exceeded")
      }
      const event = AgentEventV1Schema.parse(value)
      const eventBytes = Buffer.byteLength(JSON.stringify(event), "utf8")
      if (eventBytes > MAX_RUNTIME_EVENT_BYTES_V1) {
        throw new Error("runtime_event_bytes_exceeded")
      }
      bytes += eventBytes
      if (bytes > MAX_RUNTIME_STREAM_BYTES_V1) {
        throw new Error("runtime_event_bytes_exceeded")
      }
      events.push(event)
    }
    if (events.length === 0) throw new Error("runtime_event_stream_empty")
    return await dependencies.repository.appendTerminalEvents(
      principal,
      record.request.sessionId,
      record.request.turnId,
      events,
    )
  } catch {
    return persistRuntimeFailure(
      principal,
      record,
      dependencies,
      "runtime_invalid",
    )
  }
}

export async function startAgentTurnV1(
  requestInput: unknown,
  principal: BuildPrincipalV1,
  dependencies: AgentSessionControllerDependenciesV1,
): Promise<StartAgentTurnResultV1> {
  const request = AgentTurnRequestV1Schema.parse(requestInput)
  const sessionRecord = await dependencies.repository.getSession(
    principal,
    request.sessionId,
  )
  if (!sessionRecord) return { kind: "session_not_found" }
  if (
    sessionRecord.session.status !== "active" ||
    request.uiContext.selectedBaseRevisionId !==
      sessionRecord.session.activeBaseRevisionId
  ) {
    return { kind: "stale_revision" }
  }

  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString()
  const policy = (dependencies.issuePolicy ?? mintDefaultAgentTurnPolicyV1)({
    session: sessionRecord.session,
    request,
    issuedAt: createdAt,
  })
  const created = await dependencies.repository.reserveTurn(principal, {
    request,
    requestHash: hashTurnRequest(principal, request),
    policy,
    createdAt,
  })
  if (created.kind === "session_not_found") {
    return { kind: "session_not_found" }
  }
  if (created.kind === "stale_revision") return { kind: "stale_revision" }
  if (created.kind === "active_turn_conflict") {
    return { kind: "active_turn_conflict" }
  }
  if (created.kind === "idempotency_conflict") {
    return { kind: "idempotency_conflict" }
  }
  if (created.kind === "existing") {
    return { kind: "existing", events: created.record.events }
  }

  const terminal = await collectRuntimeEvents(
    principal,
    sessionRecord.session,
    created.record,
    dependencies,
  )
  return { kind: "created", events: terminal.events }
}
