// Browser-safe Site adapter. Chat opens a Site-owned AgentSession and sends
// AgentTurnRequestV1 to Site routes. It never creates BuildJobV1 or contacts
// OpenClaw, Sprite, model tools, or persistence directly.

import { z } from "zod"

import {
  AgentEventV1Schema,
  AgentSessionV1Schema,
  AgentTurnRequestV1Schema,
  type AgentEventV1,
  type AgentSessionV1,
  type AgentTurnRequestV1,
} from "../../contracts/agent-session-v1.ts"

const DefaultProjectResponseV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().min(1),
    activeRevisionId: z.string().min(1),
  })
  .strict()
const SessionIdV1Schema = z
  .string()
  .min(40)
  .max(136)
  .regex(/^session:[A-Za-z0-9_-]{32,128}$/)

export type DefaultProjectV1 = z.infer<typeof DefaultProjectResponseV1Schema>
export type SiteagentFetchV1 = typeof fetch

export type OpenDefaultProjectResultV1 =
  | { ok: true; project: DefaultProjectV1 }
  | { ok: false; error: string }

export interface AgentEventStreamResultV1 {
  eventCount: number
  lastSequence: number | null
}

const MAX_SSE_EVENT_BYTES_V1 = 1_048_576

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function apiMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback
  const error = (payload as { error?: unknown }).error
  if (!error || typeof error !== "object") return fallback
  const message = (error as { message?: unknown }).message
  return typeof message === "string" && message.trim() ? message : fallback
}

export async function openDefaultProject(
  signal?: AbortSignal,
  fetchImpl: SiteagentFetchV1 = fetch,
): Promise<OpenDefaultProjectResultV1> {
  const response = await fetchImpl("/api/siteagent/projects/default", {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  })
  const payload = await responsePayload(response)
  const project = DefaultProjectResponseV1Schema.safeParse(payload)
  if (!response.ok || !project.success) {
    return { ok: false, error: apiMessage(payload, "Projektet kunde inte öppnas.") }
  }
  return { ok: true, project: project.data }
}

export async function openAgentSessionV1(
  projectId: string,
  signal?: AbortSignal,
  fetchImpl: SiteagentFetchV1 = fetch,
): Promise<AgentSessionV1> {
  const response = await fetchImpl(
    `/api/siteagent/projects/${encodeURIComponent(projectId)}/sessions`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    },
  )
  const payload = await responsePayload(response)
  const session = AgentSessionV1Schema.safeParse(payload)
  if (
    !response.ok ||
    !session.success ||
    session.data.projectId !== projectId ||
    session.data.status !== "active"
  ) {
    throw new Error(apiMessage(payload, "Sajtagent-sessionen kunde inte öppnas."))
  }
  return session.data
}

function parseSseBlock(block: string): string | null {
  const dataLines: string[] = []
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue
    if (line === "data") {
      dataLines.push("")
      continue
    }
    if (line.startsWith("data:")) {
      const value = line.slice(5)
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value)
    }
  }
  return dataLines.length > 0 ? dataLines.join("\n") : null
}

export async function consumeAgentEventStreamV1(
  response: Response,
  onEvent: (event: AgentEventV1) => void | Promise<void>,
): Promise<AgentEventStreamResultV1> {
  if (!response.ok) {
    const payload = await responsePayload(response)
    throw new Error(apiMessage(payload, "Sajtagent avvisade agentturnen."))
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.startsWith("text/event-stream")) {
    throw new Error("Sajtagent returnerade inte en verifierbar eventström.")
  }
  if (!response.body) {
    throw new Error("Sajtagents eventström saknade body.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventCount = 0
  let lastSequence: number | null = null

  const consumeBlock = async (block: string) => {
    const data = parseSseBlock(block)
    if (data === null) return
    if (data.length > MAX_SSE_EVENT_BYTES_V1) {
      throw new Error("Sajtagents eventström överskred V1-gränsen.")
    }
    let value: unknown
    try {
      value = JSON.parse(data)
    } catch {
      throw new Error("Sajtagents eventström innehöll ogiltig JSON.")
    }
    const parsed = AgentEventV1Schema.safeParse(value)
    if (!parsed.success) {
      throw new Error("Sajtagents eventström innehöll ett ogiltigt AgentEventV1.")
    }
    await onEvent(parsed.data)
    eventCount += 1
    lastSequence = parsed.data.sequence
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      buffer = buffer.replaceAll("\r\n", "\n")
      if (buffer.length > MAX_SSE_EVENT_BYTES_V1 && !buffer.includes("\n\n")) {
        throw new Error("Sajtagents eventström överskred V1-gränsen.")
      }

      let boundary = buffer.indexOf("\n\n")
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        await consumeBlock(block)
        boundary = buffer.indexOf("\n\n")
      }

      if (done) break
    }

    const trailing = buffer.trim()
    if (trailing) await consumeBlock(trailing)
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return { eventCount, lastSequence }
}

export async function sendAgentTurnV1(
  requestValue: AgentTurnRequestV1,
  onEvent: (event: AgentEventV1) => void | Promise<void>,
  options: {
    signal?: AbortSignal
    fetchImpl?: SiteagentFetchV1
  } = {},
): Promise<AgentEventStreamResultV1> {
  const request = AgentTurnRequestV1Schema.parse(requestValue)
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(
    `/api/siteagent/sessions/${encodeURIComponent(request.sessionId)}/turns`,
    {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      cache: "no-store",
      signal: options.signal,
    },
  )
  return consumeAgentEventStreamV1(response, onEvent)
}

export async function resumeAgentEventsV1(
  sessionId: AgentSessionV1["sessionId"],
  afterSequence: number,
  onEvent: (event: AgentEventV1) => void | Promise<void>,
  options: {
    signal?: AbortSignal
    fetchImpl?: SiteagentFetchV1
  } = {},
): Promise<AgentEventStreamResultV1> {
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    throw new Error("afterSequence måste vara ett icke-negativt heltal.")
  }
  const session = SessionIdV1Schema.parse(sessionId)
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(
    `/api/siteagent/sessions/${encodeURIComponent(session)}/events?afterSequence=${afterSequence}`,
    {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: options.signal,
    },
  )
  return consumeAgentEventStreamV1(response, onEvent)
}

export async function promptAssist(): Promise<string> {
  throw new Error("Prompt-assist är inte ansluten till produktcontrollern ännu.")
}

export async function publish(): Promise<{ ok: boolean; url?: string }> {
  return { ok: false }
}

export async function downloadZip(versionId: string): Promise<void> {
  if (!versionId.trim()) throw new Error("Versionen saknar ett giltigt ID.")
  const response = await fetch(
    `/api/siteagent/versions/${encodeURIComponent(versionId)}/download`,
    { cache: "no-store" },
  )
  if (!response.ok) {
    const payload = await responsePayload(response)
    throw new Error(apiMessage(payload, "ZIP-exporten kunde inte hämtas."))
  }
  if (response.headers.get("content-type")?.toLowerCase() !== "application/zip") {
    throw new Error("ZIP-exporten returnerade ett oväntat format.")
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = "siteagent-version.zip"
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
