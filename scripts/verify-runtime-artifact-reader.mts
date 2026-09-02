import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { register } from "node:module"

import {
  ArtifactReadRequestV1Schema,
  MAX_ARTIFACT_READ_REQUEST_BYTES_V1,
  MAX_ARTIFACT_READ_RESPONSE_BYTES_V1,
  MAX_PREVIEW_ARTIFACT_BYTES_V1,
} from "../contracts/artifact-read-v1.ts"
import {
  BuildJobV1Schema,
  WorkerCandidateReportV1Schema,
  WorkerFailureReportV1Schema,
} from "../contracts/builder-v1.ts"
import { runtimeSignaturePayloadV1 } from "../lib/siteagent/server/runtime-protocol-v1.ts"

register("./server-only-test-hook.mjs", import.meta.url)

const {
  ReadyArtifactReadRuntimeHealthV1Schema,
  SignedRuntimeArtifactReaderV1,
  createRuntimeArtifactReaderFromEnvV1,
} = await import("../lib/siteagent/server/runtime-artifact-reader.ts")
const { SignedBuildRuntimeClientV1 } = await import(
  "../lib/siteagent/server/runtime-client.ts"
)

const signingKey = "artifact-reader-test-key-at-least-32-bytes"
const timestamp = "2026-09-01T12:00:00.000Z"
const nonce = "nonce:artifact-reader-test-0001"
const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant:one",
}
const htmlBytes = Buffer.from(
  "<!doctype html><html><body>Verifierad artifact read</body></html>",
  "utf8",
)
const htmlSha256 = createHash("sha256").update(htmlBytes).digest("hex")
const sourceRef =
  "sprite-worktree:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:index.html"

const job = BuildJobV1Schema.parse({
  schemaVersion: 1,
  jobId: "job:artifact-reader",
  tenantId: principal.tenantId,
  projectId: "project:one",
  baseRevisionId: "revision:base",
  idempotencyKey: "idempotency:artifact-reader",
  createdAt: timestamp,
  expiresAt: "2026-09-01T12:10:00.000Z",
  intent: {
    schemaVersion: 1,
    intentType: "site.change",
    message: "Verifiera den privata previewn",
    context: {},
  },
  executionPolicy: {
    deadlineAt: "2026-09-01T12:05:00.000Z",
    maxSteps: 20,
    maxToolCalls: 50,
    maxModelTokens: 20_000,
    maxCostMicros: 0,
    capabilities: ["workspace.read", "preview.manage"],
    network: { mode: "deny-all" },
    packages: { mode: "deny" },
  },
})

const report = WorkerCandidateReportV1Schema.parse({
  schemaVersion: 1,
  status: "candidate",
  jobId: job.jobId,
  sourceRunId: "openclaw:artifact-reader",
  baseRevisionId: job.baseRevisionId,
  candidateRevisionId: `revision:sha256:${"3".repeat(64)}`,
  changedPaths: ["index.html"],
  artifacts: [
    {
      kind: "preview",
      ref: sourceRef,
      mediaType: "text/html",
      sha256: htmlSha256,
    },
  ],
  receipts: [],
  diagnostics: [],
  reportedAt: timestamp,
})

function failureReport(
  status: "failed" | "cancelled" | "timed_out",
  code: string,
  binding: { jobId?: string; baseRevisionId?: string } = {},
) {
  return WorkerFailureReportV1Schema.parse({
    schemaVersion: 1,
    status,
    jobId: binding.jobId ?? job.jobId,
    sourceRunId: `openclaw:${code}`,
    baseRevisionId: binding.baseRevisionId ?? job.baseRevisionId,
    receipts: [],
    diagnostics: [{ code, message: `Runtime diagnostic: ${code}`, retryable: true }],
    reportedAt: timestamp,
  })
}

const readyHealth = {
  service: "sajtagent-sprites-runtime",
  mode: "openclaw-gateway",
  openClawConnected: true,
  openClawVersion: "runtime-test-v1",
  signedJobsEnabled: true,
  agentSessionContractVersion: 1,
  agentTurnStreamTransport: "sse",
  agentTurnStreamEnabled: true,
  agentTurnCapabilities: ["conversation.respond"],
  artifactReadContractVersion: 1,
  artifactReadEnabled: true,
}

function privateJsonResponse(
  value: unknown,
  options: {
    status?: number
    headers?: Record<string, string>
    omitContentLength?: boolean
  } = {},
): Response {
  const body = JSON.stringify(value)
  return new Response(body, {
    status: options.status ?? 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...(options.omitContentLength
        ? {}
        : { "content-length": String(Buffer.byteLength(body, "utf8")) }),
      ...options.headers,
    },
  })
}

