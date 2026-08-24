// Builder v2 — delade typer.
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
  /** Fallback när ingen riktig preview-URL finns (simuleringsläge) */
  srcDoc: string | null
  pages: string[]
  createdAt: number
  pinned: boolean
}

export type PreviewStatus = "idle" | "starting" | "ready" | "error"

/**
 * Events från chat-streamen. Motsvarar SSE-eventen från
 * POST /api/engine/chats/stream i sajtmaskin (text / preview / done / error).
 */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "preview"; url?: string; srcDoc?: string; pages?: string[] }
  | { type: "done"; versionId?: string }
  | { type: "error"; message: string }

export type PublishState = "idle" | "publishing" | "published"
