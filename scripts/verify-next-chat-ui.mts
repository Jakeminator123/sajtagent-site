import assert from "node:assert/strict"
import { AgentEventV1Schema, type AgentEventV1 } from "../contracts/agent-session-v1.ts"
import { createAgentEventProjectionV1, hasRunningAgentTurnV1, reduceAgentEventV1, reduceAgentEventsV1 } from "../lib/siteagent/agent-event-reducer.ts"
import { applyExpectedTurnStreamEventV1 } from "../lib/siteagent/agent-event-stream-apply.ts"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { canSendWithNextProfile, isNextBuildActive, nextSourceDownloadHref, parseNextProjectRead, parseNextProjectState, previewContentUrl, reconcileNextPreview } from "../lib/siteagent/next-preview-client.ts"
import { buildPreviewRouteTree, nextPreviewRouteAfterChange, normalizeManualPageRouteInput, previewRouteLabel } from "../lib/siteagent/preview-route-tree.ts"

const sessionId = "session:abcdefghijklmnopqrstuvwxyzABCDEF"
assert.equal(canSendWithNextProfile("loading", false), false, "a delayed profile must not expose an HTML send that the server routes to React")
assert.equal(canSendWithNextProfile("error", false), false, "a failed capability read must not silently select HTML")
assert.equal(canSendWithNextProfile("available", false), true)
assert.equal(canSendWithNextProfile("unavailable", false), true, "explicit disabled response preserves the HTML flow")
assert.equal(canSendWithNextProfile("unavailable", true), false, "an established React project must not silently downgrade to HTML after a 404")
assert.equal(canSendWithNextProfile("available", true), true, "restored React configuration unlocks the same draft")
const turnId = "turn:nextverified1234"
const occurredAt = "2026-09-14T18:00:00.000Z"
const expiresAt = "2026-09-14T18:15:00.000Z"
const result = {schemaVersion: 2 as const, status: "succeeded" as const, projectId: "project:next", jobId: "job:nextverified", sourceRevisionId: `revision:sha256:${"a".repeat(64)}`, previewRef: `preview:${"b".repeat(32)}`, verifiedAt: occurredAt}
const event = (sequence: number, type: string, payload: unknown): AgentEventV1 => AgentEventV1Schema.parse({schemaVersion: 1, sessionId, turnId, eventId: `event:nextui${String(sequence).padStart(12, "0")}`, sequence, occurredAt, type, payload})
const events = [
  event(1, "turn.accepted", {acceptedAt: occurredAt}),
  event(2, "tool.started", {toolCallId: "tool:next", capability: "build.request", safeLabel: "Bygger React"}),
  event(3, "build.started", {toolCallId: "tool:next", jobId: result.jobId, intentType: "site.create"}),
  event(4, "tool.completed", {toolCallId: "tool:next", status: "passed", receipts: [], artifacts: []}),
  event(5, "next.preview.ready", {jobId: result.jobId, result}),
  event(6, "turn.completed", {outcome: "built"}),
]
const built = reduceAgentEventsV1(createAgentEventProjectionV1(sessionId), events)
const preparing = reduceAgentEventsV1(createAgentEventProjectionV1(sessionId), events.slice(0, 2))
assert.equal(preparing.turns[turnId]?.buildJobId, null)
assert.equal(hasRunningAgentTurnV1(preparing), true, "hydrated source preparation must lock project/reset actions even before Next repo.begin")
assert.equal(hasRunningAgentTurnV1(built), false, "terminal completion releases busy controls")
assert.equal(hasRunningAgentTurnV1({...built, turns: {...built.turns, [turnId]: {...built.turns[turnId]!, terminal: {kind: "completed", outcome: "awaiting_user"}}}}), false, "a terminal question turn must remain answerable")
const interrupted = reduceAgentEventV1(preparing, event(3, "turn.failed", {code: "turn_interrupted", message: "Körningen avbröts.", retryable: true}))
assert.equal(hasRunningAgentTurnV1(interrupted), false, "server recovery of an abandoned turn unlocks the retained draft")
assert.equal(built.status, "idle")
assert.deepEqual(built.turns[turnId]?.nextPreviewResult, result)
assert.equal(built.turns[turnId]?.previewResult, null, "Next must not manufacture a V1 HTML version")
assert.equal(built.canonicalPreviewCandidate, null, "Next must not enter V1 canonical reconciliation")
assert.equal(reduceAgentEventV1(built, events[4]), built, "exact replay stays idempotent")
assert.equal(applyExpectedTurnStreamEventV1({projection: built, event: events[4], expectedSessionId: sessionId, expectedTurnId: turnId}).kind, "ignored")

