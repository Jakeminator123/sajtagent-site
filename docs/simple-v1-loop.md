# V1: one continuous agent, one verified truth

Status: Site mutation join implemented and focused-tested locally. Live use is
blocked until the Runtime tool is registered and the reviewed Site migrations
are applied.

## The simple rule

The chat card talks to one continuous SiteAgent. A normal answer stays a normal
answer. The browser cannot start a build. A site mutation becomes one bounded
build only when the current authenticated turn yields the exact
Site-authorized `build.request` handoff. Only deterministic SiteAgent checks
may turn a worker candidate into a version.

```text
Chat -> Site session -> private OpenClaw session -> answer / question
                                              \-> typed build.request handoff
                                                  -> BuildJobV1 -> candidate
                                                  -> acceptance -> version + preview
```

There is no second agent loop, browser-to-Sprite request or simulated success.
`BuildJobV1` is a subordinate mutation envelope, never the chat protocol. See
`docs/agent-session-v1.md` for the session, turn, event and resume contract.

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
| Chat and cards | Browser UI | Send browser-safe turns and project canonical events. |
| Product controller | `sajtagent-site` | Auth, session binding, idempotency, policy, event sequence, acceptance and terminal outcome. |
| Runtime client | `sajtagent-site` | Map the Site session privately and stream normalized runtime events. |
| Agent runtime | `sajtagent-sprites` | OpenClaw session, approved tools and non-authoritative reports. |
| Product persistence | `sajtagent-site` | Atomically persist accepted revision, version, preview and event. |
| Preview route | `sajtagent-site` | Resolve an opaque owner-bound reference and return isolated HTML. |

Sajtmaskin is useful evidence for one principle: readiness must never stay
green when product verification is red. Its branches, database, auth,
deployment, runtime and orchestration are not dependencies of this loop.

## Request and acceptance

1. The browser opens its authenticated starter project and Site-owned session.
2. Chat sends an `AgentTurnRequestV1`; Site binds user, tenant, project, base
   revision and idempotency and creates `AgentTurnPolicyV1`.
3. Site may authorize exactly `conversation.respond` plus one `build.request`
   for the current project, base revision and singleton mutation intent. The
   browser cannot add capabilities, intent types or job identifiers.
4. Runtime may either finish a normal answer/question turn or close its private
   SSE stream at exactly one open `build.request`. Site revalidates that
   handoff, derives `BuilderIntentV1` from the signed turn and policy, and then
   sends one HMAC-signed `BuildJobV1`.
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

`SITEAGENT_RUNTIME_URL` and `SITEAGENT_RUNTIME_SIGNING_KEY` must always be
configured server-side as a pair. If either is absent, Site stays disconnected
and fails the turn without fabricating a result.

## Verification

The executable checks are intentionally split by responsibility:

```text
npm run check:contracts
npm run check:agent-session-ui
npm run check:build-jobs
npm run check:builder-adapter
npm run check:site-ui
npm run cards:check
```

Database verification additionally requires a local Supabase reset, pgTAP
RLS tests and database lint. A production build is reported separately from
focused TypeScript checks while the documented global typecheck waiver exists.
