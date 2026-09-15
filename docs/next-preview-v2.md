# Next preview V2 — first static-export profile

Implemented code is not evidence of configured deployment or a live E2E.
V1 remains unchanged unless `SITEAGENT_NEXT_ENABLED=true` and every required
server setting is present. If the flag is off or a required setting is missing,
authenticated `GET /api/siteagent/projects/:id/next` returns **404**
`{error:"next_preview_unavailable"}` so Vercel 5xx monitors do not treat the
intentional fail-closed path as an outage. That 404 is only the expected-off
state, not a genuine fault. Classified POST `/next` server faults are 5xx with
an allowlisted `reason` (500 permanent, 502 upstream/worker/source, 503 unavailable);
unknown errors still return 503 `{error:"next_build_failed"}`. Runtime 4xx bodies
with a closed `{error}` code (`source_generation_failed`,
`invalid_generated_source`) keep that reason instead of collapsing to
`runtime_transport_4xx`. The first profile is genuine Next `output: export`
with interactive client JavaScript; SSR, customer API routes, arbitrary build
configuration and secrets in customer execution are not supported.

## Which Builder surface uses Next?

The ordinary **Sajtagent chat** is the instruction surface for both profiles.
Site selects Next only when the complete server configuration is enabled **and**
the project preference is `next` or unset. An explicit `html` preference keeps
the HTML sketch lane while Next remains a deployment capability. The preference
cannot enable Next when `SITEAGENT_NEXT_ENABLED` is off or the env is incomplete.
There is no HTML-to-React migration. It still classifies turn permissions and
requires the model's exact authorized `build.request` handoff; ordinary
conversation does not start a build.

Next success is a distinct `next.preview.ready` event with the accepted project,
job, source revision and preview reference. It never fabricates a V1 version or
sitemap, and does not replace the HTML session's base revision. The shared preview
reconciles this binding against the owner-authorized Next read model. Publication
uses the accepted Next revision; the versions card retains HTML history and shows
the **latest accepted Next revision**. Historical Next version restore is not
implemented. Existing HTML projects are not automatically converted into React.

Source ZIP download requires the exact accepted job and revision. It includes a
standalone fixed Next scaffold plus the exact accepted source snapshot and its
manifest. The local scaffold removes the private gateway base path. It has no
generated lockfile, so it is not a promise of a byte-identical rebuild.

## End-to-end responsibility

