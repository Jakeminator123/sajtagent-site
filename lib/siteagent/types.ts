// Sajtagent — små klientprojektioner. Auktoritativ jobb- och versionsstate
// kommer alltid från de versionerade Builder-kontrakten.

export type ChatRole = "user" | "assistant"

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

export interface SiteVersion {
  id: string
  label: string
  projectId: string
  versionNumber: number
  workspaceRevisionId: string
  previewRef: string
  previewUrl: string
  sitemapRevision: string
  sha256: string
  sizeBytes: number
  verifiedAt: string
  createdAt: string
  pinned: boolean
}

export type PreviewStatus = "idle" | "building" | "ready" | "error"

export type PublishState = "idle" | "publishing" | "published"
