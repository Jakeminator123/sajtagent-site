# AgentSession V1 server

Status: local Site-owned implementation. The migration is committed source, not
proof that any Supabase environment has been changed.

## Browser routes

- `POST /api/siteagent/projects/{projectId}/sessions` opens or reuses the one
  active Site session for an owned project. The response is `AgentSessionV1`.
- `POST /api/siteagent/sessions/{sessionId}/turns` accepts only the strict
  browser-safe `AgentTurnRequestV1`. A successfully persisted turn returns
  `text/event-stream` with one raw `AgentEventV1` in each `data:` field.
- `GET /api/siteagent/sessions/{sessionId}/events?afterSequence=N` resumes the
  persisted session-global sequence. A cursor after the current sequence is a
  conflict, not an empty success.

Mutating routes require same-origin requests and an authenticated, owner-bound
principal. All responses are private and non-cacheable.

## Authority and storage

`agent_sessions`, `agent_turns` and `agent_events` contain browser-safe data and
are owner-readable through RLS. `agent_turn_policies` has no browser-role grant.
All four tables reject browser writes. A private Postgres trigger atomically
advances `agent_sessions.last_sequence` and rejects every gap or replay.

The database also enforces one active session per project, one running turn per
session, one use of an idempotency key per session and globally unique event
IDs. The repository repeats these checks inside transactions. Each
non-terminal suffix is validated against the persisted turn prefix before it
is committed; the terminal suffix is validated against the complete turn
before closure.

Without a build coordinator, the Site-minted policy remains answer-only with
`maxToolCalls: 0`. The product route injects the coordinator and may instead
authorize exactly `conversation.respond`, one `build.request`, one singleton
mutation intent and `maxToolCalls: 1`, bound to the current project and base
revision. The browser cannot add a tool, capability, intent type or job ID
because its request schema is strict and the policy is created only on the
server.

## Runtime boundary

The runtime client implements the ratified private `POST /v1/agent-turns`
touchdown. It sends the strict JSON body `{ schemaVersion, session, turn,
policy, baseSequence }` and signs the exact UTF-8 bytes with the shared
`siteagent-runtime-v1` HMAC format. HTTP is accepted only on loopback; every
non-loopback endpoint must use HTTPS.

Before dispatch, Site requires `/health` to advertise AgentSession contract 1,
SSE transport, enabled streaming and either exactly `conversation.respond` or
the ratified ordered pair `conversation.respond`, `build.request`.
`artifactReadEnabled` may be false or true because the conversation ingress
validates its own capability independently from the subordinate build path.
The turn response must be non-cacheable
`text/event-stream; charset=utf-8`. Site parses the Runtime body incrementally,
verifies every `id`, event name and full `AgentEventV1`, the 32 KiB frame /
4,096 event / 4 MiB stream bounds, consecutive session-global sequence, first
`turn.accepted` and policy binding. Each verified non-terminal event is
persisted before it is forwarded on the same browser response. A terminal
event is held until Runtime closes cleanly, then complete-turn validation and
terminal persistence happen before it is forwarded. The sole non-terminal
exception must end at one open `tool.started` for `build.request`, with one
allowed mutation intent and no message, question, completed tool, build or
preview. Runtime-provided status and tool labels are replaced with a small
Site-owned vocabulary before persistence. Explicit analysis/reasoning markup
in a message delta fails closed, and runtime failure text is replaced with a
bounded generic product message.

Runtime mints the accepted event at `baseSequence + 1`; Site validates and
persists that incoming event rather than sending an accepted prefix to the
private POST. For the exact build handoff, Site derives the typed intent from
the original turn and singleton policy, mints and runs the BuildJob, and
appends `build.started` as soon as the real BuildJob record exists. Completion,
preview and terminal events are appended only from the actual coordinator
result; canonical acceptance adds `tool.completed`, `preview.ready`, one
deterministic user-facing completion message and `turn.completed:built`. Site
alone owns durable sequence and browser resume. Until both
`SITEAGENT_RUNTIME_URL` and server-only `SITEAGENT_RUNTIME_SIGNING_KEY` are
configured, a valid browser POST locally persists and streams exactly
`turn.accepted` followed by `turn.failed`; it never fabricates a model answer,
preview or version.

## Verification

```powershell
npm run check:agent-session
npm run check:agent-session-server
npx eslint "lib/siteagent/server/agent-session-*.ts" `
  "lib/siteagent/server/postgres-agent-session-repository.ts" `
  "app/api/siteagent/projects/[projectId]/sessions/route.ts" `
  "app/api/siteagent/sessions/[sessionId]/turns/route.ts" `
  "app/api/siteagent/sessions/[sessionId]/events/route.ts" `
  "scripts/verify-agent-session-server.mts"
npx supabase db reset
npx supabase test db supabase/tests/agent_sessions_rls_test.sql --local
```

The two Supabase commands require Docker Desktop or Podman. No linked-project
or cloud database command is part of this checkpoint.
