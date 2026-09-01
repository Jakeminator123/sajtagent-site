import { BuildPrincipalV1Schema, type BuildPrincipalV1 } from "./build-job-input.ts"

export function buildPrincipalFromClaimsV1(claims: unknown): BuildPrincipalV1 | null {
  if (!claims || typeof claims !== "object") return null
  const record = claims as Record<string, unknown>
  if (record.is_anonymous === true) return null

  const parsed = BuildPrincipalV1Schema.safeParse({
    userId: record.sub,
    // Personal tenant ownership is derived by the server. Never trust editable
    // user metadata for authorization decisions.
    tenantId: typeof record.sub === "string" ? `personal:${record.sub}` : null,
  })
  return parsed.success ? parsed.data : null
}
