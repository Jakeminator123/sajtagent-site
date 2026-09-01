import {
  DeterministicCandidateAcceptanceV1,
  type CandidateArtifactReaderV1,
  type SiteCandidatePreviewStoreV1,
} from "./candidate-acceptance.ts"
import type {
  AcceptedCandidateCommitterV1,
  BuildJobControllerDependenciesV1,
  BuildRuntimeClientV1,
} from "./build-job-controller.ts"
import type { BuildJobRepositoryV1 } from "./build-job-repository.ts"

export const RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1 = {
  kind: "unavailable",
  reason: "runtime_artifact_protocol_missing",
} as const

export const RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1 = {
  kind: "unavailable",
  reason: "runtime_artifact_capability_unavailable",
} as const

export type RuntimeArtifactTransferV1 =
  | typeof RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1
  | typeof RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1
  | { kind: "available"; reader: CandidateArtifactReaderV1 }

export type BuildJobServerCapabilityV1 = {
  runtimeConfigured: boolean
  artifactTransferConfigured: boolean
  dispatchReady: boolean
  blockedReason:
    | "runtime_unconfigured"
    | "runtime_artifact_protocol_missing"
    | "runtime_artifact_capability_unavailable"
    | null
}

type BuildJobServerJoinInputV1 = {
  repository: BuildJobRepositoryV1
  runtime: BuildRuntimeClientV1 | null
  artifactTransfer: RuntimeArtifactTransferV1
  previewStore: SiteCandidatePreviewStoreV1
  successCommitter: AcceptedCandidateCommitterV1
  now?: () => Date
}

export type BuildJobServerJoinV1 = {
  dependencies: Pick<
    BuildJobControllerDependenciesV1,
    | "repository"
    | "runtime"
    | "acceptance"
    | "successCommitter"
    | "runtimeUnavailableMessage"
    | "now"
  >
  capability: BuildJobServerCapabilityV1
}

/**
 * Opens runtime dispatch only when the signed job client and a reviewed
 * artifact-byte protocol are both present. An opaque WorkerReport ref alone is
 * never treated as readable content.
 */
export function createBuildJobServerJoinV1(
  input: BuildJobServerJoinInputV1,
): BuildJobServerJoinV1 {
  const runtimeConfigured = input.runtime !== null
  const artifactTransferConfigured = input.artifactTransfer.kind === "available"
  const dispatchReady = runtimeConfigured && artifactTransferConfigured
  const blockedReason = !runtimeConfigured
    ? "runtime_unconfigured"
    : input.artifactTransfer.kind === "unavailable"
      ? input.artifactTransfer.reason
      : null
  const acceptance =
    input.runtime && input.artifactTransfer.kind === "available"
      ? new DeterministicCandidateAcceptanceV1({
          revisionGuard: input.repository,
          artifactReader: input.artifactTransfer.reader,
          previewStore: input.previewStore,
          now: input.now,
        })
      : null

  return {
    dependencies: {
      repository: input.repository,
      runtime: dispatchReady ? input.runtime : null,
      acceptance,
      successCommitter: input.successCommitter,
      runtimeUnavailableMessage:
        blockedReason === "runtime_artifact_protocol_missing"
          ? "Runtime-dispatch är blockerad eftersom ett verifierat protokoll för artefaktbytes saknas. Ingen runtime anropades och ingen preview skapades."
          : blockedReason === "runtime_artifact_capability_unavailable"
            ? "Runtime-dispatch är blockerad eftersom ArtifactReadV1 inte annonserades som aktivt av en strikt runtime-hälsokontroll. Ingen runtime anropades och ingen preview skapades."
          : undefined,
      now: input.now,
    },
    capability: {
      runtimeConfigured,
      artifactTransferConfigured,
      dispatchReady,
      blockedReason,
    },
  }
}
