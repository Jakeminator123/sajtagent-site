import "server-only"

import { createHmac, randomUUID } from "node:crypto"

import { z } from "zod"

import {
  AGENT_PROFILE_ACTIVATION_PATH_V1,
  MAX_AGENT_PROFILE_ACTIVATION_REQUEST_BYTES_V1,
  AgentProfileActivationConflictCodeV1Schema,
  AgentProfileActivationProjectionV1Schema,
  AgentProfileActivationReceiptV1Schema,
  AgentProfileActivationRequestV1Schema,
  type AgentProfileActivationConflictCodeV1,
  type AgentProfileActivationProjectionV1,
} from "../../../contracts/agent-profile-activation-v1.ts"
import {
  AgentProfileCompileProjectionV1Schema,
  EffectiveAgentPolicyV1Schema,
  type AgentProfileCompileProjectionV1,
  type AgentProfileV1,
} from "../../../contracts/agent-profile-v1.ts"
import { runtimeSignaturePayloadV1 } from "./runtime-protocol-v1.ts"

const HEALTH_PATH_V1 = "/health"
const COMPILE_PATH_V1 = "/v1/agent-profiles/compile"
const MAX_RUNTIME_RESPONSE_BYTES_V1 = 512 * 1024
const RUNTIME_TIMEOUT_MS_V1 = 5_000

const AgentProfileRuntimeHealthV1Schema = z
  .object({
    service: z.literal("sajtagent-sprites-runtime"),
    mode: z.enum(["openclaw-gateway", "fail-closed"]),
    signedJobsEnabled: z.literal(true),
  })
  .passthrough()

const RuntimeProfileCompileResponseV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    effectivePolicy: EffectiveAgentPolicyV1Schema,
  })
  .passthrough()

const RuntimeProfileActivationErrorV1Schema = z
  .object({
    error: AgentProfileActivationConflictCodeV1Schema,
    message: z.string().min(1).max(500),
    activeRevision: z.number().int().positive().optional(),
  })
  .strict()

type FetchV1 = typeof globalThis.fetch

export class AgentProfileActivationConflictV1 extends Error {
  readonly code: AgentProfileActivationConflictCodeV1
  readonly activeRevision?: number

  constructor(
    code: AgentProfileActivationConflictCodeV1,
    message: string,
    activeRevision?: number,
  ) {
    super(message)
    this.name = "AgentProfileActivationConflictV1"
    this.code = code
    this.activeRevision = activeRevision
  }
}

export class AgentProfileActivationPayloadTooLargeV1 extends Error {
  constructor() {
    super("runtime_profile_activation_payload_too_large")
    this.name = "AgentProfileActivationPayloadTooLargeV1"
  }
}

function isAllowedRuntimeUrl(url: URL): boolean {
  if (url.username || url.password || url.search || url.hash) return false
  if (url.protocol === "https:") return true
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
  )
}

function assertPrivateRuntimeResponse(response: Response, endpoint: URL): void {
  if (response.redirected || (response.url && response.url !== endpoint.href)) {
    throw new Error("runtime_response_endpoint_mismatch")
  }
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get("content-type") ?? "")) {
    throw new Error("runtime_response_content_type_invalid")
  }
  const cacheControl = (response.headers.get("cache-control") ?? "").toLowerCase()
  if (!cacheControl.split(",").map((part) => part.trim()).includes("no-store")) {
    throw new Error("runtime_response_not_no_store")
  }
  if (response.headers.get("access-control-allow-origin") !== null) {
    throw new Error("runtime_private_response_exposes_cors")
  }
  if ((response.headers.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") {
    throw new Error("runtime_response_missing_nosniff")
  }
}

async function readBoundedJsonV1(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length")
  if (declared && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAX_RUNTIME_RESPONSE_BYTES_V1)) {
    throw new Error("runtime_response_too_large")
  }
  const declaredLength = declared === null ? null : Number(declared)
  if (!response.body) throw new Error("runtime_response_body_missing")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_RUNTIME_RESPONSE_BYTES_V1) {
      await reader.cancel()
      throw new Error("runtime_response_too_large")
    }
    chunks.push(value)
  }
  if (declaredLength !== null && size !== declaredLength) {
    throw new Error("runtime_response_content_length_mismatch")
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new Error("runtime_response_invalid_json")
  }
}

export class SignedAgentProfileRuntimeClientV1 {
  private readonly healthEndpoint: URL
  private readonly compileEndpoint: URL
  private readonly activateEndpoint: URL
  private readonly signingKey: string
  private readonly fetchImpl: FetchV1
  private readonly now: () => Date
  private readonly createNonce: () => string
  private readonly createActivationId: () => string
  private readonly createIdempotencyKey: () => string

  constructor(
    baseUrl: string,
    signingKey: string,
    options: {
      fetch?: FetchV1
      now?: () => Date
      createNonce?: () => string
      createActivationId?: () => string
      createIdempotencyKey?: () => string
    } = {},
  ) {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
    this.healthEndpoint = new URL(HEALTH_PATH_V1, normalizedBase)
    this.compileEndpoint = new URL(COMPILE_PATH_V1, normalizedBase)
    this.activateEndpoint = new URL(AGENT_PROFILE_ACTIVATION_PATH_V1, normalizedBase)
    if (
      !isAllowedRuntimeUrl(this.compileEndpoint) ||
      !isAllowedRuntimeUrl(this.activateEndpoint)
    ) {
      throw new Error("Runtime URL must use HTTPS or loopback HTTP")
    }
    if (signingKey.length < 32) {
      throw new Error("Runtime signing key must contain at least 32 characters")
    }
    this.signingKey = signingKey
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.createNonce = options.createNonce ?? randomUUID
    this.createActivationId = options.createActivationId ?? randomUUID
    this.createIdempotencyKey = options.createIdempotencyKey ?? randomUUID
  }

