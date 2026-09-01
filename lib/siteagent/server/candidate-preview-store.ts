import { createHash, randomUUID } from "node:crypto"

import {
  type LoadedCandidatePreviewV1,
  type MaterializedSitePreviewV1,
  type SiteCandidatePreviewStoreV1,
  type SitePreviewHealthV1,
} from "./candidate-acceptance.ts"
import {
  StagedInlinePreviewArtifactV1Schema,
  previewResponseHeadersV1,
  validateInlinePreviewArtifactV1,
} from "./version-model.ts"

type InlineSiteCandidatePreviewStoreDependenciesV1 = {
  createId?: () => string
}

function previewDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function decodePreview(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("preview_invalid_utf8")
  }
}

function verifyPreviewBytes(preview: {
  mediaType: string
  sha256: string
  sizeBytes: number
  content: Uint8Array
}): void {
  if (preview.content.byteLength !== preview.sizeBytes) {
    throw new Error("preview_size_mismatch")
  }
  if (previewDigest(preview.content) !== preview.sha256) {
    throw new Error("preview_hash_mismatch")
  }
  const html = decodePreview(preview.content)
  const normalizedHtml = html.toLowerCase()
  if (!normalizedHtml.includes("<!doctype html") && !normalizedHtml.includes("<html")) {
    throw new Error("preview_not_html_document")
  }
  validateInlinePreviewArtifactV1({
    mediaType: preview.mediaType,
    sha256: preview.sha256,
    sizeBytes: preview.sizeBytes,
    content: html,
  })
}

/**
 * Site-owned V1 staging. The bytes remain an uncommitted server value until
 * PostgresSiteVersionRepositoryV1 commits preview, version, result, and event
 * in one transaction.
 */
export class InlineSiteCandidatePreviewStoreV1
  implements SiteCandidatePreviewStoreV1
{
  private readonly createId: () => string

  constructor(dependencies: InlineSiteCandidatePreviewStoreDependenciesV1 = {}) {
    this.createId = dependencies.createId ?? randomUUID
  }

  async materializePreview(input: {
    preview: LoadedCandidatePreviewV1
  }): Promise<MaterializedSitePreviewV1> {
    const content = new Uint8Array(input.preview.bytes)
    verifyPreviewBytes({
      mediaType: input.preview.mediaType,
      sha256: input.preview.sha256,
      sizeBytes: input.preview.sizeBytes,
      content,
    })
    return StagedInlinePreviewArtifactV1Schema.parse({
      state: "staged",
      previewRef: `preview:${this.createId()}`,
      mediaType: input.preview.mediaType,
      sha256: input.preview.sha256,
      sizeBytes: input.preview.sizeBytes,
      content,
    })
  }

  async checkPreviewHealth(input: {
    preview: MaterializedSitePreviewV1
  }): Promise<SitePreviewHealthV1> {
    const unhealthy = (): SitePreviewHealthV1 => ({
      healthy: false,
      statusCode: 503,
      previewRef: input.preview.previewRef,
      mediaType: input.preview.mediaType,
      sha256: input.preview.sha256,
      sizeBytes: input.preview.sizeBytes,
    })
    try {
      const preview = StagedInlinePreviewArtifactV1Schema.parse(input.preview)
      verifyPreviewBytes(preview)
      const headers = previewResponseHeadersV1(preview.sizeBytes)
      if (
        headers.get("content-length") !== String(preview.sizeBytes) ||
        headers.get("content-type") !== "text/html; charset=utf-8" ||
        !headers.get("content-security-policy")?.includes("sandbox")
      ) {
        return unhealthy()
      }
      return {
        healthy: true,
        statusCode: 200,
        previewRef: preview.previewRef,
        mediaType: preview.mediaType,
        sha256: preview.sha256,
        sizeBytes: preview.sizeBytes,
      }
    } catch {
      return unhealthy()
    }
  }
}
