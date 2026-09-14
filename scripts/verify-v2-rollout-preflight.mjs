import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  TARGET, inspectConfiguration, databaseIsSajtagent, inspectArtifactProject,
  inspectDatabaseResult, checkArtifactProtection, runPreflight,
} from "./v2-rollout-preflight.mjs"

const env = {
  SITEAGENT_NEXT_ENABLED: "false",
  SITEAGENT_SITE_ORIGIN: "https://sajtagent-site.vercel.app",
  SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.sajtagent.se",
  SITEAGENT_PUBLISHED_DOMAIN: "sites.sajtagent.se",
  SITEAGENT_RUNTIME_URL: "https://sajtagent.example.test",
  SITEAGENT_RUNTIME_SIGNING_KEY: "test-signing-key-only-000000000000000000",
  SITEAGENT_NEXT_VERCEL_TOKEN: "test-vercel-token-not-a-real-secret",
  SITEAGENT_NEXT_VERCEL_BYPASS: "test-vercel-bypass-not-a-real-secret",
  SITEAGENT_NEXT_VERCEL_TEAM_ID: TARGET.team,
  SITEAGENT_NEXT_VERCEL_PROJECT_ID: TARGET.artifact,
  NEXT_PUBLIC_SUPABASE_URL: `https://${TARGET.supabase}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
  POSTGRES_URL: `postgres://app.${TARGET.supabase}:test-db-password-only@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require`,
}
let passed = 0
function expectCheck(overrides, id, status) {
  assert.equal(inspectConfiguration({ ...env, ...overrides }).find(item => item.id === id)?.status, status)
  passed++
}

