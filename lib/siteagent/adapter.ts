// Temporary browser-to-controller compatibility boundary. The V1 target is a
// continuous AgentSession/AgentEvent channel; BuildJobV1 remains a subordinate
// mutation envelope selected by Sajtagent, not the chat protocol itself.
// The browser never calls OpenClaw, Sprite, model tools, or persistence directly.

import { z } from "zod"

import type { BuilderIntentV1 } from "../../contracts/builder-v1.ts"
import type { BuildChoices } from "./build-choices"

const DefaultProjectResponseV1Schema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  activeRevisionId: z.string().min(1),
}).strict()

const BuildJobResponseV1Schema = z.object({
  schemaVersion: z.literal(1),
  events: z.array(z.unknown()).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

export interface SubmitBuildIntentParams {
  isFollowUp: boolean
  message: string
  choices: BuildChoices
  planMode?: boolean
  /** Promptläge från förstasidan. */
  mode?: string
  signal?: AbortSignal
}

export interface BuildIntentDispatchV1 {
  projectId: string | null
  events: readonly unknown[]
  error: string | null
}

export type DefaultProjectV1 = z.infer<typeof DefaultProjectResponseV1Schema>

export type OpenDefaultProjectResultV1 =
  | { ok: true; project: DefaultProjectV1 }
  | { ok: false; error: string }

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

export async function openDefaultProject(
  signal?: AbortSignal,
): Promise<OpenDefaultProjectResultV1> {
  const response = await fetch("/api/siteagent/projects/default", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
  })
  const payload = await responsePayload(response)
  const project = DefaultProjectResponseV1Schema.safeParse(payload)
  if (!response.ok || !project.success) {
    return { ok: false, error: apiMessage(payload, "Projektet kunde inte öppnas.") }
  }
  return { ok: true, project: project.data }
}

/**
 * Opens the authenticated user's starter project and creates one BuildJobV1.
 * The adapter returns the controller envelope without projecting product
 * success. Only the pure BuildEventV1 reducer may interpret those events.
 */
export async function submitBuildIntent(
  params: SubmitBuildIntentParams,
): Promise<BuildIntentDispatchV1> {
  // Integration seam to replace with AgentSession dispatch once that shared
  // contract is ratified. Do not copy this one-message/one-job shape outward.
  const { isFollowUp, message, choices, planMode, mode, signal } = params
  try {
    const opened = await openDefaultProject(signal)
    if (!opened.ok) {
      return {
        projectId: null,
        events: [],
        error: opened.error,
      }
    }
    const project = opened.project

    const intent: BuilderIntentV1 = {
      schemaVersion: 1,
      intentType: isFollowUp ? "site.change" : "site.create",
      message,
      context: {
        selectedBaseRevisionId: project.activeRevisionId,
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
        projectId: project.projectId,
        baseRevisionId: project.activeRevisionId,
        idempotencyKey: `browser:${crypto.randomUUID()}`,
        intent,
      }),
      signal,
    })
    const buildPayload = await responsePayload(buildResponse)
    const envelope = BuildJobResponseV1Schema.safeParse(buildPayload)
    if (!envelope.success) {
      return {
        projectId: project.projectId,
        events: [],
        error: "Build-controllern returnerade ett ogiltigt svar.",
      }
    }

    const controllerMessage = envelope.data.error?.message
    return {
      projectId: project.projectId,
      events: envelope.data.events ?? [],
      error:
        controllerMessage ??
        (!buildResponse.ok
          ? apiMessage(
              buildPayload,
              "Byggjobbet kunde inte slutföras.",
            )
          : null),
    }
  } catch (error) {
    if (signal?.aborted) throw error
    return {
      projectId: null,
      events: [],
      error: error instanceof Error ? error.message : "Build-anropet kunde inte slutföras.",
    }
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
