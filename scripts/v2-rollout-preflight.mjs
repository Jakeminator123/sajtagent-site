import { execFile } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "../lib/db/env.ts"
import { assertPreviewSiteOrigin, gatewayHost, supportedArtifactProtection } from "../lib/siteagent/server/next-preview-model.ts"
import { publicationDomain } from "../lib/siteagent/server/next-publication-model.ts"

// Deliberately fixed to Sajtagent. This is not a general account inspection tool.
export const TARGET = Object.freeze({
  team: "team_j7KE5zKTm5rdg7zfWzOZhJ89",
  site: "prj_hMs2VN2gnj9YU42ZDcEv9U8fOpKf",
  artifact: "prj_Fig75Ev2mLddBP1BKj8ebcYkw0zz",
  supabase: "ywoltuegeemqznbcgokg",
})

const PRIVATE_KEYS = [
  "SITEAGENT_RUNTIME_SIGNING_KEY", "SITEAGENT_NEXT_VERCEL_TOKEN",
  "SITEAGENT_NEXT_VERCEL_BYPASS",
]
const RUNTIME_ONLY = ["SPRITES_API_TOKEN", "SPRITES_TOKEN", "SPRITE_TOKEN", "SITEAGENT_SPRITES_TOKEN"]
const REQUIRED_KEYS = [
  "SITEAGENT_SITE_ORIGIN", "SITEAGENT_NEXT_PREVIEW_DOMAIN", "SITEAGENT_PUBLISHED_DOMAIN",
  "SITEAGENT_RUNTIME_URL", "SITEAGENT_NEXT_VERCEL_TEAM_ID", "SITEAGENT_NEXT_VERCEL_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ...PRIVATE_KEYS,
]

const present = value => typeof value === "string" && value.trim().length > 0
const check = (id, status, message) => ({ id, status, message })

/** No configured values or exception text may enter a report. */
export function inspectConfiguration(env) {
  const checks = []
  for (const key of REQUIRED_KEYS) {
    checks.push(check(key, present(env[key]) ? "pass" : "blocked", present(env[key]) ? "Configured; value omitted." : "Required setting is missing."))
  }
  const enabled = env.SITEAGENT_NEXT_ENABLED
  checks.push(check("feature_flag", enabled === undefined || enabled === "false" || enabled === "true" ? "pass" : "fail",
    enabled === "true" ? "V2 is enabled. This audit cannot authorize customer rollout." : "V2 can remain disabled during preparation."))

  let secretPlacement = !RUNTIME_ONLY.some(key => present(env[key]))
  const privateValues = [...PRIVATE_KEYS, ...RUNTIME_ONLY, ...DB_ENV_VARS, "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]
    .map(key => env[key]).filter(present).map(value => value.trim())
  const selectedDb = resolveConfiguredDbEnv(env)
  if (selectedDb) privateValues.push(selectedDb.connectionString)
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("NEXT_PUBLIC_") || !present(value)) continue
    const normalized = value.trim()
    if (/SPRITE|SIGNING|BYPASS|VERCEL_TOKEN|SERVICE_ROLE|SECRET|POSTGRES|DATABASE_URL/.test(key) || privateValues.includes(normalized) || normalized.startsWith("sb_secret_")) secretPlacement = false
  }
  checks.push(check("secret_placement", secretPlacement ? "pass" : "fail", secretPlacement
    ? "No recognized runtime token or public secret alias is present. Vercel secret types still require verification."
    : "Remove Sprite administration tokens from Site and secrets from NEXT_PUBLIC variables."))

  if (present(env.SITEAGENT_SITE_ORIGIN) && present(env.SITEAGENT_NEXT_PREVIEW_DOMAIN) && present(env.SITEAGENT_PUBLISHED_DOMAIN)) {
    try {
      assertPreviewSiteOrigin(env.SITEAGENT_SITE_ORIGIN, env.SITEAGENT_NEXT_PREVIEW_DOMAIN)
      gatewayHost("check", "check", env.SITEAGENT_NEXT_PREVIEW_DOMAIN)
      if (!publicationDomain(env)) throw new Error("invalid")
      checks.push(check("domain_separation", "pass", "Product, private preview and public publication zones satisfy the production validators; DNS is untested."))
    } catch {
      checks.push(check("domain_separation", "fail", "Use an exact HTTPS Site origin and separate, non-nested preview/publication domains without wildcard prefixes."))
    }
  }

  for (const [key, expected] of [["SITEAGENT_NEXT_VERCEL_TEAM_ID", TARGET.team], ["SITEAGENT_NEXT_VERCEL_PROJECT_ID", TARGET.artifact], ["VERCEL_PROJECT_ID", TARGET.site], ["VERCEL_ORG_ID", TARGET.team]]) {
    if (present(env[key])) checks.push(check(`${key}_scope`, env[key] === expected ? "pass" : "fail", "Must identify the approved Sajtagent resource; artifact and Site projects are distinct."))
  }
  if (present(env.NEXT_PUBLIC_SUPABASE_URL)) checks.push(check("supabase_scope", env.NEXT_PUBLIC_SUPABASE_URL === `https://${TARGET.supabase}.supabase.co` ? "pass" : "fail", "Auth must use the Sajtagent Supabase project."))
  if (present(env.SITEAGENT_RUNTIME_URL)) {
    let valid = false
    try {
      const url = new URL(env.SITEAGENT_RUNTIME_URL)
      valid = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
    } catch { /* Report a fixed diagnostic, never the URL parser error. */ }
    checks.push(check("runtime_url", valid ? "pass" : "fail", "Runtime must have an HTTPS URL without embedded credentials, query or fragment."))
  }
  if (present(env.SITEAGENT_RUNTIME_SIGNING_KEY)) checks.push(check("runtime_signing_key", env.SITEAGENT_RUNTIME_SIGNING_KEY.length >= 32 ? "pass" : "fail", "Runtime signing key must contain at least 32 characters."))
  const db = resolveConfiguredDbEnv(env)
  checks.push(check("database_scope", !db ? "blocked" : databaseIsSajtagent(db.connectionString) ? "pass" : "fail", !db
    ? "No usable database setting in the application's normal precedence order."
    : "Selected app database must identify Sajtagent; no connection string is displayed."))
  return checks
}

