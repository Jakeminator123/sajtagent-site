import {
  AgentEventV1Schema,
  type AgentToolCapabilityV1,
  type AgentEventV1,
} from "../../contracts/agent-session-v1.ts"

type QuestionEventV1 = Extract<AgentEventV1, { type: "question.requested" }>
type PreviewEventV1 = Extract<AgentEventV1, { type: "preview.ready" }>

export type AgentProjectionStatusV1 =
  | "idle"
  | "active"
  | "awaiting_user"
  | "failed"
  | "invalid"

export interface AgentMessageProjectionV1 {
  messageId: string
  turnId: string
  content: string
  createdAt: number
  firstSequence: number
  lastSequence: number
}

export interface AgentToolProjectionV1 {
  toolCallId: string
  turnId: string
  safeLabel: string
  capability: AgentToolCapabilityV1
  status: "running" | "passed" | "failed" | "cancelled"
}

export type AgentQuestionProjectionV1 = QuestionEventV1["payload"] & {
  turnId: string
}

export type AgentPreviewProjectionV1 = PreviewEventV1["payload"]["result"]

export interface AgentTurnProjectionV1 {
  turnId: string
  acceptedSequence: number
  messageIds: readonly string[]
  toolCallIds: readonly string[]
  questionId: string | null
  buildJobId: string | null
  buildToolCallId: string | null
  previewResult: AgentPreviewProjectionV1 | null
  terminal:
    | { kind: "completed"; outcome: "answered" | "awaiting_user" | "built" | "no_change" }
    | { kind: "failed"; code: string; message: string; retryable: boolean }
    | null
}

export interface AgentEventProjectionV1 {
  sessionId: string | null
  lastSequence: number
  sequenceFingerprints: Readonly<Record<string, string>>
  eventSequences: Readonly<Record<string, number>>
  status: AgentProjectionStatusV1
  statusLabel: string
  activeTurnId: string | null
  turns: Readonly<Record<string, AgentTurnProjectionV1>>
  turnOrder: readonly string[]
  messages: Readonly<Record<string, AgentMessageProjectionV1>>
  messageOrder: readonly string[]
  tools: Readonly<Record<string, AgentToolProjectionV1>>
  pendingQuestion: AgentQuestionProjectionV1 | null
  canonicalPreviewCandidate: AgentPreviewProjectionV1 | null
  error: string | null
}

export function createAgentEventProjectionV1(
  sessionId: string | null = null,
): AgentEventProjectionV1 {
  return {
    sessionId,
    lastSequence: 0,
    sequenceFingerprints: {},
    eventSequences: {},
    status: "idle",
    statusLabel: sessionId ? "Redo" : "Öppnar Sajtagent…",
    activeTurnId: null,
    turns: {},
    turnOrder: [],
    messages: {},
    messageOrder: [],
    tools: {},
    pendingQuestion: null,
    canonicalPreviewCandidate: null,
    error: null,
  }
}

function eventFingerprint(event: AgentEventV1): string {
  return JSON.stringify(event)
}

function failClosed(
  state: AgentEventProjectionV1,
  message: string,
): AgentEventProjectionV1 {
  if (state.status === "invalid") return state
  return {
    ...state,
    status: "invalid",
    statusLabel: "Agentströmmen stoppades felsäkert.",
    pendingQuestion: null,
    canonicalPreviewCandidate: null,
    error: message,
  }
}

function withEventIdentity(
  state: AgentEventProjectionV1,
  event: AgentEventV1,
  fingerprint: string,
): AgentEventProjectionV1 {
  return {
    ...state,
    sessionId: state.sessionId ?? event.sessionId,
    lastSequence: event.sequence,
    sequenceFingerprints: {
      ...state.sequenceFingerprints,
      [String(event.sequence)]: fingerprint,
    },
    eventSequences: {
      ...state.eventSequences,
      [event.eventId]: event.sequence,
    },
  }
}

function updateTurn(
  state: AgentEventProjectionV1,
  turn: AgentTurnProjectionV1,
): AgentEventProjectionV1 {
  return {
    ...state,
    turns: { ...state.turns, [turn.turnId]: turn },
  }
}

function statusLabelFor(
  state: Extract<AgentEventV1, { type: "agent.status" }>["payload"]["state"],
): string {
  if (state === "thinking") return "Sajtagent tänker…"
  if (state === "using_tool") return "Sajtagent använder ett godkänt verktyg…"
  if (state === "checking") return "Sajtagent kontrollerar resultatet…"
  if (state === "waiting_for_user") return "Sajtagent väntar på ditt svar."
  return "Redo"
}

