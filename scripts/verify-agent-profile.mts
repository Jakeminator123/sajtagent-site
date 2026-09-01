import { strict as assert } from "node:assert"

import {
  AgentProfileV1Schema,
  DEFAULT_AGENT_PROFILE_V1,
  DEFAULT_LOCAL_AGENT_CEILING_V1,
  compilePortableOpenClawBundleV1,
} from "../contracts/agent-profile-v1.ts"

const profile = AgentProfileV1Schema.parse(DEFAULT_AGENT_PROFILE_V1)
const bundle = compilePortableOpenClawBundleV1(
  profile,
  DEFAULT_LOCAL_AGENT_CEILING_V1,
)

assert.match(bundle.files["SOUL.md"], /Sajtagenten/)
assert.match(bundle.files["AGENTS.md"], /Behörigheter kommer från den effektiva hostpolicyn/)
assert.match(bundle.files["profiles/openclaw.yml"], /workspaceOnly: true/)
assert.equal(bundle.effectivePolicy.commandMode, "auto")
assert.equal(bundle.effectivePolicy.memory.rememberAcrossConversations, false)
assert.equal("credentials" in bundle, false)

const blockedMcpProfile = {
  ...profile,
  requestedPolicy: {
    ...profile.requestedPolicy,
    mcpToolGrants: ["github__list_issues"],
  },
}
const blockedMcpBundle = compilePortableOpenClawBundleV1(
  blockedMcpProfile,
  DEFAULT_LOCAL_AGENT_CEILING_V1,
)
assert.deepEqual(blockedMcpBundle.effectivePolicy.mcpToolGrants, [])
assert.deepEqual(blockedMcpBundle.effectivePolicy.blockedMcpTools, ["github__list_issues"])

const invalidPackages = AgentProfileV1Schema.safeParse({
  ...profile,
  requestedPolicy: {
    ...profile.requestedPolicy,
    capabilities: [...profile.requestedPolicy.capabilities, "packages.install"],
    packages: { mode: "deny" },
  },
})
assert.equal(invalidPackages.success, false)

const invalidMcpName = AgentProfileV1Schema.safeParse({
  ...profile,
  requestedPolicy: {
    ...profile.requestedPolicy,
    mcpToolGrants: ["whole-server-wildcard"],
  },
})
assert.equal(invalidMcpName.success, false)

console.log("PASS AgentProfileV1: 10 assertions")
