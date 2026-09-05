import { createHash, randomBytes, randomUUID } from "node:crypto"

import { z } from "zod"

import {
  AgentEventV1Schema,
  AgentTurnPolicyV1Schema,
  AgentTurnRequestV1Schema,
  validateAgentTurnAgainstPolicyV1,
  type AgentEventV1,
  type AgentSessionV1,
  type AgentTurnPolicyV1,
  type AgentTurnRequestV1,
} from "../../../contracts/agent-session-v1.ts"
import type { EvidenceReceiptV1 } from "../../../contracts/builder-v1.ts"
import type {
  AgentTurnBuildCoordinatorV1,
  AgentTurnBuildPlanV1,
} from "./agent-turn-build-join.ts"
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
const RAW_REASONING_MARKER_V1 =
  /<\s*\/?\s*(?:analysis|thinking|reasoning|chain[-_ ]of[-_ ]thought)\b|(?:^|\n)\s*(?:analysis|reasoning|chain[- ]of[- ]thought)\s*:/i

const SAFE_AGENT_STATUS_LABEL_V1 = {
  idle: "Redo",
  thinking: "Sajtagent arbetar…",
  waiting_for_user: "Sajtagent behöver ditt svar.",
  using_tool: "Sajtagent använder ett avgränsat verktyg…",
  checking: "Sajtagent kontrollerar resultatet…",
} as const

const SAFE_TOOL_LABEL_V1 = {
  "project.read": "Sajtagent läser projektet…",
  "checks.run": "Sajtagent kontrollerar sidan…",
  "build.request": "Sajtagent förbereder bygget…",
} as const

export type AgentTurnPolicyIssuerV1 = (input: {
  session: AgentSessionV1
  request: AgentTurnRequestV1
  issuedAt: string
  buildPlan: AgentTurnBuildPlanV1 | null
}) => AgentTurnPolicyV1

