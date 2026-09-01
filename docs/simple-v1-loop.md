# V1: one prompt, one verified site

Status: accepted product loop. The site implementation is local until the
private runtime ingress and artifact-transfer boundary are ratified.

## The simple rule

The browser submits intent. The SiteAgent controller decides what is true.
OpenClaw produces a candidate. Only deterministic SiteAgent checks may turn
that candidate into a version.

```text
Chat -> SiteAgent controller -> private OpenClaw runtime -> candidate
     -> SiteAgent acceptance -> revision + version -> authenticated preview
```

There is no second agent loop, no browser-to-Sprite request, no simulated
success and no separate "maybe ready" state. A job is either in progress,
failed, or backed by one canonical `BuildResultV1` success.

## One product state machine

| State | User-visible meaning | Allowed next state |
| --- | --- | --- |
| `idle` | No build is running. | `running` |
| `running` | SiteAgent is building or checking. | `ready`, `failed` |
| `ready` | A persisted revision, version and healthy preview exist. | `running` |
| `failed` | No new version or ready preview was created. | `running` |

The UI may show detailed phases such as plan, build, check and persist, but
those are progress labels rather than additional sources of truth.

## Ownership

| Part | Owner | Responsibility |
| --- | --- | --- |
| Chat and cards | Browser UI | Send typed intent and project canonical events. |
| Product controller | `sajtagent-site` | Auth, ownership, idempotency, policy, acceptance and terminal event. |
| Runtime client | `sajtagent-site` | Health preflight and one signed server-to-server request. |
| Agent runtime | `sajtagent-sprites` | OpenClaw session, tools, workspace and non-authoritative report. |
| Product persistence | `sajtagent-site` | Atomically persist accepted revision, version, preview and event. |
| Preview route | `sajtagent-site` | Resolve an opaque owner-bound reference and return isolated HTML. |

Sajtmaskin is useful evidence for one principle: readiness must never stay
green when product verification is red. Its branches, database, auth,
deployment, runtime and orchestration are not dependencies of this loop.

## Request and acceptance

1. The browser opens its authenticated starter project.
2. Chat sends a `BuilderIntentV1` to `POST /api/siteagent/build-jobs`.
3. The controller binds user, tenant, project, base revision and idempotency.
4. The runtime client requires a healthy signed OpenClaw runtime before
   dispatch and sends one HMAC-signed `BuildJobV1`.
5. The runtime returns one Zod-validated `WorkerReportV1` synchronously.
6. A candidate must be bound to the same job and base revision. It must have
   exactly one HTML preview artifact with SHA-256, a passed preview receipt
   referring to that artifact and the checks required by job policy.
7. SiteAgent materializes and hashes the preview bytes, checks preview health,
   then atomically persists the revision, version, opaque preview reference
   and final `job.succeeded` event.
8. Any mismatch produces one terminal `job.failed`; no partial version is
   visible.

Receipt display names are not policy identifiers. Acceptance uses typed
category/status, evidence binding and job policy. It does not hard-code model
names or the current runtime command label.

## Preview boundary

The runtime's internal artifact reference is opaque evidence, not a URL. It
must never be copied into `BuildResultV1.previewRef` or sent to the browser.
SiteAgent mints its own opaque preview reference after materialization.

The authenticated preview response is owner-, tenant-, project- and
revision-bound, `no-store`, size-limited and served with an isolating CSP. The
Builder iframe also uses a sandbox without same-origin privileges.

## Configuration

Browser-visible configuration is limited to the Supabase project URL and
publishable key. Postgres connections, runtime URL and runtime signing key are
server-only. Model/provider credentials, OpenClaw credentials, Sprite tokens
and workspace paths are runtime-only and never belong in this repository.

`SITEAGENT_RUNTIME_URL` and `SITEAGENT_RUNTIME_SIGNING_KEY` remain unset until
the private ingress is ratified. They must always be configured as a pair.

## Verification

The executable checks are intentionally split by responsibility:

```text
npm run check:contracts
npm run check:build-jobs
npm run check:builder-adapter
npm run check:site-ui
npm run cards:check
```

Database verification additionally requires a local Supabase reset, pgTAP
RLS tests and database lint. A production build is reported separately from
focused TypeScript checks while the documented global typecheck waiver exists.
