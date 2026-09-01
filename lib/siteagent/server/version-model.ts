import { createHash } from "node:crypto"

import { z } from "zod"

import {
  BuildJobV1Schema,
  EvidenceReceiptV1Schema,
  WorkerCandidateReportV1Schema,
} from "../../../contracts/builder-v1.ts"

export const MAX_INLINE_PREVIEW_BYTES_V1 = 1_048_576

export const SiteOpaqueIdV1Schema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)

export const SitePreviewRefV1Schema = z
  .string()
  .regex(/^preview:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)

export const InlinePreviewArtifactV1Schema = z
  .object({
    mediaType: z.literal("text/html"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().min(1).max(MAX_INLINE_PREVIEW_BYTES_V1),
    content: z.string().min(1).max(MAX_INLINE_PREVIEW_BYTES_V1),
  })
  .strict()

export type InlinePreviewArtifactV1 = z.infer<typeof InlinePreviewArtifactV1Schema>

export const StagedInlinePreviewArtifactV1Schema = z
  .object({
    state: z.literal("staged"),
    previewRef: SitePreviewRefV1Schema,
    mediaType: z.literal("text/html"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().min(1).max(MAX_INLINE_PREVIEW_BYTES_V1),
    content: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.byteLength >= 1 && bytes.byteLength <= MAX_INLINE_PREVIEW_BYTES_V1),
  })
  .strict()

export const PreparedAcceptedCandidateV1Schema = z
  .object({
    report: WorkerCandidateReportV1Schema,
    preview: StagedInlinePreviewArtifactV1Schema,
    verifiedAt: z.string().datetime({ offset: true }),
    receipts: z.array(EvidenceReceiptV1Schema).min(1).max(2_000),
  })
  .strict()

export type PreparedAcceptedCandidateV1 = z.infer<
  typeof PreparedAcceptedCandidateV1Schema
>

export const CanonicalVersionSummaryV1Schema = z
  .object({
    versionId: SiteOpaqueIdV1Schema,
    projectId: SiteOpaqueIdV1Schema,
    workspaceRevisionId: SiteOpaqueIdV1Schema,
    previewRef: SiteOpaqueIdV1Schema,
    sitemapRevision: SiteOpaqueIdV1Schema,
    versionNumber: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().min(1).max(MAX_INLINE_PREVIEW_BYTES_V1),
    verifiedAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type CanonicalVersionSummaryV1 = z.infer<
  typeof CanonicalVersionSummaryV1Schema
>

export const CanonicalProjectStateV1Schema = z
  .object({
    projectId: SiteOpaqueIdV1Schema,
    name: z.string().min(1).max(160),
    activeRevisionId: SiteOpaqueIdV1Schema.nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    activeVersion: CanonicalVersionSummaryV1Schema.nullable(),
  })
  .strict()

export type CanonicalProjectStateV1 = z.infer<typeof CanonicalProjectStateV1Schema>

export type StoredInlinePreviewV1 = InlinePreviewArtifactV1 & {
  previewRef: string
}

function previewDigest(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex")
}

function previewByteDigest(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex")
}

export function validateInlinePreviewArtifactV1(
  value: unknown,
): InlinePreviewArtifactV1 {
  const preview = InlinePreviewArtifactV1Schema.parse(value)
  const bytes = Buffer.byteLength(preview.content, "utf8")
  if (bytes !== preview.sizeBytes) throw new Error("preview_size_mismatch")
  if (previewDigest(preview.content) !== preview.sha256) {
    throw new Error("preview_hash_mismatch")
  }
  if (preview.content.toLowerCase().includes("sprite-worktree:")) {
    throw new Error("preview_contains_runtime_ref")
  }
  if (preview.content.includes("\0")) throw new Error("preview_contains_nul")
  return preview
}

export function validatePreparedAcceptedCandidateV1(
  jobValue: unknown,
  preparedValue: unknown,
): {
  job: z.infer<typeof BuildJobV1Schema>
  prepared: PreparedAcceptedCandidateV1
  htmlContent: string
} {
  const job = BuildJobV1Schema.parse(jobValue)
  const prepared = PreparedAcceptedCandidateV1Schema.parse(preparedValue)
  if (prepared.preview.content.byteLength !== prepared.preview.sizeBytes) {
    throw new Error("preview_size_mismatch")
  }
  if (previewByteDigest(prepared.preview.content) !== prepared.preview.sha256) {
    throw new Error("preview_hash_mismatch")
  }
  let htmlContent: string
  try {
    htmlContent = new TextDecoder("utf-8", { fatal: true }).decode(prepared.preview.content)
  } catch {
    throw new Error("preview_invalid_utf8")
  }
  validateInlinePreviewArtifactV1({
    mediaType: prepared.preview.mediaType,
    sha256: prepared.preview.sha256,
    sizeBytes: prepared.preview.sizeBytes,
    content: htmlContent,
  })
  if (prepared.report.jobId !== job.jobId) throw new Error("worker_job_mismatch")
  if (prepared.report.baseRevisionId !== job.baseRevisionId) {
    throw new Error("worker_base_revision_mismatch")
  }
  if (prepared.receipts.some((receipt) => receipt.status !== "passed")) {
    throw new Error("version_receipts_not_passed")
  }
  return { job, prepared, htmlContent }
}

export function publicVerificationReceiptsV1(
  receipts: PreparedAcceptedCandidateV1["receipts"],
): Array<
  Omit<PreparedAcceptedCandidateV1["receipts"][number], "evidenceRef" | "summary">
> {
  return receipts.map((receipt) => {
    const { evidenceRef, summary, ...publicReceipt } = receipt
    void evidenceRef
    void summary
    return publicReceipt
  })
}

export function previewResponseHeadersV1(sizeBytes: number): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "Content-Disposition": "inline",
    "Content-Length": String(sizeBytes),
    "Content-Security-Policy": [
      "sandbox",
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "script-src 'none'",
      "style-src 'unsafe-inline'",
      "img-src data: blob:",
      "font-src data:",
      "media-src data: blob:",
      "connect-src 'none'",
      "worker-src 'none'",
    ].join("; "),
    "Content-Type": "text/html; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    Expires: "0",
    "Permissions-Policy":
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    Vary: "Cookie",
  })
}

export function privateJsonHeadersV1(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "Content-Type": "application/json; charset=utf-8",
    Expires: "0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    Vary: "Cookie",
  })
}
