import { z } from "zod"
import { isNextPreviewUnavailableError } from "./next-preview-model.ts"

/**
 * Closed POST /next failure reasons. HTTP mapping:
 * 500 = permanent server fault (byte verification or artifact configuration)
 * 502 = artifact deploy/upload failed, or runtime/worker rejected the job
 * 503 = runtime unavailable — unknown errors stay 503 without a reason
 *
 * `next_preview_unavailable` is not in this set; it remains 404 (expected-off,
 * not a genuine fault; that 404 exists to keep Vercel 5xx monitors quiet).
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
  deployment_bytes_mismatch: 500,
  configuration_missing: 500,
  artifact_deploy_failed: 502,
  runtime_transport_4xx: 502,
  worker_build_failed: 502,
  runtime_transport_5xx: 503,
  runtime_transport_failed: 503,
} as const satisfies Record<NextBuildFailureReason, 500 | 502 | 503>

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
  error: "next_preview_unavailable" | "next_build_failed" | "project_busy" | "source_context_too_large" | "stale_source_generation" |
    "invalid_source_path" | "invalid_source_file_size" | "invalid_source_bundle" | "invalid_source_count"
  reason?: NextBuildFailureReason
}

const NAMED_SOURCE_ERRORS = [
  "invalid_source_path",
  "invalid_source_file_size",
  "invalid_source_bundle",
  "invalid_source_count",
] as const

export type NextAccessFailureBody = {
  error: "next_preview_unavailable" | "preview_access_denied" | "invalid_access_binding" | "payload_too_large" | "preview_access_unavailable"
}

export type NextProfileFailureBody = {
  error: "next_preview_unavailable" | "invalid_profile_preference" | "payload_too_large" | "project_not_found" | "next_profile_failed"
}

function namedSourceZodConstraint(error: z.ZodError): NextBuildFailureBody["error"] | null {
  for (const issue of error.issues) {
    if (issue.path.includes("content") && issue.code === "too_big") return "invalid_source_file_size"
    if (issue.path[0] === "files" && issue.path.length === 1 && (issue.code === "too_big" || issue.code === "too_small")) {
      return "invalid_source_count"
    }
    if (issue.path.includes("path")) return "invalid_source_path"
  }
  return null
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
    const source = namedSourceZodConstraint(error)
    return { status: 400, body: { error: source ?? "next_build_failed" } }
  }
  const code = error instanceof Error ? error.message : ""
  const named = Object.hasOwn(NAMED_CLIENT, code) ? NAMED_CLIENT[code as keyof typeof NAMED_CLIENT] : undefined
  if (named) return { status: named.status, body: { error: named.error } }
  if ((NAMED_SOURCE_ERRORS as readonly string[]).includes(code)) {
    return { status: 400, body: { error: code as (typeof NAMED_SOURCE_ERRORS)[number] } }
  }
  if (code.startsWith("invalid_source")) return { status: 400, body: { error: "invalid_source_path" } }
  if (Object.hasOwn(INTERNAL_TO_REASON, code)) {
    const reason = INTERNAL_TO_REASON[code as keyof typeof INTERNAL_TO_REASON]
    return { status: NEXT_BUILD_FAILURE_STATUS[reason], body: { error: "next_build_failed", reason } }
  }
  return { status: 503, body: { error: "next_build_failed" } }
}

/** Persist only the closed POST /next reason set. Unknown errors keep the generic code. */
export function persistedNextFailureCode(error: unknown): string {
  const reason = nextBuildFailureResponse(error).body.reason
  return reason && isNextBuildFailureReason(reason) ? reason : "build_or_verification_failed"
}

/** Retry only when the identical request might succeed after a transient runtime outage. */
export function isRetryableNextFailure(mapped: { status: number; body: NextBuildFailureBody }): boolean {
  return mapped.body.reason === "runtime_transport_5xx" ||
    mapped.body.reason === "runtime_transport_failed" ||
    (mapped.status === 503 && mapped.body.error === "next_build_failed" && mapped.body.reason === undefined)
}

/** Safe profile-preference body. Never echoes `error.message` or stored state. */
export function nextProfileFailureResponse(error: unknown): { status: number; body: NextProfileFailureBody } {
  if (isNextPreviewUnavailableError(error)) {
    return { status: 404, body: { error: "next_preview_unavailable" } }
  }
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "invalid_profile_preference" } }
  }
  const code = error instanceof Error ? error.message : ""
  if (code === "payload_too_large") return { status: 413, body: { error: "payload_too_large" } }
  if (code === "invalid_json") return { status: 400, body: { error: "invalid_profile_preference" } }
  if (code === "project_not_found") return { status: 404, body: { error: "project_not_found" } }
  return { status: 503, body: { error: "next_profile_failed" } }
}

/** Safe access-route body. Never echoes `error.message`, grants, hostnames or tokens. */
export function nextAccessFailureResponse(error: unknown): { status: number; body: NextAccessFailureBody } {
  if (isNextPreviewUnavailableError(error)) {
    return { status: 404, body: { error: "next_preview_unavailable" } }
  }
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "invalid_access_binding" } }
  }
  const code = error instanceof Error ? error.message : ""
  if (code === "payload_too_large") return { status: 413, body: { error: "payload_too_large" } }
  if (code === "invalid_json") return { status: 400, body: { error: "invalid_access_binding" } }
  if (code === "preview_access_denied") return { status: 403, body: { error: "preview_access_denied" } }
  return { status: 503, body: { error: "preview_access_unavailable" } }
}
