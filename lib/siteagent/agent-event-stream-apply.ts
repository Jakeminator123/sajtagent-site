import type { AgentEventV1 } from "../../contracts/agent-session-v1.ts"
import {
  reduceAgentEventV1,
  rejectAgentEventStreamV1,
  type AgentEventProjectionV1,
} from "./agent-event-reducer.ts"

export const SESSION_TURN_MISMATCH_MESSAGE_V1 =
  "Agentströmmen svarade för fel session eller turn."

export type ApplyExpectedTurnStreamEventResultV1 = {
  kind: "applied" | "ignored" | "rejected"
  projection: AgentEventProjectionV1
}

function eventFingerprint(event: AgentEventV1): string {
  return JSON.stringify(event)
}

export function isExactReplayEventV1(
  projection: AgentEventProjectionV1,
  event: AgentEventV1,
): boolean {
  return (
    projection.sequenceFingerprints[String(event.sequence)] ===
    eventFingerprint(event)
  )
}

export function applyExpectedTurnStreamEventV1(input: {
  projection: AgentEventProjectionV1
  event: AgentEventV1
  expectedSessionId: string
  expectedTurnId: string
}): ApplyExpectedTurnStreamEventResultV1 {
  const { projection, event, expectedSessionId, expectedTurnId } = input

  if (event.sessionId !== expectedSessionId) {
    return {
      kind: "rejected",
      projection: rejectAgentEventStreamV1(
        projection,
        SESSION_TURN_MISMATCH_MESSAGE_V1,
      ),
    }
  }

  if (isExactReplayEventV1(projection, event)) {
    return { kind: "ignored", projection }
  }

  if (event.turnId !== expectedTurnId) {
    if (projection.turns[expectedTurnId]) {
      return {
        kind: "rejected",
        projection: rejectAgentEventStreamV1(
          projection,
          SESSION_TURN_MISMATCH_MESSAGE_V1,
        ),
      }
    }

    // Same session, expected turn not started yet: leftover events from an
    // earlier turn (resume/catch-up) are applied by the reducer. Mixed-session
    // and lifecycle violations still fail closed there.
    const next = reduceAgentEventV1(projection, event)
    return {
      kind: next.status === "invalid" ? "rejected" : "applied",
      projection: next,
    }
  }

  const next = reduceAgentEventV1(projection, event)
  return {
    kind: next.status === "invalid" ? "rejected" : "applied",
    projection: next,
  }
}
