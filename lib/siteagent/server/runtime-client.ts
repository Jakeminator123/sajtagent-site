import "server-only"

import { createHmac, randomUUID } from "node:crypto"

import {
  WorkerReportV1Schema,
  type BuildJobV1,
  type WorkerReportV1,
} from "../../../contracts/builder-v1.ts"
import type { BuildRuntimeClientV1 } from "./build-job-controller.ts"
import {
  ReadyRuntimeHealthV1Schema,
  runtimeSignaturePayloadV1,
} from "./runtime-protocol-v1.ts"

const RUNTIME_PATH = "/v1/build-jobs"
const HEALTH_PATH = "/health"
type FetchV1 = typeof globalThis.fetch

function isAllowedRuntimeUrl(url: URL): boolean {
  if (url.protocol === "https:") return true
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
  )
}

function assertExactRuntimeEndpoint(response: Response, endpoint: URL): void {
  if (
    response.redirected ||
    (response.url !== "" && response.url !== endpoint.href)
  ) {
    throw new Error("Runtime redirects are forbidden")
  }
}

export class SignedBuildRuntimeClientV1 implements BuildRuntimeClientV1 {
  private readonly endpoint: URL
  private readonly healthEndpoint: URL
  private readonly signingKey: string
  private readonly fetchImpl: FetchV1
  private readonly now: () => Date
  private readonly createNonce: () => string

  constructor(
    baseUrl: string,
    signingKey: string,
    options: {
      fetch?: FetchV1
      now?: () => Date
      createNonce?: () => string
    } = {},
  ) {
    const endpoint = new URL(RUNTIME_PATH, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
    if (!isAllowedRuntimeUrl(endpoint)) {
      throw new Error("Runtime URL must use HTTPS or loopback HTTP")
    }
    if (signingKey.length < 32) {
      throw new Error("Runtime signing key must contain at least 32 characters")
    }
    this.endpoint = endpoint
    this.healthEndpoint = new URL(HEALTH_PATH, endpoint)
    this.signingKey = signingKey
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.createNonce = options.createNonce ?? randomUUID
  }

  async run(job: BuildJobV1): Promise<WorkerReportV1> {
    const healthResponse = await this.fetchImpl(this.healthEndpoint, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
    assertExactRuntimeEndpoint(healthResponse, this.healthEndpoint)
    if (healthResponse.status !== 200) {
      throw new Error(`Runtime health check failed (HTTP ${healthResponse.status})`)
    }
    const health = ReadyRuntimeHealthV1Schema.safeParse(
      await healthResponse.json() as unknown,
    )
    if (!health.success) {
      throw new Error("Runtime is not ready for signed OpenClaw jobs")
    }

    const body = JSON.stringify(job)
    const timestamp = this.now().toISOString()
    const nonce = this.createNonce()
    const signature = createHmac("sha256", this.signingKey)
      .update(runtimeSignaturePayloadV1("POST", this.endpoint.pathname, timestamp, nonce, body))
      .digest("hex")
    const remainingMs = Date.parse(job.executionPolicy.deadlineAt) - this.now().getTime()
    if (remainingMs <= 0) throw new Error("Build job deadline has expired")
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-siteagent-timestamp": timestamp,
        "x-siteagent-nonce": nonce,
        "x-siteagent-signature": signature,
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(remainingMs, 30_000)),
    })
    assertExactRuntimeEndpoint(response, this.endpoint)
    if (response.status !== 200) {
      throw new Error(`Runtime build job failed (HTTP ${response.status})`)
    }
    const value = await response.json() as unknown
    const parsed = WorkerReportV1Schema.safeParse(value)
    if (!parsed.success) {
      throw new Error(`Runtime returned an invalid report (HTTP ${response.status})`)
    }
    return parsed.data
  }
}

export function createRuntimeClientFromEnvV1(
  env: NodeJS.ProcessEnv = process.env,
): SignedBuildRuntimeClientV1 | null {
  const baseUrl = env.SITEAGENT_RUNTIME_URL?.trim()
  const signingKey = env.SITEAGENT_RUNTIME_SIGNING_KEY?.trim()
  if (!baseUrl && !signingKey) return null
  if (!baseUrl || !signingKey) {
    throw new Error(
      "SITEAGENT_RUNTIME_URL and SITEAGENT_RUNTIME_SIGNING_KEY must be configured together",
    )
  }
  return new SignedBuildRuntimeClientV1(baseUrl, signingKey)
}
