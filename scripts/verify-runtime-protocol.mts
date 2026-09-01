import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import {
  ReadyRuntimeHealthV1Schema,
  runtimeSignaturePayloadV1,
} from "../lib/siteagent/server/runtime-protocol-v1.ts"

const body = JSON.stringify({ schemaVersion: 1, jobId: "job:test" })
const bodyHash = createHash("sha256").update(body).digest("hex")
assert.equal(
  runtimeSignaturePayloadV1(
    "post",
    "/v1/build-jobs",
    "2026-09-01T12:00:00.000Z",
    "nonce:test",
    body,
  ),
  [
    "siteagent-runtime-v1",
    "2026-09-01T12:00:00.000Z",
    "nonce:test",
    "POST",
    "/v1/build-jobs",
    bodyHash,
  ].join("\n"),
)

assert.equal(
  ReadyRuntimeHealthV1Schema.safeParse({
    mode: "openclaw-gateway",
    openClawConnected: true,
    openClawVersion: "2026.8.2",
    signedJobsEnabled: true,
  }).success,
  true,
)
for (const health of [
  {
    mode: "local-harness",
    openClawConnected: true,
    openClawVersion: "2026.8.2",
    signedJobsEnabled: true,
  },
  {
    mode: "openclaw-gateway",
    openClawConnected: false,
    openClawVersion: "2026.8.2",
    signedJobsEnabled: true,
  },
  {
    mode: "openclaw-gateway",
    openClawConnected: true,
    openClawVersion: "2026.8.2",
    signedJobsEnabled: false,
  },
]) {
  assert.equal(ReadyRuntimeHealthV1Schema.safeParse(health).success, false)
}

console.log("Runtime protocol: PASS (signature bytes and fail-closed health gate)")