export type AgentSessionControllerDependenciesV1 = {
  repository: AgentSessionRepositoryV1
  runtime: AgentSessionRuntimeClientV1 | null
  now?: () => Date
  createId?: () => string
  createSessionSecret?: () => string
  issuePolicy?: AgentTurnPolicyIssuerV1
  buildCoordinator?: AgentTurnBuildCoordinatorV1 | null
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

function createMessageId(dependencies: AgentSessionControllerDependenciesV1): string {
  return `message:${(dependencies.createId ?? randomUUID)()}`
}

function sanitizeRuntimeEventV1(event: AgentEventV1): AgentEventV1 {
  if (event.type === "agent.status") {
    return AgentEventV1Schema.parse({
      ...event,
      payload: {
        state: event.payload.state,
        label: SAFE_AGENT_STATUS_LABEL_V1[event.payload.state],
      },
    })
  }
  if (event.type === "tool.started") {
    return AgentEventV1Schema.parse({
      ...event,
      payload: {
        ...event.payload,
        safeLabel: SAFE_TOOL_LABEL_V1[event.payload.capability],
      },
    })
  }
  if (event.type === "turn.failed") {
    return AgentEventV1Schema.parse({
      ...event,
      payload: {
        ...event.payload,
        message: "Sajtagent kunde inte slutföra svaret.",
      },
    })
  }
  if (
    event.type === "message.delta" &&
    (RAW_REASONING_MARKER_V1.test(event.payload.delta) ||
      event.payload.delta.includes("\0"))
  ) {
    throw new Error("runtime_message_contains_private_reasoning")
  }
  return event
}

export function mintDefaultAgentTurnPolicyV1(input: {
  session: AgentSessionV1
  request: AgentTurnRequestV1
  issuedAt: string
  buildPlan?: AgentTurnBuildPlanV1 | null
}): AgentTurnPolicyV1 {
  if (
    input.request.sessionId !== input.session.sessionId ||
    input.request.uiContext.selectedBaseRevisionId !==
      input.session.activeBaseRevisionId
  ) {
    throw new Error("agent_turn_binding_mismatch")
  }
  const buildPlan = input.buildPlan ?? null
  if (
    buildPlan &&
    (buildPlan.request.projectId !== input.session.projectId ||
      buildPlan.request.baseRevisionId !== input.session.activeBaseRevisionId ||
      buildPlan.request.intent.intentType !== buildPlan.intentType ||
      buildPlan.request.intent.message !== input.request.message ||
      buildPlan.request.intent.context.selectedBaseRevisionId !==
        input.request.uiContext.selectedBaseRevisionId)
  ) {
    throw new Error("agent_build_plan_binding_mismatch")
  }
  return AgentTurnPolicyV1Schema.parse({
    schemaVersion: 1,
    sessionId: input.session.sessionId,
    turnId: input.request.turnId,
    projectId: input.session.projectId,
    baseRevisionId: input.session.activeBaseRevisionId,
    issuedAt: input.issuedAt,
    expiresAt: new Date(Date.parse(input.issuedAt) + 5 * 60_000).toISOString(),
    capabilities: buildPlan
      ? ["conversation.respond", "build.request"]
      : ["conversation.respond"],
    allowedMutationIntents: buildPlan ? [buildPlan.intentType] : [],
    maxToolCalls: buildPlan ? 1 : 0,
    maxModelTokens: 32_000,
    maxCostMicros: 250_000,
  })
}

function agentReceipts(receipts: EvidenceReceiptV1[]) {
  const safeLabel = {
    tool: "Verktyg verifierat",
    check: "Kontroll godkänd",
    preview: "Preview verifierad",
    policy: "Policy verifierad",
  } as const
  return receipts.slice(0, 64).map((receipt) => ({
    receiptId: receipt.receiptId,
    category: receipt.category,
    safeLabel: safeLabel[receipt.category],
    status: receipt.status,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
  }))
}

function exactBuildHandoff(
  session: AgentSessionV1,
  record: StoredAgentTurnV1,
  events: AgentEventV1[],
): Extract<AgentEventV1, { type: "tool.started" }> | null {
  const validated = validateAgentTurnAgainstPolicyV1(
    session,
    record.policy,
    events,
    { baseSequence: record.baseSequence, requireTerminal: false },
  )
  if (!validated.success) throw new Error(validated.error)
  const last = validated.events.at(-1)
  const started = validated.events.filter(
    (event) => event.type === "tool.started",
  )
  const forbidden = validated.events.some(
    (event) =>
      event.type === "message.delta" ||
      event.type === "question.requested" ||
      event.type === "tool.completed" ||
      event.type === "build.started" ||
      event.type === "preview.ready" ||
      event.type === "turn.completed" ||
      event.type === "turn.failed",
  )
  if (
    last?.type !== "tool.started" ||
    last.payload.capability !== "build.request" ||
    started.length !== 1 ||
    forbidden
  ) {
    return null
  }
  return last
}

async function completeBuildHandoff(
  principal: BuildPrincipalV1,
  record: StoredAgentTurnV1,
  runtimeEvents: AgentEventV1[],
  tool: Extract<AgentEventV1, { type: "tool.started" }>,
  plan: AgentTurnBuildPlanV1,
  dependencies: AgentSessionControllerDependenciesV1,
): Promise<StoredAgentTurnV1> {
  const coordinator = dependencies.buildCoordinator
  if (
    !coordinator ||
    record.policy.allowedMutationIntents.length !== 1 ||
    record.policy.allowedMutationIntents[0] !== plan.intentType
  ) {
    throw new Error("agent_build_handoff_not_authorized")
  }

  const result = await coordinator.run({ principal, plan })
  const buildRecord = result.record
  const buildResult = buildRecord?.result ?? null
  let sequence = runtimeEvents.at(-1)!.sequence
  const events = [...runtimeEvents]
  const append = (event: unknown) => {
    events.push(
      AgentEventV1Schema.parse({
        ...(event as Record<string, unknown>),
        eventId: createEventId(dependencies),
        sequence: ++sequence,
      }),
    )
  }

  if (buildRecord) {
    append({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      occurredAt: buildRecord.job.createdAt,
      type: "build.started",
      payload: {
        jobId: buildRecord.job.jobId,
        toolCallId: tool.payload.toolCallId,
        intentType: plan.intentType,
      },
    })
  }

  if (buildResult?.status === "succeeded") {
    append({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      occurredAt: buildResult.verifiedAt,
      type: "tool.completed",
      payload: {
        toolCallId: tool.payload.toolCallId,
        status: "passed",
        receipts: agentReceipts(buildResult.receipts),
        artifacts: [],
      },
    })
    append({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      occurredAt: buildResult.verifiedAt,
      type: "preview.ready",
      payload: {
        jobId: buildResult.jobId,
        result: {
          schemaVersion: 1,
          status: "succeeded",
          jobId: buildResult.jobId,
          baseRevisionId: buildResult.baseRevisionId,
          workspaceRevisionId: buildResult.workspaceRevisionId,
          versionId: buildResult.versionId,
          previewRef: buildResult.previewRef,
          sitemapRevision: buildResult.sitemapRevision,
          verifiedAt: buildResult.verifiedAt,
        },
      },
    })
    append({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      occurredAt: buildResult.verifiedAt,
      type: "message.delta",
      payload: {
        messageId: createMessageId(dependencies),
        delta: "Klart — sidan är byggd och verifierad. Previewn är redo.",
      },
    })
    append({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      occurredAt: buildResult.verifiedAt,
      type: "turn.completed",
      payload: { outcome: "built" },
    })
  } else {
    const failedAt =
      buildResult?.failedAt ??
      (dependencies.now ?? (() => new Date()))().toISOString()
    append({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      occurredAt: failedAt,
      type: "tool.completed",
      payload: {
        toolCallId: tool.payload.toolCallId,
        status: buildResult?.code === "cancelled" ? "cancelled" : "failed",
        receipts: agentReceipts(buildResult?.receipts ?? []),
        artifacts: [],
      },
    })
    append({
      schemaVersion: 1,
      sessionId: record.request.sessionId,
      turnId: record.request.turnId,
      occurredAt: failedAt,
      type: "turn.failed",
      payload: {
        code: buildResult?.code ?? "build_join_rejected",
        message: "Bygget kunde inte slutföras. Ingen preview accepterades.",
        retryable: buildResult?.retryable ?? result.httpStatus >= 500,
      },
    })
  }

  return dependencies.repository.appendTerminalEvents(
    principal,
    record.request.sessionId,
    record.request.turnId,
    events,
  )
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
  buildPlan: AgentTurnBuildPlanV1 | null,
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
      const event = sanitizeRuntimeEventV1(AgentEventV1Schema.parse(value))
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
    const last = events.at(-1)
    if (last?.type === "turn.completed" || last?.type === "turn.failed") {
      return await dependencies.repository.appendTerminalEvents(
        principal,
        record.request.sessionId,
        record.request.turnId,
        events,
      )
    }
    const handoff = exactBuildHandoff(session, record, events)
    if (!handoff || !dependencies.buildCoordinator || !buildPlan) {
      throw new Error("runtime_event_stream_incomplete")
    }
    return await completeBuildHandoff(
      principal,
      record,
      events,
      handoff,
      buildPlan,
      dependencies,
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
  const storedSession = await dependencies.repository.getSession(
    principal,
    request.sessionId,
  )
  if (!storedSession) return { kind: "session_not_found" }
  const sessionRecord = await dependencies.repository.ensureActiveSession(
    principal,
    {
      sessionId: storedSession.session.sessionId,
      projectId: storedSession.session.projectId,
      now: (dependencies.now ?? (() => new Date()))().toISOString(),
    },
  )
  if (
    !sessionRecord ||
    sessionRecord.session.sessionId !== request.sessionId
  ) {
    return { kind: "session_not_found" }
  }
  if (
    sessionRecord.session.status !== "active" ||
    request.uiContext.selectedBaseRevisionId !==
      sessionRecord.session.activeBaseRevisionId
  ) {
    return { kind: "stale_revision" }
  }

  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString()
  const buildPlan = dependencies.buildCoordinator
    ? await dependencies.buildCoordinator.plan({
        principal,
        session: sessionRecord.session,
        request,
      })
    : null
  const policy = (dependencies.issuePolicy ?? mintDefaultAgentTurnPolicyV1)({
    session: sessionRecord.session,
    request,
    issuedAt: createdAt,
    buildPlan,
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
    buildPlan,
    dependencies,
  )
  return { kind: "created", events: terminal.events }
}
