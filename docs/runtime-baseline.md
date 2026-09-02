# Builder runtime baseline

Status: integrated AgentTurn-to-BuildJob join, fail-closed before canonical
preview, 2026-09-02.

The Builder now uses Sajtagent-owned product routes:

- `POST /api/siteagent/projects/default` opens one deterministic, owner-bound
  starter project and base revision;
- project/session routes open a Site-owned `AgentSessionV1`, turn POST streams
  `AgentEventV1`, and events GET resumes after the last verified sequence;
- no browser-callable build-job route exists. The AgentTurn route now injects
  the Site-owned BuildJob controller, ArtifactRead gate and version committer;
- Supabase SSR cookies and verified claims resolve the server principal;
- V1 exposes the user's input in a separate Chat card;
- replies, progress and fail-closed errors appear in the Sajtagent card, which
  is the product surface for the OpenClaw-backed agent;
- Build choices can be opened beside the conversation or folded down;
- the old `/api/engine/chats/stream` request and simulated HTML fallback no
  longer exist in production code.

Each deployment remains deliberately disconnected unless its server-only
runtime URL and signing key are configured and strict Runtime
health advertises both signed jobs and ArtifactReadV1. A missing or unhealthy
runtime and an unverified worker candidate end as `job.failed`. The browser
cannot convert that state into a preview or ready version.

The deterministic Site-owned candidate gate is implemented internally and documented in
[`candidate-acceptance-v1.md`](candidate-acceptance-v1.md). It verifies stable
receipt semantics, exact preview bytes and metadata, active revision, staged
Site preview health, and exposes one atomic success-commit seam. The product
join has a server-only ArtifactReadV1 adapter, while candidate acceptance,
staged Site preview health and the transactional version repository are
assembled behind the explicit dispatch guard documented in
[`build-job-server-join-v1.md`](build-job-server-join-v1.md). The repository
and owner-bound routes are documented in
[`site-version-preview-v1.md`](site-version-preview-v1.md). Repository checks
alone are not proof that a particular deployment has its migration, private
runtime configuration, or current end-to-end path healthy.

This build gate is subordinate to the mutating tool path. It does not define
the ordinary Chat-to-Sajtagent conversation protocol, and conversation alone
does not create a build job or version.

The product wording is user-to-Sajtagent; OpenClaw is Sajtagent's runtime, not a
second product persona. The network path remains browser -> SiteAgent
controller -> Sprite runtime -> OpenClaw. The browser never receives runtime
signing keys or calls OpenClaw directly.

## V1 surface boundary

The orphaned workflow-editor prototype and its generation, execution, GitHub,
memory, and workflow routes are not part of SiteAgent V1. They have been
removed together with their Drizzle schema and scripts. Site persistence uses
the server-only `pg.Pool` module and reviewed Supabase migrations.

Prompt dictation remains available only through the authenticated, same-origin
`POST /api/ai/transcribe` Site route. It accepts at most 20 MB and returns a
generic failure instead of provider details. The browser never calls the
transcription provider directly. `npm run check:v1-cleanup` locks these
boundaries and is run by CI.

## Client projection boundary

The browser now reduces each subordinate `BuildEventV1` stream with one pure,
sequence-aware state machine. Exact event replays are deduplicated. Changed
replays, mixed job IDs, sequence gaps, incomplete streams, and events after a
terminal event invalidate the candidate projection and clear its result.

`job.succeeded` is necessary but not sufficient for ready UI. Its version,
workspace revision, preview ref, and sitemap revision must also match the
owner-bound project state and versions read models. Reload restores Versioner,
Karta, and Preview from those read models. The preview iframe uses only the
authenticated Site route; inline `srcDoc` is not part of the product flow.

Chat uses one continuous Sajtagent `AgentSession`. The browser opens a
Site-owned session, POSTs strict `AgentTurnRequestV1`, consumes Site SSE and
resumes from its last verified global sequence. It never creates `BuildJobV1`:
that remains a subordinate server-owned mutation envelope minted only after an
exact `build.request` handoff in the same turn.

## Still unavailable

- production-durable revision backup/restore and a persistent Runtime replay
  journal beyond the current Sprite-local Git refs;
- prompt assist, publish, ZIP export, import, and save actions.

These controls are disabled or return failure. They do not report simulated
success. The authenticated preview route and sandboxed Builder iframe exist,
but they remain empty until a canonical version has been accepted and stored.

## Configuration boundary

Magic-link login uses only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Database writes require the separate
server-only Postgres connection and the reviewed migration in every target
environment.

The shared private artifact-byte protocol and Site adapter are implemented and
covered locally. Every release still requires the server-only environment,
strict healthy Runtime capability, applied Site persistence, and a fresh
end-to-end proof. The accepted end-to-end contract remains
[`first-vertical-slice.md`](first-vertical-slice.md).
