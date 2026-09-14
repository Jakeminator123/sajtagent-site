# V2 E — executable smoke and evidence

This is an implementation of the real Site smoke driver, not evidence that the
remote system passed. It targets the B project API, D `/next` routes and F
`/publish` routes plus the anonymous publication gateway. It does
not call runtime administration or use a shared privileged worker for customer
code. No production tables are reset and no test projects are deleted.

## One-time setup

Run from the repository root with Node 24:

```sh
npm ci --prefix tests/v2-e2e-tools
node tests/v2-e2e-tools/node_modules/playwright/cli.js install chromium
```

The tool dependency is separately locked; this does not change product runtime
dependencies. On Linux, install the browser system dependencies if Playwright
reports they are missing. Do not capture traces, storage-state files, or auth
screenshots while handling test credentials.

## Live command

Provide these environment variables through the operator's secret manager or
local ignored environment configuration, never command-line password arguments:

- `V2_E2E_SITE_ORIGIN`: reviewed Sajtagent Site deployment origin, without a path.
- `V2_E2E_GATEWAY_DOMAIN`: the configured dedicated preview gateway parent
  domain, without protocol or project prefix. The driver rejects grant actions
  outside this domain and requires a separate HTTPS origin.
- `V2_E2E_PUBLISHED_DOMAIN`: the separate public gateway parent domain, e.g.
  `sites.sajtagent.se`. Required for the live driver. This must be distinct and
  non-nested with the preview zone and must not contain the Site origin. Public
  URLs are independently derived from the created tenant/project binding;
  returned URLs and browser redirects must match before content is trusted.
- `V2_E2E_OWNER_EMAIL`, `V2_E2E_OWNER_PASSWORD`: first dedicated real test account.
- `V2_E2E_OTHER_EMAIL`, `V2_E2E_OTHER_PASSWORD`: a different dedicated real account.
- Optional `V2_E2E_BUILD_WAIT_MS`: driver HTTP ceiling, default 900000, max 1800000.
  This is **not** the runtime's hard process timeout.

```sh
node scripts/run-v2-e2e.mjs
```

The operator must first verify that this deployment uses only Sajtagent's
Supabase project `ywoltuegeemqznbcgokg`, the reviewed C runtime, and D gateway
configuration. The test creates two owner projects and one second-account
project, named `V2 smoke ...`, and retains them for inspection. It performs real
builds, including an intentionally broken compilation and a cancelled slow
build. It **publishes the generic fixture to an anonymous public URL** and later
republishes revision TWO. The public fixture/project remains for inspection;
no customer content is used. Use test accounts, not a customer's working project.

Output is JSON lines containing fixed assertion names and redacted failures.
Passwords, emails, cookie values, source text, preview grants, private URLs and
raw service errors are not printed. Exit 1 means blocked/failed. Exit 2 means
implemented live checks passed but required runtime evidence remains missing.
The driver deliberately cannot label the complete V2 E2E green without that
evidence. Local fixture-only modes may exit 0 and label their scope explicitly.

## What runs