export function databaseIsSajtagent(connectionString) {
  try {
    const url = new URL(connectionString)
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password || url.pathname !== "/postgres" || url.hash) return false
    // pg connection-string query parameters can override host/user. Reject them
    // before opening a connection; checking the URL's hostname alone is unsafe.
    if ([...url.searchParams.keys()].some(key => !["sslmode", "supa", "pgbouncer"].includes(key))) return false
    if (url.hostname === `db.${TARGET.supabase}.supabase.co`) return true
    return /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && decodeURIComponent(url.username).endsWith(`.${TARGET.supabase}`)
  } catch { return false }
}

export function inspectArtifactProject(project) {
  if (!project || project.id !== TARGET.artifact || project.accountId !== TARGET.team || project.name !== "sajtagent-next-artifacts") {
    return check("artifact_protection", "fail", "Vercel response does not identify the approved artifact project and team.")
  }
  const coversPreview = supportedArtifactProtection(project.ssoProtection?.deploymentType)
  return check("artifact_protection", coversPreview ? "pass" : "blocked", coversPreview
    ? "Project settings cover preview deployments. Actual anonymous denial and authenticated byte verification remain untested."
    : "Artifact protection covering all preview deployments is absent or unrecognized. Confirm the project settings before building.")
}

const ARTIFACT_TOOLBAR_KEY = "VERCEL_PREVIEW_FEEDBACK_ENABLED"
const ARTIFACT_TOOLBAR_TARGETS = ["production", "preview", "development"]

/** Values are inspected locally and never copied into the report. */
export function inspectArtifactPreviewFeedback(envs) {
  const records = (Array.isArray(envs) ? envs : []).filter(item => item && item.key === ARTIFACT_TOOLBAR_KEY)
  if (records.length === 0) {
    return check("artifact_preview_feedback", "fail", "Required artifact Toolbar setting is missing for all targets.")
  }
  if (records.length !== 1) {
    return check("artifact_preview_feedback", "fail", "Required artifact Toolbar setting is split across several records.")
  }
  const record = records[0]
  const targets = Array.isArray(record.target) ? record.target : []
  const branchScoped = typeof record.gitBranch === "string" && record.gitBranch.trim().length > 0
  if (branchScoped || !ARTIFACT_TOOLBAR_TARGETS.every(name => targets.includes(name))) {
    return check("artifact_preview_feedback", "fail", "Required artifact Toolbar setting does not cover all targets.")
  }
  if (record.value !== "0") {
    return check("artifact_preview_feedback", "fail", "Required artifact Toolbar setting is not disabled.")
  }
  return check("artifact_preview_feedback", "pass", "Artifact Toolbar injection is disabled for all targets. Live byte verification remains untested.")
}

