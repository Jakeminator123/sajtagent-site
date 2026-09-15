import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const proxySource = readFileSync(resolve(root, "lib/supabase/proxy.ts"), "utf8")
const envExample = readFileSync(resolve(root, ".env.example"), "utf8")
const chatFaceSource = readFileSync(resolve(root, "components/siteagent/faces/chat-face.tsx"), "utf8")
const faceDefsSource = readFileSync(resolve(root, "components/siteagent/faces/face-defs.tsx"), "utf8")
const conversationComposerSource = readFileSync(
  resolve(root, "components/siteagent/conversation-composer.tsx"),
  "utf8",
)
const agentFaceSource = readFileSync(resolve(root, "components/siteagent/faces/agent-face.tsx"), "utf8")
const agentWidgetSource = readFileSync(resolve(root, "components/siteagent/agent-widget.tsx"), "utf8")
const layoutSource = readFileSync(resolve(root, "components/siteagent/use-layout-prefs.ts"), "utf8")
const builderAdapterSource = readFileSync(resolve(root, "lib/siteagent/adapter.ts"), "utf8")
const builderStoreSource = readFileSync(resolve(root, "components/siteagent/builder-store.tsx"), "utf8")
const previewStageSource = readFileSync(resolve(root, "components/siteagent/preview-stage.tsx"), "utf8")
const cubeStageSource = readFileSync(resolve(root, "components/siteagent/cube-stage.tsx"), "utf8")
const engineBackSource = readFileSync(resolve(root, "components/siteagent/faces/back-faces.tsx"), "utf8")
const builderHeaderSource = readFileSync(resolve(root, "components/siteagent/builder-header.tsx"), "utf8")
const buildProfileSwitchSource = readFileSync(resolve(root, "components/siteagent/build-profile-switch.tsx"), "utf8")
const newDraftMenuSource = readFileSync(resolve(root, "components/siteagent/new-draft-menu.tsx"), "utf8")
const newDraftCopySource = readFileSync(resolve(root, "components/siteagent/new-draft-intents.ts"), "utf8")
const builderPageSource = readFileSync(resolve(root, "app/builder/page.tsx"), "utf8")
const layoutPrefsSource = readFileSync(resolve(root, "components/siteagent/layout-prefs.ts"), "utf8")
const versionListSource = readFileSync(resolve(root, "components/siteagent/version-list.tsx"), "utf8")
const sitemapFaceSource = readFileSync(resolve(root, "components/siteagent/faces/sitemap-face.tsx"), "utf8")
const nextPagesControlsSource = readFileSync(resolve(root, "components/siteagent/next-pages-controls.tsx"), "utf8")
const nextPreviewFrameSource = readFileSync(resolve(root, "components/siteagent/next-preview-frame.tsx"), "utf8")
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
  faceDefsSource,
  /export type FaceId = "choices" \| "versions" \| "blocks" \| "map" \| "agent"/,
  "executable registry must be the five-card post-absorption set",
)
assert.doesNotMatch(
  faceDefsSource,
  /id:\s*"chat"/,
  "Chat must not remain a default CubeStage face",
)
assert.match(
  agentFaceSource,
  /message\.role === "user"/,
  "Sajtagent card must render the user's side of the conversation",
)
assert.match(
  agentFaceSource,
  /message\.role === "assistant"/,
  "Sajtagent card must render the agent's side of the conversation",
)
assert.match(
  agentFaceSource,
  /ConversationComposer/,
  "Sajtagent card must host the conversation composer",
)
assert.match(
  agentFaceSource,
  /canSendTurn/,
  "Sajtagent composer must share the turn-send gate",
)
assert.match(
  agentFaceSource,
  /AGENT_LISTEN_BODY/,
  "empty Sajtagent card must reuse the shared listen/build-rule body",
)
assert.match(
  conversationHandoffSource,
  /Sajtagent bygger bara när en godkänd turn begär det\./,
  "Sajtagent empty copy must keep the approved-turn build rule",
)
assert.doesNotMatch(
  conversationHandoffSource,
  /Skriv i Chatt-kortet/,
  "single-card copy must not send writing to a separate Chat card",
)
assert.doesNotMatch(
  agentFaceSource,
  /Skriv i Chatt-kortet/,
  "Sajtagent must not point the user at a separate Chat card",
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
  conversationHandoffSource,
  /CONVERSATION_STATUS_SESSION_ERROR/,
  "composer must explain a failed session open before talking about integrity",
)
assert.match(
  agentFaceSource,
  /conversationComposerStatus/,
  "Sajtagent must use the shared session-vs-integrity status helper",
)
assert.match(
  conversationHandoffSource,
  /Sessionen kunde inte öppnas\. Logga in eller prova Ny chatt\./,
  "session-open copy stays user-facing Swedish",
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
  conversationHandoffSource,
  /CONVERSATION_PLACEHOLDER/,
  "ready composer placeholder must keep writing in Sajtagent",
)
assert.match(
  conversationHandoffSource,
  /CONVERSATION_STATUS_STREAMING/,
  "composer must show a waiting state while Sajtagent streams",
)
assert.match(
  conversationHandoffSource,
  /CONVERSATION_WRITE_TITLE = "Skriv här"/,
  "empty conversation must lead with skriv här",
)
assert.match(
  conversationComposerSource,
  /data-conversation-composer/,
  "composer must mark the single-card input chrome",
)
assert.match(
  conversationComposerSource,
  /data-chat-waiting=\{isStreaming \? "" : undefined\}/,
  "streaming wait copy lives on the composer status line, not a second bubble",
)
assert.doesNotMatch(
  agentFaceSource,
  /till höger/,
  "conversation copy must not assume a column",
)
assert.doesNotMatch(
  cubeStageSource,
  /chatDisplayHeight|COMPACT_CHAT_HEIGHT|isChatComposerCompact|data-face-compact/,
  "compact Chat height must be gone from CubeStage after absorption",
)
assert.match(
  cubeStageSource,
  /role="region"/,
  "open Builder cards must be named regions",
)
assert.match(
  cubeStageSource,
  /setPointerCapture/,
  "open cards must capture the pointer so preview iframes cannot swallow drag",
)
assert.match(
  cubeStageSource,
  /dragElastic=\{0\}/,
  "open-card drag must not rubber-band",
)
assert.match(
  cubeStageSource,
  /dragConstraints=\{false\}/,
  "open-card drag must not remeasure the iframe-bearing stage on every move",
)
assert.match(
  cubeStageSource,
  /dragBoundsRef/,
  "card travel is clamped from a one-shot stage measure at pointer down",
)
assert.doesNotMatch(
  cubeStageSource,
  /absolute left-4 top-4 bottom-4 flex flex-col items-start/,
  "open cards must not live in a left flex column that fights left-right drag",
)
assert.doesNotMatch(
  cubeStageSource,
  /absolute right-4 top-4 bottom-40 flex flex-col items-end/,
  "open cards must not live in a right flex column that fights left-right drag",
)
assert.match(
  cubeStageSource,
  /function stackedCardHome/,
  "column is only a home corner on the stage, not a drag parent",
)
assert.match(
  cubeStageSource,
  /dragging && "z-30 select-none touch-none"/,
  "touch scrolling must yield only while a card is being dragged",
)
assert.match(
  cubeStageSource,
  /layout=\{false\}/,
  "the draggable card node must not run layout projection during drag",
)
assert.doesNotMatch(
  cubeStageSource,
  /style=\{\{ width: size\.w, height: size\.h, x, y, perspective/,
  "3D perspective must not sit on the dragged node",
)
assert.match(
  cubeStageSource,
  /transformStyle: "preserve-3d", perspective: 1400/,
  "card flip keeps perspective on the inner face, not the drag layer",
)
assert.doesNotMatch(
  cubeStageSource,
  /LayoutGroup/,
  "open cards must not share a LayoutGroup with the dock",
)
assert.doesNotMatch(
  cubeStageSource,
  /layoutId=/,
  "docked cards must not project into open cards via layoutId",
)
assert.doesNotMatch(
  layoutSource,
  /clamp\([^;]*-1200,\s*1200\)/,
  "face offsets must not use a hardcoded ±1200 clamp",
)
assert.match(
  layoutPrefsSource,
  /export function clampFaceOffset/,
  "offset clamp must be a shared geometry helper",
)
assert.equal(
  [...layoutSource.matchAll(/clampFaceOffset/g)].length >= 2,
  true,
  "hydration and moveFace must share clampFaceOffset",
)
assert.doesNotMatch(
  layoutSource,
  /chatDisplayHeight|COMPACT_CHAT_HEIGHT|isChatComposerCompact/,
  "compact Chat height must not be persisted in layout:v4",
)
assert.match(
  conversationHandoffSource,
  /CONVERSATION_WRITE_BODY = "Fråga eller beskriv sajten."/,
  "empty conversation body must stay one short ask line",
)
assert.match(
  conversationHandoffSource,
  /CONVERSATION_STATUS_READY = "Skriv här. Svaret syns i samma kort."/,
  "composer status after the first send must stay in the same card",
)
assert.match(
  conversationHandoffSource,
  /CONVERSATION_PLACEHOLDER = "Skriv till Sajtagent…"/,
  "composer placeholder must keep writing in Sajtagent",
)
assert.match(
  chatFaceSource,
  /Flyttad till Sajtagent/,
  "unused Chat face must point back to Sajtagent if re-enabled",
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
  conversationComposerSource,
  /ImageIcon|Textbilagor är inte anslutna/,
  "composer must not show unfinished attachment chrome",
)
assert.match(
  agentWidgetSource,
  /Skriv i Sajtagent-kortet\./,
  "agent widget footer must send writing to the Sajtagent card",
)
assert.match(
  layoutSource,
  /DEFAULT_DOCKED: FaceId\[\] = \["choices", "versions", "blocks", "map"\]/,
  "default Builder must open Sajtagent and dock the supporting cards",
)
assert.match(
  layoutSource,
  /migrateDockedFaces/,
  "layout hydration must migrate Chat docks without wiping other faces",
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
assert.match(engineBackSource, /buildStatusLabel\(agentProjection\)/, "Build status must derive from verified event state, including terminal outcomes")
assert.match(builderHeaderSource, /NewDraftMenu/, "the header must host the Ny… menu")
assert.match(newDraftCopySource, /NEW_DRAFT_TRIGGER_LABEL = "Ny…"/, "the header control is Ny…, not a lone Ny chatt button")
assert.match(newDraftMenuSource, /\{NEW_CHAT_LABEL\}/, "Ny chatt remains a named menu intent")
assert.match(newDraftMenuSource, /\{NEW_PROJECT_LABEL\}/, "Nytt projekt is the second named menu intent")
assert.match(
  newDraftCopySource,
  /NEW_PROJECT_CONFIRM_DESCRIPTION =\s*"Ett separat projekt skapas\. Dina tidigare projekt, versioner och previews finns kvar\."/,
  "Nytt projekt preserves previous projects",
)
assert.match(newDraftCopySource, /NEW_PROJECT_CONFIRM_CANCEL = "Avbryt"/)
assert.match(newDraftCopySource, /NEW_PROJECT_CONFIRM_ACTION = "Skapa projekt"/)
assert.doesNotMatch(newDraftMenuSource, /variant: "destructive"/, "creating a project is non-destructive")
assert.match(newDraftMenuSource, /aria-label=\{NEW_DRAFT_TRIGGER_ARIA_LABEL\}/)
assert.match(newDraftMenuSource, /onEscapeKeyDown/)
assert.equal(
  [...newDraftMenuSource.matchAll(/<DropdownMenuItem/g)].length,
  2,
  "the Ny… menu has exactly two intents",
)
assert.doesNotMatch(newDraftMenuSource, /Nytt bygge|Annat|Övrigt/, "do not invent a third Ny… item")
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
  /LAYOUT_DEFAULTS_REVISION = 6/,
  "Chat absorption must be revision 6 inside the same v4 key",
)
assert.match(
  layoutPrefsSource,
  /migrateDockedFaces/,
  "layout-prefs must expose a Chat-dock migration that keeps other docks",
)
assert.match(
  versionListSource,
  /Skriv i Sajtagent-kortet\. Sajtagent skapar den första när ett bygge verifieras\./,
  "empty Versions card must not repeat the title as body copy",
)
assert.doesNotMatch(
  sitemapFaceSource,
  /canonical revision|read-modellen|Sidträdet kopplas i nästa steg|Sidträdet för React är inte anslutet/,
  "Map copy must not expose internal read-model wording or the old stub",
)
assert.doesNotMatch(
  sitemapFaceSource,
  /accepted_source_files|app\/page\.tsx/,
  "Map must render owner routes, not parse source paths in the browser",
)
assert.match(
  sitemapFaceSource,
  /Sidor i den accepterade React-källan/,
  "Map must describe Next routes as accepted source pages",
)
assert.match(
  sitemapFaceSource,
  /node\.virtual/,
  "Map must mark invented parent folders as virtual group nodes",
)
assert.match(
  sitemapFaceSource,
  /HTML-skissen är en sida/,
  "HTML map must stay a single honest page node",
)
assert.match(
  sitemapFaceSource,
  /Lägg till och ta bort sidor i React-läget/,
  "HTML map must not offer active add\/remove",
)
assert.match(
  sitemapFaceSource,
  /NextPagesAddForm/,
  "Map must expose the Next add-page form",
)
assert.match(
  sitemapFaceSource,
  /NextPageRemoveButton/,
  "Map must expose remove on child pages",
)
assert.match(
  sitemapFaceSource,
  /buildPreviewRouteTree/,
  "Map must nest accepted routes as a page tree",
)
assert.doesNotMatch(
  sitemapFaceSource,
  /paddingLeft|routeDepth/,
  "Map must nest children instead of padding a flat list",
)
assert.match(nextPagesControlsSource, /Lägg till/)
assert.match(nextPagesControlsSource, /Ta bort/)
assert.match(
  nextPagesControlsSource,
  /normalizeManualPageRouteInput/,
  "manual add must lowercase and strip trailing slashes before POST",
)
assert.match(
  previewStageSource,
  /w-\[min\(80vw,100%\)\]/,
  "Preview window must occupy about 80% of the viewport, not a 1100px cap",
)
assert.doesNotMatch(
  previewStageSource,
  /max-w-\[1100px\]/,
  "Preview must not keep the old 1100px width cap",
)
assert.match(
  previewStageSource,
  /NextPagesAddForm/,
  "Preview chrome can add a Next page",
)
assert.match(
  previewStageSource,
  /HTML-skissen är en sida\. Lägg till och ta bort sidor i React-läget/,
  "HTML preview must not present an active page editor",
)
assert.match(
  sitemapFaceSource,
  /previewKind === "next"/,
  "Map must not show the HTML sketch as the current Next tree",
)
assert.match(
  previewStageSource,
  /previewableRoutes\.length > 1/,
  "Preview chrome only shows a page switcher when several export-backed routes exist",
)
assert.match(
  nextPreviewFrameSource,
  /acceptedPreviewableRoutes/,
  "Next preview must not navigate source-only routes that the export cannot serve",
)
assert.match(
  sitemapFaceSource,
  /inte i previewn ännu/,
  "Map must mark source pages that are not in the accepted export",
)
assert.match(
  sitemapFaceSource,
  /sitemapRowNote/,
  "Map must show group and not-yet-preview notes in the row, not only a title tooltip",
)
assert.doesNotMatch(
  sitemapFaceSource,
  /canSelect = previewKind === "next" && previewableRoutes\.length > 1/,
  "Map must let the user select an export-backed page even when it is the only one",
)
assert.match(
  nextPreviewFrameSource,
  /previewOrigin\.current = action\.origin/,
  "Next preview must keep the bootstrap origin before navigating pages",
)
assert.match(
  nextPreviewFrameSource,
  /if \(!bootstrapped \|\| !frame \|\| !origin\) return/,
  "Next preview must not navigate content routes before bootstrap",
)
assert.match(
  nextPreviewFrameSource,
  /previewContentUrl/,
  "Next preview page URLs must use the gateway content path",
)
assert.match(
  nextPreviewFrameSource,
  /previewRouteFromFrameMessage/,
  "Next preview must accept only typed route messages from the gateway origin",
)
assert.match(
  nextPreviewFrameSource,
  /event\.origin !== origin/,
  "Next preview must ignore route messages from other origins",
)
assert.match(
  previewStageSource,
  /onRoute=\{setPreviewRoute\}/,
  "In-preview navigation must update Karta and the chrome route",
)
assert.doesNotMatch(
  nextPreviewFrameSource,
  /src=\{/,
  "Next preview iframe must not request a content URL before the bootstrap POST",
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
  /const hasContent = nextAvailability !== "loading" && Boolean\(previewUrl \|\| accepted\)/,
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
assert.match(
  builderHeaderSource,
  /BuildProfileSwitch/,
  "the temporary HTML-sketch / React switch lives in the existing Builder header",
)
assert.match(buildProfileSwitchSource, /HTML-skiss/)
assert.match(buildProfileSwitchSource, /React \(Next\)/)
assert.match(
  buildProfileSwitchSource,
  /Temporary sketch-mode switch/,
  "the control must stay marked as the temporary doctrine switch",
)
assert.match(
  buildProfileSwitchSource,
  /availability !== "available"/,
  "the switch is hidden when Next is not a deployment capability",
)
assert.match(
  builderHeaderSource,
  /HTML-skiss kan inte publiceras/,
  "HTML sketch cannot publish; existing Next publication is unchanged",
)
assert.match(heroSource, /beta/, "the hero must label the current product state as beta")
assert.doesNotMatch(heroSource, /färdig webbplats|bygger sidan|tio sekunder/, "the hero must not claim unavailable build automation")
assert.match(agendaSource, /Frågor får svar utan bygge/, "the agenda must distinguish conversation from a build order")
assert.match(agendaSource, /resultatet har verifierats/, "the agenda must retain the verified-result boundary")
assert.doesNotMatch(agendaSource, /Byggstarten förblir stängd/, "the agenda must not claim that the working V1 build path is disabled")
assert.match(
  authPathsSource,
  /export const LOGIN_SUCCESS_PATH = "\/builder"/,
  "password and magic-link login must share /builder as the success path",
)
assert.match(authCallbackSource, /authCallbackRedirectPath/, "OTP callback must reuse the shared success path")
assert.match(loginFormSource, /signInWithPassword/, "login must offer email and password")
assert.match(loginFormSource, /signInWithOtp/, "login must keep the existing magic-link path")
assert.match(loginFormSource, /Logga in/, "the primary action must be password sign-in")
assert.match(loginFormSource, /authCallbackRedirectPath/, "password login must validate its destination like the OTP callback")
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
  "Site UI boundary: PASS (routing, public environment, single-card conversation, fail-closed build path, and honest beta UI)",
)
