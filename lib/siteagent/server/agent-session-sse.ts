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
  return agentEventStreamSseResponseV1(
    (async function* () {
      yield* events
    })(),
  )
}

export function agentEventStreamSseResponseV1(
  events: AsyncIterable<AgentEventV1>,
): Response {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          for await (const event of events) {
            if (!cancelled) controller.enqueue(agentEventSseChunkV1(event))
          }
          if (!cancelled) controller.close()
        } catch (error) {
          if (!cancelled) controller.error(error)
        }
      })()
    },
    cancel() {
      cancelled = true
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
