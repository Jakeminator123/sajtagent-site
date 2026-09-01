"use client"

// One small browser projection for the Builder. Chat sends AgentTurnRequestV1
// to Site-owned routes; BuildJobV1 is never created in the browser. Preview and
// versions still come only from canonical owner-bound read models.

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

import type {
  AgentEventV1,
  AgentSessionV1,
  AgentTurnRequestV1,
} from "@/contracts/agent-session-v1"
import * as adapter from "@/lib/siteagent/adapter"
import {
  createAgentEventProjectionV1,
  isActiveAgentTurnTerminalV1,
  reduceAgentEventV1,
  rejectAgentEventStreamV1,
  type AgentEventProjectionV1,
} from "@/lib/siteagent/agent-event-reducer"
import { defaultBuildChoices, type BuildChoices } from "@/lib/siteagent/build-choices"
import {
  loadCanonicalProjectV1,
  reconcileAgentPreviewV1,
  toSiteVersionV1,
  type CanonicalProjectReadModelV1,
} from "@/lib/siteagent/read-model"
import type { ChatMessage, PreviewStatus, PublishState, SiteVersion } from "@/lib/siteagent/types"

type SessionStatusV1 = "opening" | "ready" | "error"

interface BuilderStore {
  choices: BuildChoices
  setChoice: (key: string, value: string) => void
  setPageCount: (n: number) => void

