"use client"

// One small browser projection for the Builder. Sajtagent sends
// AgentTurnRequestV1 to Site-owned routes; BuildJobV1 is never created in the
// browser. Preview and versions still come only from canonical owner-bound
// read models.

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
import { builderProjectHref, createProject, openProject } from "@/lib/siteagent/project-browser"
import { draftAfterDelivery, hasAcceptedDraftTurn, withLandingDraft, type LandingDraft } from "@/lib/siteagent/landing-draft"
import { applyExpectedTurnStreamEventV1 } from "@/lib/siteagent/agent-event-stream-apply"
import {
  createAgentEventProjectionV1,
  hasRunningAgentTurnV1,
  isAgentTurnTerminalV1,
  rejectAgentEventStreamV1,
  type AgentEventProjectionV1,
} from "@/lib/siteagent/agent-event-reducer"
import {
  catchUpAgentEventProjectionV1,
  loadAgentEventProjectionV1,
} from "@/lib/siteagent/agent-session-bootstrap"
import { defaultBuildChoices, type BuildChoices } from "@/lib/siteagent/build-choices"
import {
  advanceAgentSessionBaseV1,
  loadCanonicalProjectV1,
  reconcileAgentPreviewV1,
  toSiteVersionV1,
  type CanonicalProjectReadModelV1,
} from "@/lib/siteagent/read-model"
import type { ChatMessage, PreviewStatus, PublishState, SiteVersion } from "@/lib/siteagent/types"
import { canSendWithNextProfile, isNextBuildActive, reconcileNextPreview, type NextAvailability, type NextBuildProfile, type NextProjectState } from "@/lib/siteagent/next-preview-client"
import { nextPreviewRouteAfterChange } from "@/lib/siteagent/preview-route-tree"
import { useNextProject } from "./use-next-project"

type SessionStatusV1 = "opening" | "ready" | "error"

interface BuilderStore {
  projectId: string | null
  projectName: string | null
  draftMessage: string
  landingDraft: LandingDraft | null
  setDraftMessage: (text: string) => void
  sendDraftMessage: () => Promise<void>
  choices: BuildChoices
  setChoice: (key: string, value: string) => void
  setPageCount: (n: number) => void

  messages: ChatMessage[]
  isStreaming: boolean
  canSendTurn: boolean
  sessionStatus: SessionStatusV1
  agentProjection: AgentEventProjectionV1
  sendMessage: (text: string, opts?: { mode?: string }) => Promise<void>
  answerQuestion: (questionId: string, selections: string[]) => Promise<void>
  promptAssist: (text: string) => Promise<string>
  logs: string[]

  previewStatus: PreviewStatus
  previewUrl: string | null
  sitemapRevision: string | null
  previewRoutes: string[]
  previewRoute: string
  setPreviewRoute: (route: string) => void
  previewKind: "html" | "next"
  nextState: NextProjectState | null
  nextAvailability: NextAvailability
  nextError: string
  buildProfile: NextBuildProfile | null
  buildProfileStatus: string | null
  setBuildProfilePreference: (preference: "html" | "next") => Promise<void>
  showNextPreview: () => void
  refreshNextPreview: () => Promise<void>
  cancelNextBuild: () => Promise<void>
  mutateNextPages: (op: "add" | "remove", route: string) => Promise<void>
  canMutateNextPages: boolean

  versions: SiteVersion[]
  activeVersionId: string | null
  restoreVersion: (id: string) => void
  togglePin: (id: string) => void

  newChat: () => void
  selectProject: (projectId: string) => void
  newProject: (name?: string) => Promise<{ ok: true } | { ok: false; error: string }>
  resetStarter: () => Promise<{ ok: true } | { ok: false; error: string }>
  isResettingProject: boolean
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

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError",
  )
}

