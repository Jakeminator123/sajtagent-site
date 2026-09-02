import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import {
  MAX_INLINE_PREVIEW_BYTES_V1,
  PreparedAcceptedCandidateV1Schema,
  previewResponseHeadersV1,
  publicVerificationReceiptsV1,
  validateInlinePreviewArtifactV1,
  validatePreparedAcceptedCandidateV1,
} from "../lib/siteagent/server/version-model.ts"

const html = "<!doctype html><main>Verifierad preview</main>"
const htmlBytes = new TextEncoder().encode(html)
const sha256 = createHash("sha256").update(htmlBytes).digest("hex")
const receipt = {
  receiptId: "receipt-preview-001",
  category: "preview" as const,
  name: "Preview health",
  status: "passed" as const,
  startedAt: "2026-09-01T12:05:00.000Z",
  finishedAt: "2026-09-01T12:05:01.000Z",
  summary: "HTML svarade friskt.",
  evidenceRef: "private-runtime-evidence",
}
const input = {
  job: {
    schemaVersion: 1 as const,
    jobId: "job-001",
    tenantId: "personal:11111111-1111-4111-8111-111111111111",
    projectId: "project-001",
    baseRevisionId: "revision-001",
    idempotencyKey: "idem-001",
    createdAt: "2026-09-01T12:00:00.000Z",
    expiresAt: "2026-09-01T12:15:00.000Z",
    intent: {
      schemaVersion: 1 as const,
      intentType: "site.create" as const,
      message: "Skapa en enkel sida.",
      context: {},
    },
    executionPolicy: {
      deadlineAt: "2026-09-01T12:10:00.000Z",
      maxSteps: 20,
      maxToolCalls: 40,
      maxModelTokens: 100_000,
      maxCostMicros: 1_000_000,
      capabilities: ["workspace.read" as const],
      network: { mode: "deny-all" as const },
      packages: { mode: "deny" as const },
    },
  },
  report: {
    schemaVersion: 1 as const,
    status: "candidate" as const,
    jobId: "job-001",
    sourceRunId: "run-001",
    baseRevisionId: "revision-001",
    candidateRevisionId: `revision:sha256:${"2".repeat(64)}`,
    changedPaths: ["index.html"],
    artifacts: [
      {
        kind: "preview" as const,
        ref: "sprite-worktree:internal:path",
        mediaType: "text/html",
        sha256,
      },
    ],
    receipts: [receipt],
    diagnostics: [],
    reportedAt: "2026-09-01T12:05:01.000Z",
  },
  preview: {
    state: "staged" as const,
    previewRef: "preview:11111111-1111-4111-8111-111111111111",
    mediaType: "text/html" as const,
    sha256,
    sizeBytes: Buffer.byteLength(html, "utf8"),
    content: htmlBytes,
  },
  verifiedAt: "2026-09-01T12:05:02.000Z",
  receipts: [receipt],
}

const { job, ...prepared } = input

assert.equal(validateInlinePreviewArtifactV1({
  mediaType: prepared.preview.mediaType,
  sha256: prepared.preview.sha256,
  sizeBytes: prepared.preview.sizeBytes,
  content: html,
}).sha256, sha256)
assert.equal(validatePreparedAcceptedCandidateV1(job, prepared).job.jobId, "job-001")

assert.throws(
  () => validatePreparedAcceptedCandidateV1(job, {
    ...prepared,
    preview: { ...prepared.preview, sha256: "0".repeat(64) },
  }),
  /preview_hash_mismatch/,
)
assert.throws(
  () => validatePreparedAcceptedCandidateV1(job, {
    ...prepared,
    preview: { ...prepared.preview, sizeBytes: prepared.preview.sizeBytes + 1 },
  }),
  /preview_size_mismatch/,
)
assert.throws(
  () => {
    const content = new TextEncoder().encode(`<!-- sprite-worktree:private -->${html}`)
    return validatePreparedAcceptedCandidateV1(job, {
      ...prepared,
      preview: {
        ...prepared.preview,
        content,
        sizeBytes: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      },
    })
  },
  /preview_contains_runtime_ref/,
)
assert.equal(
  PreparedAcceptedCandidateV1Schema.safeParse({
    ...prepared,
    preview: { ...prepared.preview, storageRef: "sprite-worktree:private:index.html" },
  }).success,
  false,
)
assert.equal(
  PreparedAcceptedCandidateV1Schema.safeParse({
    ...prepared,
    preview: {
      ...prepared.preview,
      content: new Uint8Array(MAX_INLINE_PREVIEW_BYTES_V1 + 1),
      sizeBytes: MAX_INLINE_PREVIEW_BYTES_V1 + 1,
    },
  }).success,
  false,
)
const invalidUtf8 = new Uint8Array([0xc3, 0x28])
assert.throws(
  () => validatePreparedAcceptedCandidateV1(job, {
    ...prepared,
    preview: {
      ...prepared.preview,
      content: invalidUtf8,
      sizeBytes: invalidUtf8.byteLength,
      sha256: createHash("sha256").update(invalidUtf8).digest("hex"),
    },
  }),
  /preview_invalid_utf8/,
)
assert.throws(
  () => validatePreparedAcceptedCandidateV1(job, {
    ...prepared,
    report: { ...prepared.report, baseRevisionId: "revision-other" },
  }),
  /worker_base_revision_mismatch/,
)
assert.throws(
  () => validatePreparedAcceptedCandidateV1(job, {
    ...prepared,
    receipts: [{ ...receipt, status: "failed" as const }],
  }),
  /version_receipts_not_passed/,
)

const publicReceipts = publicVerificationReceiptsV1(prepared.receipts)
assert.equal("evidenceRef" in publicReceipts[0]!, false)
assert.equal("summary" in publicReceipts[0]!, false)
assert.equal(JSON.stringify(publicReceipts).includes("sprite-worktree:"), false)

const headers = previewResponseHeadersV1(prepared.preview.sizeBytes)
assert.match(headers.get("cache-control") ?? "", /no-store/)
assert.match(headers.get("content-security-policy") ?? "", /sandbox/)
assert.match(headers.get("content-security-policy") ?? "", /script-src 'none'/)
assert.equal(headers.get("x-content-type-options"), "nosniff")
assert.equal(headers.get("cross-origin-resource-policy"), "same-origin")
assert.equal(headers.get("content-type"), "text/html; charset=utf-8")

const migration = readFileSync(
  new URL("../supabase/migrations/20260901184058_create_site_versions_and_previews.sql", import.meta.url),
  "utf8",
)
const rlsTest = readFileSync(
  new URL("../supabase/tests/site_versions_rls_test.sql", import.meta.url),
  "utf8",
)
assert.match(migration, /alter table public\.site_preview_artifacts enable row level security/)
assert.match(migration, /alter table public\.site_versions enable row level security/)
assert.match(migration, /revoke all on table public\.site_preview_artifacts from anon, authenticated/)
assert.doesNotMatch(migration, /grant select on table public\.site_preview_artifacts to authenticated/)
assert.match(migration, /site_preview_artifacts_size_bounded/)
assert.match(migration, /site_versions_preview_owner_fk/)
assert.match(rlsTest, /authenticated owners must use the preview route/)
assert.match(rlsTest, /cross-tenant version is invisible/)

console.log("PASS: 23 canonical version, preview, and static RLS checks")