function runtimeClientWithBuildResponse(buildResponse: () => Response) {
  return new SignedBuildRuntimeClientV1(
    "https://runtime.example",
    signingKey,
    {
      now: () => new Date(timestamp),
      createNonce: () => nonce,
      fetch: (async (input, init) => {
        assert.equal(init?.redirect, "error")
        return String(input).endsWith("/health")
          ? privateJsonResponse(readyHealth)
          : buildResponse()
      }) as typeof fetch,
    },
  )
}

function artifactResponseFromRequest(
  body: string,
  bytes = htmlBytes,
): Record<string, unknown> {
  const request = ArtifactReadRequestV1Schema.parse(JSON.parse(body))
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  return {
    schemaVersion: 1,
    readIdempotencyKey: request.readIdempotencyKey,
    binding: request.binding,
    maxBytes: request.maxBytes,
    artifact: {
      ...request.artifact,
      sha256,
      relativePath: "index.html",
      sizeBytes: bytes.byteLength,
      encoding: "base64",
      bytesBase64: bytes.toString("base64"),
    },
  }
}

const assertions: string[] = []
function passed(name: string): void {
  assertions.push(name)
}

{
  let healthInit: RequestInit | undefined
  const reader = new SignedRuntimeArtifactReaderV1(
    "https://runtime.example",
    signingKey,
    {
      fetch: (async (_input, init) => {
        healthInit = init
        return privateJsonResponse(readyHealth)
      }) as typeof fetch,
    },
  )
  assert.equal(await reader.isRuntimeReady(), true)
  assert.equal(healthInit?.method, "GET")
  assert.equal(healthInit?.redirect, "error")
  assert.equal(healthInit?.cache, "no-store")
  assert(healthInit?.signal)
  assert.equal(
    ReadyArtifactReadRuntimeHealthV1Schema.safeParse({
      ...readyHealth,
      unexpected: true,
    }).success,
    false,
  )
  passed("strict no-store health opens the capability with redirects disabled")
}

for (const [name, response] of [
  [
    "disabled capability",
    privateJsonResponse({ ...readyHealth, artifactReadEnabled: false }),
  ],
  [
    "unratified version",
    privateJsonResponse({ ...readyHealth, artifactReadContractVersion: 2 }),
  ],
  [
    "unexpected health field",
    privateJsonResponse({ ...readyHealth, unexpected: true }),
  ],
  [
    "cacheable health",
    privateJsonResponse(readyHealth, {
      headers: { "cache-control": "max-age=60" },
    }),
  ],
  [
    "redirect health",
    privateJsonResponse(readyHealth, {
      status: 302,
      headers: { location: "https://attacker.example/health" },
    }),
  ],
  ["non-200 success health", privateJsonResponse(readyHealth, { status: 201 })],
] as const) {
  const reader = new SignedRuntimeArtifactReaderV1(
    "https://runtime.example",
    signingKey,
    { fetch: (async () => response) as typeof fetch },
  )
  assert.equal(await reader.isRuntimeReady(), false, name)
}
passed("health drift, disabled capability, cacheability and redirects fail closed")

{
  let readInit: RequestInit | undefined
  const reader = new SignedRuntimeArtifactReaderV1(
    "https://runtime.example",
    signingKey,
    {
      now: () => new Date(timestamp),
      createNonce: () => nonce,
      fetch: (async (_input, init) => {
        readInit = init
        const requestBody = init?.body
        if (typeof requestBody !== "string") {
          throw new Error("expected string request body")
        }
        return privateJsonResponse(artifactResponseFromRequest(requestBody))
      }) as typeof fetch,
    },
  )
  const loaded = await reader.readPreviewArtifact({
    principal,
    job,
    report,
    sourceRef,
    maxBytes: MAX_PREVIEW_ARTIFACT_BYTES_V1,
  })
  const body = String(readInit?.body)
  const headers = new Headers(readInit?.headers)
  assert(Buffer.byteLength(body, "utf8") <= MAX_ARTIFACT_READ_REQUEST_BYTES_V1)
  assert.equal(readInit?.method, "POST")
  assert.equal(readInit?.redirect, "error")
  assert.equal(readInit?.cache, "no-store")
  assert(readInit?.signal)
  assert.equal(headers.get("x-siteagent-timestamp"), timestamp)
  assert.equal(headers.get("x-siteagent-nonce"), nonce)
  assert.equal(
    headers.get("x-siteagent-signature"),
    createHmac("sha256", signingKey)
      .update(
        runtimeSignaturePayloadV1(
          "POST",
          "/v1/artifacts/read",
          timestamp,
          nonce,
          body,
        ),
      )
      .digest("hex"),
  )
  assert.equal(loaded.sourceRef, sourceRef)
  assert.equal(loaded.relativePath, "index.html")
  assert.equal(loaded.mediaType, "text/html")
  assert.equal(loaded.sha256, htmlSha256)
  assert.equal(loaded.sizeBytes, htmlBytes.byteLength)
  assert.deepEqual(Buffer.from(loaded.bytes), htmlBytes)
  passed("adapter signs exact request bytes and returns independently verified HTML")
}