  messages: ChatMessage[]
  isStreaming: boolean
  sessionStatus: SessionStatusV1
  agentProjection: AgentEventProjectionV1
  sendMessage: (text: string, opts?: { mode?: string }) => Promise<void>
  answerQuestion: (questionId: string, selections: string[]) => Promise<void>
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

function randomContractId(prefix: "turn" | "msg"): string {
  return `${prefix}:${crypto.randomUUID().replaceAll("-", "")}`
}

function normalizedMode(
  mode: string | undefined,
): AgentTurnRequestV1["uiContext"]["mode"] {
  if (mode === "analyserad" || mode === "analyzed") return "analyzed"
  if (mode === "audit") return "audit"
  if (mode === "template") return "template"
  if (mode === "fritext" || mode === "freeform") return "freeform"
  return undefined
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function eventLogLine(event: AgentEventV1): string | null {
  if (event.type === "turn.accepted") return "Sajtagent tog emot turnen."
  if (event.type === "agent.status") return event.payload.label ?? null
  if (event.type === "tool.started") return `Verktyg: ${event.payload.safeLabel}`
  if (event.type === "tool.completed") return `Verktygsstatus: ${event.payload.status}`
  if (event.type === "build.started") return "Ett avgränsat bygge startade."
  if (event.type === "preview.ready") return "Canonical preview accepterades av Site."
  if (event.type === "question.requested") return "Sajtagent bad om ett strukturerat svar."
  if (event.type === "turn.completed") return `Turn klar: ${event.payload.outcome}`
  if (event.type === "turn.failed") return `Turn stoppad: ${event.payload.message}`
  return null
}

function needsAgentResume(projection: AgentEventProjectionV1): boolean {
  return projection.status !== "invalid" && !isActiveAgentTurnTerminalV1(projection)
}

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [choices, setChoices] = useState<BuildChoices>(defaultBuildChoices)
  const [userMessages, setUserMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<SessionStatusV1>("opening")
  const [agentProjection, setAgentProjection] = useState<AgentEventProjectionV1>(
    createAgentEventProjectionV1,
  )
  const [versions, setVersions] = useState<SiteVersion[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [publishState, setPublishState] = useState<PublishState>("idle")
  const [logs, setLogs] = useState<string[]>([])

  const projectIdRef = useRef<string | null>(null)
  const baseRevisionIdRef = useRef<string | null>(null)
  const sessionRef = useRef<AgentSessionV1 | null>(null)
  const projectionRef = useRef<AgentEventProjectionV1>(agentProjection)
  const bootstrapPromiseRef = useRef<Promise<AgentSessionV1> | null>(null)
  const sessionGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)

  const assistantMessages = useMemo<ChatMessage[]>(
    () =>
      agentProjection.messageOrder.flatMap((messageId) => {
        const message = agentProjection.messages[messageId]
        return message
          ? [
              {
                id: message.messageId,
                role: "assistant" as const,
                content: message.content,
                createdAt: message.createdAt,
                turnId: message.turnId,
              },
            ]
          : []
      }),
    [agentProjection.messageOrder, agentProjection.messages],
  )
  const messages = useMemo(
    () =>
      [...userMessages, ...assistantMessages].sort(
        (left, right) => left.createdAt - right.createdAt,
      ),
    [assistantMessages, userMessages],
  )

  const activeVersion = useMemo(
    () => versions.find((version) => version.id === activeVersionId) ?? null,
    [activeVersionId, versions],
  )
  const previewUrl = activeVersion?.previewUrl ?? null
  const sitemapRevision = activeVersion?.sitemapRevision ?? null
  const activeTurn = agentProjection.activeTurnId
    ? agentProjection.turns[agentProjection.activeTurnId]
    : null
  const buildActive = Boolean(activeTurn?.buildJobId && !activeTurn.terminal)
  const previewStatus: PreviewStatus = activeVersion
    ? "ready"
    : buildActive
      ? "building"
      : agentProjection.status === "failed" || agentProjection.status === "invalid"
        ? "error"
        : "idle"

  const pushLog = useCallback((line: string) => {
    const timestamp = new Date().toLocaleTimeString("sv-SE", { hour12: false })
    setLogs((previous) => [...previous.slice(-199), `${timestamp}  ${line}`])
  }, [])

  const applyProjection = useCallback((projection: AgentEventProjectionV1) => {
    projectionRef.current = projection
    setAgentProjection(projection)
  }, [])

  const applyReadModel = useCallback((readModel: CanonicalProjectReadModelV1) => {
    baseRevisionIdRef.current = readModel.project.activeRevisionId
    setVersions((previous) =>
      readModel.versions.map((version) => ({
        ...toSiteVersionV1(version),
        pinned: previous.find((item) => item.id === version.versionId)?.pinned ?? false,
      })),
    )
    setActiveVersionId(readModel.project.activeVersion?.versionId ?? null)
  }, [])

  const startSession = useCallback(
    (signal?: AbortSignal): Promise<AgentSessionV1> => {
      if (sessionRef.current) return Promise.resolve(sessionRef.current)
      if (bootstrapPromiseRef.current) return bootstrapPromiseRef.current

      setSessionStatus("opening")
      const sessionGeneration = ++sessionGenerationRef.current
      const promise = (async () => {
        const opened = await adapter.openDefaultProject(signal)
        if (!opened.ok) throw new Error(opened.error)
        projectIdRef.current = opened.project.projectId
        baseRevisionIdRef.current = opened.project.activeRevisionId

        const readModelPromise = loadCanonicalProjectV1(
          opened.project.projectId,
          signal,
        ).catch(() => ({
          ok: false as const,
          error: "Projektets canonical read model kunde inte hämtas.",
        }))
        const [session, loaded] = await Promise.all([
          adapter.openAgentSessionV1(opened.project.projectId, signal),
          readModelPromise,
        ])
        if (
          signal?.aborted ||
          sessionGeneration !== sessionGenerationRef.current
        ) {
          throw new DOMException("Aborted", "AbortError")
        }

        sessionRef.current = session
        baseRevisionIdRef.current = session.activeBaseRevisionId
        applyProjection(createAgentEventProjectionV1(session.sessionId))
        setSessionStatus("ready")

        if (
          loaded.ok &&
          loaded.readModel.project.activeRevisionId === session.activeBaseRevisionId
        ) {
          applyReadModel(loaded.readModel)
        } else if (!loaded.ok) {
          pushLog(`canonical state: ${loaded.error}`)
        } else {
          pushLog("canonical state: basrevisionen ändrades medan sessionen öppnades.")
        }
        return session
      })()

      bootstrapPromiseRef.current = promise
      const clearBootstrap = () => {
        if (bootstrapPromiseRef.current === promise) bootstrapPromiseRef.current = null
      }
      void promise.then(clearBootstrap, clearBootstrap)
      return promise
    },
    [applyProjection, applyReadModel, pushLog],
  )

  useEffect(() => {
    const controller = new AbortController()
    void startSession(controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setSessionStatus("error")
      applyProjection(
        rejectAgentEventStreamV1(
          createAgentEventProjectionV1(),
          errorMessage(error, "Sajtagent-sessionen kunde inte öppnas."),
        ),
      )
    })
    return () => {
      controller.abort()
      if (!sessionRef.current) {
        sessionGenerationRef.current += 1
        bootstrapPromiseRef.current = null
      }
      abortRef.current?.abort()
    }
  }, [applyProjection, startSession])

  const setChoice = useCallback((key: string, value: string) => {
    setChoices((previous) => ({ ...previous, [key]: value }))
  }, [])

  const setPageCount = useCallback((pageCount: number) => {
    setChoices((previous) => ({ ...previous, pageCount }))
  }, [])

  const runTurn = useCallback(
    async (
      text: string,
      opts: {
        mode?: string
        replyToQuestionId?: string
        answerSelections?: string[]
      } = {},
    ) => {
      const trimmed = text.trim()
      if (!trimmed || abortRef.current) return
      if (projectionRef.current.status === "invalid") {
        pushLog("meddelandet stoppades: öppna en ny chatt efter integritetsfelet.")
        return
      }
      if (agentProjection.pendingQuestion && !opts.replyToQuestionId) {
        pushLog("meddelandet stoppades: svara först på Sajtagents fråga.")
        return
      }

      const controller = new AbortController()
      abortRef.current = controller
      const requestGeneration = ++requestGenerationRef.current
      setIsStreaming(true)

      try {
        const session = await startSession(controller.signal)
        if (requestGeneration !== requestGenerationRef.current) return
        const selectedBaseRevisionId =
          baseRevisionIdRef.current ?? session.activeBaseRevisionId
        const turnId = randomContractId("turn")
        const request: AgentTurnRequestV1 = {
          schemaVersion: 1,
          sessionId: session.sessionId,
          turnId,
          idempotencyKey: `browser:${crypto.randomUUID()}`,
          message: trimmed,
          replyToQuestionId: opts.replyToQuestionId,
          answerSelections: opts.answerSelections,
          uiContext: {
            selectedBaseRevisionId,
            buildChoices: choices,
            mode: normalizedMode(opts.mode),
          },
        }

        setUserMessages((previous) => [
          ...previous,
          {
            id: randomContractId("msg"),
            role: "user",
            content: trimmed,
            createdAt: Date.now(),
            turnId,
          },
        ])
        pushLog("> skickar agentturn till Sajtagent")

        const onEvent = (event: AgentEventV1) => {
          if (event.sessionId !== session.sessionId || event.turnId !== turnId) {
            const rejected = rejectAgentEventStreamV1(
              projectionRef.current,
              "Agentströmmen svarade för fel session eller turn.",
            )
            applyProjection(rejected)
            throw new Error(rejected.error ?? "Fel session eller turn.")
          }
          const next = reduceAgentEventV1(projectionRef.current, event)
          applyProjection(next)
          const logLine = eventLogLine(event)
          if (logLine) pushLog(logLine)
          if (next.status === "invalid") {
            throw new Error(next.error ?? "Agentströmmen stoppades felsäkert.")
          }
        }

        let transportError: unknown = null
        try {
          await adapter.sendAgentTurnV1(request, onEvent, {
            signal: controller.signal,
          })
        } catch (error) {
          transportError = error
        }

        if (
          !controller.signal.aborted &&
          needsAgentResume(projectionRef.current)
        ) {
          try {
            pushLog(`återupptar agentström efter sekvens ${projectionRef.current.lastSequence}`)
            await adapter.resumeAgentEventsV1(
              session.sessionId,
              projectionRef.current.lastSequence,
              onEvent,
              { signal: controller.signal },
            )
          } catch (error) {
            transportError ??= error
          }
        }

        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) {
          return
        }
        if (!isActiveAgentTurnTerminalV1(projectionRef.current)) {
          const rejected = rejectAgentEventStreamV1(
            projectionRef.current,
            errorMessage(
              transportError,
              "Agentströmmen avslutades utan terminal turnstatus.",
            ),
          )
          applyProjection(rejected)
          pushLog(`fel: ${rejected.error ?? "Agentströmmen stoppades."}`)
          return
        }

        const previewCandidate = projectionRef.current.canonicalPreviewCandidate
        const currentTurn = projectionRef.current.activeTurnId
          ? projectionRef.current.turns[projectionRef.current.activeTurnId]
          : null
        if (
          currentTurn?.terminal?.kind === "completed" &&
          currentTurn.terminal.outcome === "built" &&
          previewCandidate
        ) {
          const projectId = projectIdRef.current
          const loaded = projectId
            ? await loadCanonicalProjectV1(projectId, controller.signal)
            : { ok: false as const, error: "Agentturnen saknade projektidentitet." }
          if (
            !loaded.ok ||
            !reconcileAgentPreviewV1(previewCandidate, loaded.readModel)
          ) {
            const rejected = rejectAgentEventStreamV1(
              projectionRef.current,
              loaded.ok
                ? "Agentens preview kunde inte bekräftas mot canonical projektstate."
                : loaded.error,
            )
            applyProjection(rejected)
            pushLog(`fel: ${rejected.error ?? "Preview kunde inte verifieras."}`)
            return
          }
          applyReadModel(loaded.readModel)
        }
      } catch (error) {
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) {
          const rejected = rejectAgentEventStreamV1(
            projectionRef.current,
            errorMessage(error, "Agentturnen kunde inte slutföras."),
          )
          applyProjection(rejected)
          pushLog(`fel: ${rejected.error ?? "Agentturnen stoppades."}`)
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (requestGeneration === requestGenerationRef.current) setIsStreaming(false)
      }
    },
    [
      agentProjection.pendingQuestion,
      applyProjection,
      applyReadModel,
      choices,
      pushLog,
      startSession,
    ],
  )

