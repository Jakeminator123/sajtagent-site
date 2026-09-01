// Browser boundary for Sajtagent. The browser sends product intent only; it
// never calls OpenClaw, Sprite, model tools, or persistence directly.

import { z } from "zod"

import { BuildEventV1Schema, type BuilderIntentV1 } from "../../contracts/builder-v1.ts"
import type { BuildChoices } from "./build-choices"
import type { StreamEvent } from "./types"

const DefaultProjectResponseV1Schema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  activeRevisionId: z.string().min(1),
})

const BuildJobResponseV1Schema = z.object({
  schemaVersion: z.literal(1),
  events: z.array(z.unknown()).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

export interface StreamChatParams {
  chatId: string | null
  message: string
  choices: BuildChoices
  planMode?: boolean
  /** Promptläge från förstasidan. */
  mode?: string
  onEvent: (event: StreamEvent) => void
  signal?: AbortSignal
}

function normalizedMode(mode: string | undefined): BuilderIntentV1["context"]["mode"] {
  if (mode === "analyserad" || mode === "analyzed") return "analyzed"
  if (mode === "audit") return "audit"
  if (mode === "template") return "template"
  if (mode === "fritext" || mode === "freeform") return "freeform"
  return undefined
}

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

export function reduceBuildEventsV1(
  eventsInput: unknown,
  onEvent: (event: StreamEvent) => void,
): { valid: boolean; terminalSeen: boolean } {
  const events = BuildEventV1Schema.array().safeParse(eventsInput)
  if (!events.success) {
    onEvent({ type: "error", message: "Build-events matchade inte det signerade kontraktet." })
    return { valid: false, terminalSeen: false }
  }

  let expectedSequence = 1
  let terminalSeen = false
  let jobId: string | null = null
  for (const event of events.data) {
    jobId ??= event.jobId
    if (event.jobId !== jobId || event.sequence !== expectedSequence) {
      onEvent({ type: "error", message: "Build-eventströmmen hade ett sekvensgap." })
      return { valid: false, terminalSeen: false }
    }
    expectedSequence += 1

    if (event.type === "job.accepted") {
      onEvent({ type: "progress", message: "Byggjobbet accepterades." })
    } else if (event.type === "job.running") {
      onEvent({ type: "progress", message: event.payload.label ?? `Fas: ${event.payload.phase}` })
    } else if (event.type === "message.delta") {
      onEvent({ type: "text", delta: event.payload.delta })
    } else if (event.type === "job.failed") {
      terminalSeen = true
      onEvent({ type: "error", message: event.payload.result.message })
    } else if (event.type === "job.succeeded") {
      terminalSeen = true
      onEvent({
        type: "error",
        message: "Bygget verifierades, men en autentiserad preview-route är ännu inte ansluten.",
      })
    }
  }
  return { valid: true, terminalSeen }
}

/**
 * Opens the authenticated user's starter project and creates one BuildJobV1.
 * A missing runtime, rejected candidate, or missing preview route remains an
 * explicit error; this function never manufactures HTML or a ready version.
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { chatId, message, choices, planMode, mode, onEvent, signal } = params
  try {
    const projectResponse = await fetch("/api/siteagent/projects/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
    })
    const projectPayload = await responsePayload(projectResponse)
    const project = DefaultProjectResponseV1Schema.safeParse(projectPayload)
    if (!projectResponse.ok || !project.success) {
      onEvent({
        type: "error",
        message: apiMessage(projectPayload, "Projektet kunde inte öppnas."),
      })
      return
    }

    const intent: BuilderIntentV1 = {
      schemaVersion: 1,
      intentType: chatId ? "site.change" : "site.create",
      message,
      context: {
        selectedBaseRevisionId: project.data.activeRevisionId,
        buildChoices: choices,
        mode: normalizedMode(mode),
        planMode,
      },
    }
    const buildResponse = await fetch("/api/siteagent/build-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        projectId: project.data.projectId,
        baseRevisionId: project.data.activeRevisionId,
        idempotencyKey: `browser:${crypto.randomUUID()}`,
        intent,
      }),
      signal,
    })
    const buildPayload = await responsePayload(buildResponse)
    const envelope = BuildJobResponseV1Schema.safeParse(buildPayload)
    if (!envelope.success) {
      onEvent({ type: "error", message: "Build-controllern returnerade ett ogiltigt svar." })
      return
    }

    const reduced = reduceBuildEventsV1(envelope.data.events ?? [], onEvent)
    if (!reduced.valid) return
    if (!reduced.terminalSeen) {
      onEvent({
        type: "error",
        message: apiMessage(
          buildPayload,
          buildResponse.ok ? "Byggjobbet saknar terminal status." : "Byggjobbet kunde inte startas.",
        ),
      })
    }
  } catch (error) {
    if (signal?.aborted) return
    onEvent({
      type: "error",
      message: error instanceof Error ? error.message : "Build-anropet kunde inte slutföras.",
    })
  }
}

export async function promptAssist(): Promise<string> {
  throw new Error("Prompt-assist är inte ansluten till produktcontrollern ännu.")
}

export async function publish(): Promise<{ ok: boolean; url?: string }> {
  return { ok: false }
}

export async function downloadZip(versionId: string): Promise<void> {
  void versionId
  throw new Error("ZIP-export är inte ansluten till en verifierad version ännu.")
}
