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
const WORKER_REPORT_HTTP_STATUSES_V1 = new Set([200, 409, 503, 504])
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

function expectedWorkerReportStatusV1(report: WorkerReportV1): number {
  if (report.status === "candidate") return 200
  if (report.status === "cancelled") return 409
  if (report.status === "timed_out") return 504
  const code = report.diagnostics[0]?.code
  return code === "stale_revision" || code === "idempotency_conflict"
    ? 409
    : 503
}

export class SignedBuildRuntimeClientV1 implements BuildRuntimeClientV1 {
  private readonly endpoint: URL
  private readonly healthEndpoint: URL
  private readonly signingKey: string
  private readonly fetchImpl: FetchV1
  private readonly now: () => Date
  private readonly createNonce: () => string
  private readonly createTimeoutSignal: (milliseconds: number) => AbortSignal

  constructor(
    baseUrl: string,
    signingKey: string,
    options: {
      fetch?: FetchV1
      now?: () => Date
      createNonce?: () => string
      createTimeoutSignal?: (milliseconds: number) => AbortSignal
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
    this.createTimeoutSignal = options.createTimeoutSignal ?? AbortSignal.timeout
  }

  async run(job: BuildJobV1): Promise<WorkerReportV1> {
    const healthResponse = await this.fetchImpl(this.healthEndpoint, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: this.createTimeoutSignal(5_000),
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
      signal: this.createTimeoutSignal(remainingMs),
    })
    assertExactRuntimeEndpoint(response, this.endpoint)
    if (!WORKER_REPORT_HTTP_STATUSES_V1.has(response.status)) {
      throw new Error(`Runtime build job failed (HTTP ${response.status})`)
    }
    let value: unknown
    try {
      value = await response.json() as unknown
    } catch {
      throw new Error(`Runtime returned an invalid report (HTTP ${response.status})`)
    }
    const parsed = WorkerReportV1Schema.safeParse(value)
    if (!parsed.success) {
      throw new Error(`Runtime returned an invalid report (HTTP ${response.status})`)
    }
    if (
      parsed.data.jobId !== job.jobId ||
      parsed.data.baseRevisionId !== job.baseRevisionId
    ) {
      throw new Error("Runtime returned a report for a different job or base revision")
    }
    if (expectedWorkerReportStatusV1(parsed.data) !== response.status) {
      throw new Error(`Runtime report/status mismatch (HTTP ${response.status})`)
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