const pending = reduceAgentEventsV1(createAgentEventProjectionV1(sessionId), events.slice(0, 4))
assert.equal(reduceAgentEventV1(pending, event(5, "turn.completed", {outcome: "built"})).status, "invalid", "built needs an accepted preview")
assert.equal(reduceAgentEventV1(pending, event(5, "next.preview.ready", {jobId: "job:other", result: {...result, jobId: "job:other"}})).status, "invalid", "another build cannot provide the preview")
const withNext = reduceAgentEventV1(pending, events[4])
assert.equal(reduceAgentEventV1(withNext, event(6, "next.preview.ready", {jobId: result.jobId, result})).status, "invalid", "one build cannot deliver two distinct preview events")
const htmlResult = {schemaVersion: 1, status: "succeeded", jobId: result.jobId, baseRevisionId: "revision:base", workspaceRevisionId: "revision:html", versionId: "version:html", previewRef: "preview:abcdefghijklmnop", sitemapRevision: "sitemap:html", verifiedAt: occurredAt}
assert.equal(reduceAgentEventV1(withNext, event(6, "preview.ready", {jobId: result.jobId, result: htmlResult})).status, "invalid", "a build cannot mix React and HTML results")

const accepted = {...result, acceptedAt: occurredAt}
const body = {schemaVersion: 2, state: {current: {...result, status: "accepted", expiresAt}, accepted}, profile: {available: ["html", "next"] as const, preference: "html" as const, effective: "html" as const}}
const state = parseNextProjectState(body, result.projectId)
assert.deepEqual(state.accepted?.routes, [])
assert.deepEqual(parseNextProjectRead(body, result.projectId).profile, body.profile)
assert.equal(parseNextProjectRead({schemaVersion: 2, state: {current: null, accepted: null}}, result.projectId).profile, null)
assert.equal(reconcileNextPreview(result, state, result.projectId), true)
assert.deepEqual(parseNextProjectState({
  ...body,
  state: {current: null, accepted: {...accepted, routes: ["/", "/about"]}},
}, result.projectId).accepted?.routes, ["/", "/about"])
assert.throws(() => parseNextProjectState({
  ...body,
  state: {current: null, accepted: {...accepted, routes: ["about"]}},
}, result.projectId))
assert.throws(() => parseNextProjectState({
  ...body,
  state: {current: null, accepted: {...accepted, routes: ["/../secret"]}},
}, result.projectId))
assert.equal(previewContentUrl("https://abcd.preview.example.com", result.previewRef, "/"), `https://abcd.preview.example.com/api/siteagent/next-previews/${encodeURIComponent(result.previewRef)}/content/`)
assert.equal(previewContentUrl("https://abcd.preview.example.com", result.previewRef, "/about"), `https://abcd.preview.example.com/api/siteagent/next-previews/${encodeURIComponent(result.previewRef)}/content/about/`)
assert.throws(() => parseNextProjectState(body, "project:other"), /annat projekt/)
assert.throws(() => parseNextProjectState({...body, state: {...body.state, current: {...body.state.current, projectId: "project:other"}}}, result.projectId))
for (const [key, value] of Object.entries({jobId: "job:old", sourceRevisionId: `revision:sha256:${"c".repeat(64)}`, previewRef: `preview:${"d".repeat(32)}`})) {
  const stale = parseNextProjectState({...body, state: {current: null, accepted: {...accepted, [key]: value}}}, result.projectId)
  assert.equal(reconcileNextPreview(result, stale, result.projectId), false, `stale ${key} must be rejected`)
}
const afterFailure = parseNextProjectState({...body, state: {current: {...result, jobId: "job:failed", status: "failed", expiresAt, failureCode: "timeout"}, accepted}}, result.projectId)
assert.deepEqual(afterFailure.accepted, state.accepted, "a failed iteration preserves accepted React output")
assert.equal(parseNextProjectState({schemaVersion: 2, state: {current: null, accepted: null}}, result.projectId).accepted, null)
const building = parseNextProjectState({...body, state: {current: {...body.state.current, status: "building"}, accepted}}, result.projectId)
assert.equal(isNextBuildActive(building.current, Date.parse(occurredAt)), true)
assert.equal(isNextBuildActive(building.current, Date.parse(expiresAt)), false, "an expired worker lease must not permanently lock the composer or project navigation")
assert.equal(isNextBuildActive(afterFailure.current, Date.parse(occurredAt)), false)
assert.throws(() => parseNextProjectState({...body, state: {current: {...body.state.current, expiresAt: "invalid"}, accepted}}, result.projectId), "an invalid expiry must fail the read model, not invent readiness")
const download = new URL(nextSourceDownloadHref(state.accepted!), "https://sajtagent.test")
assert.equal(download.searchParams.get("sourceRevisionId"), result.sourceRevisionId)
assert.equal(download.searchParams.get("jobId"), result.jobId)
assert.equal(decodeURIComponent(download.pathname), `/api/siteagent/projects/${result.projectId}/next/download`)

