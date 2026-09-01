// Siteagent — delade typer.
// Speglar formerna i sajtmaskin (chat/version/preview) så mergen blir enkel.

export type ChatRole = "user" | "assistant"

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

export type VersionStatus = "building" | "ready" | "error"

export interface SiteVersion {
  id: string
  label: string
  status: VersionStatus
  previewUrl: string | null
  /** Endast verifierat dokumentinnehåll; sätts aldrig från lokal simulering. */
  srcDoc: string | null
  pages: string[]
  createdAt: number
  pinned: boolean
}

export type PreviewStatus = "idle" | "starting" | "ready" | "error"

/**
 * UI-events reducerade från BuildEventV1. Preview och done får bara skapas
 * efter att servern har verifierat kandidat, revision och preview.
 */
export type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "text"; delta: string }
  | { type: "preview"; url?: string; srcDoc?: string; pages?: string[] }
  | { type: "done"; versionId?: string }
  | { type: "error"; message: string }

export type PublishState = "idle" | "publishing" | "published"