function eventLogLine(event: AgentEventV1): string | null {
  if (event.type === "turn.accepted") return "Sajtagent tog emot turnen."
  if (event.type === "agent.status") return event.payload.label ?? null
  if (event.type === "tool.started") return `Verktyg: ${event.payload.safeLabel}`
  if (event.type === "tool.completed") return `Verktygsstatus: ${event.payload.status}`
  if (event.type === "build.started") return "Ett avgränsat bygge startade."
  if (event.type === "preview.ready") return "Canonical preview accepterades av Site."
  if (event.type === "next.preview.ready") return "React-preview accepterades av Site."
  if (event.type === "question.requested") return "Sajtagent bad om ett strukturerat svar."
  if (event.type === "turn.completed") return `Turn klar: ${event.payload.outcome}`
  if (event.type === "turn.failed") return `Turn stoppad: ${event.payload.message}`
  return null
}

function needsAgentResume(
  projection: AgentEventProjectionV1,
  turnId: string,
): boolean {
  return projection.status !== "invalid" && !isAgentTurnTerminalV1(projection, turnId)
}

function projectionAllowsRetry(projection: AgentEventProjectionV1): boolean {
  return projection.status !== "invalid"
}

export function BuilderProvider({ children, initialProjectId = null, initialDraft = null }: { children: ReactNode; initialProjectId?: string | null; initialDraft?: LandingDraft | null }) {
  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [draftMessage, setDraftMessageState] = useState(initialDraft?.text ?? "")
  const draftMessageRef = useRef(initialDraft?.text ?? "")
  const [landingDraft, setLandingDraft] = useState<LandingDraft | null>(initialDraft)
  const landingDraftRef = useRef<LandingDraft | null>(initialDraft)
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
  const [isResettingProject, setIsResettingProject] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const nextProject = useNextProject(projectId)
  const [previewSelection, setPreviewSelection] = useState<"auto" | "html" | "next">("auto")
  const [previewRoute, setPreviewRouteState] = useState("/")
  const previousPreviewRoutesRef = useRef<string[]>([])
  const pendingPreviewRouteRef = useRef<string | null>(null)
  const nextBuildActive = isNextBuildActive(nextProject.state?.current ?? null)
  const nextCurrent = nextProject.state?.current ?? null
  const buildProfileReady = canSendWithNextProfile(nextProject.availability, nextProject.hasNext)
  const buildProfileStatus = buildProfileReady ? null : nextProject.availability === "loading"
    ? "Läser byggläge. Ditt utkast ligger kvar."
    : nextProject.availability === "unavailable" ? "React är avstängt. Läs byggläget igen när det är aktiverat."
      : "Byggläget kunde inte läsas. Försök igen via previewn."
  const previewKind = previewSelection === "html" ? "html" :
    previewSelection === "next" || nextProject.hasNext ? "next" : "html"
  const refreshNextState = nextProject.refresh

  const projectIdRef = useRef<string | null>(initialProjectId)
  const baseRevisionIdRef = useRef<string | null>(null)
  const sessionRef = useRef<AgentSessionV1 | null>(null)
  const projectionRef = useRef<AgentEventProjectionV1>(agentProjection)
  const bootstrapPromiseRef = useRef<Promise<AgentSessionV1> | null>(null)
  const sessionGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)
  const resettingProjectRef = useRef(false)

  const setDraftMessage = useCallback((text: string) => {
    draftMessageRef.current = text
    setDraftMessageState(text)
    if (landingDraftRef.current) {
      const next = text.trim() ? { ...landingDraftRef.current, text } : null
      landingDraftRef.current = next
      setLandingDraft(next)
      window.history.replaceState(null, "", withLandingDraft(window.location.href, next))
    }
  }, [])

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
  const previewUrl = previewKind === "html" ? activeVersion?.previewUrl ?? null : null
  const sitemapRevision = previewKind === "html" ? activeVersion?.sitemapRevision ?? null : null
  const previewRoutes = useMemo(() => {
    if (previewKind === "next") return nextProject.state?.accepted?.routes ?? []
    return previewKind === "html" && activeVersion ? ["/"] : []
  }, [previewKind, nextProject.state?.accepted?.routes, activeVersion])

  useEffect(() => {
    const previousRoutes = previousPreviewRoutesRef.current
    const nextRoute = nextPreviewRouteAfterChange({
      previousRoutes,
      nextRoutes: previewRoutes,
      currentRoute: previewRoute,
      pendingRoute: pendingPreviewRouteRef.current,
    })
    previousPreviewRoutesRef.current = previewRoutes
    if (pendingPreviewRouteRef.current && previewRoutes.includes(pendingPreviewRouteRef.current)) {
      pendingPreviewRouteRef.current = null
    }
    if (nextRoute !== previewRoute) setPreviewRouteState(nextRoute)
  }, [previewRoutes, previewRoute])

  const setPreviewRoute = useCallback((route: string) => {
    setPreviewRouteState((current) => (previewRoutes.includes(route) ? route : current))
  }, [previewRoutes])

  const activeTurn = agentProjection.activeTurnId
    ? agentProjection.turns[agentProjection.activeTurnId]
    : null
  const agentTurnActive = hasRunningAgentTurnV1(agentProjection)
  const buildActive = Boolean(activeTurn?.buildJobId && !activeTurn.terminal) || nextBuildActive
  const latestTurnId = agentProjection.turnOrder.at(-1) ?? null
  const latestTurn = latestTurnId ? agentProjection.turns[latestTurnId] ?? null : null
  const buildFailed = Boolean(
    latestTurn?.buildJobId && latestTurn.terminal?.kind === "failed",
  )
  // Conversation failures stay in the Sajtagent card. Preview only shows a
  // build error when a real BuildJob failed and no version exists yet.
  const previewStatus: PreviewStatus = buildActive
    ? "building"
    : (previewKind === "next" ? nextProject.state?.accepted : activeVersion)
      ? "ready"
      : buildFailed
        ? "error"
        : "idle"
  const canSendTurn =
    !isStreaming && !isResettingProject && !nextBuildActive && !agentTurnActive &&
    buildProfileReady &&
    sessionStatus === "ready" &&
    !agentProjection.pendingQuestion &&
    agentProjection.status !== "invalid"

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
    if (sessionRef.current) {
      sessionRef.current =
        advanceAgentSessionBaseV1(sessionRef.current, readModel) ??
        sessionRef.current
    }
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
        const requestedProjectId = projectIdRef.current
        const opened = requestedProjectId
          ? { ok: true as const, project: await openProject(requestedProjectId, signal) }
          : await adapter.openDefaultProject(signal)
        if (!opened.ok) throw new Error(opened.error)
        // A cancelled bootstrap must not overwrite a newer project/session.
        if (signal?.aborted || sessionGeneration !== sessionGenerationRef.current) {
          throw new DOMException("Aborted", "AbortError")
        }
        projectIdRef.current = opened.project.projectId
        setProjectId(opened.project.projectId)
        setProjectName("name" in opened.project ? opened.project.name : "Ditt personliga startprojekt")
        const url = new URL(window.location.href)
        url.searchParams.set("project", opened.project.projectId)
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)

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

        const hydratedProjection = await loadAgentEventProjectionV1(
          session.sessionId,
          { signal },
        )
        if (
          signal?.aborted ||
          sessionGeneration !== sessionGenerationRef.current
        ) {
          throw new DOMException("Aborted", "AbortError")
        }

        sessionRef.current = session
        baseRevisionIdRef.current = session.activeBaseRevisionId
        applyProjection(hydratedProjection)
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
      })().catch((error: unknown) => {
        if (signal?.aborted || sessionGeneration !== sessionGenerationRef.current) {
          throw new DOMException("Aborted", "AbortError")
        }
        throw error
      })

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
      if (controller.signal.aborted || isAbortError(error)) return
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
      sessionGenerationRef.current += 1
      requestGenerationRef.current += 1
      bootstrapPromiseRef.current = null
      abortRef.current?.abort()
    }
  }, [applyProjection, startSession])

  // A reload can land while source generation has an active agent turn but no
  // Next worker row yet. Recover its durable events without enabling reset or
  // starting a second turn. Serial reads also let Site expire abandoned turns.
  useEffect(() => {
    if (!agentTurnActive || isStreaming || !agentProjection.sessionId || agentProjection.status === "invalid") return
    const sessionId = agentProjection.sessionId
    const sessionGeneration = sessionGenerationRef.current
    const requestGeneration = requestGenerationRef.current
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const current = () => !controller.signal.aborted && sessionGeneration === sessionGenerationRef.current &&
      requestGeneration === requestGenerationRef.current && projectionRef.current.sessionId === sessionId
    async function recover() {
      const readAbort = new AbortController()
      const abortRead = () => readAbort.abort()
      controller.signal.addEventListener("abort", abortRead, {once: true})
      const deadline = setTimeout(abortRead, 10_000)
      try {
        const seed = projectionRef.current
        if (!current() || seed.status === "invalid") return
        const recovered = await catchUpAgentEventProjectionV1(seed, {signal: readAbort.signal})
        if (!current() || projectionRef.current !== seed) return
        const latest = recovered.activeTurnId ? recovered.turns[recovered.activeTurnId] : null
        const expectedProject = projectIdRef.current
        if (recovered.status !== "invalid" && latest?.terminal?.kind === "completed" && latest.terminal.outcome === "built" && expectedProject) {
          if (latest.previewResult) {
            const loaded = await loadCanonicalProjectV1(expectedProject, readAbort.signal)
            if (!current() || projectionRef.current !== seed) return
            if (loaded.ok && reconcileAgentPreviewV1(latest.previewResult, loaded.readModel)) {
              applyReadModel(loaded.readModel)
              setPreviewSelection("html")
            }
          } else if (latest.nextPreviewResult) {
            const state = await refreshNextState(readAbort.signal)
            if (!current() || projectionRef.current !== seed) return
            if (state && reconcileNextPreview(latest.nextPreviewResult, state, expectedProject)) setPreviewSelection("next")
          }
        }
        if (!current() || projectionRef.current !== seed) return
        applyProjection(recovered)
        if (recovered.status === "invalid" || !hasRunningAgentTurnV1(recovered)) return
      } catch { /* Keep the pending turn locked; the next bounded read retries. */ }
      finally { clearTimeout(deadline); controller.signal.removeEventListener("abort", abortRead) }
      if (current()) timer = setTimeout(() => void recover(), 3000)
    }
    void recover()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [agentTurnActive, isStreaming, agentProjection.sessionId, agentProjection.status, applyProjection, applyReadModel, refreshNextState])

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
        onAccepted?: () => void
      } = {},
    ) => {
      const trimmed = text.trim()
      if (!trimmed || abortRef.current || resettingProjectRef.current || nextBuildActive) return
      if (!buildProfileReady) {
        pushLog("Meddelandet väntar tills projektets byggläge har bekräftats. Uppdatera previewn och försök igen.")
        return
      }
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
        let deliveryTurnId: string | null = null
        let acknowledged = false
        const acknowledgeDelivery = () => {
          if (acknowledged || !deliveryTurnId || controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return
          const projection = projectionRef.current
          if (!hasAcceptedDraftTurn(projection, session.sessionId, deliveryTurnId)) return
          acknowledged = true
          opts.onAccepted?.()
        }

        const syncSessionProjection = async () => {
          const current = projectionRef.current
          if (current.status === "invalid") return current
          const seeded =
            current.sessionId === session.sessionId
              ? current
              : current.sessionId
                ? current
                : { ...current, sessionId: session.sessionId }
          if (seeded.sessionId !== session.sessionId) return current
          const caughtUp = await catchUpAgentEventProjectionV1(seeded, {
            signal: controller.signal,
          })
          if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return current
          applyProjection(caughtUp)
          acknowledgeDelivery()
          return caughtUp
        }

        const reconcileLatestBuiltTurn = async () => {
          const latestTurnId = projectionRef.current.turnOrder.at(-1) ?? null
          const latestTurn = latestTurnId
            ? projectionRef.current.turns[latestTurnId] ?? null
            : null
          if (
            latestTurn?.terminal?.kind !== "completed" ||
            latestTurn.terminal.outcome !== "built" ||
            !projectIdRef.current
          ) {
            return
          }
          if (latestTurn.nextPreviewResult) {
            const expectedProject = projectIdRef.current
            const state = await refreshNextState(controller.signal)
            if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current &&
              projectIdRef.current === expectedProject && state &&
              reconcileNextPreview(latestTurn.nextPreviewResult, state, expectedProject)) {
              setPreviewSelection("next")
            }
            return
          }
          if (!latestTurn.previewResult) return
          const loaded = await loadCanonicalProjectV1(
            projectIdRef.current,
            controller.signal,
          )
          if (
            !controller.signal.aborted && requestGeneration === requestGenerationRef.current &&
            loaded.ok &&
            reconcileAgentPreviewV1(latestTurn.previewResult, loaded.readModel)
          ) {
            applyReadModel(loaded.readModel)
          }
        }

        await syncSessionProjection()
        if (
          controller.signal.aborted ||
          requestGeneration !== requestGenerationRef.current
        ) {
          return
        }
        await reconcileLatestBuiltTurn()
        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return

        const openTurnId = projectionRef.current.activeTurnId
        const openTurn = openTurnId
          ? projectionRef.current.turns[openTurnId] ?? null
          : null
        if (openTurn && !openTurn.terminal) {
          pushLog("meddelandet stoppades: föregående turn pågår fortfarande.")
          return
        }

        const selectedBaseRevisionId =
          baseRevisionIdRef.current ?? session.activeBaseRevisionId
        const turnId = randomContractId("turn")
        deliveryTurnId = turnId
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

        const onEvent = async (event: AgentEventV1) => {
          if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return
          if (event.sequence > projectionRef.current.lastSequence + 1) {
            pushLog(
              `synkroniserar agenthistorik efter sekvens ${projectionRef.current.lastSequence}`,
            )
            await syncSessionProjection()
          }
          if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return
          const result = applyExpectedTurnStreamEventV1({
            projection: projectionRef.current,
            event,
            expectedSessionId: session.sessionId,
            expectedTurnId: turnId,
          })
          applyProjection(result.projection)
          acknowledgeDelivery()
          if (result.kind !== "ignored") {
            const logLine = eventLogLine(event)
            if (logLine) pushLog(logLine)
          }
          if (result.projection.status === "invalid") {
            throw new Error(
              result.projection.error ?? "Agentströmmen stoppades felsäkert.",
            )
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
          needsAgentResume(projectionRef.current, turnId)
        ) {
          try {
            pushLog(`återupptar agentström efter sekvens ${projectionRef.current.lastSequence}`)
            await syncSessionProjection()
            await reconcileLatestBuiltTurn()
          } catch (error) {
            transportError ??= error
          }
        }

        if (
          !controller.signal.aborted &&
          requestGeneration === requestGenerationRef.current &&
          projectionAllowsRetry(projectionRef.current) &&
          !projectionRef.current.turns[turnId]
        ) {
          const retryRequest: AgentTurnRequestV1 = {
            ...request,
            uiContext: {
              ...request.uiContext,
              selectedBaseRevisionId:
                baseRevisionIdRef.current ??
                request.uiContext.selectedBaseRevisionId,
            },
          }
          try {
            pushLog("försöker agentturnen igen efter sessionssynk")
            await adapter.sendAgentTurnV1(retryRequest, onEvent, {
              signal: controller.signal,
            })
            transportError = null
          } catch (error) {
            transportError = error
          }
          if (needsAgentResume(projectionRef.current, turnId)) {
            try {
              await syncSessionProjection()
            } catch (error) {
              transportError ??= error
            }
          }
        }

        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) {
          return
        }
        if (!isAgentTurnTerminalV1(projectionRef.current, turnId)) {
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

        const currentTurn = projectionRef.current.turns[turnId] ?? null
        const previewCandidate = currentTurn?.previewResult ?? null
        const nextCandidate = currentTurn?.nextPreviewResult ?? null
        if (currentTurn?.terminal?.kind === "completed" && currentTurn.terminal.outcome === "built" && nextCandidate) {
          const expectedProject = projectIdRef.current
          const state = await refreshNextState(controller.signal)
          if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return
          if (!expectedProject || projectIdRef.current !== expectedProject || !state || !reconcileNextPreview(nextCandidate, state, expectedProject)) {
            throw new Error("React-resultatet kunde inte bekräftas mot projektets godkända version.")
          }
          setPreviewSelection("next")
        }
        if (
          currentTurn?.terminal?.kind === "completed" &&
          currentTurn.terminal.outcome === "built" &&
          previewCandidate
        ) {
          const projectId = projectIdRef.current
          const loaded = projectId
            ? await loadCanonicalProjectV1(projectId, controller.signal)
            : { ok: false as const, error: "Agentturnen saknade projektidentitet." }
          if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return
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
          setPreviewSelection("html")
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
      refreshNextState,
      buildProfileReady,
      nextBuildActive,
    ],
  )

  const sendMessage = useCallback(
    (text: string, opts?: { mode?: string }) => runTurn(text, opts),
    [runTurn],
  )

  const sendDraftMessage = useCallback(async () => {
    if (!canSendTurn) return
    const sent = draftMessageRef.current
    await runTurn(sent, {
      mode: landingDraftRef.current?.mode,
      onAccepted: () => {
        const next = draftAfterDelivery(draftMessageRef.current, sent, true)
        if (next !== draftMessageRef.current) setDraftMessage(next)
      },
    })
  }, [canSendTurn, runTurn, setDraftMessage])

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
      if (!versions.some(version => version.id === id)) return
      setPreviewSelection("html")
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

  const beginFreshSession = useCallback(
    (clearProject: boolean) => {
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
      if (clearProject) {
        setVersions([])
        setActiveVersionId(null)
      }
      void startSession().catch((error: unknown) => {
        if (isAbortError(error)) return
        setSessionStatus("error")
        applyProjection(
          rejectAgentEventStreamV1(
            createAgentEventProjectionV1(),
            errorMessage(error, "En ny Sajtagent-session kunde inte öppnas."),
          ),
        )
      })
    },
    [applyProjection, startSession],
  )

  const newChat = useCallback(() => {
    if (resettingProjectRef.current || abortRef.current || nextBuildActive || hasRunningAgentTurnV1(projectionRef.current)) return
    beginFreshSession(false)
  }, [beginFreshSession, nextBuildActive])

  const selectProject = useCallback((selectedProjectId: string) => {
    if (resettingProjectRef.current || abortRef.current || nextBuildActive || hasRunningAgentTurnV1(projectionRef.current)) return
    window.location.assign(withLandingDraft(builderProjectHref(selectedProjectId), landingDraftRef.current))
  }, [nextBuildActive])

  const newProject = useCallback(async (name?: string) => {
    if (abortRef.current || nextBuildActive || hasRunningAgentTurnV1(projectionRef.current)) {
      return { ok: false as const, error: "Vänta tills Sajtagent har svarat innan du byter projekt." }
    }
    if (resettingProjectRef.current) {
      return { ok: false as const, error: "Ett nytt projekt startas redan." }
    }
    resettingProjectRef.current = true
    setIsResettingProject(true)
    try {
      const created = await createProject(name)
      // Full-document navigation deliberately discards every project-scoped
      // projection, in-flight callback and card state before opening another.
      window.location.assign(withLandingDraft(builderProjectHref(created.projectId), landingDraftRef.current))
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: errorMessage(error, "Projektet kunde inte skapas.") }
    } finally {
      resettingProjectRef.current = false
      setIsResettingProject(false)
    }
  }, [nextBuildActive])

  const resetStarter = useCallback(async () => {
    if (abortRef.current || nextBuildActive || hasRunningAgentTurnV1(projectionRef.current)) {
      return { ok: false as const, error: "Vänta tills Sajtagent har avslutat arbetet innan du återställer projektet." }
    }
    if (resettingProjectRef.current || !projectIdRef.current?.startsWith("project:personal:")) {
      return { ok: false as const, error: "Öppna ditt personliga startprojekt före återställning." }
    }
    resettingProjectRef.current = true
    setIsResettingProject(true)
    requestGenerationRef.current += 1
    sessionGenerationRef.current += 1
    bootstrapPromiseRef.current = null
    try {
      const reset = await adapter.resetPersonalStarterProject()
      if (!reset.ok) {
        if (!sessionRef.current) setSessionStatus("error")
        return reset
      }
      window.location.assign(builderProjectHref(reset.project.projectId))
      return { ok: true as const }
    } catch (error) {
      if (!sessionRef.current) setSessionStatus("error")
      return { ok: false as const, error: errorMessage(error, "Startprojektet kunde inte återställas.") }
    } finally {
      resettingProjectRef.current = false
      setIsResettingProject(false)
      abortRef.current = null
      setIsStreaming(false)
    }
  }, [nextBuildActive])

  const publish = useCallback(async () => {
    if (publishState === "publishing") return
    setPublishState("publishing")
    const result = await adapter.publish()
    setPublishState(result.ok ? "published" : "idle")
  }, [publishState])

  const showNextPreview = useCallback(() => setPreviewSelection("next"), [])
  const refreshNextPreview = useCallback(async () => { await refreshNextState() }, [refreshNextState])
  const setBuildProfilePreference = useCallback(async (preference: "html" | "next") => {
    try {
      await nextProject.setProfilePreference(preference)
    } catch (error) {
      pushLog(errorMessage(error, "Byggläget kunde inte sparas. Utkastet ligger kvar."))
    }
  }, [nextProject.setProfilePreference, pushLog])
  const cancelNextBuild = useCallback(async () => {
    const current = nextCurrent
    if (!projectId || current?.status !== "building") return
    const response = await fetch(`/api/siteagent/projects/${encodeURIComponent(projectId)}/next`, {
      method: "DELETE", headers: {"content-type": "application/json"}, body: JSON.stringify({jobId: current.jobId}),
    })
    if (!response.ok) throw new Error("Avbrottet kunde inte bekräftas. Den godkända versionen behålls.")
    await refreshNextState()
  }, [projectId, nextCurrent, refreshNextState])
  const canMutateNextPages = Boolean(
    previewKind === "next" && nextProject.state?.accepted && !nextBuildActive && !agentTurnActive && nextProject.availability === "available",
  )
  const mutateNextPages = useCallback(async (op: "add" | "remove", route: string) => {
    if (op === "add") pendingPreviewRouteRef.current = route
    try {
      await nextProject.mutatePages(op, route)
    } catch (error) {
      if (op === "add" && pendingPreviewRouteRef.current === route) pendingPreviewRouteRef.current = null
      throw error
    }
  }, [nextProject.mutatePages])

  const value = useMemo<BuilderStore>(
    () => ({
      projectId,
      projectName,
      draftMessage,
      landingDraft,
      setDraftMessage,
      sendDraftMessage,
      resetStarter,
      choices,
      setChoice,
      setPageCount,
      messages,
      isStreaming: isStreaming || nextBuildActive || agentTurnActive,
      canSendTurn,
      sessionStatus,
      agentProjection,
      sendMessage,
      answerQuestion,
      promptAssist: adapter.promptAssist,
      logs,
      previewStatus,
      previewUrl,
      sitemapRevision,
      previewRoutes,
      previewRoute,
      setPreviewRoute,
      previewKind,
      nextState: nextProject.state,
      nextAvailability: nextProject.availability,
      nextError: nextProject.error,
      buildProfile: nextProject.profile,
      buildProfileStatus,
      setBuildProfilePreference,
      showNextPreview,
      refreshNextPreview,
      cancelNextBuild,
      mutateNextPages,
      canMutateNextPages,
      versions,
      activeVersionId,
      restoreVersion,
      togglePin,
      newChat,
      selectProject,
      newProject,
      isResettingProject,
      publishState,
      publish,
    }),
    [
      projectId,
      projectName,
      draftMessage,
      landingDraft,
      setDraftMessage,
      sendDraftMessage,
      resetStarter,
      choices,
      setChoice,
      setPageCount,
      messages,
      isStreaming,
      canSendTurn,
      sessionStatus,
      agentProjection,
      sendMessage,
      answerQuestion,
      logs,
      previewStatus,
      previewUrl,
      sitemapRevision,
      previewRoutes,
      previewRoute,
      setPreviewRoute,
      previewKind,
      nextProject.state,
      nextProject.availability,
      nextProject.error,
      nextProject.profile,
      buildProfileStatus,
      setBuildProfilePreference,
      nextBuildActive,
      agentTurnActive,
      showNextPreview,
      refreshNextPreview,
      cancelNextBuild,
      mutateNextPages,
      canMutateNextPages,
      versions,
      activeVersionId,
      restoreVersion,
      togglePin,
      newChat,
      selectProject,
      newProject,
      isResettingProject,
      publishState,
      publish,
    ],
  )

  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>
}
