# Next preview V2 — first static-export profile

Implemented code is not evidence of configured deployment or a live E2E.
V1 remains unchanged unless `SITEAGENT_NEXT_ENABLED=true` and every required
server setting is present. If the flag is off or a required setting is missing,
authenticated `GET /api/siteagent/projects/:id/next` returns **404**
`{error:"next_preview_unavailable"}` so Vercel 5xx monitors do not treat the
intentional fail-closed path as an outage. Unexpected failures after V2 is
enabled still return 503. The first profile is genuine Next `output: export`
with interactive client JavaScript; SSR, customer API routes, arbitrary build
configuration and secrets in customer execution are not supported.

## End-to-end responsibility

1. Site authenticates the owner and selects project, job, revision, preview ref.
   `POST /api/siteagent/projects/:id/next` receives `{prompt}` or `{files:[{path,content}]}`;
   browser input never selects a worker, tenant, job or revision.
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
   status and lifetime. Only server `begin` can change job ID. Failures, explicit
   cancel, aborted HTTP request, timeout and stale responses keep accepted data.
   The remaining A old-failure regression is covered in the server checker.
6. The accepted source and output are durable in `next_preview_states`. Source
   reopening does not require a living Runtime process. V1 tables are untouched.

## Interactive owner-only preview

The trusted gateway is the Site deployment on an exclusively reserved wildcard
domain. **Each project has a distinct origin** from SHA256(tenant,project). On
gateway hosts `proxy.ts` blocks every Site/UI/auth/API/asset route except the
two gateway routes, including `_next`, images and extensions.

- Site POST `/projects/:id/next/access` requires the configured Site Origin and
  current owner Supabase claims/session. It mints an opaque, one-use 60-second
  grant in DB; never a Supabase or Vercel token.
- The Builder form POSTs that grant into the iframe. Gateway exchanges it for a
  15-minute `__Host-` HttpOnly Secure SameSite=None Partitioned cookie. Browser
  support for partitioned cookies must be exercised in live browser smoke.
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
- Applied migration `20260913203600_next_preview_v2.sql`
- Server DB role can read `auth.sessions(id,user_id,not_after)`. Do not grant this
  to browser/anonymous/authenticated Data API roles. Missing permission denies.
- Wildcard DNS + certificate + Vercel domain routing to the trusted gateway code.
- Runtime C feature enabled with actually authorized Sprites administration.

Create no public aliases to protected artifacts. Keep original Vercel protection
enabled for all preview deployments. Gateway works from verified stored bytes,
not by sharing a protection bypass cookie with the user.

## Product integration and verification

`NextPreviewPanel` is the opt-in Builder component; import it in PreviewStage
with current owner-selected project ID after the B project selector merges.
It polls state, sends a Next instruction or source bundle, reopens accepted
source, cancels, and bootstraps interactive preview. Prompt mode is an explicit
V2 panel action; the original V1 agent conversation remains backward-compatible.

`npm run check:next-preview` runs focused local regression assertions and a real
TypeScript check. The global next build TypeScript waiver is not used by it.
Actual Vercel API/deployment, wildcard cookie/iframe behavior, two-account live
access, actual process termination and Runtime restart remain mandatory E checks.

References consulted 2026-09-13:
- https://vercel.com/docs/rest-api/deployments/create-a-new-deployment
- https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
- https://supabase.com/docs/guides/database/postgres/row-level-security
- Local Next 16.3.3 `node_modules/next/dist/docs/.../route.md`
