import {
  AgentProfileV1Schema,
  type AgentProfileV1,
} from "../../contracts/agent-profile-v1.ts"

function profileContentV1(profile: AgentProfileV1): string {
  return JSON.stringify({
    ...profile,
    revision: 1,
    updatedAt: "2000-01-01T00:00:00.000Z",
  })
}

export function readStoredAgentProfileDraftV1(
  value: string | null,
): AgentProfileV1 | null {
  if (!value) return null
  try {
    const parsed = AgentProfileV1Schema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function prepareAgentProfileActivationDraftV1(
  currentInput: AgentProfileV1,
  storedInput: AgentProfileV1 | null,
  activatedAt: Date,
): AgentProfileV1 {
  const current = AgentProfileV1Schema.parse(currentInput)
  const stored = storedInput === null ? null : AgentProfileV1Schema.parse(storedInput)

  if (stored && profileContentV1(current) === profileContentV1(stored)) {
    return stored
  }

  return AgentProfileV1Schema.parse({
    ...current,
    revision: Math.max(current.revision, stored?.revision ?? 0) + 1,
    updatedAt: activatedAt.toISOString(),
  })
}

export function rebaseAgentProfileActivationDraftV1(
  currentInput: AgentProfileV1,
  activeRuntimeRevision: number,
  rebasedAt: Date,
): AgentProfileV1 {
  const current = AgentProfileV1Schema.parse(currentInput)
  return AgentProfileV1Schema.parse({
    ...current,
    revision: Math.max(current.revision, activeRuntimeRevision) + 1,
    updatedAt: rebasedAt.toISOString(),
  })
}