async function expectReadFailure(
  responseFactory: (body: string) => Response,
  pattern: RegExp,
  candidateReport = report,
): Promise<void> {
  const reader = new SignedRuntimeArtifactReaderV1(
    "https://runtime.example",
    signingKey,
    {
      now: () => new Date(timestamp),
      createNonce: () => nonce,
      fetch: (async (_input, init) => {
        const requestBody = init?.body
        if (typeof requestBody !== "string") {
          throw new Error("expected string request body")
        }
        return responseFactory(requestBody)
      }) as typeof fetch,
    },
  )
  await assert.rejects(
    reader.readPreviewArtifact({
      principal,
      job,
      report: candidateReport,
      sourceRef,
      maxBytes: MAX_PREVIEW_ARTIFACT_BYTES_V1,
    }),
    pattern,
  )
}

await expectReadFailure((body) => {
  const value = artifactResponseFromRequest(body)
  value.binding = {
    ...(value.binding as Record<string, unknown>),
    projectId: "project:other",
  }
  return privateJsonResponse(value)
}, /exact request binding/)

const nonHtml = Buffer.from("plain text, not a document", "utf8")
const nonHtmlSha256 = createHash("sha256").update(nonHtml).digest("hex")
const nonHtmlReport = WorkerCandidateReportV1Schema.parse({
  ...report,
  artifacts: [{ ...report.artifacts[0], sha256: nonHtmlSha256 }],
})
await expectReadFailure(
  (body) => privateJsonResponse(artifactResponseFromRequest(body, nonHtml)),
  /failed Site verification/,
  nonHtmlReport,
)

await expectReadFailure(
  (body) =>
    privateJsonResponse(artifactResponseFromRequest(body), { status: 201 }),
  /HTTP 201/,
)

await expectReadFailure(
  () =>
    privateJsonResponse({}, {
      headers: {
        "content-length": String(MAX_ARTIFACT_READ_RESPONSE_BYTES_V1 + 1),
      },
    }),
  /runtime_response_too_large/,
)

await expectReadFailure(
  (body) =>
    privateJsonResponse(artifactResponseFromRequest(body), {
      headers: { "cache-control": "public, max-age=60" },
    }),
  /runtime_response_not_no_store/,
)

