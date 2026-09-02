import "server-only"

import { createHash, createHmac, randomUUID } from "node:crypto"

import { z } from "zod"

import {
  ARTIFACT_READ_CONTRACT_VERSION_V1,
  ARTIFACT_READ_PATH_V1,
  ArtifactReadRequestV1Schema,
  MAX_ARTIFACT_READ_REQUEST_BYTES_V1,
  MAX_ARTIFACT_READ_RESPONSE_BYTES_V1,
  MAX_PREVIEW_ARTIFACT_BYTES_V1,
  validateArtifactReadResponseV1,
  type ArtifactReadRequestV1,
} from "../../../contracts/artifact-read-v1.ts"
import type {
  CandidateArtifactReaderV1,
  LoadedCandidatePreviewV1,
  WorkerCandidateReportV1,
} from "./candidate-acceptance.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"
import type { BuildJobV1 } from "../../../contracts/builder-v1.ts"
import { runtimeSignaturePayloadV1 } from "./runtime-protocol-v1.ts"

const HEALTH_PATH_V1 = "/health"
const MAX_RUNTIME_HEALTH_BYTES_V1 = 64 * 1024
export const RUNTIME_HEALTH_TIMEOUT_MS_V1 = 5_000
export const ARTIFACT_READ_TIMEOUT_MS_V1 = 30_000

const RuntimeHealthReasonV1Schema = z.string().trim().min(1).max(2_000)

/**
 * This is the complete health shape emitted by the ratified Runtime commit.
 * Strict parsing deliberately turns any unreviewed health drift into a closed
 * dispatch gate.
 */
export const ReadyArtifactReadRuntimeHealthV1Schema = z
  .object({
    service: z.literal("sajtagent-sprites-runtime"),
    mode: z.literal("openclaw-gateway"),
    openClawConnected: z.literal(true),
    openClawVersion: z.string().trim().min(1).max(160),
    openClawReason: RuntimeHealthReasonV1Schema.optional(),
    signedJobsEnabled: z.literal(true),
    agentSessionContractVersion: z.literal(1),
    agentTurnStreamTransport: z.literal("sse"),
    agentTurnStreamEnabled: z.boolean(),
    agentTurnCapabilities: z.union([
      z.tuple([z.literal("conversation.respond")]),
      z.tuple([
        z.literal("conversation.respond"),
        z.literal("build.request"),
      ]),
    ]),
    artifactReadContractVersion: z.literal(
      ARTIFACT_READ_CONTRACT_VERSION_V1,
    ),
    artifactReadEnabled: z.literal(true),
  })
  .strict()

type FetchV1 = typeof globalThis.fetch

type RuntimeArtifactReaderOptionsV1 = {
  fetch?: FetchV1
  now?: () => Date
  createNonce?: () => string
  healthTimeoutMs?: number
  artifactReadTimeoutMs?: number
}

function isAllowedRuntimeUrl(url: URL): boolean {
  if (url.username || url.password || url.search || url.hash) return false
  if (url.protocol === "https:") return true
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
  )
}

function timeoutValue(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 60_000) {
    throw new Error(`${name} must be an integer between 1 and 60000 ms`)
  }
  return value
}

function hasNoStore(response: Response): boolean {
  return (response.headers.get("cache-control") ?? "")
    .toLowerCase()
    .split(",")
    .map((part) => part.trim())
    .includes("no-store")
}

function assertPrivateJsonResponseV1(
  response: Response,
  endpoint: URL,
): void {
  if (response.redirected) throw new Error("runtime_redirect_forbidden")
  if (response.url && response.url !== endpoint.href) {
    throw new Error("runtime_response_endpoint_mismatch")
  }
  if (
    !/^application\/json;\s*charset=utf-8$/i.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    throw new Error("runtime_response_content_type_invalid")
  }
  if (!hasNoStore(response)) {
    throw new Error("runtime_response_not_no_store")
  }
  if (response.headers.get("access-control-allow-origin") !== null) {
    throw new Error("runtime_private_response_exposes_cors")
  }
  if (
    (response.headers.get("x-content-type-options") ?? "").toLowerCase() !==
    "nosniff"
  ) {
    throw new Error("runtime_response_missing_nosniff")
  }
  if (response.headers.has("content-encoding")) {
    throw new Error("runtime_response_encoding_forbidden")
  }
}

