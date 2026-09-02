import { createHmac, randomUUID } from "node:crypto"

import { z } from "zod"

import {
  AgentEventV1Schema,
  validateAgentTurnAgainstPolicyV1,
  type AgentEventV1,
  type AgentSessionV1,
  type AgentTurnPolicyV1,
  type AgentTurnRequestV1,
} from "../../../contracts/agent-session-v1.ts"
import { runtimeSignaturePayloadV1 } from "./runtime-protocol-v1.ts"

const AGENT_TURN_PATH_V1 = "/v1/agent-turns"
const HEALTH_PATH = "/health"
const MAX_HEALTH_BYTES_V1 = 64 * 1024
const MAX_AGENT_TURN_BODY_BYTES_V1 = 512 * 1024
const MAX_AGENT_TURN_EVENTS_V1 = 4_096
const MAX_AGENT_EVENT_SSE_BYTES_V1 = 32 * 1024
const MAX_AGENT_TURN_SSE_BYTES_V1 = 4 * 1024 * 1024
const MAX_AGENT_TURN_DURATION_MS_V1 = 15 * 60_000

export const ReadyAgentTurnRuntimeHealthV1Schema = z
  .object({
    agentSessionContractVersion: z.literal(1),
    agentTurnStreamTransport: z.literal("sse"),
    agentTurnStreamEnabled: z.literal(true),
    agentTurnCapabilities: z.union([
      z.tuple([z.literal("conversation.respond")]),
      z.tuple([
        z.literal("conversation.respond"),
        z.literal("build.request"),
      ]),
    ]),
    artifactReadEnabled: z.boolean(),
  })
  .passthrough()

export type RuntimeAgentTurnIngressV1 = {
  schemaVersion: 1
  session: AgentSessionV1
  turn: AgentTurnRequestV1
  policy: AgentTurnPolicyV1
  baseSequence: number
}

export interface AgentSessionRuntimeClientV1 {
  streamTurn(input: {
    session: AgentSessionV1
    request: AgentTurnRequestV1
    policy: AgentTurnPolicyV1
    baseSequence: number
  }): AsyncIterable<unknown>
}

export type AgentSessionRuntimeConfigurationV1 = {
  baseUrl: string
  signingKey: string
}

type FetchV1 = typeof globalThis.fetch

function isAllowedRuntimeUrl(url: URL): boolean {
  if (url.protocol === "https:") return true
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
  )
}

async function readBoundedBytesV1(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) throw new Error("runtime_response_body_missing")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error("runtime_response_too_large")
    }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function parseAgentTurnSseV1(
  bytes: Uint8Array,
  input: RuntimeAgentTurnIngressV1,
): AgentEventV1[] {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("runtime_sse_invalid_utf8")
  }
  const normalized = text.replace(/\r\n/g, "\n")
  if (!normalized.endsWith("\n\n")) {
    throw new Error("runtime_sse_incomplete_frame")
  }
  const frames = normalized.slice(0, -2).split("\n\n")
  if (frames.length < 1 || frames.length > MAX_AGENT_TURN_EVENTS_V1) {
    throw new Error("runtime_sse_event_limit")
  }

  const events = frames.map((frame) => {
    if (Buffer.byteLength(`${frame}\n\n`, "utf8") > MAX_AGENT_EVENT_SSE_BYTES_V1) {
      throw new Error("runtime_sse_frame_too_large")
    }
    const lines = frame.split("\n")
    if (
      lines.length !== 3 ||
      !lines[0]?.startsWith("id: ") ||
      !lines[1]?.startsWith("event: ") ||
      !lines[2]?.startsWith("data: ")
    ) {
      throw new Error("runtime_sse_frame_invalid")
    }
    const id = lines[0].slice(4)
    const eventName = lines[1].slice(7)
    if (!/^[1-9][0-9]*$/.test(id)) {
      throw new Error("runtime_sse_id_invalid")
    }
    let value: unknown
    try {
      value = JSON.parse(lines[2].slice(6)) as unknown
    } catch {
      throw new Error("runtime_sse_data_invalid_json")
    }
    const event = AgentEventV1Schema.parse(value)
    if (String(event.sequence) !== id || event.type !== eventName) {
      throw new Error("runtime_sse_envelope_mismatch")
    }
    return event
  })
  const terminal = validateAgentTurnAgainstPolicyV1(
    input.session,
    input.policy,
    events,
    { baseSequence: input.baseSequence, requireTerminal: true },
  )
  if (terminal.success) return terminal.events

  const handoff = validateAgentTurnAgainstPolicyV1(
    input.session,
    input.policy,
    events,
    { baseSequence: input.baseSequence, requireTerminal: false },
  )
  if (!handoff.success) throw new Error(handoff.error)
  const last = handoff.events.at(-1)
  const tools = handoff.events.filter((event) => event.type === "tool.started")
  const forbidden = handoff.events.some(
    (event) =>
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
    tools.length !== 1 ||
    forbidden ||
    input.policy.allowedMutationIntents.length !== 1
  ) {
    throw new Error(terminal.error)
  }
  return handoff.events
}

