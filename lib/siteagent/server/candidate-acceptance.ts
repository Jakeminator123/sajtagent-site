import { createHash } from "node:crypto"

import {
  EvidenceReceiptV1Schema,
  WorkerCandidateReportV1Schema,
  type BuildJobV1,
  type BuildResultV1,
  type EvidenceReceiptV1,
} from "../../../contracts/builder-v1.ts"
import type { BuildPrincipalV1 } from "./build-job-input.ts"

type BuildFailureCodeV1 = Extract<BuildResultV1, { status: "failed" }>["code"]
export type WorkerCandidateReportV1 = ReturnType<
  typeof WorkerCandidateReportV1Schema.parse
>

export type CandidateAcceptanceInputV1 = {
  principal: BuildPrincipalV1
  job: BuildJobV1
  report: unknown
}

export type CandidateAcceptanceDecisionV1 =
  | { accepted: true; prepared: PreparedAcceptedCandidateV1 }
  | {
      accepted: false
      code: BuildFailureCodeV1
      message: string
      retryable: boolean
      receipts: EvidenceReceiptV1[]
    }

export interface CandidateAcceptanceV1 {
  accept(input: CandidateAcceptanceInputV1): Promise<CandidateAcceptanceDecisionV1>
}

export interface CandidateRevisionGuardV1 {
  isProjectRevisionCurrent(
    principal: BuildPrincipalV1,
    projectId: string,
    revisionId: string,
  ): Promise<boolean>
}

export type LoadedCandidatePreviewV1 = {
  sourceRef: string
  relativePath: string
  mediaType: string
  sha256: string
  sizeBytes: number
  bytes: Uint8Array
}

export interface CandidateArtifactReaderV1 {
  readPreviewArtifact(input: {
    principal: BuildPrincipalV1
    job: BuildJobV1
    report: WorkerCandidateReportV1
    sourceRef: string
    maxBytes: number
  }): Promise<LoadedCandidatePreviewV1>
}

export type MaterializedSitePreviewV1 = {
  state: "staged"
  previewRef: string
  mediaType: string
  sha256: string
  sizeBytes: number
  content: Uint8Array
}

export type SitePreviewHealthV1 = {
  healthy: boolean
  statusCode: number
  previewRef: string
  mediaType: string
  sha256: string
  sizeBytes: number
}

export type PreparedAcceptedCandidateV1 = {
  report: WorkerCandidateReportV1
  preview: MaterializedSitePreviewV1
  verifiedAt: string
  receipts: EvidenceReceiptV1[]
}

export interface SiteCandidatePreviewStoreV1 {
  materializePreview(input: {
    principal: BuildPrincipalV1
    job: BuildJobV1
    report: WorkerCandidateReportV1
    preview: LoadedCandidatePreviewV1
  }): Promise<MaterializedSitePreviewV1>
  checkPreviewHealth(input: {
    principal: BuildPrincipalV1
    job: BuildJobV1
    preview: MaterializedSitePreviewV1
  }): Promise<SitePreviewHealthV1>
}

export type CandidateAcceptancePolicyV1 = {
  allowedPreviewPaths: readonly string[]
  maxPreviewBytes: number
  requiredCheckNames: readonly string[]
}

export const DEFAULT_CANDIDATE_ACCEPTANCE_POLICY_V1: CandidateAcceptancePolicyV1 = {
  allowedPreviewPaths: [
    ".siteagent-preview.html",
    "dist/index.html",
    "build/index.html",
    "index.html",
  ],
  maxPreviewBytes: 1024 * 1024,
  requiredCheckNames: [],
}

type DeterministicCandidateAcceptanceDependenciesV1 = {
  revisionGuard: CandidateRevisionGuardV1
  artifactReader: CandidateArtifactReaderV1
  previewStore: SiteCandidatePreviewStoreV1
  now?: () => Date
  policy?: Partial<CandidateAcceptancePolicyV1>
}

function rejected(
  code: BuildFailureCodeV1,
  message: string,
  retryable: boolean,
  receipts: EvidenceReceiptV1[] = [],
): CandidateAcceptanceDecisionV1 {
  return { accepted: false, code, message, retryable, receipts }
}

function isPortableRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  )
}