const here = dirname(fileURLToPath(import.meta.url))
const store = readFileSync(resolve(here, "../components/siteagent/builder-store.tsx"), "utf8")
const header = readFileSync(resolve(here, "../components/siteagent/builder-header.tsx"), "utf8")
const profileSwitch = readFileSync(resolve(here, "../components/siteagent/build-profile-switch.tsx"), "utf8")
const nextHook = readFileSync(resolve(here, "../components/siteagent/use-next-project.ts"), "utf8")
assert.match(store, /canSendWithNextProfile\(nextProject\.availability, nextProject\.hasNext\)/)
assert.match(store, /setBuildProfilePreference/)
assert.match(header, /BuildProfileSwitch/)
assert.match(header, /effectiveProfile === "next"/)
assert.match(header, /HTML-skiss kan inte publiceras/)
assert.match(profileSwitch, /Temporary sketch-mode switch/)
assert.match(profileSwitch, /HTML-skiss/)
assert.match(profileSwitch, /React \(Next\)/)
assert.match(profileSwitch, /availability !== "available" \|\| !profile/)
assert.match(nextHook, /setProfilePreference/)
assert.match(nextHook, /mutatePages/)
assert.match(nextHook, /\/next\/pages/)
assert.match(nextHook, /availability: "available"/)
assert.doesNotMatch(nextHook, /setSnapshot\([^\)]*availability: "loading"/)
assert.deepEqual(buildPreviewRouteTree(["/", "/om", "/om/team", "/kontakt"]), [
  {
    route: "/",
    children: [
      { route: "/kontakt", children: [] },
      { route: "/om", children: [{ route: "/om/team", children: [] }] },
    ],
  },
])
assert.deepEqual(buildPreviewRouteTree(["/om/team", "/kontakt"]), [
  { route: "/kontakt", children: [] },
  { route: "/om/team", children: [] },
])
assert.equal(previewRouteLabel("/"), "/")
assert.equal(previewRouteLabel("/om/team"), "team")
assert.equal(nextPreviewRouteAfterChange({
  previousRoutes: ["/", "/om"],
  nextRoutes: ["/", "/kontakt", "/om"],
  currentRoute: "/",
  pendingRoute: "/kontakt",
}), "/kontakt")
assert.equal(nextPreviewRouteAfterChange({
  previousRoutes: ["/", "/om"],
  nextRoutes: ["/", "/kontakt", "/om"],
  currentRoute: "/",
}), "/kontakt")
assert.equal(nextPreviewRouteAfterChange({
  previousRoutes: [],
  nextRoutes: ["/", "/om"],
  currentRoute: "/",
}), "/")
assert.equal(nextPreviewRouteAfterChange({
  previousRoutes: ["/", "/om"],
  nextRoutes: ["/"],
  currentRoute: "/om",
}), "/")
assert.match(store, /nextPreviewRouteAfterChange/)
assert.match(store, /pendingPreviewRouteRef/)
assert.equal(normalizeManualPageRouteInput("Kontakt"), "/kontakt")
assert.equal(normalizeManualPageRouteInput("/Om/"), "/om")
assert.equal(normalizeManualPageRouteInput("  /team  "), "/team")
assert.equal(normalizeManualPageRouteInput(""), "")
const pagesControls = readFileSync(resolve(here, "../components/siteagent/next-pages-controls.tsx"), "utf8")
assert.match(pagesControls, /normalizeManualPageRouteInput/)
const sitemapFace = readFileSync(resolve(here, "../components/siteagent/faces/sitemap-face.tsx"), "utf8")
assert.match(sitemapFace, /buildPreviewRouteTree/)
assert.match(sitemapFace, /SitemapBranch/)
assert.doesNotMatch(sitemapFace, /paddingLeft/)
console.log("PASS shared Next chat projection: lifecycle, replay, exact owner/job/revision binding, retained accepted output, source export")
