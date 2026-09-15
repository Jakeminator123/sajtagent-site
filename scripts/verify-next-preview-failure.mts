import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ZodError } from "zod"
import {
  NEXT_BUILD_FAILURE_REASONS,
  NEXT_BUILD_FAILURE_STATUS,
  isNextBuildFailureReason,
  nextBuildFailureResponse,
} from "../lib/siteagent/server/next-preview-failure.ts"

const INTERNAL_CASES = [
  ["deployment_bytes_mismatch", 422, "deployment_bytes_mismatch"],
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
  ["preview_protection_required", 422, "configuration_missing"],
  ["invalid_next_runtime_config", 422, "configuration_missing"],
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
assert.deepEqual(nextBuildFailureResponse(new Error("invalid_source_path")), { status: 400, body: { error: "next_build_failed" } })
assert.deepEqual(nextBuildFailureResponse(new ZodError([])), { status: 400, body: { error: "next_build_failed" } })

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
