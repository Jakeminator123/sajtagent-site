import type { AgentEventV1 } from "../../../contracts/agent-session-v1.ts"

const encoder = new TextEncoder()

export function agentEventSseChunkV1(event: AgentEventV1): Uint8Array {
  return encoder.encode(
    `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  )
}

export function agentEventsSseResponseV1(
  events: readonly AgentEventV1[],
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(agentEventSseChunkV1(event))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      Expires: "0",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      Vary: "Cookie",
    },
  })
}