function declaredContentLengthV1(
  response: Response,
  maxBytes: number,
  required: boolean,
): number | null {
  const value = response.headers.get("content-length")
  if (value === null) {
    if (required) throw new Error("runtime_response_content_length_missing")
    return null
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("runtime_response_content_length_invalid")
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maxBytes) {
    throw new Error("runtime_response_too_large")
  }
  return parsed
}

async function readBoundedBytesV1(
  response: Response,
  maxBytes: number,
  requireContentLength: boolean,
): Promise<Uint8Array> {
  const declaredLength = declaredContentLengthV1(
    response,
    maxBytes,
    requireContentLength,
  )
  if (!response.body) throw new Error("runtime_response_body_missing")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error("runtime_response_too_large")
    }
    chunks.push(value)
  }
  if (declaredLength !== null && size !== declaredLength) {
    throw new Error("runtime_response_content_length_mismatch")
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function parseJsonBytesV1(bytes: Uint8Array): unknown {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("runtime_response_invalid_utf8")
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error("runtime_response_invalid_json")
  }
}

function hasHtmlDocumentV1(bytes: Uint8Array): boolean {
  try {
    const html = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .toLowerCase()
    return html.includes("<!doctype html") || html.includes("<html")
  } catch {
    return false
  }
}

function createReadRequestV1(input: {
  principal: BuildPrincipalV1
  job: BuildJobV1
  report: WorkerCandidateReportV1
  sourceRef: string
  maxBytes: number
}): ArtifactReadRequestV1 {
  const { principal, job, report, sourceRef, maxBytes } = input
  if (
    principal.tenantId !== job.tenantId ||
    report.jobId !== job.jobId ||
    report.baseRevisionId !== job.baseRevisionId
  ) {
    throw new Error("artifact_read_binding_mismatch")
  }
  const previewArtifacts = report.artifacts.filter(
    (artifact) => artifact.kind === "preview" && artifact.ref === sourceRef,
  )
  const preview = previewArtifacts[0]
  if (
    previewArtifacts.length !== 1 ||
    !preview ||
    preview.mediaType !== "text/html" ||
    !preview.sha256
  ) {
    throw new Error("artifact_read_preview_mismatch")
  }

  const binding = {
    tenantId: job.tenantId,
    projectId: job.projectId,
    jobId: job.jobId,
    baseRevisionId: job.baseRevisionId,
    sourceRunId: report.sourceRunId,
    candidateRevisionId: report.candidateRevisionId,
    reportedAt: report.reportedAt,
  }
  const artifact = {
    kind: "preview" as const,
    ref: preview.ref,
    mediaType: "text/html" as const,
    sha256: preview.sha256,
  }
  const readIdempotencyKey = `artifact-read:${createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: ARTIFACT_READ_CONTRACT_VERSION_V1,
        binding,
        artifact,
        maxBytes,
      }),
    )
    .digest("hex")}`

  return ArtifactReadRequestV1Schema.parse({
    schemaVersion: ARTIFACT_READ_CONTRACT_VERSION_V1,
    readIdempotencyKey,
    binding,
    artifact,
    maxBytes,
  })
}