function isSiteOwnedPreviewRef(value: string, sourceRef: string): boolean {
  return (
    value !== sourceRef &&
    /^preview:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
}

function hasHtmlDocument(bytes: Uint8Array): boolean {
  try {
    const html = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .toLowerCase()
    return html.includes("<!doctype html") || html.includes("<html")
  } catch {
    return false
  }
}

function validateReceipts(
  job: BuildJobV1,
  report: WorkerCandidateReportV1,
  previewRef: string,
  requiredCheckNames: readonly string[],
): string | null {
  if (report.receipts.length >= 2_000) {
    return "Kandidatens kvittolista lämnar inget utrymme för Site-acceptanskvittot."
  }
  if (new Set(report.receipts.map((receipt) => receipt.receiptId)).size !== report.receipts.length) {
    return "Kandidaten innehåller duplicerade kvitto-ID:n."
  }
  if (report.receipts.some((receipt) => receipt.status !== "passed")) {
    return "Kandidaten innehåller ett misslyckat eller avbrutet kvitto."
  }

  const createdAt = Date.parse(job.createdAt)
  const reportedAt = Date.parse(report.reportedAt)
  if (
    report.receipts.some(
      (receipt) =>
        Date.parse(receipt.startedAt) < createdAt ||
        Date.parse(receipt.finishedAt) > reportedAt,
    )
  ) {
    return "Kandidatens kvittotider ligger utanför jobbets verifierbara tidsfönster."
  }

  const passedChecks = report.receipts.filter(
    (receipt) => receipt.category === "check" && receipt.status === "passed",
  )
  if (job.executionPolicy.capabilities.includes("checks.run") && passedChecks.length === 0) {
    return "Jobbets check-policy saknar ett godkänt check-kvitto."
  }
  if (
    requiredCheckNames.some(
      (name) => !passedChecks.some((receipt) => receipt.name === name),
    )
  ) {
    return "Kandidaten saknar ett uttryckligen krävt check-kvitto."
  }

  const previewReceipt = report.receipts.find(
    (receipt) =>
      receipt.category === "preview" &&
      receipt.status === "passed" &&
      receipt.evidenceRef === previewRef,
  )
  if (!previewReceipt) {
    return "Kandidaten saknar ett godkänt preview-kvitto för exakt artefaktreferens."
  }
  return null
}

function exactPreviewMetadata(
  value: {
    mediaType: string
    sha256: string
    sizeBytes: number
  },
  expected: {
    mediaType: string
    sha256: string
    sizeBytes: number
  },
): boolean {
  return (
    value.mediaType === expected.mediaType &&
    value.sha256 === expected.sha256 &&
    value.sizeBytes === expected.sizeBytes
  )
}

export class DeterministicCandidateAcceptanceV1 implements CandidateAcceptanceV1 {
  private readonly dependencies: DeterministicCandidateAcceptanceDependenciesV1
  private readonly policy: CandidateAcceptancePolicyV1

  constructor(dependencies: DeterministicCandidateAcceptanceDependenciesV1) {
    this.dependencies = dependencies
    this.policy = {
      ...DEFAULT_CANDIDATE_ACCEPTANCE_POLICY_V1,
      ...dependencies.policy,
    }
  }

  async accept(
    input: CandidateAcceptanceInputV1,
  ): Promise<CandidateAcceptanceDecisionV1> {
    const parsed = WorkerCandidateReportV1Schema.safeParse(input.report)
    if (!parsed.success) {
      return rejected(
        "verification_failed",
        "Runtime-rapporten matchar inte kandidatkontraktet.",
        false,
      )
    }
    const report = parsed.data
    const { job, principal } = input

    if (report.jobId !== job.jobId || report.baseRevisionId !== job.baseRevisionId) {
      return rejected(
        "verification_failed",
        "Kandidaten är inte bunden till exakt jobb och basrevision.",
        false,
        report.receipts,
      )
    }
    if (report.candidateRevisionId === job.baseRevisionId) {
      return rejected(
        "verification_failed",
        "Kandidatrevisionen får inte vara samma som basrevisionen.",
        false,
        report.receipts,
      )
    }
    if (
      report.changedPaths.length === 0 ||
      new Set(report.changedPaths).size !== report.changedPaths.length
    ) {
      return rejected(
        "verification_failed",
        "Kandidaten måste innehålla en entydig lista över ändrade sökvägar.",
        false,
        report.receipts,
      )
    }

    const now = (this.dependencies.now ?? (() => new Date()))()
    const nowMs = now.getTime()
    const createdAtMs = Date.parse(job.createdAt)
    const expiresAtMs = Date.parse(job.expiresAt)
    const reportedAtMs = Date.parse(report.reportedAt)
    if (nowMs > expiresAtMs || reportedAtMs > expiresAtMs) {
      return rejected(
        "expired",
        "Jobbet eller kandidatrapporten har passerat jobbets utgångstid.",
        false,
        report.receipts,
      )
    }
    if (reportedAtMs < createdAtMs || reportedAtMs > nowMs) {
      return rejected(
        "verification_failed",
        "Kandidatrapportens tid ligger utanför det verifierbara jobbfönstret.",
        false,
        report.receipts,
      )
    }

    if (!(await this.isCurrentRevision(principal, job))) {
      return rejected(
        "stale_revision",
        "Projektets aktiva revision har ändrats sedan jobbet skapades.",
        false,
        report.receipts,
      )
    }

    const previewArtifacts = report.artifacts.filter(
      (artifact) => artifact.kind === "preview",
    )
    const previewArtifact = previewArtifacts[0]
    if (
      previewArtifacts.length !== 1 ||
      !previewArtifact ||
      previewArtifact.mediaType !== "text/html" ||
      !previewArtifact.sha256
    ) {
      return rejected(
        "verification_failed",
        "Kandidaten måste innehålla exakt en SHA-märkt text/html-preview.",
        false,
        report.receipts,
      )
    }

    const receiptError = validateReceipts(
      job,
      report,
      previewArtifact.ref,
      this.policy.requiredCheckNames,
    )
    if (receiptError) {
      return rejected("verification_failed", receiptError, false, report.receipts)
    }

    let loaded: LoadedCandidatePreviewV1
    try {
      loaded = await this.dependencies.artifactReader.readPreviewArtifact({
        principal,
        job,
        report,
        sourceRef: previewArtifact.ref,
        maxBytes: this.policy.maxPreviewBytes,
      })
    } catch {
      return rejected(
        "verification_failed",
        "Preview-artefakten kunde inte hämtas genom den privata artefaktgränsen.",
        true,
        report.receipts,
      )
    }

    const actualSize = loaded.bytes.byteLength
    const actualSha256 = createHash("sha256").update(loaded.bytes).digest("hex")
    if (
      loaded.sourceRef !== previewArtifact.ref ||
      loaded.mediaType !== "text/html" ||
      loaded.sha256 !== previewArtifact.sha256 ||
      actualSha256 !== previewArtifact.sha256 ||
      loaded.sizeBytes !== actualSize ||
      actualSize <= 0 ||
      actualSize > this.policy.maxPreviewBytes ||
      !isPortableRelativePath(loaded.relativePath) ||
      !this.policy.allowedPreviewPaths.includes(loaded.relativePath) ||
      !hasHtmlDocument(loaded.bytes)
    ) {
      return rejected(
        "verification_failed",
        "Preview-artefaktens referens, hash, mediaType, storlek, sökväg eller HTML-innehåll avviker.",
        false,
        report.receipts,
      )
    }

    let materialized: MaterializedSitePreviewV1
    try {
      materialized = await this.dependencies.previewStore.materializePreview({
        principal,
        job,
        report,
        preview: loaded,
      })
    } catch {
      return rejected(
        "persistence_failed",
        "Preview-artefakten kunde inte materialiseras i Site-ägd lagring.",
        true,
        report.receipts,
      )
    }
    if (
      materialized.state !== "staged" ||
      !isSiteOwnedPreviewRef(materialized.previewRef, previewArtifact.ref) ||
      materialized.content.byteLength !== actualSize ||
      createHash("sha256").update(materialized.content).digest("hex") !== actualSha256 ||
      !exactPreviewMetadata(materialized, {
        mediaType: loaded.mediaType,
        sha256: actualSha256,
        sizeBytes: actualSize,
      })
    ) {
      return rejected(
        "persistence_failed",
        "Den materialiserade previewn saknar exakt Site-ägd identitet eller metadata.",
        false,
        report.receipts,
      )
    }

    let health: SitePreviewHealthV1
    try {
      health = await this.dependencies.previewStore.checkPreviewHealth({
        principal,
        job,
        preview: materialized,
      })
    } catch {
      return rejected(
        "preview_unhealthy",
        "Den Site-ägda previewns hälsokontroll kunde inte slutföras.",
        true,
        report.receipts,
      )
    }
    if (
      !health.healthy ||
      health.statusCode !== 200 ||
      health.previewRef !== materialized.previewRef ||
      !exactPreviewMetadata(health, materialized)
    ) {
      return rejected(
        "preview_unhealthy",
        "Den Site-ägda previewn är inte frisk eller matchar inte verifierad metadata.",
        true,
        report.receipts,
      )
    }

    if (!(await this.isCurrentRevision(principal, job))) {
      return rejected(
        "stale_revision",
        "Projektets aktiva revision ändrades under kandidatverifieringen.",
        false,
        report.receipts,
      )
    }

    const verifiedAt = (this.dependencies.now ?? (() => new Date()))().toISOString()
    if (Date.parse(verifiedAt) > expiresAtMs) {
      return rejected(
        "expired",
        "Jobbet hann löpa ut innan den verifierade kandidaten kunde committas.",
        false,
        report.receipts,
      )
    }
    const acceptanceReceipt = EvidenceReceiptV1Schema.parse({
      receiptId: `acceptance:${createHash("sha256").update(job.jobId).digest("hex").slice(0, 32)}`,
      category: "policy",
      name: "Site candidate acceptance",
      status: "passed",
      startedAt: report.reportedAt,
      finishedAt: verifiedAt,
      summary: "Jobbindning, kvitton, artefaktbytes och Site-preview verifierades deterministiskt.",
      evidenceRef: materialized.previewRef,
    })
    const receipts = [...report.receipts, acceptanceReceipt]

    return {
      accepted: true,
      prepared: { report, preview: materialized, verifiedAt, receipts },
    }
  }

  private async isCurrentRevision(
    principal: BuildPrincipalV1,
    job: BuildJobV1,
  ): Promise<boolean> {
    try {
      return await this.dependencies.revisionGuard.isProjectRevisionCurrent(
        principal,
        job.projectId,
        job.baseRevisionId,
      )
    } catch {
      return false
    }
  }
}
