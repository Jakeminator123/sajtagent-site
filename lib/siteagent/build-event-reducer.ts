import {
  BuildEventV1Schema,
  type BuildEventV1,
  type BuildResultV1,
} from "../../contracts/builder-v1.ts"

export type BuildProjectionStatusV1 =
  | "submitting"
  | "accepted"
  | "running"
  | "succeeded"
  | "failed"
  | "invalid"

export interface BuildActivityV1 {
  sequence: number | null
  kind: "progress" | "success" | "error"
  message: string
}

/**
 * Pure browser projection of one BuildEventV1 stream.
 *
 * `result` can only be populated by a terminal contract event. An integrity
 * error clears it, so no caller can accidentally retain a ready projection
 * after a sequence gap, conflicting replay, mixed job, or post-terminal event.
 */
export interface BuildEventProjectionV1 {
  jobId: string | null
  lastSequence: number
  status: BuildProjectionStatusV1
  terminal: "succeeded" | "failed" | null
  fingerprints: Readonly<Record<string, string>>
  assistantText: string
  progressLabel: string
  result: BuildResultV1 | null
  error: string | null
  activity: readonly BuildActivityV1[]
}

export function createBuildEventProjectionV1(): BuildEventProjectionV1 {
  return {
    jobId: null,
    lastSequence: 0,
    status: "submitting",
    terminal: null,
    fingerprints: {},
    assistantText: "",
    progressLabel: "Skickar uppdraget till Sajtagent…",
    result: null,
    error: null,
    activity: [],
  }
}

function eventFingerprint(event: BuildEventV1): string {
  return JSON.stringify(event)
}

function failClosed(
  state: BuildEventProjectionV1,
  message: string,
): BuildEventProjectionV1 {
  if (state.status === "invalid") return state
  return {
    ...state,
    status: "invalid",
    progressLabel: "Eventströmmen stoppades felsäkert.",
    result: null,
    error: message,
    activity: [
      ...state.activity.filter((activity) => activity.kind !== "success"),
      { sequence: null, kind: "error", message },
    ],
  }
}

function activityForEvent(event: BuildEventV1): BuildActivityV1 | null {
  if (event.type === "job.accepted") {
    return { sequence: event.sequence, kind: "progress", message: "Byggjobbet accepterades." }
  }
  if (event.type === "job.running") {
    return {
      sequence: event.sequence,
      kind: "progress",
      message: event.payload.label ?? `Fas: ${event.payload.phase}`,
    }
  }
  if (event.type === "job.succeeded") {
    return { sequence: event.sequence, kind: "success", message: "Verifierat bygge klart." }
  }
  if (event.type === "job.failed") {
    return { sequence: event.sequence, kind: "error", message: event.payload.result.message }
  }
  return null
}

export function reduceBuildEventV1(
  state: BuildEventProjectionV1,
  input: unknown,
): BuildEventProjectionV1 {
  if (state.status === "invalid") return state

  const parsed = BuildEventV1Schema.safeParse(input)
  if (!parsed.success) {
    return failClosed(state, "Build-eventet matchade inte det signerade kontraktet.")
  }

  const event = parsed.data
  if (state.jobId && event.jobId !== state.jobId) {
    return failClosed(state, "Build-eventströmmen blandade händelser från olika jobb.")
  }

  const fingerprint = eventFingerprint(event)
  const seenFingerprint = state.fingerprints[String(event.sequence)]
  if (seenFingerprint) {
    return seenFingerprint === fingerprint
      ? state
      : failClosed(state, "Ett redan mottaget sekvensnummer hade ett annat innehåll.")
  }

  if (state.terminal) {
    return failClosed(state, "Build-eventströmmen fortsatte efter terminal status.")
  }

  const expectedSequence = state.lastSequence + 1
  if (event.sequence !== expectedSequence) {
    return failClosed(
      state,
      `Build-eventströmmen hade ett sekvensgap: väntade ${expectedSequence}, fick ${event.sequence}.`,
    )
  }
  if (event.sequence === 1 && event.type !== "job.accepted") {
    return failClosed(state, "Build-eventströmmen började inte med job.accepted.")
  }

  const activity = activityForEvent(event)
  const next: BuildEventProjectionV1 = {
    ...state,
    jobId: state.jobId ?? event.jobId,
    lastSequence: event.sequence,
    fingerprints: { ...state.fingerprints, [String(event.sequence)]: fingerprint },
    activity: activity ? [...state.activity, activity] : state.activity,
  }

  if (event.type === "job.accepted") {
    return { ...next, status: "accepted", progressLabel: "Byggjobbet är accepterat." }
  }
  if (event.type === "job.running") {
    return {
      ...next,
      status: "running",
      progressLabel: event.payload.label ?? `Sajtagent arbetar: ${event.payload.phase}`,
    }
  }
  if (event.type === "message.delta") {
    return {
      ...next,
      status: "running",
      assistantText: state.assistantText + event.payload.delta,
      progressLabel: state.progressLabel || "Sajtagent arbetar…",
    }
  }
  if (event.type === "job.failed") {
    return {
      ...next,
      status: "failed",
      terminal: "failed",
      progressLabel: "Bygget stoppades.",
      result: event.payload.result,
      error: event.payload.result.message,
    }
  }
  return {
    ...next,
    status: "succeeded",
    terminal: "succeeded",
    progressLabel: "Bygget är verifierat och klart.",
    result: event.payload.result,
    error: null,
  }
}

export function reduceBuildEventsV1(
  state: BuildEventProjectionV1,
  inputs: readonly unknown[],
): BuildEventProjectionV1 {
  return inputs.reduce(reduceBuildEventV1, state)
}

export function completeBuildEventStreamV1(
  state: BuildEventProjectionV1,
  fallbackMessage = "Byggjobbet saknar terminal status.",
): BuildEventProjectionV1 {
  return state.terminal ? state : failClosed(state, fallbackMessage)
}

export function rejectBuildEventStreamV1(
  state: BuildEventProjectionV1,
  message: string,
): BuildEventProjectionV1 {
  return failClosed(state, message)
}