1. Site authenticates the owner and selects project, job, revision, preview ref.
   `POST /api/siteagent/projects/:id/next` receives `{prompt}` or `{files:[{path,content}]}`;
   browser input never selects a worker, tenant, job or revision.
   Source limits mirror Sprites `NextBuildRequestV2Schema` and must change with it:
   path alphabet `^[A-Za-z0-9_@.()[\] /-]+$`, max 240 chars, per-file content
   512 KiB, Site file count 2–250 (stricter than the controller's 1–256), plus
   Site-only leading-dot / duplicate / bundle-ceiling checks. The alphabet
   applies only to inbound source, not to Next export output or already-accepted
   gateway paths (`safeFilePath` is the stored/served safety check). Named 400
   codes (`invalid_source_path`, `invalid_source_file_size`, `invalid_source_count`,
   `invalid_source_bundle`) never echo file contents.
   Prompt mode first calls signed `/v2/next-source`: the existing OpenClaw
   conversation provider has all tools denied and returns JSON source only.
   Preparation has a distinct job ID; the final build revision is never changed.
   Iteration loads accepted DB source. Compare-and-set rejects preparation based
   on a version replaced meanwhile. The first prompt context is bounded to 18k
   characters (prompt plus source); larger source remains importable without
   silent truncation or pretending the model saw it.
   Model-produced files omit `package.json`: Runtime C appends its fixed,
   trusted package before hashing the generation receipt and owns build config.
   Site preserves and hashes that exact returned bundle. Package-less imported
   source also works because Runtime owns the fixed execution package.
2. Signed Runtime `/v2/next-builds` creates/runs the isolated project worker.
   Source revision is SHA256 of JSON `[tenantId,projectId,sorted(path,content)]`.
   Runtime returns the exact binding, isolated worker receipt and static files.
3. **Site owns Vercel deployment**: uploads only static output under `public/`
   with no framework/install/build command. It cannot execute customer source.
   No customer `package.json`, `vercel.json`, API or function reaches deployment.
4. **Site verifies** deployment READY, expected Vercel project, job/revision/output
   metadata, original anonymous URL denial and every deployed static file byte.
   Missing deployment protection fails closed, never produces accepted state.
5. Postgres row lock compares current job/project/revision/ref, active building
   status and lifetime. Only server `begin` can change job ID. Failures persist
   the same allowlisted `reason` on `current.failureCode`; unknown errors keep
   `build_or_verification_failed`. Explicit cancel, aborted HTTP request,
   timeout and stale responses keep accepted data. Chat marks a Next failure
   retryable only for transient runtime unavailability (`runtime_transport_5xx`
   / `runtime_transport_failed` / unknown 503), not for 500/502. The remaining
   A old-failure regression is covered in the server checker.
6. The accepted source and output are durable in `next_preview_states`. Source
   reopening does not require a living Runtime process. V1 tables are untouched.

## Interactive owner-only preview

The trusted gateway is the Site deployment on an exclusively reserved wildcard
domain. **Each project has a distinct origin** from SHA256(tenant,project). On
gateway hosts `proxy.ts` blocks every Site/UI/auth/API/asset route except the
two gateway routes, including `_next`, images and extensions.

- Site POST `/projects/:id/next/access` requires the configured Site Origin and
  current owner Supabase claims/session. Next disabled or incomplete config is
  404 `next_preview_unavailable` (same as #37), not 403. A genuine grant denial
  stays 403 `preview_access_denied`. Malformed/oversized binding bodies are
  400/413. Persistence failures are 503 `preview_access_unavailable`. It mints
  an opaque, one-use 60-second grant in DB; never a Supabase or Vercel token.
- The Builder form POSTs that grant into the iframe. Gateway exchanges it for a
  15-minute `__Host-` HttpOnly Secure SameSite=None Partitioned cookie. Browser
  support for partitioned cookies must be exercised in live browser smoke.
- The shared Builder binds grant issuance and exchange to the displayed job,
  source revision and preview reference. If acceptance changes before exchange,
  the old grant is denied; it cannot open different output under the old label.
  Bodyless access remains supported for existing operator smoke clients.
- Every HTML/asset/file request checks the session hash, host, project, tenant,
  owner, preview reference and live `auth.sessions` user/expiry. Logout/session
  revocation denies further requests, and a copied direct URL grants no access.
- Static bytes are served from the immutable deployment-verified DB snapshot.
  No upstream request means **no bypass token, credential, cookie or request
  header can enter generated server code**. The original Vercel URL stays private.
- Sandbox allows scripts and same-origin only on the separated project origin.
  CSP blocks workers/service workers, nested frames, forms and external network;
  all responses are private/no-store. Existing fetched bytes cannot be remotely
  erased, but no authenticated network access survives session revocation.

## Configuration / live prerequisites

Required Site/gateway server configuration (never NEXT_PUBLIC):

- `SITEAGENT_NEXT_ENABLED=true`
- `SITEAGENT_SITE_ORIGIN` exact HTTPS product origin
- `SITEAGENT_NEXT_PREVIEW_DOMAIN` exclusive wildcard domain, e.g. preview.example.com
- Existing `SITEAGENT_RUNTIME_URL` and `SITEAGENT_RUNTIME_SIGNING_KEY`
- `SITEAGENT_NEXT_VERCEL_TOKEN`, `SITEAGENT_NEXT_VERCEL_TEAM_ID`
- `SITEAGENT_NEXT_VERCEL_PROJECT_ID` dedicated static-artifact project, NOT Site
- `SITEAGENT_NEXT_VERCEL_BYPASS` only for protected static-byte verification
- On the **artifact project** itself: `VERCEL_PREVIEW_FEEDBACK_ENABLED=0` for all
  targets. Otherwise Vercel injects its Toolbar script into the exported
  `turbopack-*.js` and exact-byte verification fails. `POST /next` then returns
  500 `{error:"next_build_failed",reason:"deployment_bytes_mismatch"}` — a
  permanent server fault, not a client 4xx and not a transient 503. Other
  classified failures keep `error:"next_build_failed"` and add an allowlisted
  `reason`; unknown errors stay 503 without a reason. Mapping lives in
  `lib/siteagent/server/next-preview-failure.ts`.
- Applied migration `20260913203600_next_preview_v2.sql`
- Server DB role can read `auth.sessions(id,user_id,not_after)`. Do not grant this
  to browser/anonymous/authenticated Data API roles. Missing permission denies.
- Wildcard DNS + certificate + Vercel domain routing to the trusted gateway code.
- Runtime C feature enabled with actually authorized Sprites administration.

Create no public aliases to protected artifacts. Keep original Vercel protection
enabled for all preview deployments. Gateway works from verified stored bytes,
not by sharing a protection bypass cookie with the user.

## Product integration and verification

BuilderProvider restores and polls the current project's Next state, including
the sibling `profile: {available, preference, effective}` block on
`GET /api/siteagent/projects/:id/next`. The temporary header switch persists
through `POST /api/siteagent/projects/:id/next/profile` and reuses that same
read — no second poller. The shared PreviewStage hosts the protected Next
frame; the existing chat, versions card and header use that same state. There
is no separate customer-facing Next prompt. Switching profile does not convert
artifacts, touch `next_publications_v2`, or change the published revision.
The direct Next build/source APIs remain available for operator smoke and source
import. With Next disabled, existing HTML projects continue through V1. Projects
with accepted Next output must not silently downgrade to HTML on configuration
failure.

The chat route has an 800-second runtime ceiling. When an authenticated owner
reads or starts a turn, a still-running turn older than 15 minutes is completed
as `turn.failed` under the session/turn locks. This recovers a crashed request
without inventing success, changing accepted output, or accepting late events.
The browser also respects the separate Next job expiry instead of treating an
expired `building` row as a permanent navigation/composer lock.

`npm run check:next-preview` runs focused local regression assertions and a real
TypeScript check. The global next build TypeScript waiver is not used by it.
Actual Vercel API/deployment, wildcard cookie/iframe behavior, two-account live
access, actual process termination and Runtime restart remain mandatory E checks.

### Operator handoff for ordinary-chat rollout

1. Deploy the coordinated Site/Sprites `main` revisions. The matching chat
   contract includes `next.preview.ready`; record exact deployment SHAs.
2. Obtain a clean bounded worker smoke, a recorded Runtime restart and source
   reopen, and cancellation/timeout process-death evidence. A healthy endpoint
   or a stopped operator command is not a passing receipt.
3. Verify wildcard HTTPS for `*.preview.sajtagent.se` and
   `*.sites.sajtagent.se` routes to `sajtagent-site`, and that original artifact
   URLs remain private. Keep control-plane Sprites credentials off Site/workers.
4. Enable Next in a controlled test deployment with complete server settings.
   Use two dedicated customer accounts. Submit a small interactive React brief
   through the **ordinary chat** in a fresh project; verify a click changes
   rendered state, iterate, reload, download source and publish. Also test
   failed builds, cross-account/direct-link denial and expired-turn recovery.
5. Record the actual accepted job/revision, deployment and test result before
   enabling general customer traffic. Existing HTML versions stay HTML; a
   successful code merge does not convert or rebuild them.

The canonical operations record remains the
[Platform handoff](https://github.com/Jakeminator123/sajtagent-platform/blob/main/docs/v2-rollout-handoff.md).
Do not repeat already-applied migrations or broaden DB grants because older
historical checklists still describe them as pending.

References consulted 2026-09-13:
- https://vercel.com/docs/rest-api/deployments/create-a-new-deployment
- https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
- https://supabase.com/docs/guides/database/postgres/row-level-security
- Local Next 16.3.3 `node_modules/next/dist/docs/.../route.md`
