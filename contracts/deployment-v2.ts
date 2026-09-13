import { z } from "zod"

export const NEXT_PREVIEW_CONTRACT_VERSION_V2 = 2 as const
export const NEXT_PREVIEW_KIND_V2 = "next" as const
export const NEXT_PREVIEW_ACCESS_MODE_V2 = "owner_authenticated" as const

const IdentifierV2Schema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)

const TimestampV2Schema = z.string().datetime({ offset: true })

export const SourceRevisionIdV2Schema = z
  .string()
  .regex(/^revision:sha256:[a-f0-9]{64}$/)

export const PreviewRefV2Schema = z
  .string()
  .min(24)
  .max(136)
  .regex(/^preview:[A-Za-z0-9_-]{16,128}$/)

export const DeploymentOwnerV2Schema = z
  .object({
    tenantId: IdentifierV2Schema,
    projectId: IdentifierV2Schema,
    principalId: IdentifierV2Schema,
  })
  .strict()

export type DeploymentOwnerV2 = z.infer<typeof DeploymentOwnerV2Schema>

export const PreviewAccessRequirementV2Schema = z
  .object({
    schemaVersion: z.literal(NEXT_PREVIEW_CONTRACT_VERSION_V2),
    mode: z.literal(NEXT_PREVIEW_ACCESS_MODE_V2),
    owner: DeploymentOwnerV2Schema,
  })
  .strict()

export type PreviewAccessRequirementV2 = z.infer<
  typeof PreviewAccessRequirementV2Schema
>

export const DeploymentSourceBindingV2Schema = z
  .object({
    jobId: IdentifierV2Schema,
    sourceRevisionId: SourceRevisionIdV2Schema,
  })
  .strict()

export type DeploymentSourceBindingV2 = z.infer<
  typeof DeploymentSourceBindingV2Schema
>

export const NextPreviewFailureCodeV2Schema = z.enum([
  "stale_revision",
  "worker_failed",
  "timeout",
  "verification_failed",
  "preview_unhealthy",
  "internal_error",
])

export type NextPreviewFailureCodeV2 = z.infer<
  typeof NextPreviewFailureCodeV2Schema
>

const NextPreviewBuildBaseV2Schema = z
  .object({
    jobId: IdentifierV2Schema,
    sourceRevisionId: SourceRevisionIdV2Schema,
  })
  .strict()

export const NextPreviewBuildBuildingV2Schema = NextPreviewBuildBaseV2Schema.extend({
  status: z.literal("building"),
  startedAt: TimestampV2Schema,
}).strict()

export const NextPreviewBuildFailedV2Schema = NextPreviewBuildBaseV2Schema.extend({
  status: z.literal("failed"),
  failedAt: TimestampV2Schema,
  code: NextPreviewFailureCodeV2Schema,
  message: z.string().min(1).max(2_000),
  retryable: z.boolean(),
}).strict()

export const NextPreviewBuildAcceptedV2Schema = NextPreviewBuildBaseV2Schema.extend({
  status: z.literal("accepted"),
  acceptedAt: TimestampV2Schema,
}).strict()

export const NextPreviewBuildV2Schema = z.discriminatedUnion("status", [
  NextPreviewBuildBuildingV2Schema,
  NextPreviewBuildFailedV2Schema,
  NextPreviewBuildAcceptedV2Schema,
])

export type NextPreviewBuildV2 = z.infer<typeof NextPreviewBuildV2Schema>

export const NextPreviewAcceptedRevisionV2Schema = z
  .object({
    revisionId: SourceRevisionIdV2Schema,
    jobId: IdentifierV2Schema,
    sourceRevisionId: SourceRevisionIdV2Schema,
    previewRef: PreviewRefV2Schema,
    acceptedAt: TimestampV2Schema,
  })
  .strict()

export type NextPreviewAcceptedRevisionV2 = z.infer<
  typeof NextPreviewAcceptedRevisionV2Schema
>

export const NextPreviewDeploymentV2Schema = z
  .object({
    schemaVersion: z.literal(NEXT_PREVIEW_CONTRACT_VERSION_V2),
    kind: z.literal(NEXT_PREVIEW_KIND_V2),
    deploymentId: IdentifierV2Schema,
    owner: DeploymentOwnerV2Schema,
    access: PreviewAccessRequirementV2Schema,
    sourceBinding: DeploymentSourceBindingV2Schema,
    build: NextPreviewBuildV2Schema,
    acceptedRevision: NextPreviewAcceptedRevisionV2Schema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!sameOwner(value.owner, value.access.owner)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["access", "owner"],
        message: "Preview access owner must match the deployment owner",
      })
    }
    if (value.build.jobId !== value.sourceBinding.jobId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["build", "jobId"],
        message: "Build jobId must match the source binding jobId",
      })
    }
    if (value.build.sourceRevisionId !== value.sourceBinding.sourceRevisionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["build", "sourceRevisionId"],
        message: "Build sourceRevisionId must match the source binding",
      })
    }
    if (value.build.status === "accepted") {
      if (!value.acceptedRevision) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acceptedRevision"],
          message: "An accepted build must persist acceptedRevision",
        })
        return
      }
      if (value.acceptedRevision.jobId !== value.build.jobId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acceptedRevision", "jobId"],
          message: "acceptedRevision.jobId must match the accepted build jobId",
        })
      }
      if (value.acceptedRevision.sourceRevisionId !== value.build.sourceRevisionId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acceptedRevision", "sourceRevisionId"],
          message: "acceptedRevision must keep the accepted build source revision",
        })
      }
      if (value.acceptedRevision.acceptedAt !== value.build.acceptedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acceptedRevision", "acceptedAt"],
          message: "acceptedRevision.acceptedAt must match the accepted build",
        })
      }
      return
    }
    if (
      value.acceptedRevision &&
      value.acceptedRevision.jobId === value.build.jobId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptedRevision", "jobId"],
        message:
          "A building or failed wave cannot claim its own job as acceptedRevision",
      })
    }
  })

