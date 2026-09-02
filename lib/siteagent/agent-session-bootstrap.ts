import type { AgentSessionV1 } from "../../contracts/agent-session-v1.ts"
import {
  resumeAgentEventsV1,
  type SiteagentFetchV1,
} from "./adapter.ts"
import {
  createAgentEventProjectionV1,
  reduceAgentEventV1,
  type AgentEventProjectionV1,
} from "./agent-event-reducer.ts"

export async function loadAgentEventProjectionV1(
  sessionId: AgentSessionV1["sessionId"],
  options: {
    signal?: AbortSignal
    fetchImpl?: SiteagentFetchV1
  } = {},
): Promise<AgentEventProjectionV1> {
  return catchUpAgentEventProjectionV1(
    createAgentEventProjectionV1(sessionId),
    options,
  )
}

export async function catchUpAgentEventProjectionV1(
  initialProjection: AgentEventProjectionV1,
  options: {
    signal?: AbortSignal
    fetchImpl?: SiteagentFetchV1
  } = {},
): Promise<AgentEventProjectionV1> {
  if (!initialProjection.sessionId || initialProjection.status === "invalid") {
    throw new Error("Agenthistoriken saknade en giltig sessionsprojektion.")
  }
  let projection = initialProjection

  while (true) {
    const afterSequence = projection.lastSequence
    const result = await resumeAgentEventsV1(
      initialProjection.sessionId,
      afterSequence,
      (event) => {
        const next = reduceAgentEventV1(projection, event)
        if (next.status === "invalid") {
          throw new Error(next.error ?? "Agenthistoriken stoppades felsäkert.")
        }
        projection = next
      },
      options,
    )

    if (result.eventCount === 0) return projection
    if (projection.lastSequence <= afterSequence) {
      throw new Error("Agenthistoriken gjorde inga sekvensframsteg.")
    }
  }
}