function completedTurnError(
  state: AgentEventProjectionV1,
  turn: AgentTurnProjectionV1,
  outcome: "answered" | "awaiting_user" | "built" | "no_change",
): string | null {
  const hasOpenTool = turn.toolCallIds.some(
    (toolCallId) => state.tools[toolCallId]?.status === "running",
  )
  if (hasOpenTool) return "En avslutad agentturn lämnade ett verktyg öppet."

  const hasMessage = turn.messageIds.length > 0
  const hasQuestion = turn.questionId !== null
  const hasBuild = turn.buildJobId !== null
  const hasPreview = turn.previewResult !== null
  const hasBuildRequest = turn.toolCallIds.some(
    (toolCallId) => state.tools[toolCallId]?.capability === "build.request",
  )

  if (
    outcome === "answered" &&
    (!hasMessage || hasQuestion || hasBuildRequest || hasBuild)
  ) {
    return "Utfallet answered saknade svar eller innehöll otillåten fråga/build."
  }
  if (
    outcome === "awaiting_user" &&
    (!hasQuestion || hasBuildRequest || hasBuild)
  ) {
    return "Utfallet awaiting_user kräver en strukturerad fråga utan build."
  }
  if (outcome === "built" && (hasQuestion || !hasBuild || !hasPreview)) {
    return "Utfallet built kräver en verifierad preview och får inte innehålla en fråga."
  }
  if (
    outcome === "no_change" &&
    (hasQuestion || hasBuildRequest || hasBuild || hasPreview)
  ) {
    return "Utfallet no_change får inte innehålla fråga, build eller preview."
  }
  return null
}

