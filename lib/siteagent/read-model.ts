import { z } from "zod"

import type {
  AgentEventV1,
  AgentSessionV1,
} from "../../contracts/agent-session-v1.ts"
import type { BuildResultV1 } from "../../contracts/builder-v1.ts"
import type { SiteVersion } from "./types"

type AgentPreviewResultV1 = Extract<
  AgentEventV1,
  { type: "preview.ready" }
>["payload"]["result"]

const TimestampV1Schema = z.string().datetime({ offset: true })

export const CanonicalVersionV1Schema = z
  .object({
    versionId: z.string().min(1),
    projectId: z.string().min(1),
    workspaceRevisionId: z.string().min(1),
    previewRef: z.string().min(1),
    sitemapRevision: z.string().min(1),
    versionNumber: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
    verifiedAt: TimestampV1Schema,
    createdAt: TimestampV1Schema,
  })
  .strict()

const ProjectStateV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    project: z
      .object({
        projectId: z.string().min(1),
        name: z.string().min(1),
        activeRevisionId: z.string().min(1),
        updatedAt: TimestampV1Schema,
        activeVersion: CanonicalVersionV1Schema.nullable(),
      })
      .strict(),
  })
  .strict()

const ProjectVersionsV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().min(1),
    versions: z.array(CanonicalVersionV1Schema),
  })
  .strict()

export type CanonicalVersionV1 = z.infer<typeof CanonicalVersionV1Schema>
export type CanonicalProjectReadModelV1 = {
  project: z.infer<typeof ProjectStateV1Schema>["project"]
  versions: CanonicalVersionV1[]
}

export type LoadCanonicalProjectResultV1 =
  | { ok: true; readModel: CanonicalProjectReadModelV1 }
  | { ok: false; error: string }

export function advanceAgentSessionBaseV1(
  session: AgentSessionV1,
  readModel: CanonicalProjectReadModelV1,
): AgentSessionV1 | null {
  if (session.projectId !== readModel.project.projectId) return null
  const updatedAt = new Date(
    Math.max(
      Date.parse(session.createdAt),
      Date.parse(session.updatedAt),
      Date.parse(readModel.project.updatedAt),
    ),
  ).toISOString()
  return {
    ...session,
    activeBaseRevisionId: readModel.project.activeRevisionId,
    updatedAt,
  }
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function canonicalVersionEquals(left: CanonicalVersionV1, right: CanonicalVersionV1): boolean {
  return (
    left.versionId === right.versionId &&
    left.projectId === right.projectId &&
    left.workspaceRevisionId === right.workspaceRevisionId &&
    left.previewRef === right.previewRef &&
    left.sitemapRevision === right.sitemapRevision &&
    left.versionNumber === right.versionNumber &&
    left.sha256 === right.sha256 &&
    left.sizeBytes === right.sizeBytes &&
    left.verifiedAt === right.verifiedAt &&
    left.createdAt === right.createdAt
  )
}

export async function loadCanonicalProjectV1(
  projectId: string,
  signal?: AbortSignal,
): Promise<LoadCanonicalProjectResultV1> {
  const encodedProjectId = encodeURIComponent(projectId)
  const [stateResponse, versionsResponse] = await Promise.all([
    fetch(`/api/siteagent/projects/${encodedProjectId}/state`, { signal }),
    fetch(`/api/siteagent/projects/${encodedProjectId}/versions`, { signal }),
  ])
  const [statePayload, versionsPayload] = await Promise.all([
    responsePayload(stateResponse),
    responsePayload(versionsResponse),
  ])
  if (!stateResponse.ok || !versionsResponse.ok) {
    return { ok: false, error: "Projektets verifierade state kunde inte hämtas." }
  }

  const state = ProjectStateV1Schema.safeParse(statePayload)
  const versions = ProjectVersionsV1Schema.safeParse(versionsPayload)
  if (!state.success || !versions.success) {
    return { ok: false, error: "Projektets read model matchade inte det förväntade kontraktet." }
  }
  if (
    state.data.project.projectId !== projectId ||
    versions.data.projectId !== projectId ||
    versions.data.versions.some((version) => version.projectId !== projectId)
  ) {
    return { ok: false, error: "Projektets read model hade fel ägarbunden projektidentitet." }
  }

  const activeVersion = state.data.project.activeVersion
  if (
    activeVersion &&
    !versions.data.versions.some((version) => canonicalVersionEquals(version, activeVersion))
  ) {
    return { ok: false, error: "Aktiv version saknades i den canonical versionslistan." }
  }

  return {
    ok: true,
    readModel: {
      project: state.data.project,
      versions: versions.data.versions,
    },
  }
}

export function reconcileBuildSuccessV1(
  result: Extract<BuildResultV1, { status: "succeeded" }>,
  readModel: CanonicalProjectReadModelV1,
): CanonicalVersionV1 | null {
  const activeVersion = readModel.project.activeVersion
  const listedVersion = readModel.versions.find((version) => version.versionId === result.versionId)
  if (!activeVersion || !listedVersion) return null
  if (!canonicalVersionEquals(activeVersion, listedVersion)) return null
  if (readModel.project.activeRevisionId !== result.workspaceRevisionId) return null
  if (
    listedVersion.workspaceRevisionId !== result.workspaceRevisionId ||
    listedVersion.previewRef !== result.previewRef ||
    listedVersion.sitemapRevision !== result.sitemapRevision
  ) {
    return null
  }
  return listedVersion
}

export function reconcileAgentPreviewV1(
  result: AgentPreviewResultV1,
  readModel: CanonicalProjectReadModelV1,
): CanonicalVersionV1 | null {
  const activeVersion = readModel.project.activeVersion
  const listedVersion = readModel.versions.find(
    (version) => version.versionId === result.versionId,
  )
  if (!activeVersion || !listedVersion) return null
  if (!canonicalVersionEquals(activeVersion, listedVersion)) return null
  if (readModel.project.activeRevisionId !== result.workspaceRevisionId) return null
  if (
    listedVersion.workspaceRevisionId !== result.workspaceRevisionId ||
    listedVersion.previewRef !== result.previewRef ||
    listedVersion.sitemapRevision !== result.sitemapRevision ||
    listedVersion.verifiedAt !== result.verifiedAt
  ) {
    return null
  }
  return listedVersion
}

export function toSiteVersionV1(version: CanonicalVersionV1): SiteVersion {
  return {
    id: version.versionId,
    label: `Version ${version.versionNumber}`,
    projectId: version.projectId,
    versionNumber: version.versionNumber,
    workspaceRevisionId: version.workspaceRevisionId,
    previewRef: version.previewRef,
    previewUrl: `/api/siteagent/previews/${encodeURIComponent(version.previewRef)}`,
    sitemapRevision: version.sitemapRevision,
    sha256: version.sha256,
    sizeBytes: version.sizeBytes,
    verifiedAt: version.verifiedAt,
    createdAt: version.createdAt,
    pinned: false,
  }
}