const clean = await runPreflight(env)
assert.equal(clean.exitCode, 0)
assert.equal(clean.liveE2eVerified, false)
assert.equal(clean.checks.find(item => item.id === "application_database").status, "pending")
assert.ok(clean.remaining.includes("Two-account browser preview isolation"))
assert.equal(env.SITEAGENT_NEXT_ENABLED, "false")
passed++
expectCheck({ SITEAGENT_NEXT_ENABLED: "true" }, "feature_flag", "pass")
expectCheck({ SITEAGENT_NEXT_ENABLED: "yes" }, "feature_flag", "fail")
expectCheck({ SITEAGENT_NEXT_VERCEL_TOKEN: "" }, "SITEAGENT_NEXT_VERCEL_TOKEN", "blocked")
expectCheck({ SITEAGENT_NEXT_VERCEL_TEAM_ID: "another-team" }, "SITEAGENT_NEXT_VERCEL_TEAM_ID_scope", "fail")
expectCheck({ SITEAGENT_NEXT_VERCEL_PROJECT_ID: TARGET.site }, "SITEAGENT_NEXT_VERCEL_PROJECT_ID_scope", "fail")
expectCheck({ VERCEL_PROJECT_ID: "sajtmaskin-out-of-scope" }, "VERCEL_PROJECT_ID_scope", "fail")
expectCheck({ NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co" }, "supabase_scope", "fail")
expectCheck({ SITEAGENT_RUNTIME_URL: "http://example.test" }, "runtime_url", "fail")
expectCheck({ SITEAGENT_RUNTIME_URL: "https://secret@example.test" }, "runtime_url", "fail")
expectCheck({ SITEAGENT_RUNTIME_SIGNING_KEY: "short" }, "runtime_signing_key", "fail")
for (const overrides of [
  { SITEAGENT_NEXT_PREVIEW_DOMAIN: "*.preview.sajtagent.se" },
  { SITEAGENT_NEXT_PREVIEW_DOMAIN: "preview.vercel.app" },
  { SITEAGENT_PUBLISHED_DOMAIN: "preview.sajtagent.se" },
  { SITEAGENT_PUBLISHED_DOMAIN: "sub.preview.sajtagent.se" },
  { SITEAGENT_PUBLISHED_DOMAIN: "sajtagent.se" },
  { SITEAGENT_SITE_ORIGIN: "https://preview.sajtagent.se" },
  { SITEAGENT_SITE_ORIGIN: "https://sites.sajtagent.se" },
  { SITEAGENT_SITE_ORIGIN: "https://customer.preview.sajtagent.se" },
  { SITEAGENT_SITE_ORIGIN: "https://sajtagent-site.vercel.app/path" },
]) expectCheck(overrides, "domain_separation", "fail")
for (const overrides of [
  { SPRITES_API_TOKEN: "private-sprite-token" },
  { SPRITE_TOKEN: "private-sprite-token" },
  { SITEAGENT_SPRITES_TOKEN: "private-sprite-token" },
  { NEXT_PUBLIC_SPRITE_TOKEN: "public-secret" },
  { NEXT_PUBLIC_SITEAGENT_RUNTIME_SIGNING_KEY: "public-secret" },
  { NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "public-secret" },
  { NEXT_PUBLIC_INNOCENT_ALIAS: env.SITEAGENT_NEXT_VERCEL_BYPASS },
  { NEXT_PUBLIC_INNOCENT_ALIAS: env.POSTGRES_URL },
  { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test-only" },
  { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "  sb_secret_test-only  " },
  { NEXT_PUBLIC_INNOCENT_ALIAS: `  ${env.POSTGRES_URL}  ` },
  { SUPABASE_SERVICE_ROLE_KEY: "  private-service-role  ", NEXT_PUBLIC_INNOCENT_ALIAS: "private-service-role" },
  { SUPABASE_SERVICE_ROLE_KEY: "private-service-role", NEXT_PUBLIC_INNOCENT_ALIAS: "private-service-role" },
]) expectCheck(overrides, "secret_placement", "fail")

assert.equal(databaseIsSajtagent(`postgres://app:pw@db.${TARGET.supabase}.supabase.co:5432/postgres`), true)
assert.equal(databaseIsSajtagent(env.POSTGRES_URL), true)
for (const url of [
  "postgres://app:pw@localhost:5432/postgres",
  "postgres://app.otherproject:pw@aws-1-eu-north-1.pooler.supabase.com:6543/postgres",
  `postgres://app.${TARGET.supabase}:pw@aws-1-eu-north-1.pooler.supabase.com.attacker.test:6543/postgres`,
  `${env.POSTGRES_URL}&host=another-project.supabase.co`,
  `${env.POSTGRES_URL}&user=app.otherproject`,
  `${env.POSTGRES_URL}&options=-c%20role%3Dpostgres`,
]) { assert.equal(databaseIsSajtagent(url), false); passed++ }
expectCheck({ POSTGRES_URL: "postgres://bad:pw@other.test/postgres", DATABASE_URL: env.POSTGRES_URL }, "database_scope", "fail")
expectCheck({ POSTGRES_URL: "${POSTGRES_URL}", DATABASE_URL: env.POSTGRES_URL }, "database_scope", "pass")
expectCheck({ POSTGRES_URL: ` '${env.POSTGRES_URL}' ` }, "database_scope", "pass")

const project = { id: TARGET.artifact, accountId: TARGET.team, name: "sajtagent-next-artifacts", ssoProtection: { deploymentType: "all" } }
assert.equal(inspectArtifactProject(project).status, "pass")
assert.equal(inspectArtifactProject({ ...project, ssoProtection: null }).status, "blocked")
assert.equal(inspectArtifactProject({ ...project, ssoProtection: { deploymentType: "production" } }).status, "blocked")
assert.equal(inspectArtifactProject({ ...project, ssoProtection: { deploymentType: "preview" } }).status, "pass")
assert.equal(inspectArtifactProject({ ...project, ssoProtection: { deploymentType: "all_except_custom_domains" } }).status, "pass")
assert.equal(inspectArtifactProject({ ...project, ssoProtection: { deploymentType: "prod_deployment_urls_and_all_previews" } }).status, "blocked")
assert.equal(inspectArtifactProject({ ...project, ssoProtection: null, passwordProtection: { deploymentType: "all" } }).status, "blocked")
assert.equal(inspectArtifactProject({ ...project, accountId: "wrong-team" }).status, "fail")
assert.equal(inspectArtifactProject({ ...project, id: TARGET.site }).status, "fail")
assert.equal(inspectArtifactProject({ ...project, accountId: undefined }).status, "fail")
passed += 10

let calls = 0
const fetchImpl = async (url, init) => {
  calls++
  assert.equal(url, `https://api.vercel.com/v9/projects/${TARGET.artifact}?teamId=${TARGET.team}`)
  assert.equal(init.method, "GET")
  assert.equal(init.redirect, "error")
  assert.equal(init.headers.Authorization, `Bearer ${env.SITEAGENT_NEXT_VERCEL_TOKEN}`)
  assert.ok(init.signal instanceof AbortSignal)
  return Response.json(project)
}
assert.equal((await checkArtifactProtection(env, fetchImpl)).status, "pass")
assert.equal(calls, 1)
await checkArtifactProtection({ ...env, SITEAGENT_NEXT_VERCEL_PROJECT_ID: "another-project" }, fetchImpl)
assert.equal(calls, 1, "wrong project must never receive credentials")
await runPreflight({ ...env, SPRITES_TOKEN: "unsafe" }, { liveVercel: true, fetchImpl })
assert.equal(calls, 1, "unsafe configuration suppresses all live checks")
const failedApi = await checkArtifactProtection(env, async () => { throw new Error(env.SITEAGENT_NEXT_VERCEL_TOKEN) })
assert.equal(failedApi.status, "blocked")
assert.equal(JSON.stringify(failedApi).includes(env.SITEAGENT_NEXT_VERCEL_TOKEN), false)
const deniedApi = await checkArtifactProtection(env, async () => new Response(env.SITEAGENT_NEXT_VERCEL_TOKEN, { status: 403 }))
assert.equal(JSON.stringify(deniedApi).includes(env.SITEAGENT_NEXT_VERCEL_TOKEN), false)
passed += 5

const dbGood = { schema_ready: true, app_dml: true, session_read: true, browser_closed: true }
assert.equal(inspectDatabaseResult(dbGood).status, "pass")
for (const key of Object.keys(dbGood)) {
  assert.equal(inspectDatabaseResult({ ...dbGood, [key]: false }).status, "blocked")
  assert.equal(inspectDatabaseResult({ ...dbGood, [key]: "true" }).status, "blocked")
  passed++
}

// Exercise the executable entrypoint, env precedence, exit semantics and both
// output streams. This never contacts DNS, Vercel, Supabase or a worker.
const cli = fileURLToPath(new URL("./v2-rollout-preflight.mjs", import.meta.url))
function runCli(values, args = []) {
  return spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", cli, ...args], {
    env: { ...values }, encoding: "utf8", timeout: 10000, windowsHide: true,
  })
}
for (const [values, expected] of [[env, 0], [{}, 2], [{ ...env, SITEAGENT_SITE_ORIGIN: env.SITEAGENT_NEXT_VERCEL_TOKEN }, 1]]) {
  const result = runCli(values)
  assert.equal(result.status, expected, result.stderr)
  assert.equal(JSON.parse(result.stdout).liveE2eVerified, false)
  for (const secret of [env.POSTGRES_URL, env.SITEAGENT_NEXT_VERCEL_TOKEN, env.SITEAGENT_NEXT_VERCEL_BYPASS, env.SITEAGENT_RUNTIME_SIGNING_KEY]) {
    assert.equal((result.stdout + result.stderr).includes(secret), false)
  }
  passed++
}
const invalid = runCli(env, [`--token=${env.SITEAGENT_NEXT_VERCEL_TOKEN}`])
assert.equal(invalid.status, 1)
assert.equal(invalid.stdout.includes(env.SITEAGENT_NEXT_VERCEL_TOKEN), false)
passed++
for (const [mode, expected] of [["pass", 0], ["denied", 2], ["error", 2]]) {
  const result = runCli({
    ...env,
    NODE_OPTIONS: `--import=${new URL("./fixtures/v2-preflight-pg-hook.mjs", import.meta.url).href}`,
    TEST_PREFLIGHT_DB_MODE: mode,
  }, ["--live-db"])
  assert.equal(result.status, expected, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.checks.find(item => item.id === "application_database").status, mode === "pass" ? "pass" : "blocked")
  for (const secret of [env.POSTGRES_URL, env.SITEAGENT_NEXT_VERCEL_TOKEN]) assert.equal((result.stdout + result.stderr).includes(secret), false)
  passed++
}
console.log(`V2 rollout preflight: ${passed} checks passed (offline/mocked; no live E2E claimed).`)
