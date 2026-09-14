import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { authCallbackRedirectPath, builderEntryPath, loginPath, magicLinkRedirectTo } from "../lib/supabase/auth-paths.ts"
import { draftAfterDelivery, hasAcceptedDraftTurn, landingDraftFromParams, withLandingDraft } from "../lib/siteagent/landing-draft.ts"
import { createAgentEventProjectionV1, type AgentEventProjectionV1, type AgentTurnProjectionV1 } from "../lib/siteagent/agent-event-reducer.ts"
import { buildStatusLabel } from "../lib/siteagent/build-status-label.ts"

const origin = "https://sajtagent.example"
const prompt = "Bygg Åkes sida 🏔️ & pris? 50% #skidor; kod C:\\projekt\\ny\n<script>test</script>"
const entry = { project: "project:owner:skidor", prompt, mode: "fritext" }
const destination = builderEntryPath(entry)
assert.equal(authCallbackRedirectPath(destination), destination)
const passwordLogin = new URL(loginPath(destination), origin)
assert.equal(passwordLogin.pathname, "/login")
assert.equal(passwordLogin.searchParams.get("next"), destination)
const callback = new URL(magicLinkRedirectTo(origin, destination))
assert.equal(callback.origin, origin)
assert.equal(callback.pathname, "/auth/callback")
const afterCallback = authCallbackRedirectPath(callback.searchParams.get("next"))
assert.equal(afterCallback, destination)
assert.deepEqual(Object.fromEntries(new URL(afterCallback, origin).searchParams), entry)
const failedCallback = new URL(loginPath(afterCallback, true), origin)
assert.equal(failedCallback.searchParams.get("error"), "auth_callback_failed")
assert.equal(failedCallback.searchParams.get("next"), destination)
assert.equal(new URL(loginPath(destination, "auth_unavailable"), origin).searchParams.get("next"), destination)

for (const path of [
  null, undefined, "", "https://evil.example", "javascript:alert(1)",
  "//evil.example/builder", "/\\evil.example/builder", "\\evil.example",
  "%2fbuilder", "/%2fbuilder", "/%5cevil.example", "/%252fevil.example",
  "/builder/../login", "/builder%2f..%2fapi", "/builder\\..\\api",
  "/builder\n", "/builder\t", "/builder\r", "/builder\u0000", "/login", "/api/siteagent/projects",
]) assert.equal(authCallbackRedirectPath(path), "/builder", `reject ${JSON.stringify(path)}`)
assert.equal(authCallbackRedirectPath("/builder?next=https://evil.example&unknown=1#https://evil.example"), "/builder")
assert.equal(builderEntryPath({ project: ["a", "b"], prompt: ["a", "b"], mode: ["audit"] }), "/builder")

// Reload/login/project navigation preserves a draft as data. It has no send effect.
const draft = landingDraftFromParams(entry)
assert.deepEqual(draft, { text: prompt, mode: "fritext" })
assert.equal(landingDraftFromParams({ prompt: "  " }), null)
const otherProject = withLandingDraft("/builder?project=project%3Aother", draft)
assert.equal(new URL(otherProject, origin).searchParams.get("project"), "project:other")
assert.equal(new URL(otherProject, origin).searchParams.get("prompt"), prompt)
assert.equal(withLandingDraft(destination, null), "/builder?project=project%3Aowner%3Askidor")

const empty = createAgentEventProjectionV1("session:test")
const turn: AgentTurnProjectionV1 = {
  turnId: "turn:accepted", acceptedSequence: 1, messageIds: [], toolCallIds: [],
  questionId: null, buildJobId: null, buildToolCallId: null, previewResult: null, terminal: null,
}
const history: AgentEventProjectionV1 = {
  ...empty, lastSequence: 1, turns: { [turn.turnId]: turn }, turnOrder: [turn.turnId], activeTurnId: turn.turnId,
}
assert.equal(hasAcceptedDraftTurn(empty, "session:test", turn.turnId), false, "opening or unaccepted failure must keep the draft")
assert.equal(hasAcceptedDraftTurn(history, "session:other", turn.turnId), false, "other session cannot acknowledge a draft")
assert.equal(hasAcceptedDraftTurn(history, "session:test", "turn:other"), false, "old history cannot acknowledge a new draft")
assert.equal(hasAcceptedDraftTurn({ ...history, status: "invalid" }, "session:test", turn.turnId), false, "invalid stream cannot consume a draft")
assert.equal(hasAcceptedDraftTurn(history, "session:test", turn.turnId), true)
assert.equal(draftAfterDelivery(prompt, prompt, false), prompt, "pre-acceptance failure preserves input")
assert.equal(draftAfterDelivery(prompt, prompt, true), "", "matching accepted send clears input")
assert.equal(draftAfterDelivery("Edited while sending", prompt, true), "Edited while sending", "late acknowledgement cannot erase newer input")
assert.deepEqual(landingDraftFromParams(entry), draft, "restored history does not hide an incoming draft")

assert.match(buildStatusLabel(empty), /Inget bygge/)
const building = { ...history, statusLabel: "Verifierar resultat…", turns: { [turn.turnId]: { ...turn, buildJobId: "job:test" } } }
assert.equal(buildStatusLabel(building), "Verifierar resultat…")
assert.match(buildStatusLabel({ ...building, turns: { [turn.turnId]: { ...building.turns[turn.turnId], terminal: { kind: "completed", outcome: "built" } } } }), /klart och verifierat/)
assert.match(buildStatusLabel({ ...building, turns: { [turn.turnId]: { ...building.turns[turn.turnId], terminal: { kind: "failed", code: "cancelled", message: "cancelled", retryable: true } } } }), /stoppades/)
assert.match(buildStatusLabel({ ...building, status: "invalid" }), /kunde inte verifieras/)

// Wiring guards complement the behavioral cases above and the browser smoke.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
assert.doesNotMatch(read("components/siteagent/landing-prompt-handoff.tsx"), /useEffect|sendMessage|sendDraftMessage|messages\.length/)
assert.match(read("components/siteagent/faces/agent-face.tsx"), /input=\{draftMessage\}/)
assert.match(read("components/siteagent/builder-store.tsx"), /acknowledgeDelivery\(\)/)
assert.match(read("app/builder/page.tsx"), /auth\.getUser\(\)/)
assert.match(read("app/auth/callback/route.ts"), /loginPath\(next, true\)/)
assert.match(read("components/siteagent/next-preview-panel.tsx"), /setState\(null\)/)
console.log("Entry UX: PASS (local auth returns, draft preservation and acknowledgement, terminal build labels)")
