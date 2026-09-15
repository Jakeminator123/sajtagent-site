import { deriveAcceptedPreviewRoutes, nextPreviewConfig, type NextState } from "./next-preview-model.ts"

export const BUILD_PROFILE_IDS = ["html", "next"] as const
export type BuildProfileId = (typeof BUILD_PROFILE_IDS)[number]

export type ProjectBuildProfile = {
  available: BuildProfileId[]
  preference: BuildProfileId | null
  effective: BuildProfileId
}

/** Tolerate absent or garbage JSON; only html|next are meaningful preferences. */
export function readBuildProfilePreference(state: NextState): BuildProfileId | null {
  return state.profilePreference === "html" || state.profilePreference === "next"
    ? state.profilePreference
    : null
}

export function isNextPreviewAvailable(env: NodeJS.ProcessEnv): boolean {
  try {
    nextPreviewConfig(env)
    return true
  } catch {
    return false
  }
}

/**
 * Availability is only `nextPreviewConfig(env)` — a deployment gate.
 * Preference is the project owner's html|next choice, meaningful only when Next is available.
 * Unset preference defaults to next so current E2E and existing projects stay on Next.
 * An accepted Next project stays next if the deployment gate is rolled back.
 */
export function agentBuildProfile(
  env: NodeJS.ProcessEnv,
  state: NextState,
  preference: BuildProfileId | null = readBuildProfilePreference(state),
): BuildProfileId {
  if (isNextPreviewAvailable(env)) return preference === "html" ? "html" : "next"
  return state.accepted ? "next" : "html"
}

export function projectBuildProfileView(
  env: NodeJS.ProcessEnv,
  state: NextState,
): ProjectBuildProfile {
  const preference = readBuildProfilePreference(state)
  return {
    available: isNextPreviewAvailable(env) ? ["html", "next"] : ["html"],
    preference,
    effective: agentBuildProfile(env, state, preference),
  }
}

/** Owner GET/POST body: accepted artifacts stay server-side; preference is a sibling of state. */
export function nextPreviewOwnerReadModel(env: NodeJS.ProcessEnv, state: NextState) {
  const accepted = state.accepted
    ? {
        tenantId: state.accepted.tenantId,
        projectId: state.accepted.projectId,
        jobId: state.accepted.jobId,
        sourceRevisionId: state.accepted.sourceRevisionId,
        previewRef: state.accepted.previewRef,
        deploymentId: state.accepted.deploymentId,
        acceptedAt: state.accepted.acceptedAt,
        outputSha256: state.accepted.outputSha256,
        routes: deriveAcceptedPreviewRoutes(state.accepted.files),
      }
    : null
  return {
    schemaVersion: 2 as const,
    state: { current: state.current, accepted },
    profile: projectBuildProfileView(env, state),
  }
}