export class SignedRuntimeArtifactReaderV1
  implements CandidateArtifactReaderV1
{
  private readonly endpoint: URL
  private readonly healthEndpoint: URL
  private readonly signingKey: string
  private readonly fetchImpl: FetchV1
  private readonly now: () => Date
  private readonly createNonce: () => string
  private readonly healthTimeoutMs: number
  private readonly artifactReadTimeoutMs: number

  constructor(
    baseUrl: string,
    signingKey: string,
    options: RuntimeArtifactReaderOptionsV1 = {},
  ) {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
    if (!isAllowedRuntimeUrl(base)) {
      throw new Error("Runtime URL must use HTTPS or loopback HTTP without credentials or query")
    }
    if (signingKey.length < 32) {
      throw new Error("Runtime signing key must contain at least 32 characters")
    }
    this.endpoint = new URL(ARTIFACT_READ_PATH_V1, base)
    this.healthEndpoint = new URL(HEALTH_PATH_V1, base)
    this.signingKey = signingKey
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.createNonce = options.createNonce ?? randomUUID
    this.healthTimeoutMs = timeoutValue(
      options.healthTimeoutMs ?? RUNTIME_HEALTH_TIMEOUT_MS_V1,
      "healthTimeoutMs",
    )
    this.artifactReadTimeoutMs = timeoutValue(
      options.artifactReadTimeoutMs ?? ARTIFACT_READ_TIMEOUT_MS_V1,
      "artifactReadTimeoutMs",
    )
  }

  async isRuntimeReady(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.healthEndpoint, {
        method: "GET",
        headers: {
          accept: "application/json",
          "accept-encoding": "identity",
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(this.healthTimeoutMs),
      })
      if (response.status !== 200) return false
      assertPrivateJsonResponseV1(response, this.healthEndpoint)
      const bytes = await readBoundedBytesV1(
        response,
        MAX_RUNTIME_HEALTH_BYTES_V1,
        false,
      )
      return ReadyArtifactReadRuntimeHealthV1Schema.safeParse(
        parseJsonBytesV1(bytes),
      ).success
    } catch {
      return false
    }
  }

  async readPreviewArtifact(input: {
    principal: BuildPrincipalV1
    job: BuildJobV1
    report: WorkerCandidateReportV1
    sourceRef: string
    maxBytes: number
  }): Promise<LoadedCandidatePreviewV1> {
    const request = createReadRequestV1(input)
    const body = JSON.stringify(request)
    if (Buffer.byteLength(body, "utf8") > MAX_ARTIFACT_READ_REQUEST_BYTES_V1) {
      throw new Error("artifact_read_request_too_large")
    }
    const timestamp = this.now().toISOString()
    const nonce = this.createNonce()
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(nonce)) {
      throw new Error("artifact_read_nonce_invalid")
    }
    const signature = createHmac("sha256", this.signingKey)
      .update(
        runtimeSignaturePayloadV1(
          "POST",
          this.endpoint.pathname,
          timestamp,
          nonce,
          body,
        ),
      )
      .digest("hex")
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "accept-encoding": "identity",
        "content-type": "application/json",
        "x-siteagent-timestamp": timestamp,
        "x-siteagent-nonce": nonce,
        "x-siteagent-signature": signature,
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(this.artifactReadTimeoutMs),
    })
    if (response.status !== 200) {
      throw new Error(`Artifact read failed (HTTP ${response.status})`)
    }
    assertPrivateJsonResponseV1(response, this.endpoint)
    const responseBytes = await readBoundedBytesV1(
      response,
      MAX_ARTIFACT_READ_RESPONSE_BYTES_V1,
      true,
    )
    const validated = validateArtifactReadResponseV1(
      request,
      parseJsonBytesV1(responseBytes),
    )
    if (!validated.success) {
      throw new Error(`Artifact read response invalid: ${validated.error}`)
    }
    const artifact = validated.response.artifact
    const bytes = Buffer.from(artifact.bytesBase64, "base64")
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    if (
      artifact.ref !== input.sourceRef ||
      artifact.mediaType !== "text/html" ||
      artifact.encoding !== "base64" ||
      artifact.sizeBytes !== bytes.byteLength ||
      bytes.byteLength < 1 ||
      bytes.byteLength > input.maxBytes ||
      bytes.byteLength > MAX_PREVIEW_ARTIFACT_BYTES_V1 ||
      artifact.sha256 !== sha256 ||
      !hasHtmlDocumentV1(bytes)
    ) {
      throw new Error("Artifact read bytes failed Site verification")
    }

    return {
      sourceRef: artifact.ref,
      relativePath: artifact.relativePath,
      mediaType: artifact.mediaType,
      sha256,
      sizeBytes: bytes.byteLength,
      bytes: Uint8Array.from(bytes),
    }
  }
}

export function createRuntimeArtifactReaderFromEnvV1(
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeArtifactReaderOptionsV1 = {},
): SignedRuntimeArtifactReaderV1 | null {
  const baseUrl = env.SITEAGENT_RUNTIME_URL?.trim()
  const signingKey = env.SITEAGENT_RUNTIME_SIGNING_KEY?.trim()
  if (!baseUrl && !signingKey) return null
  if (!baseUrl || !signingKey) {
    throw new Error(
      "SITEAGENT_RUNTIME_URL and SITEAGENT_RUNTIME_SIGNING_KEY must be configured together",
    )
  }
  return new SignedRuntimeArtifactReaderV1(baseUrl, signingKey, options)
}
