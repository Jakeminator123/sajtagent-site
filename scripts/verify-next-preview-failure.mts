import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ZodError } from "zod"
import {
  NEXT_BUILD_FAILURE_REASONS,
  NEXT_BUILD_FAILURE_STATUS,
  isNextBuildFailureReason,
  isRetryableNextFailure,
  nextAccessFailureResponse,
  nextBuildFailureResponse,
  persistedNextFailureCode,
} from "../lib/siteagent/server/next-preview-failure.ts"

const INTERNAL_CASES = [
  ["deployment_bytes_mismatch", 500, "deployment_bytes_mismatch"],
  ["vercel_api_failed", 502, "artifact_deploy_failed"],
  ["deployment_failed", 502, "artifact_deploy_failed"],
  ["deployment_timeout", 502, "artifact_deploy_failed"],
  ["deployment_verification_failed", 502, "artifact_deploy_failed"],
  ["deployment_binding_mismatch", 502, "artifact_deploy_failed"],
  ["invalid_deployment_origin", 502, "artifact_deploy_failed"],
  ["unprotected_preview_origin", 502, "artifact_deploy_failed"],
  ["runtime_transport_4xx", 502, "runtime_transport_4xx"],
  ["runtime_transport_5xx", 503, "runtime_transport_5xx"],
  ["runtime_transport_failed", 503, "runtime_transport_failed"],
  ["worker_build_failed", 502, "worker_build_failed"],
  ["worker_binding_mismatch", 502, "worker_build_failed"],
  ["invalid_static_output", 502, "worker_build_failed"],
  ["invalid_static_encoding", 502, "worker_build_failed"],
  ["invalid_next_output", 502, "worker_build_failed"],
  ["source_generation_failed", 502, "worker_build_failed"],
  ["source_binding_mismatch", 502, "worker_build_failed"],
  ["preview_protection_required", 500, "configuration_missing"],
  ["invalid_next_runtime_config", 500, "configuration_missing"],
] as const

for (const [internal, status, reason] of INTERNAL_CASES) {
  const result = nextBuildFailureResponse(new Error(internal))
  assert.equal(result.status, status)
  assert.deepEqual(result.body, { error: "next_build_failed", reason })
  assert.equal(NEXT_BUILD_FAILURE_STATUS[reason], status)
  assert.equal(isNextBuildFailureReason(reason), true)
}

assert.deepEqual([...NEXT_BUILD_FAILURE_REASONS].sort(), [
  "artifact_deploy_failed",
  "configuration_missing",
  "deployment_bytes_mismatch",
  "runtime_transport_4xx",
  "runtime_transport_5xx",
  "runtime_transport_failed",
  "worker_build_failed",
])

const unavailable = nextBuildFailureResponse(new Error("next_preview_unavailable"))
assert.deepEqual(unavailable, { status: 404, body: { error: "next_preview_unavailable" } })
assert.equal("reason" in unavailable.body, false)

