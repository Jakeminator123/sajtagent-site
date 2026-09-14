import { nextPreviewConfig, type NextState } from "./next-preview-model.ts"

/** Keep accepted Next projects in their lane, including during flag rollback. */
export function agentBuildProfile(env: NodeJS.ProcessEnv, state: NextState): "next" | "html" {
  try {
    nextPreviewConfig(env)
    return "next"
  } catch {
    // Replays can still return persisted events. A new Next run revalidates
    // configuration before generation and cannot silently create HTML instead.
    return state.accepted ? "next" : "html"
  }
}
