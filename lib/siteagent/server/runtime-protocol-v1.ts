import { createHash } from "node:crypto"

import { z } from "zod"

export const ReadyRuntimeHealthV1Schema = z
  .object({
    mode: z.literal("openclaw-gateway"),
    openClawConnected: z.literal(true),
    openClawVersion: z.string().trim().min(1).max(160),
    signedJobsEnabled: z.literal(true),
  })
  .passthrough()

export type ReadyRuntimeHealthV1 = z.infer<typeof ReadyRuntimeHealthV1Schema>

export function runtimeSignaturePayloadV1(
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
