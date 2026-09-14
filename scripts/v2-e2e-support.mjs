import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

export const fixtureRoot = fileURLToPath(new URL("../tests/v2-e2e-fixture/", import.meta.url))

export class SmokeFailure extends Error {
  constructor(code) { super(code); this.name = "SmokeFailure" }
}

export function requireThat(condition, code) {
  if (!condition) throw new SmokeFailure(code)
}

export function requireDenied(status, code) {
  // Redirects, 5xx, transport failures and successful login pages are NOT denial proof.
  requireThat([401, 403, 404].includes(status), code)
}

export function requireCancelled(result, state, jobId) {
  requireThat(result?.cancelled === true, "cancel_was_not_confirmed")
  requireThat(state?.current?.jobId === jobId && state.current.status === "failed" &&
    state.current.failureCode === "cancelled", "cancelled_job_not_exact_terminal_state")
}

export function publicationSettings(domain, siteOrigin, gatewayDomain) {
  requireThat(typeof domain === "string" && /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain) &&
    !domain.endsWith(".vercel.app"), "missing_or_invalid_environment:V2_E2E_PUBLISHED_DOMAIN")
  requireThat(domain !== gatewayDomain && !domain.endsWith(`.${gatewayDomain}`) && !gatewayDomain.endsWith(`.${domain}`),
    "publication_and_preview_domains_must_be_separate")
  const siteHost = new URL(siteOrigin).hostname
  requireThat(siteHost !== domain && !siteHost.endsWith(`.${domain}`), "publication_must_not_include_site_origin")
  return domain
}

export function expectedPublicationUrl(project, domain) {
  requireThat(typeof project?.owner?.tenantId === "string" && typeof project.projectId === "string",
    "publication_project_binding_missing")
  const hash = createHash("sha256").update(JSON.stringify([project.owner.tenantId, project.projectId])).digest("hex").slice(0, 32)
  return `https://${hash}.${domain}/`
}

export function publishIntent(state) {
  const accepted = state?.accepted
  requireThat(typeof accepted?.sourceRevisionId === "string" && typeof accepted.jobId === "string",
    "publication_accepted_binding_missing")
  return { sourceRevisionId: accepted.sourceRevisionId, jobId: accepted.jobId }
}

export function requirePublishedBinding(published, state, expectedUrl) {
  const intent = publishIntent(state)
  requireThat(published && published.sourceRevisionId === intent.sourceRevisionId && published.jobId === intent.jobId,
    "publication_does_not_match_accepted_revision")
  requireThat(published.url === expectedUrl, "publication_url_out_of_scope")
  requireThat(typeof published.publishedAt === "string" && Number.isFinite(Date.parse(published.publishedAt)),
    "publication_timestamp_missing")
  return JSON.stringify([published.sourceRevisionId, published.jobId, published.publishedAt, published.url])
}

export function requirePublicLocation(actualUrl, expectedUrl, previewRef) {
  let url
  try { url = new URL(actualUrl) } catch { throw new SmokeFailure("invalid_publication_location") }
  const path = `/api/siteagent/next-previews/${encodeURIComponent(previewRef)}/content/`
  requireThat(url.origin === new URL(expectedUrl).origin && url.pathname === path && !url.search && !url.hash,
    "publication_redirect_changed_origin_or_revision")
}

export function safeOrigin(value) {
  let url
  try { url = new URL(value) } catch { throw new SmokeFailure("invalid_origin") }
  requireThat(!url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
    "origin_must_not_contain_credentials_or_path")
  requireThat(url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
    "origin_requires_https_or_loopback")
  return url.origin
}

export async function fixtureFiles(revision = "ONE", includeLocalBuildFiles = false) {
  requireThat(["ONE", "TWO", "BROKEN"].includes(revision), "invalid_fixture_revision")
  // C owns configuration/toolchain and rejects client lockfiles + next.config.*.
  // The local fixture retains both so its independent Next build is reproducible.
  const names = ["package.json", "app/layout.jsx", "app/page.jsx"]
  if (includeLocalBuildFiles) names.push("package-lock.json", "next.config.mjs")
  const files = []
  for (const path of names) {
    let content = await readFile(join(fixtureRoot, path), "utf8")
    if (path === "app/page.jsx") {
      content = content.replace("revision ONE", `revision ${revision}`)
      if (revision === "BROKEN") content += "\nthis is intentionally invalid JavaScript {{{\n"
    }
    files.push({ path, content })
  }
  return files
}

export function sourceDigest(files) {
  const normalized = [...files].sort((a, b) => a.path.localeCompare(b.path))
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

export async function inspectBuiltFixture() {
  const manifest = JSON.parse(await readFile(join(fixtureRoot, "package.json"), "utf8"))
  requireThat(manifest.dependencies.next === "16.3.3", "fixture_next_version_mismatch")
  const id = (await readFile(join(fixtureRoot, ".next/BUILD_ID"), "utf8")).trim()
  requireThat(Boolean(id), "fixture_missing_real_next_build_id")
  const html = await readFile(join(fixtureRoot, "out/index.html"), "utf8")
  requireThat(html.includes("Sajtagent V2 revision ONE"), "fixture_html_marker_missing")
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])
  const nextScripts = scripts.filter((path) => path.startsWith("/_next/") && path.endsWith(".js"))
  requireThat(nextScripts.length > 0, "fixture_missing_next_javascript")
  for (const path of nextScripts) {
    const bytes = await readFile(join(fixtureRoot, "out", path.slice(1)))
    requireThat(bytes.byteLength > 0, "fixture_empty_next_javascript")
  }
  return { framework: `Next.js ${manifest.dependencies.next}`, nextJavaScriptAssets: nextScripts.length }
}

export async function listExportFiles(directory = join(fixtureRoot, "out")) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listExportFiles(path))
    else files.push(relative(join(fixtureRoot, "out"), path).replaceAll("\\", "/"))
  }
  return files
}

export async function loadPlaywright() {
  // Isolated pinned tool dependency; do not change the product dependency graph.
  const playwright = await import("../tests/v2-e2e-tools/node_modules/playwright/index.mjs")
  return playwright.chromium
}

export function requiredEnvironment(env = process.env) {
  const names = ["V2_E2E_SITE_ORIGIN", "V2_E2E_OWNER_EMAIL", "V2_E2E_OWNER_PASSWORD",
    "V2_E2E_OTHER_EMAIL", "V2_E2E_OTHER_PASSWORD"]
  const missing = names.filter((name) => !env[name])
  requireThat(missing.length === 0, `missing_environment:${missing.join(",")}`)
  requireThat(env.V2_E2E_OWNER_EMAIL.toLowerCase() !== env.V2_E2E_OTHER_EMAIL.toLowerCase(),
    "two_distinct_accounts_required")
  return { origin: safeOrigin(env.V2_E2E_SITE_ORIGIN),
    owner: { email: env.V2_E2E_OWNER_EMAIL, password: env.V2_E2E_OWNER_PASSWORD },
    other: { email: env.V2_E2E_OTHER_EMAIL, password: env.V2_E2E_OTHER_PASSWORD } }
}
