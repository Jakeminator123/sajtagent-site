import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const proxySource = readFileSync(resolve(root, "lib/supabase/proxy.ts"), "utf8")
const executeSource = readFileSync(resolve(root, "app/api/execute/route.ts"), "utf8")
const envExample = readFileSync(resolve(root, ".env.example"), "utf8")
const chatFaceSource = readFileSync(resolve(root, "components/siteagent/faces/chat-face.tsx"), "utf8")
const agentFaceSource = readFileSync(resolve(root, "components/siteagent/faces/agent-face.tsx"), "utf8")
const layoutSource = readFileSync(resolve(root, "components/siteagent/use-layout-prefs.ts"), "utf8")
const builderAdapterSource = readFileSync(resolve(root, "lib/siteagent/adapter.ts"), "utf8")
const builderStoreSource = readFileSync(resolve(root, "components/siteagent/builder-store.tsx"), "utf8")
const cubeStageSource = readFileSync(resolve(root, "components/siteagent/cube-stage.tsx"), "utf8")
const engineBackSource = readFileSync(resolve(root, "components/siteagent/faces/back-faces.tsx"), "utf8")
const builderHeaderSource = readFileSync(resolve(root, "components/siteagent/builder-header.tsx"), "utf8")
const heroSource = readFileSync(resolve(root, "components/hero-section.tsx"), "utf8")
const agendaSource = readFileSync(resolve(root, "components/agenda.tsx"), "utf8")
const buildJobsRoute = resolve(root, "app/api/siteagent/build-jobs/route.ts")

assert.match(
  proxySource,
  /request:\s*\{\s*headers:\s*request\.headers\s*\}/,
  "Supabase proxy must forward only request headers to NextResponse.next",
)
assert.doesNotMatch(
  proxySource,
  /NextResponse\.next\(\{\s*request\s*\}\)/,
  "passing the full NextRequest to NextResponse.next makes non-root routes return 404",
)
assert.doesNotMatch(
  executeSource,
  /process\.env\.NEXT_PUBLIC_URL/,
  "internal server requests must derive their origin from the incoming request",
)
assert.doesNotMatch(
  envExample,
  /^NEXT_PUBLIC_URL=/m,
  "NEXT_PUBLIC_URL is not a required Site environment variable",
)
assert.match(
  chatFaceSource,
  /message\.role === "user"/,
  "Chat card must render the user's side of the conversation",
)
assert.match(
  agentFaceSource,
  /message\.role === "assistant"/,
  "Sajtagent card must render the agent's side of the conversation",
)
assert.match(
  layoutSource,
  /DEFAULT_DOCKED: FaceId\[\] = \["choices", "versions", "blocks", "map"\]/,
  "Chat and Sajtagent must be the two open default cards",
)
assert.equal(
  existsSync(buildJobsRoute),
  false,
  "the browser-callable build-jobs route must remain absent until the same-session tool join is ratified",
)
for (const [surface, source] of [
  ["browser adapter", builderAdapterSource],
  ["builder store", builderStoreSource],
]) {
  assert.doesNotMatch(source, /\/api\/siteagent\/build-jobs/, `${surface} must not dispatch a parallel build intent`)
}
assert.doesNotMatch(
  cubeStageSource,
  /versions\.length\s*>\s*0\s*\|\|\s*isStreaming/,
  "ordinary chat streaming must not lock Byggval",
)
assert.match(
  cubeStageSource,
  /previewStatus === "building"/,
  "Byggval may react to an actual build projection",
)
assert.doesNotMatch(
  engineBackSource,
  /lastAssistant|messages|isStreaming/,
  "ordinary assistant replies must not appear as build activity",
)
assert.match(engineBackSource, /activeTurn\?\.buildJobId/, "Build status must derive from a verified build event")
assert.match(builderHeaderSource, />\s*Ny chatt\s*</, "the reset action must describe a new chat")
assert.doesNotMatch(builderHeaderSource, /Nytt bygge/, "ordinary chat reset must not claim to start a build")
assert.match(heroSource, /lokal beta/, "the hero must label the current product state as beta")
assert.doesNotMatch(heroSource, /färdig webbplats|bygger sidan|tio sekunder/, "the hero must not claim unavailable build automation")
assert.match(agendaSource, /Byggstarten förblir stängd/, "the agenda must describe the fail-closed build boundary")

console.log("Site UI boundary: PASS (routing, split conversation, fail-closed build path, and honest beta UI)")
