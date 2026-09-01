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
| Runtime/controller | `sajtagent-sprites` | Authorize the job, enforce limits, assign one isolated workspace, run one bounded agent loop, verify the result, and return receipts. |
| Worker Sprite | isolated development resource | Edit only the assigned workspace and expose only its private preview service. |

Development MCP and plugin logins are not part of this path. The browser never
receives a Supabase secret, provider key, runtime credential, Sprite token, or
raw preview-organization token.

## Small versioned contract

The two repositories freeze matching schemas and valid/invalid fixtures for
`BuildJobV1` and `BuildResultV1` before connecting runtime code.

```text
BuildJobV1
  jobId, tenantId, projectId, baseRevisionId, idempotencyKey
  request: message, buildChoices, mode, planMode
  limits: deadline, maxSteps, maxToolCalls

BuildResultV1
  success: jobId, baseRevisionId, workspaceRevisionId,
           privatePreviewUrl, checks[], receipts[]
  failure: jobId, baseRevisionId, code, message, retryable, receipts[]
```

All identifiers are server-issued. The runtime rejects an expired job, a stale
base revision, an unknown tenant/project binding, an exceeded limit, and a
replayed job whose payload differs from the original idempotent request.
Receipts describe tool, check, and preview evidence without containing secrets
or unrestricted command output.

## One request flow

1. The Builder sends a validated request to a new Sajtagent-owned route such as
   `POST /api/siteagent/build-jobs`.
2. The site authenticates the user, resolves tenant/project/base revision, and
   creates one idempotent job. Invalid ownership fails before a runtime call.
3. The site sends the signed `BuildJobV1` to the runtime through a narrow
   server-to-server endpoint.
4. The runtime binds the job to one private workspace and gives one agent only
   project-scoped read, edit, check, and preview tools with fixed limits.
5. Deterministic checks decide whether the workspace revision and preview are
   acceptable. Model text never decides success or authorization.
6. The runtime returns `BuildResultV1`. Success requires a healthy private
   preview plus check and tool receipts.
7. The site persists the terminal state and version, then exposes the preview
   through an authenticated SiteAgent route for the Builder iframe.
8. Cancellation, timeout, stale revision, runtime error, failed check, or
   unhealthy preview produces `failure`; no `srcDoc` simulation is generated.

Progress is advisory and separate from the terminal result. A minimal stream
may expose `job.accepted`, `job.running`, `message.delta`, `preview.ready`, and
exactly one of `job.succeeded` or `job.failed`.

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
- Matching contract fixtures pass in both owning repositories.
- Database reset/migration checks, RLS/grant tests, lint, build, and focused
  tests pass. Build success remains separate from the known typecheck waiver.
- A browser smoke test submits one request, observes progress, renders the real
  preview, and proves that a forced runtime failure cannot appear as success.
- Publish and ZIP remain unavailable; no production deployment is performed.

## Delivery checkpoints

1. **Contract:** freeze schemas, fixtures, error codes, idempotency, and receipt
   rules without creating a cloud resource.
2. **Site boundary:** add the migration and API route, initially failing closed
   when no runtime is configured; remove no fallback until the real join exists.
3. **Runtime boundary:** implement the bounded controller and a local contract
   harness in `sajtagent-sprites`; a harness may test contracts but may never
   become a product success fallback.
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