await expectReadFailure(
  (body) =>
    privateJsonResponse(artifactResponseFromRequest(body), {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  /runtime_response_content_type_invalid/,
)

await expectReadFailure(
  (body) =>
    privateJsonResponse(artifactResponseFromRequest(body), {
      headers: { "access-control-allow-origin": "*" },
    }),
  /runtime_private_response_exposes_cors/,
)
passed("wire cap, headers, binding and HTML all fail closed")

assert.equal(createRuntimeArtifactReaderFromEnvV1({}), null)
assert.throws(
  () =>
    createRuntimeArtifactReaderFromEnvV1({
      SITEAGENT_RUNTIME_URL: "https://runtime.example",
    }),
  /must be configured together/,
)
assert.throws(
  () =>
    createRuntimeArtifactReaderFromEnvV1({
      SITEAGENT_RUNTIME_URL: "https://runtime.example",
      SITEAGENT_RUNTIME_SIGNING_KEY: "short",
    }),
  /at least 32 characters/,
)
assert.throws(
  () => new SignedRuntimeArtifactReaderV1("http://runtime.example", signingKey),
  /HTTPS or loopback HTTP/,
)
assert.doesNotThrow(
  () => new SignedRuntimeArtifactReaderV1("http://[::1]:4317", signingKey),
)
assert.doesNotThrow(
  () => new SignedBuildRuntimeClientV1("http://[::1]:4317", signingKey),
)
passed("server-only configuration rejects unsafe input and accepts IPv6 loopback")

{
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const timeoutMilliseconds: number[] = []
  const client = new SignedBuildRuntimeClientV1(
    "https://runtime.example",
    signingKey,
    {
      now: () => new Date(timestamp),
      createNonce: () => nonce,
      createTimeoutSignal: (milliseconds) => {
        timeoutMilliseconds.push(milliseconds)
        return new AbortController().signal
      },
      fetch: (async (input, init) => {
        const url = String(input)
        calls.push({ url, init })
        return url.endsWith("/health")
          ? privateJsonResponse(readyHealth)
          : privateJsonResponse(report)
      }) as typeof fetch,
    },
  )
  assert.deepEqual(await client.run(job), report)
  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.init?.redirect, "error")
  assert.equal(calls[1]?.init?.redirect, "error")
  assert.deepEqual(timeoutMilliseconds, [
    5_000,
    Date.parse(job.executionPolicy.deadlineAt) - Date.parse(timestamp),
  ])
  assert(timeoutMilliseconds[1]! > 30_000)

  for (const [status, workerReport] of [
    [503, failureReport("failed", "openclaw_gateway_error")],
    [409, failureReport("failed", "idempotency_conflict")],
    [409, failureReport("cancelled", "job_cancelled")],
    [504, failureReport("timed_out", "job_deadline_elapsed")],
  ] as const) {
    const result = await runtimeClientWithBuildResponse(
      () => privateJsonResponse(workerReport, { status }),
    ).run(job)
    assert.deepEqual(result, workerReport)
  }
  passed("signed runtime preserves valid terminal WorkerReports across contract statuses")

  for (const [status, workerReport] of [
    [200, failureReport("failed", "openclaw_gateway_error")],
    [503, report],
    [409, failureReport("failed", "openclaw_gateway_error")],
    [504, failureReport("cancelled", "job_cancelled")],
    [503, failureReport("timed_out", "job_deadline_elapsed")],
  ] as const) {
    await assert.rejects(
      runtimeClientWithBuildResponse(
        () => privateJsonResponse(workerReport, { status }),
      ).run(job),
      /Runtime report\/status mismatch/,
    )
  }

  await assert.rejects(
    runtimeClientWithBuildResponse(
      () => privateJsonResponse(
        failureReport("failed", "openclaw_gateway_error", { jobId: "job:other" }),
        { status: 503 },
      ),
    ).run(job),
    /different job or base revision/,
  )
  await assert.rejects(
    runtimeClientWithBuildResponse(
      () => privateJsonResponse(
        failureReport("failed", "openclaw_gateway_error", {
          baseRevisionId: "revision:other",
        }),
        { status: 503 },
      ),
    ).run(job),
    /different job or base revision/,
  )
  await assert.rejects(
    runtimeClientWithBuildResponse(
      () => new Response("{", { status: 503 }),
    ).run(job),
    /invalid report \(HTTP 503\)/,
  )
  await assert.rejects(
    runtimeClientWithBuildResponse(
      () => privateJsonResponse({ error: "unavailable" }, { status: 503 }),
    ).run(job),
    /invalid report \(HTTP 503\)/,
  )
  await assert.rejects(
    runtimeClientWithBuildResponse(
      () => privateJsonResponse(failureReport("failed", "openclaw_gateway_error"), {
        status: 502,
      }),
    ).run(job),
    /Runtime build job failed \(HTTP 502\)/,
  )
  passed("runtime reports fail closed on status, schema and job-binding mismatches")

  let buildCalls = 0
  const redirectingClient = new SignedBuildRuntimeClientV1(
    "https://runtime.example",
    signingKey,
    {
      now: () => new Date(timestamp),
      createNonce: () => nonce,
      fetch: (async (input, init) => {
        assert.equal(init?.redirect, "error")
        if (String(input).endsWith("/health")) {
          return privateJsonResponse(readyHealth)
        }
        buildCalls += 1
        return privateJsonResponse(report, {
          status: 307,
          headers: { location: "https://attacker.example/v1/build-jobs" },
        })
      }) as typeof fetch,
    },
  )
  await assert.rejects(redirectingClient.run(job), /HTTP 307/)
  assert.equal(buildCalls, 1)
  passed("signed build health and POST both disable and reject redirects")
}

const adapterSource = readFileSync(
  new URL("../lib/siteagent/server/runtime-artifact-reader.ts", import.meta.url),
  "utf8",
)
assert.match(adapterSource, /^import "server-only"/)
assert.doesNotMatch(adapterSource, /NEXT_PUBLIC_/)
passed("adapter is marked server-only and has no public runtime environment key")

console.log(`Runtime artifact reader: PASS (${assertions.length} assertions)`)
for (const name of assertions) console.log(`- ${name}`)