export function reduceAgentEventV1(
  state: AgentEventProjectionV1,
  input: unknown,
): AgentEventProjectionV1 {
  if (state.status === "invalid") return state

  const parsed = AgentEventV1Schema.safeParse(input)
  if (!parsed.success) {
    return failClosed(state, "Agent-eventet matchade inte AgentEventV1-kontraktet.")
  }
  const event = parsed.data
  const fingerprint = eventFingerprint(event)
  const seenFingerprint = state.sequenceFingerprints[String(event.sequence)]
  if (seenFingerprint) {
    return seenFingerprint === fingerprint
      ? state
      : failClosed(
          state,
          "Ett redan mottaget agentsekvensnummer hade ett annat innehåll.",
        )
  }

  if (state.sessionId && event.sessionId !== state.sessionId) {
    return failClosed(state, "Agentströmmen blandade händelser från olika sessioner.")
  }
  if (state.eventSequences[event.eventId] !== undefined) {
    return failClosed(state, "Agentströmmen återanvände ett eventId.")
  }
  const expectedSequence = state.lastSequence + 1
  if (event.sequence !== expectedSequence) {
    return failClosed(
      state,
      `Agentströmmen hade ett sekvensgap: väntade ${expectedSequence}, fick ${event.sequence}.`,
    )
  }

  let next = withEventIdentity(state, event, fingerprint)

  if (event.type === "turn.accepted") {
    const activeTurn = state.activeTurnId ? state.turns[state.activeTurnId] : null
    if (activeTurn && !activeTurn.terminal) {
      return failClosed(next, "En ny agentturn började innan föregående turn avslutades.")
    }
    if (state.turns[event.turnId]) {
      return failClosed(next, "turn.accepted återanvände ett turnId.")
    }
    const turn: AgentTurnProjectionV1 = {
      turnId: event.turnId,
      acceptedSequence: event.sequence,
      messageIds: [],
      toolCallIds: [],
      questionId: null,
      buildJobId: null,
      buildToolCallId: null,
      previewResult: null,
      terminal: null,
    }
    return {
      ...updateTurn(next, turn),
      status: "active",
      statusLabel: "Sajtagent tog emot meddelandet.",
      activeTurnId: event.turnId,
      turnOrder: [...state.turnOrder, event.turnId],
      pendingQuestion: null,
      canonicalPreviewCandidate: null,
      error: null,
    }
  }

  const turn = state.turns[event.turnId]
  if (!turn || state.activeTurnId !== event.turnId) {
    return failClosed(next, "Agent-eventet saknade en aktiv turn.accepted.")
  }
  if (turn.terminal) {
    return failClosed(next, "Agentströmmen fortsatte efter terminal status för en turn.")
  }

  if (event.type === "agent.status") {
    return {
      ...next,
      status: event.payload.state === "waiting_for_user" ? "awaiting_user" : "active",
      statusLabel: event.payload.label ?? statusLabelFor(event.payload.state),
    }
  }

  if (event.type === "message.delta") {
    const existing = state.messages[event.payload.messageId]
    if (existing && existing.turnId !== event.turnId) {
      return failClosed(next, "Ett messageId återanvändes i en annan turn.")
    }
    const message: AgentMessageProjectionV1 = existing
      ? {
          ...existing,
          content: existing.content + event.payload.delta,
          lastSequence: event.sequence,
        }
      : {
          messageId: event.payload.messageId,
          turnId: event.turnId,
          content: event.payload.delta,
          createdAt: Date.parse(event.occurredAt),
          firstSequence: event.sequence,
          lastSequence: event.sequence,
        }
    const updatedTurn = existing
      ? turn
      : { ...turn, messageIds: [...turn.messageIds, event.payload.messageId] }
    next = updateTurn(next, updatedTurn)
    return {
      ...next,
      status: "active",
      statusLabel: "Sajtagent svarar…",
      messages: { ...state.messages, [message.messageId]: message },
      messageOrder: existing
        ? state.messageOrder
        : [...state.messageOrder, message.messageId],
    }
  }

  if (event.type === "question.requested") {
    if (turn.questionId) {
      return failClosed(next, "V1 tillåter högst en strukturerad fråga per turn.")
    }
    const question: AgentQuestionProjectionV1 = {
      ...event.payload,
      turnId: event.turnId,
    }
    next = updateTurn(next, { ...turn, questionId: event.payload.questionId })
    return {
      ...next,
      status: "awaiting_user",
      statusLabel: "Sajtagent behöver ditt svar.",
      pendingQuestion: question,
    }
  }

  if (event.type === "tool.started") {
    if (state.tools[event.payload.toolCallId]) {
      return failClosed(next, "tool.started återanvände ett toolCallId.")
    }
    const tool: AgentToolProjectionV1 = {
      toolCallId: event.payload.toolCallId,
      turnId: event.turnId,
      safeLabel: event.payload.safeLabel,
      capability: event.payload.capability,
      status: "running",
    }
    next = updateTurn(next, {
      ...turn,
      toolCallIds: [...turn.toolCallIds, event.payload.toolCallId],
    })
    return {
      ...next,
      status: "active",
      statusLabel: event.payload.safeLabel,
      tools: { ...state.tools, [tool.toolCallId]: tool },
    }
  }

  if (event.type === "tool.completed") {
    const tool = state.tools[event.payload.toolCallId]
    if (!tool || tool.turnId !== event.turnId || tool.status !== "running") {
      return failClosed(next, "tool.completed saknade ett matchande öppet verktyg.")
    }
    return {
      ...next,
      status: "active",
      statusLabel:
        event.payload.status === "passed"
          ? `${tool.safeLabel} klart.`
          : `${tool.safeLabel} stoppades.`,
      tools: {
        ...state.tools,
        [tool.toolCallId]: { ...tool, status: event.payload.status },
      },
    }
  }

  if (event.type === "build.started") {
    const tool = state.tools[event.payload.toolCallId]
    if (
      turn.buildJobId ||
      !tool ||
      tool.turnId !== event.turnId ||
      tool.capability !== "build.request" ||
      tool.status !== "running"
    ) {
      return failClosed(next, "build.started saknade ett unikt öppet build-verktyg.")
    }
    next = updateTurn(next, {
      ...turn,
      buildJobId: event.payload.jobId,
      buildToolCallId: event.payload.toolCallId,
    })
    return {
      ...next,
      status: "active",
      statusLabel: "Sajtagent bygger…",
    }
  }

  if (event.type === "preview.ready") {
    const buildTool = turn.buildToolCallId
      ? state.tools[turn.buildToolCallId]
      : null
    if (
      turn.previewResult ||
      event.payload.jobId !== turn.buildJobId ||
      !buildTool ||
      buildTool.status !== "passed"
    ) {
      return failClosed(
        next,
        "preview.ready saknade matchande passerad build och canonical referens.",
      )
    }
    next = updateTurn(next, { ...turn, previewResult: event.payload.result })
    return {
      ...next,
      status: "active",
      statusLabel: "Verifierad preview är redo.",
      canonicalPreviewCandidate: event.payload.result,
    }
  }

  if (event.type === "turn.completed") {
    const terminalError = completedTurnError(next, turn, event.payload.outcome)
    if (terminalError) return failClosed(next, terminalError)
    const completedTurn: AgentTurnProjectionV1 = {
      ...turn,
      terminal: { kind: "completed", outcome: event.payload.outcome },
    }
    next = updateTurn(next, completedTurn)
    return {
      ...next,
      status:
        event.payload.outcome === "awaiting_user" ? "awaiting_user" : "idle",
      statusLabel:
        event.payload.outcome === "awaiting_user"
          ? "Sajtagent väntar på ditt svar."
          : event.payload.outcome === "built"
            ? "Bygget är verifierat och klart."
            : "Redo",
      error: null,
    }
  }

  const failedTurn: AgentTurnProjectionV1 = {
    ...turn,
    terminal: {
      kind: "failed",
      code: event.payload.code,
      message: event.payload.message,
      retryable: event.payload.retryable,
    },
  }
  next = updateTurn(next, failedTurn)
  return {
    ...next,
    status: "failed",
    statusLabel: "Sajtagent stoppade turnen.",
    pendingQuestion: null,
    canonicalPreviewCandidate: null,
    error: event.payload.message,
  }
}

export function reduceAgentEventsV1(
  state: AgentEventProjectionV1,
  events: readonly unknown[],
): AgentEventProjectionV1 {
  return events.reduce(reduceAgentEventV1, state)
}

export function rejectAgentEventStreamV1(
  state: AgentEventProjectionV1,
  message: string,
): AgentEventProjectionV1 {
  return failClosed(state, message)
}

export function isActiveAgentTurnTerminalV1(
  state: AgentEventProjectionV1,
): boolean {
  if (!state.activeTurnId) return false
  return Boolean(state.turns[state.activeTurnId]?.terminal)
}