  const sendMessage = useCallback(
    (text: string, opts?: { mode?: string }) => runTurn(text, opts),
    [runTurn],
  )

  const answerQuestion = useCallback(
    async (questionId: string, selections: string[]) => {
      const question = projectionRef.current.pendingQuestion
      const normalized = selections.map((selection) => selection.trim()).filter(Boolean)
      if (
        !question ||
        question.questionId !== questionId ||
        normalized.length === 0 ||
        normalized.length > 4 ||
        new Set(normalized).size !== normalized.length ||
        (!question.multiSelect && normalized.length !== 1)
      ) {
        pushLog("frågesvaret stoppades: valet matchade inte den aktiva frågan.")
        return
      }
      const allowedLabels = new Set(question.options.map((option) => option.label))
      if (
        !question.isOther &&
        question.options.length > 0 &&
        normalized.some((selection) => !allowedLabels.has(selection))
      ) {
        pushLog("frågesvaret stoppades: ett val saknades i frågans alternativ.")
        return
      }
      await runTurn(normalized.join(", "), {
        replyToQuestionId: questionId,
        answerSelections: normalized,
      })
    },
    [pushLog, runTurn],
  )

  const restoreVersion = useCallback(
    (id: string) => {
      setActiveVersionId((current) =>
        versions.some((version) => version.id === id) ? id : current,
      )
    },
    [versions],
  )

