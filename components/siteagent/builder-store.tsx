"use client"

// Central, intentionally small client projection. Chat sends product intent;
// only a sequence-valid terminal BuildResultV1 may create a version/preview.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import * as adapter from "@/lib/siteagent/adapter"
import {
  completeBuildEventStreamV1,
  createBuildEventProjectionV1,
  reduceBuildEventsV1,
  rejectBuildEventStreamV1,
  type BuildEventProjectionV1,
} from "@/lib/siteagent/build-event-reducer"
import { defaultBuildChoices, type BuildChoices } from "@/lib/siteagent/build-choices"
import {
  loadCanonicalProjectV1,
  reconcileBuildSuccessV1,
  toSiteVersionV1,
  type CanonicalProjectReadModelV1,
} from "@/lib/siteagent/read-model"
import type { ChatMessage, PreviewStatus, PublishState, SiteVersion } from "@/lib/siteagent/types"

interface BuilderStore {
  choices: BuildChoices
  setChoice: (key: string, value: string) => void
  setPageCount: (n: number) => void

  messages: ChatMessage[]
  isStreaming: boolean
  activeJob: BuildEventProjectionV1 | null
  sendMessage: (text: string, opts?: { planMode?: boolean; mode?: string }) => Promise<void>
  promptAssist: (text: string) => Promise<string>
  logs: string[]

  previewStatus: PreviewStatus
  previewUrl: string | null
  sitemapRevision: string | null

  versions: SiteVersion[]
  activeVersionId: string | null
  restoreVersion: (id: string) => void
  togglePin: (id: string) => void
  downloadZip: (id: string) => void

  newChat: () => void
  publishState: PublishState
  publish: () => Promise<void>
}

const BuilderContext = createContext<BuilderStore | null>(null)

export function useBuilder(): BuilderStore {
  const context = useContext(BuilderContext)
  if (!context) throw new Error("useBuilder must be used within BuilderProvider")
  return context
}

