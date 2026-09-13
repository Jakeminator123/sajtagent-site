import { z } from "zod"

import {
  DeploymentOwnerV2Schema,
  type DeploymentOwnerV2,
} from "./deployment-v2.ts"

export const PROJECT_CONTRACT_VERSION_V2 = 2 as const
export const DEFAULT_PROJECT_NAME_V2 = "Ny sajt"

const IdentifierV2Schema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)

const ProjectNameV2Schema = z
  .string()
  .trim()
  .min(1)
  .max(160)

export const ProjectOwnerV2Schema = DeploymentOwnerV2Schema
export type ProjectOwnerV2 = DeploymentOwnerV2

export const ProjectPrincipalV2Schema = z
  .object({
    tenantId: IdentifierV2Schema,
    principalId: IdentifierV2Schema,
  })
  .strict()

export type ProjectPrincipalV2 = z.infer<typeof ProjectPrincipalV2Schema>

export const WorkerSpriteIdV2Schema = IdentifierV2Schema

export const ProjectV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_CONTRACT_VERSION_V2),
    projectId: IdentifierV2Schema,
    name: ProjectNameV2Schema,
    owner: ProjectOwnerV2Schema,
    workerSpriteId: WorkerSpriteIdV2Schema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.owner.projectId !== value.projectId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["owner", "projectId"],
        message: "Project owner.projectId must match projectId",
      })
    }
  })

export type ProjectV2 = z.infer<typeof ProjectV2Schema>

export const CreateProjectRequestV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_CONTRACT_VERSION_V2),
    name: ProjectNameV2Schema.optional(),
  })
  .strict()

export type CreateProjectRequestV2 = z.infer<typeof CreateProjectRequestV2Schema>

export const ProjectListResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_CONTRACT_VERSION_V2),
    projects: z.array(ProjectV2Schema),
  })
  .strict()

export type ProjectListResponseV2 = z.infer<typeof ProjectListResponseV2Schema>

export const ProjectOpenResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_CONTRACT_VERSION_V2),
    project: ProjectV2Schema,
  })
  .strict()

export type ProjectOpenResponseV2 = z.infer<typeof ProjectOpenResponseV2Schema>

/** Server-owned bind envelope. Browser and model payloads must never carry this. */
export const BindProjectWorkerRequestV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_CONTRACT_VERSION_V2),
    projectId: IdentifierV2Schema,
    workerSpriteId: WorkerSpriteIdV2Schema,
  })
  .strict()

export type BindProjectWorkerRequestV2 = z.infer<
  typeof BindProjectWorkerRequestV2Schema
>

export const ProjectContractNameV2Schema = z.enum([
  "ProjectOwnerV2",
  "ProjectPrincipalV2",
  "ProjectV2",
  "CreateProjectRequestV2",
  "ProjectListResponseV2",
  "ProjectOpenResponseV2",
  "BindProjectWorkerRequestV2",
])

export type ProjectContractNameV2 = z.infer<typeof ProjectContractNameV2Schema>

export const ProjectContractSchemasV2: Record<
  ProjectContractNameV2,
  z.ZodTypeAny
> = {
  ProjectOwnerV2: ProjectOwnerV2Schema,
  ProjectPrincipalV2: ProjectPrincipalV2Schema,
  ProjectV2: ProjectV2Schema,
  CreateProjectRequestV2: CreateProjectRequestV2Schema,
  ProjectListResponseV2: ProjectListResponseV2Schema,
  ProjectOpenResponseV2: ProjectOpenResponseV2Schema,
  BindProjectWorkerRequestV2: BindProjectWorkerRequestV2Schema,
}

export type ProjectValidationV2 =
  | { success: true; project: ProjectV2 }
  | { success: false; error: string }

export type CreateProjectParseV2 =
  | { success: true; request: CreateProjectRequestV2 }
  | { success: false; error: string }

export type BindProjectWorkerDecisionV2 =
  | { success: true; workerSpriteId: string }
  | { success: false; error: string }

const CLIENT_WORKER_FIELDS = ["workerSpriteId", "worker_sprite_id"] as const

export function projectOwnerFromPrincipalV2(
  principal: ProjectPrincipalV2,
  projectId: string,
): ProjectOwnerV2 {
  return {
    tenantId: principal.tenantId,
    projectId,
    principalId: principal.principalId,
  }
}

export function sameProjectOwnerV2(
  left: ProjectOwnerV2,
  right: ProjectOwnerV2,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.projectId === right.projectId &&
    left.principalId === right.principalId
  )
}

export function principalOwnsProjectV2(
  principal: ProjectPrincipalV2,
  owner: ProjectOwnerV2,
): boolean {
  return (
    principal.tenantId === owner.tenantId &&
    principal.principalId === owner.principalId
  )
}

export function clientPayloadHasWorkerSpriteIdV2(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return CLIENT_WORKER_FIELDS.some((field) => field in record)
}

export function parseCreateProjectRequestV2(value: unknown): CreateProjectParseV2 {
  if (clientPayloadHasWorkerSpriteIdV2(value)) {
    return { success: false, error: "worker_sprite_id_client_forbidden" }
  }
  const parsed = CreateProjectRequestV2Schema.safeParse(value)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid CreateProjectRequestV2",
    }
  }
  return { success: true, request: parsed.data }
}

export function validateProjectV2(value: unknown): ProjectValidationV2 {
  const parsed = ProjectV2Schema.safeParse(value)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid ProjectV2",
    }
  }
  return { success: true, project: parsed.data }
}

export function authorizeBindProjectWorkerV2(input: {
  principal: ProjectPrincipalV2
  project: ProjectV2
  workerSpriteId: string
  occupiedBy: ProjectOwnerV2 | null
}): BindProjectWorkerDecisionV2 {
  const principal = ProjectPrincipalV2Schema.safeParse(input.principal)
  if (!principal.success) {
    return {
      success: false,
      error: principal.error.issues[0]?.message ?? "Invalid ProjectPrincipalV2",
    }
  }
  const project = validateProjectV2(input.project)
  if (!project.success) return project
  const workerSpriteId = WorkerSpriteIdV2Schema.safeParse(input.workerSpriteId)
  if (!workerSpriteId.success) {
    return { success: false, error: "invalid_worker_sprite_id" }
  }
  if (!principalOwnsProjectV2(principal.data, project.project.owner)) {
    return { success: false, error: "project_ownership_conflict" }
  }
  if (!sameProjectOwnerV2(project.project.owner, {
    tenantId: principal.data.tenantId,
    projectId: project.project.projectId,
    principalId: principal.data.principalId,
  })) {
    return { success: false, error: "project_ownership_conflict" }
  }

  const occupied = input.occupiedBy
    ? ProjectOwnerV2Schema.safeParse(input.occupiedBy)
    : null
  if (occupied && !occupied.success) {
    return { success: false, error: "invalid_occupied_owner" }
  }
  if (occupied?.success) {
    if (sameProjectOwnerV2(occupied.data, project.project.owner)) {
      return { success: true, workerSpriteId: workerSpriteId.data }
    }
    if (
      occupied.data.tenantId === project.project.owner.tenantId &&
      occupied.data.principalId === project.project.owner.principalId
    ) {
      return { success: false, error: "worker_bound_to_other_project" }
    }
    return { success: false, error: "worker_owned_by_other_principal" }
  }

  return { success: true, workerSpriteId: workerSpriteId.data }
}
