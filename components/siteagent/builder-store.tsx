"use client"

// Siteagent — central klient-state. Produktavsikter går via den tunna
// adaptern till Site-controllern; klienten avgör aldrig om ett bygge lyckats.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { defaultBuildChoices, type BuildChoices } from "@/lib/siteagent/build-choices"
import * as adapter from "@/lib/siteagent/adapter"
import type { ChatMessage, PreviewStatus, PublishState, SiteVersion } from "@/lib/siteagent/types"

interface BuilderStore {
  // Byggval
  choices: BuildChoices
  setChoice: (key: string, value: string) => void
  setPageCount: (n: number) => void

  // Chat
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (text: string, opts?: { planMode?: boolean; mode?: string }) => Promise<void>
  promptAssist: (text: string) => Promise<string>

  // Logg — strömmande händelser från motorn (visas på chatkortet)
  logs: string[]

  // Preview
  previewStatus: PreviewStatus
  previewUrl: string | null
  previewSrcDoc: string | null
  previewPages: string[]

  // Versioner
  versions: SiteVersion[]
  activeVersionId: string | null
  restoreVersion: (id: string) => void
  togglePin: (id: string) => void
  downloadZip: (id: string) => void

  // Toppbar
  newChat: () => void
  publishState: PublishState
  publish: () => Promise<void>
}

const BuilderContext = createContext<BuilderStore | null>(null)

export function useBuilder(): BuilderStore {
  const ctx = useContext(BuilderContext)
  if (!ctx) throw new Error("useBuilder must be used within BuilderProvider")
  return ctx
}

let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idCounter++}`

export function BuilderProvider({ children }: { children: React.ReactNode }) {
  const [choices, setChoices] = useState<BuildChoices>(defaultBuildChoices)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewSrcDoc, setPreviewSrcDoc] = useState<string | null>(null)
  const [previewPages, setPreviewPages] = useState<string[]>([])
  const [versions, setVersions] = useState<SiteVersion[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [publishState, setPublishState] = useState<PublishState>("idle")
  const [logs, setLogs] = useState<string[]>([])

  const pushLog = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString("sv-SE", { hour12: false })
    setLogs((prev) => [...prev.slice(-199), `${ts}  ${line}`])
  }, [])

  const chatIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const setChoice = useCallback((key: string, value: string) => {
    setChoices((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setPageCount = useCallback((n: number) => {
    setChoices((prev) => ({ ...prev, pageCount: n }))
  }, [])

  const sendMessage = useCallback(
    async (text: string, opts?: { planMode?: boolean; mode?: string }) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      const userMsg: ChatMessage = {
        id: nextId("msg"),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      }
      const assistantId = nextId("msg")
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
      ])
      setIsStreaming(true)
      setPreviewStatus("starting")
      const intentDetails = [opts?.mode ? `läge: ${opts.mode}` : null, opts?.planMode ? "planläge" : null]
        .filter(Boolean)
        .join(", ")
      pushLog(`> skickar byggavsikt${intentDetails ? ` (${intentDetails})` : ""}`)

      // Ny version i "building"-läge
      const versionId = nextId("v")
      setVersions((prev) => [
        {
          id: versionId,
          label: `Version ${prev.length + 1}`,
          status: "building",
          previewUrl: null,
          srcDoc: null,
          pages: [],
          createdAt: Date.now(),
          pinned: false,
        },
        ...prev,
      ])
      setActiveVersionId(versionId)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await adapter.streamChat({
          chatId: chatIdRef.current,
          message: trimmed,
          choices,
          planMode: opts?.planMode,
          mode: opts?.mode,
          signal: controller.signal,
          onEvent: (ev) => {
            if (ev.type === "progress") {
              pushLog(ev.message)
            } else if (ev.type === "text") {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + ev.delta } : m))
              )
            } else if (ev.type === "preview") {
              pushLog(`verifierad preview — ${(ev.pages ?? []).length || 1} sida/sidor`)
              setPreviewUrl(ev.url ?? null)
              setPreviewSrcDoc(ev.srcDoc ?? null)
              setPreviewPages(ev.pages ?? [])
              setPreviewStatus("ready")
              setVersions((prev) =>
                prev.map((v) =>
                  v.id === versionId
                    ? { ...v, previewUrl: ev.url ?? null, srcDoc: ev.srcDoc ?? null, pages: ev.pages ?? [] }
                    : v
                )
              )
            } else if (ev.type === "done") {
              chatIdRef.current ??= nextId("chat")
              pushLog("verifierat bygge klart")
              setVersions((prev) =>
                prev.map((v) => (v.id === versionId ? { ...v, status: "ready" as const } : v))
              )
            } else if (ev.type === "error") {
              pushLog(`fel: ${ev.message}`)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId && !m.content ? { ...m, content: ev.message } : m
                )
              )
              setPreviewStatus("error")
              setVersions((prev) =>
                prev.map((v) => (v.id === versionId ? { ...v, status: "error" as const } : v))
              )
            }
          },
        })
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsStreaming(false)
      }
    },
    [choices, isStreaming, pushLog]
  )

  const restoreVersion = useCallback((id: string) => {
    setVersions((prev) => {
      const v = prev.find((x) => x.id === id)
      if (v) {
        setActiveVersionId(id)
        setPreviewUrl(v.previewUrl)
        setPreviewSrcDoc(v.srcDoc)
        setPreviewPages(v.pages)
        setPreviewStatus(v.status === "ready" ? "ready" : "idle")
      }
      return prev
    })
  }, [])

  const togglePin = useCallback((id: string) => {
    setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, pinned: !v.pinned } : v)))
  }, [])

  const downloadZip = useCallback((id: string) => {
    void adapter.downloadZip(id)
  }, [])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    chatIdRef.current = null
    setMessages([])
    setIsStreaming(false)
    setPreviewStatus("idle")
    setPreviewUrl(null)
    setPreviewSrcDoc(null)
    setPreviewPages([])
    setVersions([])
    setActiveVersionId(null)
    setPublishState("idle")
    setLogs([])
    setChoices(defaultBuildChoices())
  }, [])

  const publish = useCallback(async () => {
    if (publishState === "publishing") return
    setPublishState("publishing")
    const res = await adapter.publish()
    setPublishState(res.ok ? "published" : "idle")
  }, [publishState])

  const value = useMemo<BuilderStore>(
    () => ({
      choices,
      setChoice,
      setPageCount,
      messages,
      isStreaming,
      sendMessage,
      promptAssist: adapter.promptAssist,
      logs,
      previewStatus,
      previewUrl,
      previewSrcDoc,
      previewPages,
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
      sendMessage,
      logs,
      previewStatus,
      previewUrl,
      previewSrcDoc,
      previewPages,
      versions,
      activeVersionId,
      restoreVersion,
      togglePin,
      downloadZip,
      newChat,
      publishState,
      publish,
    ]
  )

  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>
}
