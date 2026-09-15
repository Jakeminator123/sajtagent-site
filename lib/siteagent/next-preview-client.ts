import { z } from "zod"
import { PreviewRefV2Schema, SourceRevisionIdV2Schema } from "../../contracts/deployment-v2.ts"
import type { AgentNextPreviewProjection } from "./agent-event-reducer.ts"

const binding = z.object({
  projectId: z.string().min(1), jobId: z.string().min(1),
  sourceRevisionId: SourceRevisionIdV2Schema, previewRef: PreviewRefV2Schema,
})
const profileSchema = z.object({
  available: z.array(z.enum(["html", "next"])).min(1),
  preference: z.enum(["html", "next"]).nullable(),
  effective: z.enum(["html", "next"]),
}).strict()

const stateSchema = z.object({
  schemaVersion: z.literal(2),
  state: z.object({
    current: binding.extend({status: z.enum(["building", "accepted", "failed"]), expiresAt: z.string().datetime({offset: true}), failureCode: z.string().optional()}).nullable(),
    accepted: binding.extend({acceptedAt: z.string().datetime({offset: true})}).nullable(),
  }),
  profile: profileSchema.optional(),
})

export type NextProjectState = z.infer<typeof stateSchema>["state"]
export type NextBuildProfile = z.infer<typeof profileSchema>
export type NextProjectRead = { state: NextProjectState; profile: NextBuildProfile | null }
export type AcceptedNextPreview = NonNullable<NextProjectState["accepted"]>
export type NextAvailability = "loading" | "available" | "unavailable" | "error"
export function canSendWithNextProfile(availability: NextAvailability, hasNext: boolean): boolean {
  return availability === "available" || (availability === "unavailable" && !hasNext)
}
export function isNextBuildActive(current: NextProjectState["current"], now = Date.now()): boolean {
  return current?.status === "building" && Date.parse(current.expiresAt) > now
}

export function parseNextProjectRead(value: unknown, projectId: string): NextProjectRead {
  const parsed = stateSchema.safeParse(value)
  if (!parsed.success) throw new Error("Projektets React-status kunde inte verifieras.")
  const {state, profile} = parsed.data
  if ([state.current, state.accepted].some(item => item && item.projectId !== projectId)) {
    throw new Error("Next-svaret tillhörde ett annat projekt.")
  }
  return { state, profile: profile ?? null }
}

export function parseNextProjectState(value: unknown, projectId: string): NextProjectState {
  return parseNextProjectRead(value, projectId).state
}

export function reconcileNextPreview(candidate: AgentNextPreviewProjection, state: NextProjectState, projectId: string): boolean {
  const accepted = state.accepted
  return candidate.projectId === projectId && Boolean(accepted &&
    accepted.projectId === projectId && accepted.jobId === candidate.jobId &&
    accepted.sourceRevisionId === candidate.sourceRevisionId && accepted.previewRef === candidate.previewRef &&
    Date.parse(accepted.acceptedAt) === Date.parse(candidate.verifiedAt))
}

export function nextSourceDownloadHref(accepted: AcceptedNextPreview): string {
  const query = new URLSearchParams({sourceRevisionId: accepted.sourceRevisionId, jobId: accepted.jobId})
  return `/api/siteagent/projects/${encodeURIComponent(accepted.projectId)}/next/download?${query}`
}
