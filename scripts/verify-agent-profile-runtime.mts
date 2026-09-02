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
import {
  AGENT_PROFILE_ACTIVATION_PATH_V1,
  AgentProfileActivationProjectionV1Schema,
  AgentProfileActivationRequestV1Schema,
} from "../contracts/agent-profile-activation-v1.ts"
import {
  prepareAgentProfileActivationDraftV1,
  readStoredAgentProfileDraftV1,
  rebaseAgentProfileActivationDraftV1,
} from "../components/agent-studio/agent-profile-draft-v1.ts"
import { runtimeSignaturePayloadV1 } from "../lib/siteagent/server/runtime-protocol-v1.ts"

register("./server-only-test-hook.mjs", import.meta.url)

const {
  AgentProfileActivationConflictV1,
  SignedAgentProfileRuntimeClientV1,
  createAgentProfileRuntimeClientFromEnvV1,
} = await import("../lib/siteagent/server/agent-profile-runtime-client.ts")

const signingKey = "profile-test-signing-key-that-is-long-enough"
const now = new Date("2026-09-02T00:00:00.000Z")
const nonce = "nonce:agent-profile-test"
const activationId = "activation:agent-profile-test"
const idempotencyKey = "activation-idempotency:agent-profile-test"
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

  if (endpoint.pathname === AGENT_PROFILE_ACTIVATION_PATH_V1) {
    assert.equal(init?.method, "POST")
    const body = String(init?.body)
    const headers = new Headers(init?.headers)
    const request = AgentProfileActivationRequestV1Schema.parse(JSON.parse(body))
    assert.equal(request.activationId, activationId)
    assert.equal(request.idempotencyKey, idempotencyKey)
    assert.equal(request.requestedAt, now.toISOString())
    assert.equal(request.expectedActiveRevision, 1)
    assert.deepEqual(request.profile, DEFAULT_AGENT_PROFILE_V1)
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
    return jsonResponse({
      schemaVersion: 1,
      activated: true,
      profileId: DEFAULT_AGENT_PROFILE_V1.profileId,
      revision: DEFAULT_AGENT_PROFILE_V1.revision,
      activatedAt: now.toISOString(),
      activationId,
      bundleSha256: "a".repeat(64),
      takesEffect: "next-run",
      effectivePolicy: bundle.effectivePolicy,
      runtime: {
        service: "sajtagent-sprites-runtime",
        mode: "openclaw-workspace",
      },
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
  {
    fetch: fetchImpl,
    now: () => now,
    createNonce: () => nonce,
    createActivationId: () => activationId,
    createIdempotencyKey: () => idempotencyKey,
  },
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

const activationProjection = await client.activate(DEFAULT_AGENT_PROFILE_V1, 1)
assert.equal(calls, 3)
assert.deepEqual(activationProjection, {
  schemaVersion: 1,
  activated: true,
  profileId: DEFAULT_AGENT_PROFILE_V1.profileId,
  revision: DEFAULT_AGENT_PROFILE_V1.revision,
  activatedAt: now.toISOString(),
  activationId,
  bundleSha256: "a".repeat(64),
  takesEffect: "next-run",
  capabilityCount: bundle.effectivePolicy.capabilities.length,
  findingCount: bundle.effectivePolicy.findings.length,
  runtime: {
    service: "sajtagent-sprites-runtime",
    mode: "openclaw-workspace",
  },
})
assert.equal(
  AgentProfileActivationProjectionV1Schema.safeParse(activationProjection).success,
  true,
)
assert.equal("effectivePolicy" in activationProjection, false)

const conflictClient = new SignedAgentProfileRuntimeClientV1(
  "https://runtime.example/",
  signingKey,
  {
    fetch: async () =>
      jsonResponse(
        {
          error: "active_profile_revision_conflict",
          message: "Active revision changed",
          activeRevision: 7,
        },
        409,
      ),
    now: () => now,
    createNonce: () => nonce,
    createActivationId: () => activationId,
    createIdempotencyKey: () => idempotencyKey,
  },
)
await assert.rejects(
  () => conflictClient.activate(DEFAULT_AGENT_PROFILE_V1, 1),
  (error: unknown) =>
    error instanceof AgentProfileActivationConflictV1 &&
    error.code === "active_profile_revision_conflict" &&
    error.activeRevision === 7,
)

const storedDraft = {
  ...DEFAULT_AGENT_PROFILE_V1,
  revision: 3,
  updatedAt: "2026-09-01T23:00:00.000Z",
}
assert.deepEqual(
  readStoredAgentProfileDraftV1(JSON.stringify(storedDraft)),
  storedDraft,
)
assert.equal(readStoredAgentProfileDraftV1("not-json"), null)
assert.deepEqual(
  prepareAgentProfileActivationDraftV1(
    { ...DEFAULT_AGENT_PROFILE_V1, revision: 99 },
    storedDraft,
    now,
  ),
  storedDraft,
)
const changedDraft = prepareAgentProfileActivationDraftV1(
  {
    ...storedDraft,
    operatingInstructions: `${storedDraft.operatingInstructions} Kontrollera aktivering.`,
  },
  storedDraft,
  now,
)
assert.equal(changedDraft.revision, 4)
assert.equal(changedDraft.updatedAt, now.toISOString())
const rebasedDraft = rebaseAgentProfileActivationDraftV1(
  changedDraft,
  7,
  now,
)
assert.equal(rebasedDraft.revision, 8)
assert.equal(rebasedDraft.updatedAt, now.toISOString())

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
const activationRoute = readFileSync(
  new URL("../app/api/siteagent/agent-profiles/activate/route.ts", import.meta.url),
  "utf8",
)
assert.match(component, /\/api\/siteagent\/agent-profiles\/compile/)
assert.match(component, /\/api\/siteagent\/agent-profiles\/activate/)
assert.match(component, /Aktivera i OpenClaw/)
assert.doesNotMatch(component, /SITEAGENT_RUNTIME|127\.0\.0\.1:4317|\/v1\/agent-profiles\/compile/)
assert.match(route, /isSameOriginMutation/)
assert.match(route, /resolveBuildPrincipalV1/)
assert.doesNotMatch(route, /NEXT_PUBLIC_.*RUNTIME/)
assert.match(activationRoute, /isSameOriginMutation/)
assert.match(activationRoute, /resolveBuildPrincipalV1/)
assert.match(activationRoute, /AgentProfileActivationConflictV1/)
assert.doesNotMatch(activationRoute, /NEXT_PUBLIC_.*RUNTIME/)

console.log("PASS Agent Studio runtime proxy: signed compile and activation joins")