  async compile(profile: AgentProfileV1): Promise<AgentProfileCompileProjectionV1> {
    const healthResponse = await this.fetchImpl(this.healthEndpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(RUNTIME_TIMEOUT_MS_V1),
    })
    assertPrivateRuntimeResponse(healthResponse, this.healthEndpoint)
    if (healthResponse.status !== 200) throw new Error("runtime_health_unavailable")
    const health = AgentProfileRuntimeHealthV1Schema.parse(
      await readBoundedJsonV1(healthResponse),
    )

    const body = JSON.stringify({ profile })
    const timestamp = this.now().toISOString()
    const nonce = this.createNonce()
    const signature = createHmac("sha256", this.signingKey)
      .update(
        runtimeSignaturePayloadV1(
          "POST",
          this.compileEndpoint.pathname,
          timestamp,
          nonce,
          body,
        ),
      )
      .digest("hex")
    const response = await this.fetchImpl(this.compileEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-siteagent-timestamp": timestamp,
        "x-siteagent-nonce": nonce,
        "x-siteagent-signature": signature,
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(RUNTIME_TIMEOUT_MS_V1),
    })
    assertPrivateRuntimeResponse(response, this.compileEndpoint)
    if (response.status !== 200) throw new Error("runtime_profile_compile_failed")
    const compiled = RuntimeProfileCompileResponseV1Schema.parse(
      await readBoundedJsonV1(response),
    )

    return AgentProfileCompileProjectionV1Schema.parse({
      schemaVersion: 1,
      compiled: true,
      runtime: { service: health.service, mode: health.mode },
      capabilityCount: compiled.effectivePolicy.capabilities.length,
      findingCount: compiled.effectivePolicy.findings.length,
    })
  }

  async activate(
    profile: AgentProfileV1,
    expectedActiveRevision?: number,
  ): Promise<AgentProfileActivationProjectionV1> {
    const requestedAt = this.now().toISOString()
    const activationRequest = AgentProfileActivationRequestV1Schema.parse({
      schemaVersion: 1,
      activationId: this.createActivationId(),
      idempotencyKey: this.createIdempotencyKey(),
      requestedAt,
      ...(expectedActiveRevision === undefined ? {} : { expectedActiveRevision }),
      profile,
    })
    const body = JSON.stringify(activationRequest)
    if (
      new TextEncoder().encode(body).byteLength >
      MAX_AGENT_PROFILE_ACTIVATION_REQUEST_BYTES_V1
    ) {
      throw new AgentProfileActivationPayloadTooLargeV1()
    }
    const nonce = this.createNonce()
    const signature = createHmac("sha256", this.signingKey)
      .update(
        runtimeSignaturePayloadV1(
          "POST",
          this.activateEndpoint.pathname,
          requestedAt,
          nonce,
          body,
        ),
      )
      .digest("hex")
    const response = await this.fetchImpl(this.activateEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-siteagent-timestamp": requestedAt,
        "x-siteagent-nonce": nonce,
        "x-siteagent-signature": signature,
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(RUNTIME_TIMEOUT_MS_V1),
    })
    assertPrivateRuntimeResponse(response, this.activateEndpoint)
    const responseBody = await readBoundedJsonV1(response)

    if (response.status === 409) {
      const conflict = RuntimeProfileActivationErrorV1Schema.parse(responseBody)
      throw new AgentProfileActivationConflictV1(
        conflict.error,
        conflict.message,
        conflict.activeRevision,
      )
    }
    if (response.status !== 200) {
      throw new Error("runtime_profile_activation_failed")
    }

    const receipt = AgentProfileActivationReceiptV1Schema.parse(responseBody)
    return AgentProfileActivationProjectionV1Schema.parse({
      schemaVersion: receipt.schemaVersion,
      activated: receipt.activated,
      profileId: receipt.profileId,
      revision: receipt.revision,
      activatedAt: receipt.activatedAt,
      activationId: receipt.activationId,
      bundleSha256: receipt.bundleSha256,
      takesEffect: receipt.takesEffect,
      capabilityCount: receipt.effectivePolicy.capabilities.length,
      findingCount: receipt.effectivePolicy.findings.length,
      runtime: receipt.runtime,
    })
  }
}

export function createAgentProfileRuntimeClientFromEnvV1(
  env: NodeJS.ProcessEnv = process.env,
): SignedAgentProfileRuntimeClientV1 | null {
  const baseUrl = env.SITEAGENT_RUNTIME_URL?.trim()
  const signingKey = env.SITEAGENT_RUNTIME_SIGNING_KEY?.trim()
  if (!baseUrl && !signingKey) return null
  if (!baseUrl || !signingKey) {
    throw new Error(
      "SITEAGENT_RUNTIME_URL and SITEAGENT_RUNTIME_SIGNING_KEY must be configured together",
    )
  }
  return new SignedAgentProfileRuntimeClientV1(baseUrl, signingKey)
}