export type NextPreviewDeploymentV2 = z.infer<typeof NextPreviewDeploymentV2Schema>

export const DeploymentContractNameV2Schema = z.enum([
  "DeploymentOwnerV2",
  "DeploymentSourceBindingV2",
  "PreviewAccessRequirementV2",
  "NextPreviewBuildV2",
  "NextPreviewAcceptedRevisionV2",
  "NextPreviewDeploymentV2",
])

export type DeploymentContractNameV2 = z.infer<typeof DeploymentContractNameV2Schema>

export const DeploymentContractSchemasV2: Record<
  DeploymentContractNameV2,
  z.ZodTypeAny
> = {
  DeploymentOwnerV2: DeploymentOwnerV2Schema,
  DeploymentSourceBindingV2: DeploymentSourceBindingV2Schema,
  PreviewAccessRequirementV2: PreviewAccessRequirementV2Schema,
  NextPreviewBuildV2: NextPreviewBuildV2Schema,
  NextPreviewAcceptedRevisionV2: NextPreviewAcceptedRevisionV2Schema,
  NextPreviewDeploymentV2: NextPreviewDeploymentV2Schema,
}

export type NextPreviewValidationV2 =
  | { success: true; deployment: NextPreviewDeploymentV2 }
  | { success: false; error: string }

export type DeploymentWaveValidationV2 =
  | { success: true; previous: NextPreviewDeploymentV2; next: NextPreviewDeploymentV2 }
  | { success: false; error: string }

export function sameOwnerV2(left: DeploymentOwnerV2, right: DeploymentOwnerV2): boolean {
  return sameOwner(left, right)
}

export function sameAcceptedRevisionV2(
  left: NextPreviewAcceptedRevisionV2 | null,
  right: NextPreviewAcceptedRevisionV2 | null,
): boolean {
  return sameAcceptedRevision(left, right)
}

export function validateNextPreviewDeploymentV2(
  value: unknown,
): NextPreviewValidationV2 {
  const parsed = NextPreviewDeploymentV2Schema.safeParse(value)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid NextPreviewDeploymentV2",
    }
  }
  return { success: true, deployment: parsed.data }
}

export function validateDeploymentWaveTransitionV2(
  previousValue: unknown,
  nextValue: unknown,
): DeploymentWaveValidationV2 {
  const previous = validateNextPreviewDeploymentV2(previousValue)
  if (!previous.success) return previous
  const next = validateNextPreviewDeploymentV2(nextValue)
  if (!next.success) return next

  if (next.deployment.deploymentId !== previous.deployment.deploymentId) {
    return { success: false, error: "Wave transition must keep the same deploymentId" }
  }
  if (next.deployment.kind !== previous.deployment.kind) {
    return { success: false, error: "Wave transition must keep kind=next" }
  }
  if (!sameOwner(previous.deployment.owner, next.deployment.owner)) {
    return { success: false, error: "Wave transition cannot change the deployment owner" }
  }
  if (!sameOwner(previous.deployment.access.owner, next.deployment.access.owner)) {
    return { success: false, error: "Wave transition cannot change preview access owner" }
  }
  if (next.deployment.access.mode !== previous.deployment.access.mode) {
    return { success: false, error: "Wave transition cannot change preview access mode" }
  }

  if (
    previous.deployment.build.status === "accepted" &&
    next.deployment.build.jobId === previous.deployment.build.jobId &&
    next.deployment.build.status !== "accepted"
  ) {
    return {
      success: false,
      error: "An accepted job cannot later become building or failed",
    }
  }

  if (next.deployment.build.status !== "accepted") {
    if (
      !sameAcceptedRevision(
        previous.deployment.acceptedRevision,
        next.deployment.acceptedRevision,
      )
    ) {
      return {
        success: false,
        error: "A building or failed wave cannot replace or clear acceptedRevision",
      }
    }
    return { success: true, previous: previous.deployment, next: next.deployment }
  }

  if (
    previous.deployment.acceptedRevision &&
    previous.deployment.acceptedRevision.jobId === next.deployment.build.jobId &&
    !sameAcceptedRevision(
      previous.deployment.acceptedRevision,
      next.deployment.acceptedRevision,
    )
  ) {
    return {
      success: false,
      error: "Idempotent accepted replay must preserve acceptedRevision",
    }
  }

  return { success: true, previous: previous.deployment, next: next.deployment }
}

function sameOwner(left: DeploymentOwnerV2, right: DeploymentOwnerV2): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.projectId === right.projectId &&
    left.principalId === right.principalId
  )
}

function sameAcceptedRevision(
  left: NextPreviewAcceptedRevisionV2 | null,
  right: NextPreviewAcceptedRevisionV2 | null,
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.revisionId === right.revisionId &&
    left.jobId === right.jobId &&
    left.sourceRevisionId === right.sourceRevisionId &&
    left.previewRef === right.previewRef &&
    left.acceptedAt === right.acceptedAt
  )
}
