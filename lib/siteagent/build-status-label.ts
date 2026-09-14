import type { AgentEventProjectionV1 } from "./agent-event-reducer.ts"

export function buildStatusLabel(projection: AgentEventProjectionV1): string {
  const turn = [...projection.turnOrder].reverse()
    .map((id) => projection.turns[id])
    .find((candidate) => candidate?.buildJobId)
  if (!turn) return "Inget bygge har startats i den här chatten. Vanliga svar syns i Sajtagent-kortet."
  if (projection.status === "invalid") return "Byggstatus kunde inte verifieras. Senast godkända version behålls."
  if (turn.terminal?.kind === "failed") return "Bygget stoppades. Senast godkända version behålls."
  if (turn.terminal?.kind === "completed") return turn.terminal.outcome === "built"
    ? "Bygget är klart och verifierat."
    : "Bygget avslutades utan en ny verifierad version."
  return projection.statusLabel || "Sajtagent bygger…"
}
