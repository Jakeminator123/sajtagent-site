import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const proxySource = readFileSync(resolve(root, "lib/supabase/proxy.ts"), "utf8")
const executeSource = readFileSync(resolve(root, "app/api/execute/route.ts"), "utf8")
const envExample = readFileSync(resolve(root, ".env.example"), "utf8")

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

console.log("Site UI boundary: PASS (proxy routing and environment origin)")
