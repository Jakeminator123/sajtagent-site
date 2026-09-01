import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const proxySource = readFileSync(resolve(root, "lib/supabase/proxy.ts"), "utf8")
const envExample = readFileSync(resolve(root, ".env.example"), "utf8")
const chatFaceSource = readFileSync(resolve(root, "components/siteagent/faces/chat-face.tsx"), "utf8")
const agentFaceSource = readFileSync(resolve(root, "components/siteagent/faces/agent-face.tsx"), "utf8")
const layoutSource = readFileSync(resolve(root, "components/siteagent/use-layout-prefs.ts"), "utf8")

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

console.log("Site UI boundary: PASS (proxy routing, public environment, and split conversation cards)")
