import { z } from "zod"
import { isNextPreviewUnavailableError } from "./next-preview-model.ts"

/**
 * Closed POST /next failure reasons. HTTP mapping:
 * 422 = deterministic verification or artifact configuration (retry will not help)
 * 502 = artifact deploy/upload failed, or runtime/worker rejected the job
 * 503 = runtime 5xx/unavailability — unknown errors stay 503 without a reason
 *
 * `next_preview_unavailable` is not in this set; it remains 404.
 */
export const NEXT_BUILD_FAILURE_REASONS = [
  "deployment_bytes_mismatch",
  "artifact_deploy_failed",
  "runtime_transport_4xx",
  "runtime_transport_5xx",
  "runtime_transport_failed",
  "worker_build_failed",
  "configuration_missing",
] as const

export type NextBuildFailureReason = (typeof NEXT_BUILD_FAILURE_REASONS)[number]

export const NEXT_BUILD_FAILURE_STATUS = {
  deployment_bytes_mismatch: 422,
  configuration_missing: 422,
  artifact_deploy_failed: 502,
  runtime_transport_4xx: 502,
  worker_build_failed: 502,
  runtime_transport_5xx: 503,
  runtime_transport_failed: 503,
} as const satisfies Record<NextBuildFailureReason, 422 | 502 | 503>

const INTERNAL_TO_REASON = {
  deployment_bytes_mismatch: "deployment_bytes_mismatch",
  vercel_api_failed: "artifact_deploy_failed",
  deployment_failed: "artifact_deploy_failed",
  deployment_timeout: "artifact_deploy_failed",
  deployment_verification_failed: "artifact_deploy_failed",
  deployment_binding_mismatch: "artifact_deploy_failed",
  invalid_deployment_origin: "artifact_deploy_failed",
  unprotected_preview_origin: "artifact_deploy_failed",
  runtime_transport_4xx: "runtime_transport_4xx",
  runtime_transport_5xx: "runtime_transport_5xx",
  runtime_transport_failed: "runtime_transport_failed",
  worker_build_failed: "worker_build_failed",
  worker_binding_mismatch: "worker_build_failed",
  invalid_static_output: "worker_build_failed",
  invalid_static_encoding: "worker_build_failed",
  invalid_next_output: "worker_build_failed",
  source_generation_failed: "worker_build_failed",
  source_binding_mismatch: "worker_build_failed",
  preview_protection_required: "configuration_missing",
  invalid_next_runtime_config: "configuration_missing",
} as const satisfies Record<string, NextBuildFailureReason>

const NAMED_CLIENT = {
  project_not_found: { status: 404, error: "next_build_failed" },
  project_busy: { status: 409, error: "project_busy" },
  stale_source_generation: { status: 409, error: "stale_source_generation" },
  source_context_too_large: { status: 400, error: "source_context_too_large" },
} as const

export type NextBuildFailureBody = {
  error: "next_preview_unavailable" | "next_build_failed" | "project_busy" | "source_context_too_large" | "stale_source_generation"
  reason?: NextBuildFailureReason
}

export function isNextBuildFailureReason(value: string): value is NextBuildFailureReason {
  return (NEXT_BUILD_FAILURE_REASONS as readonly string[]).includes(value)
}

/** Safe API body: generic `error` plus an allowlisted `reason`. Never echoes `error.message`. */
export function nextBuildFailureResponse(error: unknown): { status: number; body: NextBuildFailureBody } {
  if (isNextPreviewUnavailableError(error)) {
    return { status: 404, body: { error: "next_preview_unavailable" } }
  }
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "next_build_failed" } }
  }
  const code = error instanceof Error ? error.message : ""
  const named = Object.hasOwn(NAMED_CLIENT, code) ? NAMED_CLIENT[code as keyof typeof NAMED_CLIENT] : undefined
  if (named) return { status: named.status, body: { error: named.error } }
  if (code.startsWith("invalid_source")) return { status: 400, body: { error: "next_build_failed" } }
  if (Object.hasOwn(INTERNAL_TO_REASON, code)) {
    const reason = INTERNAL_TO_REASON[code as keyof typeof INTERNAL_TO_REASON]
    return { status: NEXT_BUILD_FAILURE_STATUS[reason], body: { error: "next_build_failed", reason } }
  }
  return { status: 503, body: { error: "next_build_failed" } }
}
