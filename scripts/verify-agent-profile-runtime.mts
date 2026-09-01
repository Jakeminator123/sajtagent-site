import { strict as assert } from "node:assert"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { register } from "node:module"

import {
  AgentProfileCompileProjectionV1Schema,
  DEFAULT_AGENT_PROFILE_V1,
  DEFAULT_LOCAL_AGENT_CEILING_V1,
  compilePortableOpenClawBundleV1,
} from "../contracts/agent-profile-v1.ts"
import { runtimeSignaturePayloadV1 } from "../lib/siteagent/server/runtime-protocol-v1.ts"

register("./server-only-test-hook.mjs", import.meta.url)

const {
  SignedAgentProfileRuntimeClientV1,
  createAgentProfileRuntimeClientFromEnvV1,
} = await import("../lib/siteagent/server/agent-profile-runtime-client.ts")

const signingKey = "profile-test-signing-key-that-is-long-enough"
const now = new Date("2026-09-02T00:00:00.000Z")
const nonce = "nonce:agent-profile-test"
const bundle = compilePortableOpenClawBundleV1(
  DEFAULT_AGENT_PROFILE_V1,
  DEFAULT_LOCAL_AGENT_CEILING_V1,
)
let calls = 0

function jsonResponse(value: unknown, status = 200): Response {
  const body = JSON.stringify(value)
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-length": String(new TextEncoder().encode(body).byteLength),
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  })
}

const fetchImpl: typeof fetch = async (input, init) => {
  calls += 1
  const endpoint = new URL(typeof input === "string" ? input : input.toString())
  assert.equal(init?.redirect, "error")
  assert.equal(init?.cache, "no-store")
  if (endpoint.pathname === "/health") {
    assert.equal(init?.method, "GET")
    return jsonResponse({
      service: "sajtagent-sprites-runtime",
      mode: "fail-closed",
      signedJobsEnabled: true,
    })
  }

  assert.equal(endpoint.pathname, "/v1/agent-profiles/compile")
  assert.equal(init?.method, "POST")
  const body = String(init?.body)
  const headers = new Headers(init?.headers)
  assert.deepEqual(JSON.parse(body), { profile: DEFAULT_AGENT_PROFILE_V1 })
  assert.equal(headers.get("x-siteagent-timestamp"), now.toISOString())
  assert.equal(headers.get("x-siteagent-nonce"), nonce)
  assert.equal(
    headers.get("x-siteagent-signature"),
    createHmac("sha256", signingKey)
      .update(
        runtimeSignaturePayloadV1(
          "POST",
          endpoint.pathname,
          now.toISOString(),
          nonce,
          body,
        ),
      )
      .digest("hex"),
  )
  return jsonResponse(bundle)
}

const client = new SignedAgentProfileRuntimeClientV1(
  "https://runtime.example/",
  signingKey,
  { fetch: fetchImpl, now: () => now, createNonce: () => nonce },
)
const projection = await client.compile(DEFAULT_AGENT_PROFILE_V1)
assert.equal(calls, 2)
assert.deepEqual(projection, {
  schemaVersion: 1,
  compiled: true,
  runtime: { service: "sajtagent-sprites-runtime", mode: "fail-closed" },
  capabilityCount: bundle.effectivePolicy.capabilities.length,
  findingCount: bundle.effectivePolicy.findings.length,
})
assert.equal(AgentProfileCompileProjectionV1Schema.safeParse(projection).success, true)
assert.equal("files" in projection, false)
assert.equal("runtimeUrl" in projection, false)

assert.throws(
  () => new SignedAgentProfileRuntimeClientV1("http://runtime.example", signingKey),
  /HTTPS or loopback/,
)
assert.throws(
  () => new SignedAgentProfileRuntimeClientV1("https://runtime.example", "short"),
  /at least 32/,
)
assert.equal(createAgentProfileRuntimeClientFromEnvV1({}), null)
assert.throws(
  () => createAgentProfileRuntimeClientFromEnvV1({ SITEAGENT_RUNTIME_URL: "https://runtime.example" }),
  /configured together/,
)

const component = readFileSync(
  new URL("../components/agent-studio/agent-studio.tsx", import.meta.url),
  "utf8",
)
const route = readFileSync(
  new URL("../app/api/siteagent/agent-profiles/compile/route.ts", import.meta.url),
  "utf8",
)
assert.match(component, /\/api\/siteagent\/agent-profiles\/compile/)
assert.doesNotMatch(component, /SITEAGENT_RUNTIME|127\.0\.0\.1:4317|\/v1\/agent-profiles\/compile/)
assert.match(route, /isSameOriginMutation/)
assert.match(route, /resolveBuildPrincipalV1/)
assert.doesNotMatch(route, /NEXT_PUBLIC_.*RUNTIME/)

console.log("PASS Agent Studio runtime proxy: signed Site join and narrow projection")
