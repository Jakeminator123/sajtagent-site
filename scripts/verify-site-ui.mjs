import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const proxySource = readFileSync(resolve(root, "lib/supabase/proxy.ts"), "utf8")
const envExample = readFileSync(resolve(root, ".env.example"), "utf8")
const chatFaceSource = readFileSync(resolve(root, "components/siteagent/faces/chat-face.tsx"), "utf8")
const agentFaceSource = readFileSync(resolve(root, "components/siteagent/faces/agent-face.tsx"), "utf8")
const layoutSource = readFileSync(resolve(root, "components/siteagent/use-layout-prefs.ts"), "utf8")
const builderAdapterSource = readFileSync(resolve(root, "lib/siteagent/adapter.ts"), "utf8")
const builderStoreSource = readFileSync(resolve(root, "components/siteagent/builder-store.tsx"), "utf8")
const previewStageSource = readFileSync(resolve(root, "components/siteagent/preview-stage.tsx"), "utf8")
const cubeStageSource = readFileSync(resolve(root, "components/siteagent/cube-stage.tsx"), "utf8")
const engineBackSource = readFileSync(resolve(root, "components/siteagent/faces/back-faces.tsx"), "utf8")
const builderHeaderSource = readFileSync(resolve(root, "components/siteagent/builder-header.tsx"), "utf8")
const heroSource = readFileSync(resolve(root, "components/hero-section.tsx"), "utf8")
const agendaSource = readFileSync(resolve(root, "components/agenda.tsx"), "utf8")
const loginFormSource = readFileSync(resolve(root, "app/login/login-form.tsx"), "utf8")
const authPathsSource = readFileSync(resolve(root, "lib/supabase/auth-paths.ts"), "utf8")
const authCallbackSource = readFileSync(resolve(root, "app/auth/callback/route.ts"), "utf8")
const runtimeBaselineSource = readFileSync(resolve(root, "docs/runtime-baseline.md"), "utf8")
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
assert.doesNotMatch(
  builderStoreSource,
  /agentProjection\.status === "failed"/,
  "a failed conversation turn must not flip Preview into a build error",
)
assert.match(
  builderStoreSource,
  /latestTurn\?\.buildJobId/,
  "Preview error requires a failed BuildJob, not a chat answer",
)
assert.match(
  previewStageSource,
  /const hasContent = Boolean\(previewUrl\)/,
  "a verified preview iframe stays mounted for follow-up prompts",
)
assert.match(
  previewStageSource,
  /Previewn stannar här så du kan fortsätta prompta/,
  "Preview copy must describe continued conversation, not a one-shot build",
)
assert.match(heroSource, /lokal beta/, "the hero must label the current product state as beta")
assert.doesNotMatch(heroSource, /färdig webbplats|bygger sidan|tio sekunder/, "the hero must not claim unavailable build automation")
assert.match(agendaSource, /Byggstarten förblir stängd/, "the agenda must describe the fail-closed build boundary")
assert.match(
  authPathsSource,
  /export const LOGIN_SUCCESS_PATH = "\/builder"/,
  "password and magic-link login must share /builder as the success path",
)
assert.match(authCallbackSource, /authCallbackRedirectPath/, "OTP callback must reuse the shared success path")
assert.match(loginFormSource, /signInWithPassword/, "login must offer email and password")
assert.match(loginFormSource, /signInWithOtp/, "login must keep the existing magic-link path")
assert.match(loginFormSource, /Logga in/, "the primary action must be password sign-in")
assert.match(loginFormSource, /LOGIN_SUCCESS_PATH/, "password login must redirect like the OTP callback")
assert.match(loginFormSource, /<details/, "magic-link login must stay available but secondary")
assert.doesNotMatch(
  loginFormSource,
  /signUp|createUser|admin\.createUser/,
  "login must not create Auth users from application code",
)
assert.doesNotMatch(
  loginFormSource,
  /jakob\.olof\.eberg@gmail\.com/,
  "login must not hard-code an operator email",
)
assert.doesNotMatch(
  loginFormSource,
  /password:\s*['"`][^'"`]+['"`]/,
  "login must not embed a password literal",
)
assert.match(
  runtimeBaselineSource,
  /signInWithPassword/,
  "runtime baseline must document password login",
)
assert.match(
  runtimeBaselineSource,
  /jakob\.olof\.eberg@gmail\.com/,
  "runtime baseline must name the interim verified operator identity",
)
assert.match(
  runtimeBaselineSource,
  /No app-level role table exists yet/,
  "runtime baseline must record that superadmin is not a role table yet",
)

console.log(
  "Site UI boundary: PASS (routing, public environment, split conversation, fail-closed build path, and honest beta UI)",
)
