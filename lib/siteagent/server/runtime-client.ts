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

function isAllowedRuntimeUrl(url: URL): boolean {
  if (url.protocol === "https:") return true
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  )
}

export class SignedBuildRuntimeClientV1 implements BuildRuntimeClientV1 {
  private readonly endpoint: URL
  private readonly healthEndpoint: URL
  private readonly signingKey: string

  constructor(baseUrl: string, signingKey: string) {
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
  }

  async run(job: BuildJobV1): Promise<WorkerReportV1> {
    const healthResponse = await fetch(this.healthEndpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
    if (!healthResponse.ok) {
      throw new Error(`Runtime health check failed (HTTP ${healthResponse.status})`)
    }
    const health = ReadyRuntimeHealthV1Schema.safeParse(
      await healthResponse.json() as unknown,
    )
    if (!health.success) {
      throw new Error("Runtime is not ready for signed OpenClaw jobs")
    }

    const body = JSON.stringify(job)
    const timestamp = new Date().toISOString()
    const nonce = randomUUID()
    const signature = createHmac("sha256", this.signingKey)
      .update(runtimeSignaturePayloadV1("POST", this.endpoint.pathname, timestamp, nonce, body))
      .digest("hex")
    const remainingMs = Date.parse(job.executionPolicy.deadlineAt) - Date.now()
    if (remainingMs <= 0) throw new Error("Build job deadline has expired")
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-siteagent-timestamp": timestamp,
        "x-siteagent-nonce": nonce,
        "x-siteagent-signature": signature,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(remainingMs, 30_000)),
    })
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