  const togglePin = useCallback((id: string) => {
    setVersions((previous) =>
      previous.map((version) =>
        version.id === id ? { ...version, pinned: !version.pinned } : version,
      ),
    )
  }, [])

  const downloadZip = useCallback(
    (id: string) => {
      void adapter.downloadZip(id).catch((error: unknown) => {
        pushLog(`fel: ${errorMessage(error, "ZIP-export är inte tillgänglig.")}`)
      })
    },
    [pushLog],
  )

  const newChat = useCallback(() => {
    requestGenerationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    sessionRef.current = null
    sessionGenerationRef.current += 1
    bootstrapPromiseRef.current = null
    setUserMessages([])
    setIsStreaming(false)
    setPublishState("idle")
    setLogs([])
    setChoices(defaultBuildChoices())
    applyProjection(createAgentEventProjectionV1())
    void startSession().catch((error: unknown) => {
      setSessionStatus("error")
      applyProjection(
        rejectAgentEventStreamV1(
          createAgentEventProjectionV1(),
          errorMessage(error, "En ny Sajtagent-session kunde inte öppnas."),
        ),
      )
    })
  }, [applyProjection, startSession])

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
      sessionStatus,
      agentProjection,
      sendMessage,
      answerQuestion,
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
      sessionStatus,
      agentProjection,
      sendMessage,
      answerQuestion,
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