export class SignedAgentSessionRuntimeClientV1
  implements AgentSessionRuntimeClientV1
{
  private readonly endpoint: URL
  private readonly healthEndpoint: URL
  private readonly signingKey: string
  private readonly fetchImpl: FetchV1
  private readonly now: () => Date
  private readonly createNonce: () => string

  constructor(
    baseUrl: string,
    signingKey: string,
    options: {
      fetch?: FetchV1
      now?: () => Date
      createNonce?: () => string
    } = {},
  ) {
    const endpoint = new URL(
      AGENT_TURN_PATH_V1,
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    )
    if (!isAllowedRuntimeUrl(endpoint)) {
      throw new Error("Runtime URL must use HTTPS or loopback HTTP")
    }
    if (signingKey.length < 32) {
      throw new Error("Runtime signing key must contain at least 32 characters")
    }
    this.endpoint = endpoint
    this.healthEndpoint = new URL(HEALTH_PATH, endpoint)
    this.signingKey = signingKey
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.createNonce = options.createNonce ?? randomUUID
  }

  private async runTurn(input: RuntimeAgentTurnIngressV1): Promise<AgentEventV1[]> {
    const healthResponse = await this.fetchImpl(this.healthEndpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
    if (!healthResponse.ok) {
      throw new Error(`Runtime health check failed (HTTP ${healthResponse.status})`)
    }
    const healthBytes = await readBoundedBytesV1(
      healthResponse,
      MAX_HEALTH_BYTES_V1,
    )
    let healthValue: unknown
    try {
      healthValue = JSON.parse(new TextDecoder().decode(healthBytes)) as unknown
    } catch {
      throw new Error("Runtime health response is not valid JSON")
    }
    const health = ReadyAgentTurnRuntimeHealthV1Schema.safeParse(healthValue)
    if (!health.success) {
      throw new Error("Runtime is not ready for AgentSession V1")
    }
    if (
      input.policy.capabilities.some(
        (capability) =>
          !new Set<string>(health.data.agentTurnCapabilities).has(capability),
      )
    ) {
      throw new Error("Runtime does not advertise every turn capability")
    }

    const body = JSON.stringify(input)
    if (Buffer.byteLength(body, "utf8") > MAX_AGENT_TURN_BODY_BYTES_V1) {
      throw new Error("Agent turn runtime request exceeds 512 KiB")
    }
    const timestamp = this.now().toISOString()
    const nonce = this.createNonce()
    const signature = createHmac("sha256", this.signingKey)
      .update(
        runtimeSignaturePayloadV1(
          "POST",
          this.endpoint.pathname,
          timestamp,
          nonce,
          body,
        ),
      )
      .digest("hex")
    const remainingMs = Date.parse(input.policy.expiresAt) - this.now().getTime()
    if (remainingMs <= 0) throw new Error("Agent turn policy has expired")
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-siteagent-timestamp": timestamp,
        "x-siteagent-nonce": nonce,
        "x-siteagent-signature": signature,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(
        Math.min(remainingMs, MAX_AGENT_TURN_DURATION_MS_V1),
      ),
    })
    if (!response.ok) {
      throw new Error(`Agent turn runtime failed (HTTP ${response.status})`)
    }
    const contentType = response.headers.get("content-type") ?? ""
    if (!/^text\/event-stream;\s*charset=utf-8$/i.test(contentType)) {
      throw new Error("Agent turn runtime did not return the ratified SSE type")
    }
    const cacheControl = response.headers.get("cache-control") ?? ""
    if (
      !cacheControl
        .toLowerCase()
        .split(",")
        .map((part) => part.trim())
        .includes("no-store")
    ) {
      throw new Error("Agent turn runtime response is not no-store")
    }
    const bytes = await readBoundedBytesV1(
      response,
      MAX_AGENT_TURN_SSE_BYTES_V1,
    )
    return parseAgentTurnSseV1(bytes, input)
  }

  async *streamTurn(input: {
    session: AgentSessionV1
    request: AgentTurnRequestV1
    policy: AgentTurnPolicyV1
    baseSequence: number
  }): AsyncIterable<unknown> {
    const events = await this.runTurn({
      schemaVersion: 1,
      session: input.session,
      turn: input.request,
      policy: input.policy,
      baseSequence: input.baseSequence,
    })
    for (const event of events) yield event
  }
}

export function resolveAgentSessionRuntimeConfigurationV1(
  env: NodeJS.ProcessEnv,
): AgentSessionRuntimeConfigurationV1 | null {
  const baseUrl = env.SITEAGENT_RUNTIME_URL?.trim()
  const signingKey = env.SITEAGENT_RUNTIME_SIGNING_KEY?.trim()
  if (!baseUrl || !signingKey) return null
  return { baseUrl, signingKey }
}