export async function checkArtifactProtection(env, fetchImpl = fetch) {
  if (env.SITEAGENT_NEXT_VERCEL_TEAM_ID !== TARGET.team || env.SITEAGENT_NEXT_VERCEL_PROJECT_ID !== TARGET.artifact || !present(env.SITEAGENT_NEXT_VERCEL_TOKEN)) {
    return check("artifact_protection", "blocked", "Configure the exact artifact project/team and its server token before the read-only check.")
  }
  try {
    const response = await fetchImpl(`https://api.vercel.com/v9/projects/${TARGET.artifact}?teamId=${TARGET.team}`, {
      method: "GET", headers: { Authorization: `Bearer ${env.SITEAGENT_NEXT_VERCEL_TOKEN}` },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return check("artifact_protection", "blocked", "Vercel project inspection failed; verify token permissions and team access. Response body omitted.")
    return inspectArtifactProject(await response.json())
  } catch {
    return check("artifact_protection", "blocked", "Vercel project inspection failed or timed out. Error details omitted.")
  }
}

export async function checkArtifactPreviewFeedback(env, fetchImpl = fetch) {
  if (env.SITEAGENT_NEXT_VERCEL_TEAM_ID !== TARGET.team || env.SITEAGENT_NEXT_VERCEL_PROJECT_ID !== TARGET.artifact || !present(env.SITEAGENT_NEXT_VERCEL_TOKEN)) {
    return check("artifact_preview_feedback", "blocked", "Configure the exact artifact project/team and its server token before the read-only check.")
  }
  try {
    const response = await fetchImpl(`https://api.vercel.com/v9/projects/${TARGET.artifact}/env?teamId=${TARGET.team}`, {
      method: "GET", headers: { Authorization: `Bearer ${env.SITEAGENT_NEXT_VERCEL_TOKEN}` },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return check("artifact_preview_feedback", "blocked", "Vercel environment inspection failed; verify token permissions and team access. Response body omitted.")
    const payload = await response.json()
    const envs = Array.isArray(payload) ? payload : Array.isArray(payload?.envs) ? payload.envs : []
    return inspectArtifactPreviewFeedback(envs)
  } catch {
    return check("artifact_preview_feedback", "blocked", "Vercel environment inspection failed or timed out. Error details omitted.")
  }
}

export function inspectDatabaseResult(value) {
  if (!value || value.schema_ready !== true || value.app_dml !== true || value.session_read !== true || value.browser_closed !== true) {
    return check("application_database", "blocked", "App pool did not verify all V2 tables, server DML, session-column access and closed browser privileges. Review the migration and role grants.")
  }
  return check("application_database", "pass", "This process's actual application Pool verified schema and permissions with read-only SQL. This is not proof of deployed environment parity or account isolation.")
}

export async function checkApplicationDatabase(env) {
  const db = resolveConfiguredDbEnv(env)
  if (!db || !databaseIsSajtagent(db.connectionString)) return check("application_database", "blocked", "The selected application database must be the approved Sajtagent project before connecting.")
  try {
    // The app logs pg error details. Capture both child streams, output only the
    // fixed boolean schema, and kill the child on deadline (not just stop waiting).
    const result = await promisify(execFile)(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", fileURLToPath(new URL("./v2-rollout-db.mjs", import.meta.url))], {
      env, timeout: 15000, killSignal: "SIGKILL", maxBuffer: 16384, windowsHide: true,
    })
    return inspectDatabaseResult(JSON.parse(result.stdout))
  } catch {
    return check("application_database", "blocked", "Application Pool inspection failed or timed out. No database error or connection details are displayed.")
  }
}

export async function runPreflight(env, options = {}) {
  const checks = inspectConfiguration(env)
  // Fail before forwarding any credential if known unsafe config is present.
  const safe = !checks.some(item => item.status === "fail")
  checks.push(options.liveVercel && safe ? await checkArtifactProtection(env, options.fetchImpl) : check("artifact_protection", "pending", "Read-only Vercel settings check not run; use --live-vercel with safe configuration."))
  checks.push(options.liveVercel && safe ? await checkArtifactPreviewFeedback(env, options.fetchImpl) : check("artifact_preview_feedback", "pending", "Read-only Vercel Toolbar setting check not run; use --live-vercel with safe configuration."))
  checks.push(options.liveDb && safe ? await checkApplicationDatabase(env) : check("application_database", "pending", "Application Pool check not run; use --live-db with the actual deployment environment."))
  const failures = checks.some(item => item.status === "fail")
  const blocked = checks.some(item => item.status === "blocked")
  return {
    schemaVersion: 1,
    scope: "sajtagent-no-dns-preflight",
    status: failures ? "unsafe_configuration" : blocked ? "prerequisites_missing" : "requested_checks_passed",
    exitCode: failures ? 1 : blocked ? 2 : 0,
    liveE2eVerified: false,
    checks,
    remaining: ["Wildcard DNS, HTTPS and gateway routing", "Actual worker Next build, timeout, cancellation and restart", "Two-account browser preview isolation", "Original artifact URL denial and exact-byte verification", "Publishing the accepted revision"],
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.some(arg => !["--live-db", "--live-vercel"].includes(arg))) {
    process.stdout.write(JSON.stringify({ status: "invalid_arguments", message: "Usage: npm run preflight:v2 -- [--live-db] [--live-vercel]. Load credentials through environment only." }) + "\n")
    process.exitCode = 1
  } else {
    try {
      const report = await runPreflight(process.env, { liveDb: args.includes("--live-db"), liveVercel: args.includes("--live-vercel") })
      process.stdout.write(JSON.stringify(report, null, 2) + "\n")
      process.exitCode = report.exitCode
    } catch {
      process.stdout.write(JSON.stringify({ status: "preflight_failed", liveE2eVerified: false, message: "Preflight failed; private details omitted." }) + "\n")
      process.exitCode = 1
    }
  }
}
