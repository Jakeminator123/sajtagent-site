import { z } from "zod"

import {
  NEXT_PREVIEW_CONTRACT_VERSION_V2,
  PreviewAccessRequirementV2Schema,
  type PreviewAccessRequirementV2,
} from "./deployment-v2.ts"

const IdentifierV2Schema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)

export const PreviewAccessPrincipalV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anonymous") }).strict(),
  z
    .object({
      kind: z.literal("authenticated"),
      tenantId: IdentifierV2Schema,
      principalId: IdentifierV2Schema,
    })
    .strict(),
])

export type PreviewAccessPrincipalV2 = z.infer<typeof PreviewAccessPrincipalV2Schema>

export const PreviewAccessAttemptV2Schema = z
  .object({
    schemaVersion: z.literal(NEXT_PREVIEW_CONTRACT_VERSION_V2),
    deploymentId: IdentifierV2Schema,
    access: PreviewAccessRequirementV2Schema,
    principal: PreviewAccessPrincipalV2Schema,
  })
  .strict()

export type PreviewAccessAttemptV2 = z.infer<typeof PreviewAccessAttemptV2Schema>

export const PreviewAccessDecisionV2Schema = z.discriminatedUnion("decision", [
  z
    .object({
      schemaVersion: z.literal(NEXT_PREVIEW_CONTRACT_VERSION_V2),
      decision: z.literal("allow"),
      reason: z.literal("owner_authenticated"),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(NEXT_PREVIEW_CONTRACT_VERSION_V2),
      decision: z.literal("deny"),
      reason: z.enum([
        "unauthenticated",
        "principal_mismatch",
        "tenant_mismatch",
      ]),
    })
    .strict(),
])

export type PreviewAccessDecisionV2 = z.infer<typeof PreviewAccessDecisionV2Schema>

export const PreviewAccessContractNameV2Schema = z.enum([
  "PreviewAccessPrincipalV2",
  "PreviewAccessAttemptV2",
  "PreviewAccessDecisionV2",
])

export type PreviewAccessContractNameV2 = z.infer<
  typeof PreviewAccessContractNameV2Schema
>

export const PreviewAccessContractSchemasV2: Record<
  PreviewAccessContractNameV2,
  z.ZodTypeAny
> = {
  PreviewAccessPrincipalV2: PreviewAccessPrincipalV2Schema,
  PreviewAccessAttemptV2: PreviewAccessAttemptV2Schema,
  PreviewAccessDecisionV2: PreviewAccessDecisionV2Schema,
}

export type PreviewAccessEvaluationV2 =
  | { success: true; decision: PreviewAccessDecisionV2 }
  | { success: false; error: string }

export function decidePreviewAccessV2(
  access: PreviewAccessRequirementV2,
  principal: PreviewAccessPrincipalV2,
): PreviewAccessDecisionV2 {
  if (principal.kind === "anonymous") {
    return {
      schemaVersion: NEXT_PREVIEW_CONTRACT_VERSION_V2,
      decision: "deny",
      reason: "unauthenticated",
    }
  }
  if (principal.tenantId !== access.owner.tenantId) {
    return {
      schemaVersion: NEXT_PREVIEW_CONTRACT_VERSION_V2,
      decision: "deny",
      reason: "tenant_mismatch",
    }
  }
  if (principal.principalId !== access.owner.principalId) {
    return {
      schemaVersion: NEXT_PREVIEW_CONTRACT_VERSION_V2,
      decision: "deny",
      reason: "principal_mismatch",
    }
  }
  return {
    schemaVersion: NEXT_PREVIEW_CONTRACT_VERSION_V2,
    decision: "allow",
    reason: "owner_authenticated",
  }
}

export function evaluatePreviewAccessV2(
  accessValue: unknown,
  principalValue: unknown,
): PreviewAccessEvaluationV2 {
  const access = PreviewAccessRequirementV2Schema.safeParse(accessValue)
  if (!access.success) {
    return {
      success: false,
      error: access.error.issues[0]?.message ?? "Invalid PreviewAccessRequirementV2",
    }
  }
  const principal = PreviewAccessPrincipalV2Schema.safeParse(principalValue)
  if (!principal.success) {
    return {
      success: false,
      error: principal.error.issues[0]?.message ?? "Invalid PreviewAccessPrincipalV2",
    }
  }
  return {
    success: true,
    decision: decidePreviewAccessV2(access.data, principal.data),
  }
}

export function validatePreviewAccessDecisionV2(
  accessValue: unknown,
  principalValue: unknown,
  decisionValue: unknown,
): PreviewAccessEvaluationV2 {
  const evaluated = evaluatePreviewAccessV2(accessValue, principalValue)
  if (!evaluated.success) return evaluated
  const decision = PreviewAccessDecisionV2Schema.safeParse(decisionValue)
  if (!decision.success) {
    return {
      success: false,
      error: decision.error.issues[0]?.message ?? "Invalid PreviewAccessDecisionV2",
    }
  }
  if (
    decision.data.decision !== evaluated.decision.decision ||
    decision.data.reason !== evaluated.decision.reason
  ) {
    return {
      success: false,
      error: "Preview access decision must match the evaluated owner requirement",
    }
  }
  return evaluated
}