assert.deepEqual(nextBuildFailureResponse(new Error("project_not_found")), { status: 404, body: { error: "next_build_failed" } })
assert.deepEqual(nextBuildFailureResponse(new Error("project_busy")), { status: 409, body: { error: "project_busy" } })
assert.deepEqual(nextBuildFailureResponse(new Error("stale_source_generation")), { status: 409, body: { error: "stale_source_generation" } })
assert.deepEqual(nextBuildFailureResponse(new Error("source_context_too_large")), { status: 400, body: { error: "source_context_too_large" } })
assert.deepEqual(nextBuildFailureResponse(new Error("invalid_source_path")), { status: 400, body: { error: "invalid_source_path" } })
assert.deepEqual(nextBuildFailureResponse(new Error("invalid_source_file_size")), { status: 400, body: { error: "invalid_source_file_size" } })
assert.deepEqual(nextBuildFailureResponse(new Error("invalid_source_bundle")), { status: 400, body: { error: "invalid_source_bundle" } })
assert.deepEqual(nextBuildFailureResponse(new Error("invalid_source_count")), { status: 400, body: { error: "invalid_source_count" } })
assert.deepEqual(nextBuildFailureResponse(new ZodError([])), { status: 400, body: { error: "next_build_failed" } })
assert.equal(persistedNextFailureCode(new Error("deployment_bytes_mismatch")), "deployment_bytes_mismatch")
assert.equal(persistedNextFailureCode(new Error("vercel_api_failed")), "artifact_deploy_failed")
assert.equal(persistedNextFailureCode(new Error("secret https://internal.example/token")), "build_or_verification_failed")
assert.equal(isRetryableNextFailure(nextBuildFailureResponse(new Error("runtime_transport_5xx"))), true)
assert.equal(isRetryableNextFailure(nextBuildFailureResponse(new Error("runtime_transport_failed"))), true)
assert.equal(isRetryableNextFailure(nextBuildFailureResponse(new Error("deployment_bytes_mismatch"))), false)
assert.equal(isRetryableNextFailure(nextBuildFailureResponse(new Error("worker_build_failed"))), false)
assert.equal(isRetryableNextFailure(nextBuildFailureResponse(new Error("unknown"))), true)

assert.deepEqual(nextAccessFailureResponse(new Error("next_preview_unavailable")), { status: 404, body: { error: "next_preview_unavailable" } })
assert.deepEqual(nextAccessFailureResponse(new Error("preview_access_denied")), { status: 403, body: { error: "preview_access_denied" } })
assert.deepEqual(nextAccessFailureResponse(new Error("payload_too_large")), { status: 413, body: { error: "payload_too_large" } })
assert.deepEqual(nextAccessFailureResponse(new Error("invalid_json")), { status: 400, body: { error: "invalid_access_binding" } })
assert.deepEqual(nextAccessFailureResponse(new ZodError([])), { status: 400, body: { error: "invalid_access_binding" } })
assert.deepEqual(nextAccessFailureResponse(new Error("persistence_unavailable")), { status: 503, body: { error: "preview_access_unavailable" } })
const accessLeak = nextAccessFailureResponse(new Error("grant=abc hostname=secret.preview.example"))
assert.deepEqual(accessLeak, { status: 503, body: { error: "preview_access_unavailable" } })
assert.equal(JSON.stringify(accessLeak).includes("grant=abc"), false)

const leaks = [
  "Bearer tok_live_not_a_real_secret",
  "x-vercel-protection-bypass=bypass_secret_value",
  "https://runtime.internal.example/v2/next-builds",
  "sajtagent-next-artifacts.vercel.app",
  "customer source export default function Page",
  "    at StaticNextDeployer.deploy (next-preview-deployer.ts:58:13)",
  '{"error":{"message":"Vercel API exploded","missingValue":"secret"}}',
]
const unknown = nextBuildFailureResponse(new Error(leaks.join(" | ")))
assert.deepEqual(unknown, { status: 503, body: { error: "next_build_failed" } })
assert.equal("reason" in unknown.body, false)
const serialized = JSON.stringify(unknown)
for (const leak of leaks) assert.equal(serialized.includes(leak), false)
assert.equal(isNextBuildFailureReason("next_build_failed"), false)
assert.equal(isNextBuildFailureReason("vercel_api_failed"), false)

const here = dirname(fileURLToPath(import.meta.url))
const route = readFileSync(resolve(here, "../app/api/siteagent/projects/[projectId]/next/route.ts"), "utf8")
assert.match(route, /nextBuildFailureResponse\(error\)/)
assert.doesNotMatch(route, /json\([^)]*error\.message/)
assert.match(route, /isNextPreviewUnavailableError\(error\)\) return json\(404,\{error:"next_preview_unavailable"\}\)/)

console.log("Next build failure mapping: classified reasons, HTTP statuses and no-leak fallback passed (local, not live E2E).")
