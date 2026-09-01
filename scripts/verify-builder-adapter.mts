import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { reduceBuildEventsV1 } from "../lib/siteagent/adapter.ts"
import type { StreamEvent } from "../lib/siteagent/types.ts"

const occurredAt = "2026-09-01T12:00:00.000Z"
const jobId = "job:adapter-test"
const baseRevisionId = "revision:base"
const events = [
  {
    schemaVersion: 1,
    jobId,
    sequence: 1,
    occurredAt,
    type: "job.accepted",
    payload: { acceptedAt: occurredAt },
  },
  {
    schemaVersion: 1,
    jobId,
    sequence: 2,
    occurredAt,
    type: "job.failed",
    payload: {
      result: {
        schemaVersion: 1,
        status: "failed",
        jobId,
        baseRevisionId,
        code: "runtime_unavailable",
        message: "Runtime saknas.",
        retryable: true,
        failedAt: occurredAt,
        receipts: [],
      },
    },
  },
]

const reducedEvents: StreamEvent[] = []
assert.deepEqual(reduceBuildEventsV1(events, (event) => reducedEvents.push(event)), {
  valid: true,
  terminalSeen: true,
})
assert.deepEqual(reducedEvents.map((event) => event.type), ["progress", "error"])
assert.equal(reducedEvents.some((event) => event.type === "preview" || event.type === "done"), false)

const gapEvents: StreamEvent[] = []
assert.deepEqual(
  reduceBuildEventsV1([{ ...events[0], sequence: 2 }], (event) => gapEvents.push(event)),
  { valid: false, terminalSeen: false },
)
assert.equal(gapEvents[0]?.type, "error")

const source = readFileSync(resolve(process.cwd(), "lib/siteagent/adapter.ts"), "utf8")
for (const forbidden of ["/api/engine/chats/stream", "simulateStream", "<!doctype html>"]) {
  assert.equal(source.includes(forbidden), false, `adapter must not contain ${forbidden}`)
}
assert.equal(source.includes("/api/siteagent/build-jobs"), true)
assert.equal(source.includes("/api/siteagent/projects/default"), true)

console.log("Builder adapter: PASS (event reduction, sequence guard, no simulated success)")
