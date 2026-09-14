import { createHash } from "node:crypto"
import { z } from "zod"
import { PreviewRefV2Schema, SourceRevisionIdV2Schema } from "../../../contracts/deployment-v2.ts"

export const NextPreviewAccessBindingSchema = z.object({
  jobId: z.string().regex(/^job:[A-Za-z0-9._:-]+$/).max(160),
  sourceRevisionId: SourceRevisionIdV2Schema,
  previewRef: PreviewRefV2Schema,
}).strict()

export type NextPreviewAccessBinding = z.infer<typeof NextPreviewAccessBindingSchema>

/** Binding is part of the one-use capability, so it cannot be dropped or changed. */
export function previewGrantHash(token: string, binding?: NextPreviewAccessBinding): string {
  const value = binding ? JSON.stringify([token, binding.jobId, binding.sourceRevisionId, binding.previewRef]) : token
  return createHash("sha256").update(value).digest("hex")
}

export function matchesPreviewAccessBinding(actual: NextPreviewAccessBinding, expected?: NextPreviewAccessBinding): boolean {
  return !expected || (actual.jobId === expected.jobId && actual.sourceRevisionId === expected.sourceRevisionId && actual.previewRef === expected.previewRef)
}
