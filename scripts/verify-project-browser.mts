import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { builderProjectHref, createProject, listProjects, openProject } from "../lib/siteagent/project-browser.ts"

const projects = ["one", "two"].map((id) => ({
  schemaVersion: 2 as const, projectId: `project:${id}`, name: id,
  owner: { tenantId: "tenant:one", projectId: `project:${id}`, principalId: "user:one" },
  workerSpriteId: null,
}))
const calls: { url: string; method?: string; body: unknown }[] = []
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input)
  calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null })
  if (init?.method === "POST") {
    return Response.json({ schemaVersion: 2, project: projects[1] }, { status: 201 })
  }
  if (url === "/api/siteagent/projects") return Response.json({ schemaVersion: 2, projects })
  const project = projects.find((entry) => url.endsWith(encodeURIComponent(entry.projectId)))
  return project ? Response.json({ schemaVersion: 2, project }) : new Response(null, { status: 404 })
}

assert.equal((await listProjects(undefined, fakeFetch)).length, 2)
assert.equal((await openProject("project:one", undefined, fakeFetch)).name, "one")
assert.equal((await createProject("two", fakeFetch)).projectId, "project:two")
assert.deepEqual(calls.at(-1)?.body, { schemaVersion: 2, name: "two" })
assert.equal(calls.at(-1)?.url, "/api/siteagent/projects")
assert.equal((await listProjects(undefined, fakeFetch)).length, 2, "creation does not reset the previous project")
await assert.rejects(openProject("project:other-account", undefined, fakeFetch), /annat konto/)
await assert.rejects(openProject("project:one", undefined, async () => Response.json({ schemaVersion: 2, project: projects[1] })), /fel projekt/)
await assert.rejects(listProjects(undefined, async () => new Response(null, { status: 401 })), /Logga in/)
await assert.rejects(createProject("x".repeat(161), fakeFetch))
assert.equal(builderProjectHref("project:a/?&b"), "/builder?project=project%3Aa%2F%3F%26b")

const controller = new AbortController()
controller.abort()
await assert.rejects(openProject("project:one", controller.signal, async (_input, init) => {
  assert.equal(init?.signal, controller.signal)
  init?.signal?.throwIfAborted()
  return new Response()
}), { name: "AbortError" })

// Structural integration guards complement the API execution assertions.
const store = readFileSync(new URL("../components/siteagent/builder-store.tsx", import.meta.url), "utf8")
const shell = readFileSync(new URL("../components/siteagent/builder-shell.tsx", import.meta.url), "utf8")
const selector = readFileSync(new URL("../components/siteagent/project-selector.tsx", import.meta.url), "utf8")
assert.match(shell, /BuilderProvider key=\{initialProjectId/)
assert.match(store, /await openProject\(requestedProjectId, signal\)/)
assert.match(store, /sessionGeneration !== sessionGenerationRef.current[\s\S]*?projectIdRef.current = opened.project.projectId/)
assert.match(store, /const onEvent = async[\s\S]*?requestGeneration !== requestGenerationRef.current\) return/)
assert.match(selector, /selectProject\(event.target.value\)/)
assert.match(selector, /disabled=\{isResettingProject \|\| isStreaming/)
assert.match(store, /const selectProject = useCallback\([\s\S]*?if \(resettingProjectRef.current \|\| abortRef.current \|\| nextBuildActive \|\| hasRunningAgentTurnV1\(projectionRef.current\)\) return[\s\S]*?window.location.assign\(withLandingDraft/, "project switching must reject local or rehydrated active work before carrying its draft")
assert.match(store, /const newChat = useCallback\([\s\S]*?if \(resettingProjectRef.current \|\| abortRef.current \|\| nextBuildActive \|\| hasRunningAgentTurnV1\(projectionRef.current\)\) return/, "new chat must not reset local or rehydrated active work")
assert.match(store, /const newProject = useCallback\([\s\S]*?if \(abortRef.current \|\| nextBuildActive \|\| hasRunningAgentTurnV1\(projectionRef.current\)\)[\s\S]*?ok: false[\s\S]*?await createProject/, "new project must reject local or rehydrated active work before making its API request")
const newDraftMenu = readFileSync(new URL("../components/siteagent/new-draft-menu.tsx", import.meta.url), "utf8")
assert.match(newDraftMenu, /const busy = isResettingProject \|\| isStreaming/)
assert.match(newDraftMenu, /aria-label=\{NEW_DRAFT_TRIGGER_ARIA_LABEL\}[\s\S]*?disabled=\{busy\}/, "the whole new-chat/project menu stays disabled during delivery")
assert.match(store, /url.searchParams.set\("project"/, "keep landing handoff params when adding selected project")
assert.match(store, /resetStarter[\s\S]*?project:personal:/, "reset control is restricted to the personal starter")
console.log("Project browser: PASS (two projects, exact-ID open, create envelope, URL, auth errors, abort and projection guards)")
