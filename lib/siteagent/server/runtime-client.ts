import "server-only"

import { createHash, createHmac, randomUUID } from "node:crypto"

import {
  WorkerReportV1Schema,
  type BuildJobV1,
  type WorkerReportV1,
} from "../../../contracts/builder-v1.ts"
import type { BuildRuntimeClientV1 } from "./build-job-controller.ts"

const RUNTIME_PATH = "/v1/build-jobs"

function isAllowedRuntimeUrl(url: URL): boolean {
  if (url.protocol === "https:") return true
  return (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  )
}

function signaturePayload(
  method: string,
  pathname: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  const bodyDigest = createHash("sha256").update(body).digest("hex")
  return [
    "siteagent-runtime-v1",
    timestamp,
    nonce,
    method.toUpperCase(),
    pathname,
    bodyDigest,
  ].join("\n")
}

export class SignedBuildRuntimeClientV1 implements BuildRuntimeClientV1 {
  private readonly endpoint: URL
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
    this.signingKey = signingKey
  }

  async run(job: BuildJobV1): Promise<WorkerReportV1> {
    const body = JSON.stringify(job)
    const timestamp = new Date().toISOString()
    const nonce = randomUUID()
    const signature = createHmac("sha256", this.signingKey)
      .update(signaturePayload("POST", this.endpoint.pathname, timestamp, nonce, body))
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
