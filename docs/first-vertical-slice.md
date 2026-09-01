# First vertical slice: one real Builder result

Status: accepted implementation contract, 2026-09-01.

## Outcome

One authenticated user submits one Builder request and receives either:

- one real, healthy preview bound to a durable workspace revision and
  verification evidence; or
- one explicit terminal failure that cannot be presented as a ready version.

This slice replaces `streamChat` and its simulated HTML fallback end to end.
It does not preserve the Sajtmaskin-era `/api/engine/chats/stream` route or
request shape.

## Explicitly out of scope

- prompt assist, publish, ZIP export, automatic release, or production deploy;
- multi-agent planning, review, repair, or autonomous retry chains;
- general-purpose shell access, broad network access, or public Sprites;
- a complete future project schema or migration of Sajtmaskin data;
- shared Sajtmaskin code, database, auth, Vercel, MCP, or runtime dependencies.

The existing prompt-assist, publish, and ZIP prototype paths must remain
visibly unavailable or labeled as prototype behavior. They cannot count as
evidence for this slice.

## Ownership

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Browser and Builder state | `sajtagent-site` | Collect input, render progress, show authenticated preview, and render real failure. |
| Build-job API and persistence | `sajtagent-site` | Authenticate, bind tenant/project/revision, enforce idempotency, persist status, and call the runtime server to server. |
| Product controller | `sajtagent-site` | Authorize the request, create the job and execution policy, verify worker evidence, persist the result, and publish the product event stream. |
| Runtime integration | `sajtagent-sprites` | Host the Sajtagent OpenClaw profile, compile an authorized job into fail-closed session policy, normalize the upstream run, and return worker evidence. |
| Upstream agent runtime | OpenClaw Gateway | Own the serialized agent loop, session queue, run lifecycle, sandbox, native tools, and upstream tool policy. |
| Worker Sprite | isolated development resource | Hold one secret-free project workspace and expose only its private preview service. |

Development MCP and plugin logins are not part of this product path. The
browser never receives a Supabase secret, provider key, OpenClaw credential,
Sprite token, or raw preview-organization token.

## Small versioned contract

The browser uses the ratified AgentSession contract. The retained build
contracts stay internal until the same-session approval/tool join is ratified.

```text
AgentTurnRequestV1
  browser message: session, turn, idempotency and selected UI context

BuilderIntentV1
  internal normalized build intent; never a parallel browser command

BuildJobV1
  jobId, tenantId, projectId, baseRevisionId, idempotencyKey
  intent: BuilderIntentV1
  executionPolicy: semantic capabilities, budget, deadline,
                   network allowlist, package allowlist

WorkerReportV1
  candidate: sourceRunId, candidateRevisionId, changed paths,
             artifacts, checks, receipts, diagnostics
  failure: sourceRunId, status, receipts, diagnostics
  never contains a versionId or authoritative success

BuildResultV1
  success: canonical workspaceRevisionId, versionId,
           previewRef, sitemapRevision, verification receipts
  failure: code, message, retryable, receipts

BuildEventV1
  jobId, sequence, type, payload, optional sourceRunId
  exactly one final job.succeeded or job.failed
```

The browser may request behavior but can never raise capabilities. The product
controller issues identifiers and `executionPolicy`; it rejects expired jobs,
stale revisions, unknown tenant/project bindings, exceeded limits, and changed
idempotent replays. The runtime adapter compiles semantic policy into OpenClaw
session, sandbox, and tool settings without exposing upstream configuration in
the shared job contract. Receipts contain sanitized evidence, never secrets or
unrestricted command output.

## One request flow

1. The Builder sends only `AgentTurnRequestV1` to its Site-owned session route.
2. The site authenticates the user and resolves tenant/project/base revision.
   Current answer-only turns stop here without creating a build job.
3. A future explicit approval and Site-authorized tool join in the same session
   may normalize an internal `BuilderIntentV1` and create one idempotent job.
   No browser-callable build-job route exists.
4. The site sends the signed `BuildJobV1` to the runtime adapter through a
   narrow server-to-server endpoint.
