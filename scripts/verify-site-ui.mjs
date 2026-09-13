import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const proxySource = readFileSync(resolve(root, "lib/supabase/proxy.ts"), "utf8")
const envExample = readFileSync(resolve(root, ".env.example"), "utf8")
const chatFaceSource = readFileSync(resolve(root, "components/siteagent/faces/chat-face.tsx"), "utf8")
const agentFaceSource = readFileSync(resolve(root, "components/siteagent/faces/agent-face.tsx"), "utf8")
const agentWidgetSource = readFileSync(resolve(root, "components/siteagent/agent-widget.tsx"), "utf8")
const layoutSource = readFileSync(resolve(root, "components/siteagent/use-layout-prefs.ts"), "utf8")
const builderAdapterSource = readFileSync(resolve(root, "lib/siteagent/adapter.ts"), "utf8")
const builderStoreSource = readFileSync(resolve(root, "components/siteagent/builder-store.tsx"), "utf8")
const previewStageSource = readFileSync(resolve(root, "components/siteagent/preview-stage.tsx"), "utf8")
const cubeStageSource = readFileSync(resolve(root, "components/siteagent/cube-stage.tsx"), "utf8")
const engineBackSource = readFileSync(resolve(root, "components/siteagent/faces/back-faces.tsx"), "utf8")
const builderHeaderSource = readFileSync(resolve(root, "components/siteagent/builder-header.tsx"), "utf8")
const builderPageSource = readFileSync(resolve(root, "app/builder/page.tsx"), "utf8")
const layoutPrefsSource = readFileSync(resolve(root, "components/siteagent/layout-prefs.ts"), "utf8")
const versionListSource = readFileSync(resolve(root, "components/siteagent/version-list.tsx"), "utf8")
const sitemapFaceSource = readFileSync(resolve(root, "components/siteagent/faces/sitemap-face.tsx"), "utf8")
const conversationHandoffSource = readFileSync(
  resolve(root, "components/siteagent/conversation-handoff.ts"),
  "utf8",
)
const cardStatesSource = readFileSync(resolve(root, "components/siteagent/card-states.tsx"), "utf8")
const heroSource = readFileSync(resolve(root, "components/hero-section.tsx"), "utf8")
const agendaSource = readFileSync(resolve(root, "components/agenda.tsx"), "utf8")
const loginPageSource = readFileSync(resolve(root, "app/login/page.tsx"), "utf8")
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
  agentFaceSource,
  /AGENT_LISTEN_BODY/,
  "empty Sajtagent card must reuse the shared listen/answer-here body",
)
assert.match(
  conversationHandoffSource,
  /Skriv i Chatt-kortet\. Sajtagent bygger bara när en godkänd turn begär det\./,
  "Sajtagent empty copy must send writing to Chat without repeating Chat's paragraph",
)
assert.doesNotMatch(
  conversationHandoffSource,
  /Sajtagents svar visas i det här kortet/,
  "answer-here copy must not repeat Chat's write-here paragraph",
)
assert.match(
  agentFaceSource,
  /data-card-state=\{cardState\}/,
  "Sajtagent card must expose empty/streaming/ready/error state",
)
assert.match(
  agentFaceSource,
  /data-agent-streaming="waiting"/,
  "Sajtagent card must have a waiting-for-delta streaming state",
)
assert.match(
  agentFaceSource,
  /Sajtagent tänker…/,
  "streaming placeholder must reuse the thinking label",
)
assert.match(
  agentFaceSource,
  /Ny chatt krävs/,
  "fail-closed integrity errors must tell the user to start a new chat",
)
assert.match(
  agentFaceSource,
  /Kunde inte öppna sessionen/,
  "session-open failure must not be presented as an integrity stop",
)
assert.match(
  agentFaceSource,
  /sessionOpenFailure/,
  "Sajtagent must distinguish a failed session open from a fail-closed stream",
)
assert.match(
  chatFaceSource,
  /CHAT_STATUS_SESSION_ERROR/,
  "Chat must explain a failed session open before talking about integrity",
)
assert.match(
  conversationHandoffSource,
  /Sessionen kunde inte öppnas\. Logga in eller prova Ny chatt\./,
  "session-open Chat copy stays user-facing Swedish",
)
assert.doesNotMatch(
  agentFaceSource,
  /OpenClaw/,
  "Sajtagent card copy must not name the OpenClaw runtime",
)
assert.doesNotMatch(
  agentFaceSource,
  /siteagent-did-slot/,
  "the unused video-avatar slot must not occupy the Sajtagent conversation card",
)
assert.match(
  chatFaceSource,
  /CHAT_ANSWER_PLACEHOLDER/,
  "ready Chat placeholder must point answers to the Sajtagent card",
)
assert.match(
  chatFaceSource,
  /CHAT_STATUS_STREAMING/,
  "Chat must show a waiting state while Sajtagent streams",
)
assert.match(
  chatFaceSource,
  /CHAT_WRITE_HERE_TITLE/,
  "empty Chat must lead with skriv här",
)
assert.match(
  chatFaceSource,
  /data-chat-compact=\{compact \? "" : undefined\}/,
  "Chat must expose compact composer mode while Sajtagent streams or asks",
)
assert.match(
  chatFaceSource,
  /data-chat-waiting=\{isStreaming \? "" : undefined\}/,
  "Chat waiting copy lives on the status line, not a second bubble",
)
assert.doesNotMatch(
  chatFaceSource,
  /Sajtagent svarar i sitt kort…[\s\S]*Sajtagent svarar i sitt kort/,
  "Chat must not repeat the streaming wait line in the message list and footer",
)
assert.doesNotMatch(
  chatFaceSource,
  /till höger/,
  "Chat handoff must name the Sajtagent card, not assume a column",
)
assert.match(
  cubeStageSource,
  /chatDisplayHeight\(size\.h, compactChat\)/,
  "streaming Chat may shrink visually without writing a new saved size",
)
assert.match(
  cubeStageSource,
  /data-face-compact=\{compactChat \? "chat" : undefined\}/,
  "FaceCard must mark the temporary compact Chat height",
)
assert.match(
  cubeStageSource,
  /role="region"/,
  "open Builder cards must be named regions",
)
assert.doesNotMatch(
  layoutSource,
  /chatDisplayHeight|COMPACT_CHAT_HEIGHT|isChatComposerCompact/,
  "compact Chat height must not be persisted in layout:v4",
)
assert.match(
  conversationHandoffSource,
  /COMPACT_CHAT_HEIGHT = 216/,
  "compact Chat height helper must stay a presentation constant",
)
assert.match(
  conversationHandoffSource,
  /CHAT_WRITE_HERE_BODY = "Fråga eller beskriv sajten."/,
  "empty Chat body must stay one short ask line",
)
assert.match(
  conversationHandoffSource,
  /CHAT_STATUS_READY = "Skriv här. Svaret syns i Sajtagent-kortet."/,
  "Chat composer status must name the Sajtagent card after the first send",
)
assert.match(
  conversationHandoffSource,
  /CHAT_ANSWER_PLACEHOLDER = "Svaret syns i Sajtagent-kortet"/,
  "Chat placeholder must keep the answer-there handoff",
)
assert.match(
  chatFaceSource,
  /userMessages\.length === 0\s*\?\s*null/,
  "empty Chat must not repeat skriv-här on the status line",
)
assert.match(
  cardStatesSource,
  /role="img"/,
  "status dots need a role so their aria-label is exposed",
)
assert.match(
  previewStageSource,
  /role="status"/,
  "preview status chip must be a live status",
)
assert.doesNotMatch(
  chatFaceSource,
  /ImageIcon|Textbilagor är inte anslutna/,
  "Chat must not show unfinished attachment chrome",
)
assert.match(
  agentWidgetSource,
  /Skriv i Chatt-kortet\. Svaret syns i Sajtagent\./,
  "agent widget footer must send writing to Chat and answers to Sajtagent",
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
assert.match(builderHeaderSource, />\s*Sajtagent\s*</, "Builder header chrome must use the Sajtagent product name")
assert.doesNotMatch(
  builderHeaderSource,
  />\s*Siteagent\s*</,
  "Builder header must not show the Siteagent spelling",
)
assert.match(
  builderPageSource,
  /title:\s*"Sajtagent — Builder"/,
  "Builder tab title must use Sajtagent",
)
assert.doesNotMatch(
  builderPageSource,
  /SiteAgent|Siteagent/,
  "Builder page metadata must not keep the Siteagent spelling",
)
assert.match(
  loginPageSource,
  /title:\s*"Sajtagent — Logga in"/,
  "login tab title must match the visible Sajtagent label",
)
assert.doesNotMatch(
  loginPageSource,
  /SiteAgent|Siteagent/,
  "login page metadata must not keep the Siteagent spelling",
)
assert.match(
  layoutSource,
  /siteagent:layout:v4|LAYOUT_STORAGE_KEY/,
  "returning users must keep the existing layout:v4 storage key",
)
assert.match(
  layoutSource,
  /defaultsRevision: LAYOUT_DEFAULTS_REVISION/,
  "persisted layout must stamp the defaults revision after hydration",
)
assert.match(
  layoutSource,
  /migrateAgentDefaultSize/,
  "layout hydration must migrate the pre-PR#22 agent default",
)
assert.doesNotMatch(
  layoutSource,
  /localStorage\.removeItem\(STORAGE_KEY\)[\s\S]*setSizes/,
  "hydration must not wipe layout:v4 to pick up the new agent default",
)
assert.match(
  layoutPrefsSource,
  /LAYOUT_STORAGE_KEY = "siteagent:layout:v4"/,
  "layout storage key must stay siteagent:layout:v4",
)
assert.match(
  layoutPrefsSource,
  /LEGACY_UNCUSTOMIZED_AGENT_SIZE: FaceSize = \{ w: 340, h: 440 \}/,
  "legacy agent sentinel must be the pre-PR#22 default 340×440",
)
assert.match(
  layoutPrefsSource,
  /LAYOUT_DEFAULTS_REVISION = 5/,
  "agent-size migration must be revision 5 inside the same v4 key",
)
assert.match(
  versionListSource,
  /Skriv i Chatt-kortet\. Sajtagent skapar den första när ett bygge verifieras\./,
  "empty Versions card must not repeat the title as body copy",
)
assert.doesNotMatch(
  sitemapFaceSource,
  /canonical revision|read-modellen/,
  "Map stub copy must not expose internal read-model wording",
)
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
assert.match(
  previewStageSource,
  /data-preview-status=\{previewStatus\}/,
  "Preview chrome must expose idle/building/ready/error status",
)
assert.match(
  previewStageSource,
  /previewAddressLabel/,
  "Preview must not invent a fake site URL before a version exists",
)
assert.doesNotMatch(
  previewStageSource,
  /din-sajt\.siteagent\.app/,
  "empty Preview must not show a placeholder product domain",
)
assert.match(
  builderStoreSource,
  /canSendTurn/,
  "Chat and Blocks must share one turn-send gate",
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