| Check | Executable behavior |
| --- | --- |
| Two accounts | Logs both accounts in through real `/login`; checks that created projects have different principals. |
| Two projects | Creates two projects for the first account, lists both, and opens the second after iteration. |
| API isolation | Other account and anonymous context must receive 401/403/404 on project/state/Next/source/access routes. Redirects and 5xx are not proof of denial. |
| Real Next build | Sends the fixture's actual source to `POST .../next`, requires accepted job/revision/deployment/preview bindings. |
| Interactivity | Exchanges the one-use preview grant through a real browser form and clicks the exported React counter. |
| Builder iframe | Opens the actual `/builder?project=...`, checks the production iframe's exact sandbox policy and clicks its counter. |
| Exact publication | Owner explicitly publishes accepted revision ONE; returned job/revision/project and derived public hostname must match. GET and identical replay preserve the exact published identity/timestamp. |
| Publication management isolation | Other account and anonymous context must be denied on publish POST and publication-management GET after owner-positive success. Public content itself is intentionally anonymous. |
| Public Next JavaScript | Anonymous browser follows the exact public gateway redirect to the pinned preview-reference base path, sees revision ONE and clicks the React counter. Its actual Next JS asset must also return 200 anonymously. |
| Direct preview/files | Anonymous and second-account contexts are denied on the exact accepted preview URL and an actual emitted Next JS asset; the owner must load the same asset. |
| Iteration | Builds revision TWO, requires a different accepted source revision, opens its rendered marker and compares reopened source bytes. |
| Publication stays pinned | Successful iteration, failed compilation and cancellation must leave the publication identity unchanged; fresh anonymous pages still render interactive revision ONE. |
| Stale publication | Owner tries to publish old revision ONE after TWO is accepted; requires HTTP 409 and unchanged published identity. Redirects or server errors cannot pass. |
| Explicit republish | Owner publishes accepted TWO, checks the new persisted identity, then an anonymous browser must load revision TWO and click its counter at the same public hostname. |
| Failure | Sends invalid JavaScript, requires a terminal failed state and unchanged accepted identity. |
| Cancellation/late reply | Starts a slow server component build, observes its current job, cancels that exact job, waits for the original request to complete, and verifies accepted identity stayed unchanged. |

The accepted identity comparison includes job, source revision, preview ref and
deployment ID. Repeated GETs alone do not prove restart recovery. Likewise an
HTTP timeout alone does not prove that npm/Next subprocesses stopped.

The fixture sent to C omits `next.config.*` and lockfiles: C owns the fixed build
toolchain and export/base-path configuration. The local fixture includes these
files solely for reproducible independent compilation. No extra server-only
features, package-install scripts, external services, model access or network
requests are needed by the fixture.

## Remaining evidence gate

- [ ] Run the live driver on a deployment with B/C/D/F integrated and record its reviewed Git SHAs and timestamp.
- [ ] Record successful `actual_builder_iframe_interactive` from the live run, not just the local fixture mode.
- [ ] Record `anonymous_published_next_javascript`, `stale_publication_request_rejected`,
  `failed_and_cancelled_builds_keep_public_bytes` and `republish_latest_accepted_revision`
  from the live run after public wildcard DNS/HTTPS is ready.
- [ ] Capture sanitized controller evidence of different project worker IDs,
  one mutating process per project, and customer code outside the controller.
- [ ] Verify cross-worker source-file access is denied by the actual runtime.
- [ ] With a deliberately short server-controlled test ceiling, verify worker
  process exit/absence after timeout; then confirm accepted identity is unchanged.
- [ ] Restart the actual runtime through an authorized operational channel,
  verify a changed process boot identity, reopen the previous accepted revision
  through `GET .../next/source`, and compare exact files + revision ID.
- [ ] Complete independent code review of the E harness PR before merge.

Do not turn these unchecked items into a simulated pass or add public
administrative/fault-injection endpoints just to satisfy the test.

## Local, non-live verification

```sh
node scripts/verify-v2-e2e-harness.mjs
npm ci --prefix tests/v2-e2e-fixture
npm run build --prefix tests/v2-e2e-fixture
node scripts/run-v2-e2e.mjs --fixture-check
node scripts/run-v2-e2e.mjs --fixture-browser
```

`--fixture-check` requires a real `.next/BUILD_ID`, emitted HTML marker and
non-empty emitted Next JS files. `--fixture-browser` serves that export on a
temporary loopback server and clicks its counter in Chromium. Neither claims
cloud worker isolation, gateway authorization or real account E2E success.

Author verification on 2026-09-13: harness unit checks passed; the pinned Next
16.3.3 fixture compiled successfully and emitted six Next JavaScript assets.
Live run correctly stopped for missing environment/test accounts. Chromium
download did not complete in this environment, so local browser interactivity
was not verified here. Full runtime E2E remains unverified.

Publication-driver extension (2026-09-14): local negative assertion tests and
lint pass; CI now explicitly runs `verify-v2-e2e-harness.mjs`. No live publication,
browser account test or runtime test was executed by that extension. The driver
retains exit 2 for incomplete runtime evidence even after publication stages pass.