5. The adapter binds the job to one OpenClaw session and private workspace,
   then compiles its semantic execution policy into fail-closed sandbox and
   tool policy. It does not implement another agent loop.
6. OpenClaw Gateway runs the Sajtagent profile with native file, patch, command,
   check, browser, and preview tools that the compiled policy authorizes.
7. The adapter normalizes the upstream run into `WorkerReportV1`. A candidate
   is evidence, not authoritative success.
8. The site runs deterministic acceptance checks and persists either a
   canonical `BuildResultV1` or failure. Model text never decides success.
9. The site appends the terminal `BuildEventV1`, then exposes the referenced
   preview through an authenticated SiteAgent route for the Builder iframe.
10. Cancellation, timeout, stale revision, runtime error, failed check, or
   unhealthy preview produces `job.failed`; no `srcDoc` simulation is
   generated.

Progress is advisory and separate from the terminal result. A minimal stream
may expose `job.accepted`, `job.running`, and `message.delta`, followed by
exactly one terminal `job.succeeded` or `job.failed`. The terminal event is
always the final sequence. Success contains every canonical revision, version,
preview, and sitemap reference; no later ready events are allowed.

## Minimum persistence

The first site migration should add only the records needed to prove this path:

- build jobs with tenant, project, revision, idempotency, status, and limits;
- workspace revisions produced by successful jobs;
- sanitized result/check/receipt metadata needed by the user-visible version.

The migration belongs to `sajtagent-site`. Every exposed table needs explicit
grants, RLS, ownership policies, and negative cross-tenant tests. Raw provider
credentials, Sprite tokens, and unrestricted logs never belong in these rows.

## Definition of done

- `streamChat` no longer calls `/api/engine/chats/stream` and production code
  cannot reach `simulateStream` or mark its `srcDoc` as ready.
- The Builder creates no ready `SiteVersion` until the server-owned job has a
  successful `BuildResultV1`, healthy private preview, and required receipts.
- Invalid input, unauthenticated access, cross-tenant access, stale revision,
  changed idempotent replay, cancellation, timeout, failed check, runtime
  failure, and unhealthy preview all have focused failure tests.
- Matching Intent, Job, WorkerReport, Result, Event, and terminal-order fixtures
  pass in both owning repositories with the same contract-fixture digest.
- Database reset/migration checks, RLS/grant tests, lint, build, and focused
  tests pass. Build success remains separate from the known typecheck waiver.
- A browser smoke test submits one request, observes progress, renders the real
  preview, and proves that a forced runtime failure cannot appear as success.
- Publish and ZIP remain unavailable; no production deployment is performed.

## Delivery checkpoints

1. **Contract:** freeze the five schemas, fixtures, error codes, idempotency,
   terminal ordering, execution policy, and receipt rules without creating a
   cloud resource.
2. **Site boundary:** retain the internal controller, persistence and acceptance
   seams, but expose no browser build route. Ratify explicit same-session
   approval and the Site-authorized tool join before product dispatch exists.
3. **Runtime boundary:** configure the Sajtagent OpenClaw profile and implement
   only the thin signed adapter and Job Policy Compiler in
   `sajtagent-sprites`; OpenClaw remains the upstream agent loop. A local
   harness may test contracts but may never become a product success fallback.
4. **Private integration:** after explicit cloud authorization, prove one real
   job in one disposable development Sprite with private preview and cleanup.
5. **Replacement:** connect the Builder, remove the old Sajtmaskin route and
   simulated chat/build path in the same change, then run the browser smoke.

## Authorization required before Sprite work

No Sprite mutation is authorized by this document. Before checkpoint 4, the
active task must explicitly state:

- permission to create and later destroy one development Sprite;
- the Sajtagent-only name prefix, maximum count, deadline, and spend/tool budget;
- the outbound network allowlist and whether any package installation is needed;
- private preview exposure and its authentication path;
- runtime-only placement for provider credentials; and
- cleanup and evidence requirements after success or failure.

Until those decisions are authorized, implementation stops at local contracts,
site migration design, and a local runtime harness.