let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idCounter++}`

function assistantContent(projection: BuildEventProjectionV1): string {
  const text = projection.assistantText.trim()
  if (projection.status === "succeeded") {
    return text || "Bygget är verifierat och klart. Preview och version är nu tillgängliga."
  }
  if (projection.error) {
    return text ? `${text}\n\n${projection.error}` : projection.error
  }
  return text
}

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [choices, setChoices] = useState<BuildChoices>(defaultBuildChoices)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeJob, setActiveJob] = useState<BuildEventProjectionV1 | null>(null)
  const [versions, setVersions] = useState<SiteVersion[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [publishState, setPublishState] = useState<PublishState>("idle")
  const [logs, setLogs] = useState<string[]>([])

  const hasProjectHistoryRef = useRef(false)
  const projectIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)

  const activeVersion = useMemo(
    () => versions.find((version) => version.id === activeVersionId) ?? null,
    [activeVersionId, versions],
  )
  const previewUrl = activeVersion?.previewUrl ?? null
  const sitemapRevision = activeVersion?.sitemapRevision ?? null
  const previewStatus: PreviewStatus = activeVersion
    ? "ready"
    : isStreaming
      ? "building"
      : activeJob?.status === "failed" || activeJob?.status === "invalid"
        ? "error"
        : "idle"

  const pushLog = useCallback((line: string) => {
    const timestamp = new Date().toLocaleTimeString("sv-SE", { hour12: false })
    setLogs((previous) => [...previous.slice(-199), `${timestamp}  ${line}`])
  }, [])

  const applyReadModel = useCallback((readModel: CanonicalProjectReadModelV1) => {
    setVersions((previous) =>
      readModel.versions.map((version) => ({
        ...toSiteVersionV1(version),
        pinned: previous.find((item) => item.id === version.versionId)?.pinned ?? false,
      })),
    )
    setActiveVersionId(readModel.project.activeVersion?.versionId ?? null)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const opened = await adapter.openDefaultProject(controller.signal)
        if (!opened.ok || controller.signal.aborted) return
        projectIdRef.current = opened.project.projectId
        const loaded = await loadCanonicalProjectV1(opened.project.projectId, controller.signal)
        if (!loaded.ok || controller.signal.aborted) return
        applyReadModel(loaded.readModel)
        if (loaded.readModel.project.activeVersion) {
          hasProjectHistoryRef.current = true
        }
      } catch {
        // Reload is best-effort; submission surfaces auth/read errors explicitly.
      }
    })()
    return () => controller.abort()
  }, [applyReadModel])

  const setChoice = useCallback((key: string, value: string) => {
    setChoices((previous) => ({ ...previous, [key]: value }))
  }, [])

  const setPageCount = useCallback((pageCount: number) => {
    setChoices((previous) => ({ ...previous, pageCount }))
  }, [])

  const sendMessage = useCallback(
    async (text: string, opts?: { planMode?: boolean; mode?: string }) => {
      const trimmed = text.trim()
      if (!trimmed || abortRef.current) return

      const userMessage: ChatMessage = {
        id: nextId("msg"),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      }
      const assistantId = nextId("msg")
      setMessages((previous) => [
        ...previous,
        userMessage,
        { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
      ])

      const initialProjection = createBuildEventProjectionV1()
      setActiveJob(initialProjection)
      setIsStreaming(true)
      const intentDetails = [opts?.mode ? `läge: ${opts.mode}` : null, opts?.planMode ? "planläge" : null]
        .filter(Boolean)
        .join(", ")
      pushLog(`> skickar byggavsikt${intentDetails ? ` (${intentDetails})` : ""}`)

      const controller = new AbortController()
      abortRef.current = controller
      const requestGeneration = ++requestGenerationRef.current

      try {
        // Temporary compatibility seam. Future chat goes through one
        // AgentSession; this call only adapts today's controller response into
        // the reusable BuildEvent projection below.
        const dispatch = await adapter.submitBuildIntent({
          isFollowUp: hasProjectHistoryRef.current,
          message: trimmed,
          choices,
          planMode: opts?.planMode,
          mode: opts?.mode,
          signal: controller.signal,
        })
        if (requestGeneration !== requestGenerationRef.current) return

        let projection = reduceBuildEventsV1(initialProjection, dispatch.events)
        if (dispatch.projectId) projectIdRef.current = dispatch.projectId
        if (!projection.terminal) {
          projection = completeBuildEventStreamV1(
            projection,
            dispatch.error ?? "Byggjobbet saknar terminal status.",
          )
        } else if (projection.terminal === "succeeded" && dispatch.error) {
          projection = rejectBuildEventStreamV1(projection, dispatch.error)
        }

        let canonicalReadModel: CanonicalProjectReadModelV1 | null = null
        if (
          projection.status === "succeeded" &&
          !projection.error &&
          projection.result?.status === "succeeded"
        ) {
          if (!dispatch.projectId) {
            projection = rejectBuildEventStreamV1(
              projection,
              "Byggresultatet saknade en ägarbunden projektidentitet.",
            )
          } else {
            const loaded = await loadCanonicalProjectV1(dispatch.projectId, controller.signal)
            if (!loaded.ok) {
              projection = rejectBuildEventStreamV1(projection, loaded.error)
            } else if (!reconcileBuildSuccessV1(projection.result, loaded.readModel)) {
              projection = rejectBuildEventStreamV1(
                projection,
                "Buildresultatet kunde inte bekräftas mot projektets canonical read model.",
              )
            } else {
              canonicalReadModel = loaded.readModel
            }
          }
        } else if (projection.status === "invalid" && dispatch.projectId) {
          const recovered = await loadCanonicalProjectV1(dispatch.projectId, controller.signal)
          if (recovered.ok) canonicalReadModel = recovered.readModel
        }

        setActiveJob(projection)
        for (const activity of projection.activity) pushLog(activity.message)
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? { ...message, content: assistantContent(projection) }
              : message,
          ),
        )

        if (canonicalReadModel) {
          applyReadModel(canonicalReadModel)
        }
        if (canonicalReadModel && projection.result?.status === "succeeded") {
          setActiveVersionId(projection.result.versionId)
          hasProjectHistoryRef.current = true
        }
      } catch {
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) {
          const projection = rejectBuildEventStreamV1(
            initialProjection,
            "Build-anropet kunde inte slutföras.",
          )
          setActiveJob(projection)
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? { ...message, content: projection.error ?? "Bygget stoppades." }
                : message,
            ),
          )
          pushLog(`fel: ${projection.error ?? "Bygget stoppades."}`)
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (requestGeneration === requestGenerationRef.current) setIsStreaming(false)
      }
    },
    [applyReadModel, choices, pushLog],
  )

  const restoreVersion = useCallback((id: string) => {
    setActiveVersionId((current) =>
      versions.some((version) => version.id === id) ? id : current,
    )
  }, [versions])

  const togglePin = useCallback((id: string) => {
    setVersions((previous) =>
      previous.map((version) =>
        version.id === id ? { ...version, pinned: !version.pinned } : version,
      ),
    )
  }, [])

  const downloadZip = useCallback((id: string) => {
    void adapter.downloadZip(id).catch((error: unknown) => {
      pushLog(`fel: ${error instanceof Error ? error.message : "ZIP-export är inte tillgänglig."}`)
    })
  }, [pushLog])

  const newChat = useCallback(() => {
    requestGenerationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    hasProjectHistoryRef.current = false
    projectIdRef.current = null
    setMessages([])
    setIsStreaming(false)
    setActiveJob(null)
    setVersions([])
    setActiveVersionId(null)
    setPublishState("idle")
    setLogs([])
    setChoices(defaultBuildChoices())
  }, [])

  const publish = useCallback(async () => {
    if (publishState === "publishing") return
    setPublishState("publishing")
    const result = await adapter.publish()
    setPublishState(result.ok ? "published" : "idle")
  }, [publishState])

  const value = useMemo<BuilderStore>(
    () => ({
      choices,
      setChoice,
      setPageCount,
      messages,
      isStreaming,
      activeJob,
      sendMessage,
      promptAssist: adapter.promptAssist,
      logs,
      previewStatus,
      previewUrl,
      sitemapRevision,
      versions,
      activeVersionId,
      restoreVersion,
      togglePin,
      downloadZip,
      newChat,
      publishState,
      publish,
    }),
    [
      choices,
      setChoice,
      setPageCount,
      messages,
      isStreaming,
      activeJob,
      sendMessage,
      logs,
      previewStatus,
      previewUrl,
      sitemapRevision,
      versions,
      activeVersionId,
      restoreVersion,
      togglePin,
      downloadZip,
      newChat,
      publishState,
      publish,
    ],
  )

  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>
}
