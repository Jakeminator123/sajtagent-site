import { fixtureFiles, inspectBuiltFixture, loadPlaywright, requireCancelled, requireDenied, requiredEnvironment,
  requireThat, SmokeFailure, sourceDigest, publicationSettings, expectedPublicationUrl, publishIntent,
  requirePublishedBinding, requirePublicLocation } from "./v2-e2e-support.mjs"

// Intentionally no traces, screenshots, response bodies, cookies, grants or raw exceptions.
// Run against dedicated Sajtagent test accounts: this creates retained real projects.
const evidence = []
function record(name, status, detail) {
  evidence.push({ name, status, ...(detail ? { detail } : {}) })
  console.log(JSON.stringify(evidence.at(-1)))
}

async function stage(name, fn) {
  try { const result = await fn(); record(name, "passed"); return result }
  catch (error) {
    record(name, "failed", error instanceof SmokeFailure ? error.message : "redacted_execution_error")
    throw error
  }
}

function acceptedIdentity(state) {
  const value = state?.accepted
  requireThat(value && value.jobId && value.sourceRevisionId && value.previewRef && value.deploymentId,
    "accepted_state_missing_exact_bindings")
  return JSON.stringify([value.jobId, value.sourceRevisionId, value.previewRef, value.deploymentId])
}

async function signIn(context, origin, credentials) {
  const page = await context.newPage()
  // Wait for hydration: the form is React-controlled, so input typed before hydration is discarded
  // and the submit button stays disabled.
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" })
  const submit = page.getByRole("button", { name: "Logga in", exact: true })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.locator("#email").fill("")
    await page.locator("#email").pressSequentially(credentials.email, { delay: 10 })
    await page.locator("#password").fill("")
    await page.locator("#password").pressSequentially(credentials.password, { delay: 10 })
    if (await submit.isEnabled()) break
    await page.waitForTimeout(1_000)
  }
  await submit.click()
  await page.waitForURL((url) => url.origin === origin && url.pathname === "/builder", { timeout: 60_000 })
  await page.close()
}

async function runLive() {
  const config = requiredEnvironment()
  const gateway = process.env.V2_E2E_GATEWAY_DOMAIN
  requireThat(gateway && /^[a-z0-9.-]+$/i.test(gateway) && !gateway.startsWith("."),
    "missing_or_invalid_environment:V2_E2E_GATEWAY_DOMAIN")
  const publishedDomain = publicationSettings(process.env.V2_E2E_PUBLISHED_DOMAIN, config.origin, gateway)
  const timeout = Number(process.env.V2_E2E_BUILD_WAIT_MS ?? 900_000)
  requireThat(Number.isSafeInteger(timeout) && timeout >= 10_000 && timeout <= 1_800_000,
    "invalid_build_wait_ceiling")
  const chromium = await loadPlaywright()
  const browser = await chromium.launch({ headless: true, channel: "chrome" })
  try {
    const owner = await browser.newContext()
    const other = await browser.newContext()
    const anonymous = await browser.newContext()
    for (const context of [owner, other, anonymous]) context.setDefaultTimeout(30_000)

    const api = async (context, path, method = "GET", body, requestTimeout = timeout) => {
      requireThat(path.startsWith("/api/siteagent/"), "api_path_out_of_scope")
      return context.request.fetch(`${config.origin}${path}`, {
        method, ...(body !== undefined ? { data: body } : {}),
        headers: { origin: config.origin }, maxRedirects: 0, timeout: requestTimeout,
      })
    }
    const json = async (response, statuses = [200]) => {
      requireThat(statuses.includes(response.status()), "unexpected_api_status")
      return response.json()
    }
    const projectsPath = "/api/siteagent/projects"
    await stage("unauthenticated_project_api_denied", async () => {
      requireDenied((await api(anonymous, projectsPath)).status(), "anonymous_projects_not_denied")
    })
    await stage("two_real_account_logins", async () => {
      await signIn(owner, config.origin, config.owner)
      await signIn(other, config.origin, config.other)
    })
    const create = async (context, name) => (await json(await api(context, projectsPath, "POST",
      { schemaVersion: 2, name }), [201])).project
    const [project, second, otherProject] = await stage("create_and_preserve_two_owner_projects", async () => {
      const stamp = Date.now()
      const a = await create(owner, `V2 smoke first ${stamp}`)
      const b = await create(owner, `V2 smoke second ${stamp}`)
      const c = await create(other, `V2 smoke other ${stamp}`)
      requireThat(a.projectId !== b.projectId && a.owner.principalId === b.owner.principalId &&
        a.owner.principalId !== c.owner.principalId, "project_ownership_or_identity_mismatch")
      const list = (await json(await api(owner, projectsPath))).projects
      requireThat(list.some((item) => item.projectId === a.projectId) &&
        list.some((item) => item.projectId === b.projectId) &&
        !list.some((item) => item.projectId === c.projectId), "owner_list_isolation_failed")
      return [a, b, c]
    })
    const path = `${projectsPath}/${encodeURIComponent(project.projectId)}`
    const nextPath = `${path}/next`
    const readState = async () => (await json(await api(owner, nextPath))).state
    await stage("cross_account_project_and_file_apis_denied", async () => {
      for (const context of [other, anonymous]) {
        for (const route of [path, `${path}/state`, nextPath, `${nextPath}/source`]) {
          requireDenied((await api(context, route)).status(), "cross_account_api_not_denied")
        }
        requireDenied((await api(context, `${nextPath}/access`, "POST")).status(),
          "cross_account_preview_grant_not_denied")
      }
      requireDenied((await api(owner, `${projectsPath}/${encodeURIComponent(otherProject.projectId)}`)).status(),
        "reverse_cross_account_not_denied")
    })
    const build = async (files) => api(owner, nextPath, "POST", { files })
    const first = await stage("real_next_build_accepted", async () => {
      await json(await build(await fixtureFiles("ONE")), [200, 201])
      const state = await readState()
      acceptedIdentity(state)
      requireThat(state.current?.jobId === state.accepted.jobId && state.current?.status === "accepted",
        "accepted_job_not_current")
      return state
    })
    await stage("accepted_source_positive_and_cross_account_denial", async () => {
      const source = await json(await api(owner, `${nextPath}/source`))
      requireThat(source.sourceRevisionId === first.accepted.sourceRevisionId &&
        sourceDigest(source.files) === sourceDigest(await fixtureFiles("ONE")), "initial_accepted_source_mismatch")
      // Owner-positive precondition prevents a 404-for-everyone implementation from passing.
      for (const route of [path, `${path}/state`, nextPath]) await json(await api(owner, route))
      await json(await api(owner, `${nextPath}/access`, "POST"))
      for (const context of [other, anonymous]) {
        for (const route of [path, `${path}/state`, nextPath, `${nextPath}/source`]) {
          requireDenied((await api(context, route)).status(), "accepted_cross_account_api_not_denied")
        }
        requireDenied((await api(context, `${nextPath}/access`, "POST")).status(),
          "accepted_cross_account_preview_grant_not_denied")
      }
    })

    let previewPage
    let previewUrl
    const openPreview = async () => {
      const grant = await json(await api(owner, `${nextPath}/access`, "POST"))
      const action = new URL(grant.action)
      requireThat(action.protocol === "https:" && !action.username && !action.password &&
        action.hostname.endsWith(`.${gateway}`) && action.origin !== config.origin &&
        action.pathname === "/api/siteagent/next-gateway/bootstrap" && !action.search && !action.hash,
        "preview_bootstrap_origin_not_allowed")
      requireThat(typeof grant.grant === "string" && grant.grant.length > 0, "missing_one_use_preview_grant")
      if (previewPage) await previewPage.close()
      previewPage = await owner.newPage()
      // Submit a real browser form: the owner-bound exchange must issue the gateway cookie.
      await previewPage.goto(`${config.origin}/builder`, { waitUntil: "domcontentloaded" })
      await Promise.all([
        previewPage.waitForURL((url) => url.origin === action.origin &&
          url.pathname.startsWith("/api/siteagent/next-previews/")),
        previewPage.evaluate(({ action, grant }) => {
          const form = document.createElement("form")
          form.method = "POST"; form.action = action
          const input = document.createElement("input")
          input.name = "grant"; input.value = grant; form.append(input)
          document.body.append(form); form.submit()
        }, { action: grant.action, grant: grant.grant }),
      ])
      previewUrl = previewPage.url()
      requireThat(new URL(previewUrl).origin === action.origin && !new URL(previewUrl).search,
        "preview_url_exposes_query_grant_or_changed_origin")
    }
    await stage("interactive_next_javascript_and_protected_direct_assets", async () => {
      await openPreview()
      await previewPage.getByTestId("revision").filter({ hasText: "revision ONE" }).waitFor()
      const counter = previewPage.getByTestId("counter")
      requireThat((await counter.textContent())?.trim() === "Count: 0", "counter_initial_state_wrong")
      await counter.click()
      await previewPage.waitForFunction(() => document.querySelector('[data-testid="counter"]')?.textContent?.trim() === "Count: 1")
      const scripts = await previewPage.locator("script[src]").evaluateAll((nodes) => nodes.map((node) => node.src))
      const asset = scripts.find((url) => url.includes("/_next/") && url.endsWith(".js"))
      requireThat(asset && new URL(asset).origin === new URL(previewUrl).origin, "next_asset_missing_or_wrong_origin")
      requireThat((await owner.request.get(asset, { maxRedirects: 0 })).status() === 200, "owner_asset_not_accessible")
      for (const context of [other, anonymous]) {
        requireDenied((await context.request.get(previewUrl, { maxRedirects: 0 })).status(), "direct_preview_not_denied")
        requireDenied((await context.request.get(asset, { maxRedirects: 0 })).status(), "direct_next_asset_not_denied")
      }
    })
    await stage("actual_builder_iframe_interactive", async () => {
      const builder = await owner.newPage()
      try {
        await builder.goto(`${config.origin}/builder?project=${encodeURIComponent(project.projectId)}`,
          { waitUntil: "domcontentloaded" })
        const iframe = builder.locator('iframe[name="sajtagent-next-preview"]')
        await iframe.waitFor()
        const sandbox = (await iframe.getAttribute("sandbox") ?? "").split(/\s+/).sort()
        requireThat(JSON.stringify(sandbox) === JSON.stringify(["allow-same-origin", "allow-scripts"]),
          "builder_iframe_sandbox_policy_changed")
        const frame = builder.frameLocator('iframe[name="sajtagent-next-preview"]')
        await frame.getByTestId("revision").filter({ hasText: "revision ONE" }).waitFor()
        // Clicks that land before React hydrates inside the iframe are dropped; retry until one registers.
        let counted = false
        for (let attempt = 0; attempt < 8 && !counted; attempt += 1) {
          await frame.getByTestId("counter").click()
          counted = await frame.getByTestId("counter").filter({ hasText: /Count: [1-9]/ }).waitFor({ timeout: 1_500 })
            .then(() => true, () => false)
        }
        requireThat(counted, "builder_iframe_counter_not_interactive")
      } finally { await builder.close() }
    })
    const publishPath = `${path}/publish`
    const publicUrl = expectedPublicationUrl(project, publishedDomain)
    const readPublication = async () => {
      const result = await json(await api(owner, publishPath))
      requireThat(result.configured === true, "publication_not_configured")
      return result.published
    }
    const publish = async state => {
      const result = await json(await api(owner, publishPath, "POST", publishIntent(state)))
      requireThat(result.schemaVersion === 2 && result.published?.projectId === project.projectId,
        "publication_response_project_mismatch")
      requirePublishedBinding(result.published, state, publicUrl)
      return result.published
    }
    const inspectPublicPage = async (state, marker) => {
      const page = await anonymous.newPage()
      try {
        // The URL is derived independently from the server-owned project. Keep
        // redirects/assets confined there before navigating without login.
        const origin = new URL(publicUrl).origin
        await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
        const response = await page.goto(publicUrl, { waitUntil: "domcontentloaded" })
        requireThat(response?.status() === 200, "public_page_not_anonymously_available")
        requirePublicLocation(page.url(), publicUrl, state.accepted.previewRef)
        await page.getByTestId("revision").filter({ hasText: `revision ${marker}` }).waitFor()
        const counter = page.getByTestId("counter")
        requireThat((await counter.textContent())?.trim() === "Count: 0", "public_counter_initial_state_wrong")
        await counter.click()
        await page.waitForFunction(() => document.querySelector('[data-testid="counter"]')?.textContent?.trim() === "Count: 1")
        const scripts = await page.locator("script[src]").evaluateAll(nodes => nodes.map(node => node.src))
        const asset = scripts.find(url => url.includes("/_next/") && url.endsWith(".js"))
        requireThat(asset && new URL(asset).origin === origin, "public_next_asset_missing_or_wrong_origin")
        requireThat((await anonymous.request.get(asset, { maxRedirects: 0 })).status() === 200, "public_next_asset_not_anonymous")
      } finally { await page.close() }
    }
    const firstPublication = await stage("publish_exact_accepted_revision_and_deny_other_writers", async () => {
      requireThat(await readPublication() === null, "new_project_already_published")
      const published = await publish(first)
      const identity = requirePublishedBinding(published, first, publicUrl)
      requireThat(requirePublishedBinding(await readPublication(), first, publicUrl) === identity,
        "publication_read_model_mismatch")
      for (const context of [other, anonymous]) {
        requireDenied((await api(context, publishPath, "POST", publishIntent(first))).status(), "cross_account_publish_not_denied")
        requireDenied((await api(context, publishPath)).status(), "cross_account_publication_management_not_denied")
      }
      // Explicit identical replay must preserve the published snapshot timestamp.
      requireThat(requirePublishedBinding(await publish(first), first, publicUrl) === identity, "publication_replay_changed_snapshot")
      return identity
    })
    await stage("anonymous_published_next_javascript", async () => inspectPublicPage(first, "ONE"))
    const publicationUnchanged = async () => requireThat(
      requirePublishedBinding(await readPublication(), first, publicUrl) === firstPublication,
      "preview_work_moved_publication_without_publish")
    const latest = await stage("iterate_exact_source_and_keep_other_project", async () => {
      const files = await fixtureFiles("TWO")
      await json(await build(files), [200, 201])
      const state = await readState()
      requireThat(acceptedIdentity(first) !== acceptedIdentity(state) &&
        first.accepted.sourceRevisionId !== state.accepted.sourceRevisionId, "iteration_did_not_advance_source")
      const source = await json(await api(owner, `${nextPath}/source`))
      requireThat(source.sourceRevisionId === state.accepted.sourceRevisionId, "source_revision_id_mismatch")
      requireThat(sourceDigest(source.files) === sourceDigest(files), "accepted_source_does_not_match_input")
      await json(await api(owner, `${projectsPath}/${encodeURIComponent(second.projectId)}`))
      await openPreview()
      await previewPage.getByTestId("revision").filter({ hasText: "revision TWO" }).waitFor()
      return state
    })
    await stage("successful_iteration_keeps_published_revision", async () => {
      await publicationUnchanged()
      await inspectPublicPage(first, "ONE")
    })
    await stage("stale_publication_request_rejected", async () => {
      requireThat((await api(owner, publishPath, "POST", publishIntent(first))).status() === 409,
        "stale_publication_request_not_rejected")
      await publicationUnchanged()
    })
    const unchanged = async () => requireThat(acceptedIdentity(await readState()) === acceptedIdentity(latest),
      "unsuccessful_job_replaced_accepted_revision")
    await stage("failed_next_compile_preserves_accepted", async () => {
      const result = await build(await fixtureFiles("BROKEN"))
      requireThat(result.status() >= 400 && result.status() < 600, "broken_compile_not_rejected")
      const state = await readState()
      requireThat(state.current?.status === "failed", "compile_failure_not_terminal")
      await unchanged()
      await publicationUnchanged()
    })
    await stage("cancel_and_late_result_preserve_accepted", async () => {
      const slow = await fixtureFiles("TWO")
      slow.find((file) => file.path === "app/layout.jsx").content =
        "export default async function Layout({children}) { await new Promise(resolve => setTimeout(resolve, 1800000)); return <html><body>{children}</body></html> }\n"
      // Attach a handler immediately so a concurrent HTTP failure is not unhandled.
      const pending = build(slow).then((response) => ({ response }), () => ({ transportError: true }))
      let running
      const until = Date.now() + 60_000
      while (Date.now() < until) {
        const state = await readState()
        if (state.current?.status === "building") { running = state.current; break }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      requireThat(running?.jobId, "no_running_job_observed_to_cancel")
      const cancellation = await json(await api(owner, nextPath, "DELETE", { jobId: running.jobId }), [200, 202])
      requireCancelled(cancellation, await readState(), running.jobId)
      await unchanged()
      const completed = await pending
      requireThat(completed.response && completed.response.status() >= 400, "cancelled_build_response_not_observed")
      requireCancelled(cancellation, await readState(), running.jobId)
      await unchanged()
      await publicationUnchanged()
    })
    await stage("failed_and_cancelled_builds_keep_public_bytes", async () => inspectPublicPage(first, "ONE"))
    await stage("republish_latest_accepted_revision", async () => {
      const published = await publish(latest)
      const identity = requirePublishedBinding(published, latest, publicUrl)
      requireThat(identity !== firstPublication, "republish_did_not_advance_revision")
      requireThat(requirePublishedBinding(await readPublication(), latest, publicUrl) === identity,
        "republished_read_model_mismatch")
      await inspectPublicPage(latest, "TWO")
    })
    // Do not infer process death from HTTP timeout or restart proof from a repeated GET.
    record("hard_timeout_kills_worker_process", "blocked", "requires_runtime_process_exit_evidence_and_configured_short_test_ceiling")
    record("runtime_restart_reopens_exact_accepted_source", "blocked", "requires_authorized_runtime_restart_and_changed_boot_identity")
    record("cross_worker_files_and_isolated_execution", "blocked", "requires_runtime_worker_identity_and_process_evidence")
    record("overall", "partial", "live_checks_passed_but_runtime_evidence_still_required")
    process.exitCode = 2
  } finally { await browser.close() }
}

try {
  if (process.argv.includes("--fixture-browser")) {
    const { checkFixtureBrowser } = await import("./v2-e2e-fixture-browser.mjs")
    await checkFixtureBrowser()
    record("local_real_next_browser", "passed", "real exported Next client counter clicked in Chromium; not isolated runtime E2E")
  } else if (process.argv.includes("--fixture-check")) {
    const info = await inspectBuiltFixture()
    record("local_real_next_export", "passed", `${info.framework}; ${info.nextJavaScriptAssets} JavaScript assets; not runtime E2E`)
  } else await runLive()
} catch (error) {
  const detail = error instanceof SmokeFailure ? error.message : "redacted_execution_error"
  record("overall", "blocked_or_failed", detail)
  process.exitCode = 1
}
