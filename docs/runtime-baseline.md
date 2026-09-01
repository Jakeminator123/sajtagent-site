# Builder runtime baseline

Status: local controller path, fail-closed before preview, 2026-09-01.

The Builder now uses Sajtagent-owned product routes:

- `POST /api/siteagent/projects/default` opens one deterministic, owner-bound
  starter project and base revision;
- project/session routes open a Site-owned `AgentSessionV1`, turn POST streams
  `AgentEventV1`, and events GET resumes after the last verified sequence;
- `POST /api/siteagent/build-jobs` remains a server-side mutation boundary. It
  is not called by Chat or any browser adapter;
- Supabase SSR cookies and verified claims resolve the server principal;
- V1 exposes the user's input in a separate Chat card;
- replies, progress and fail-closed errors appear in the Sajtagent card, which
  is the product surface for the OpenClaw-backed agent;
- Build choices can be opened beside the conversation or folded down;
- the old `/api/engine/chats/stream` request and simulated HTML fallback no
  longer exist in production code.

The current local runtime remains deliberately disconnected. A missing
runtime or an unverified worker candidate ends as `job.failed`. The browser
cannot convert that state into a preview or ready version.

The deterministic Site-owned candidate gate is implemented and documented in
[`candidate-acceptance-v1.md`](candidate-acceptance-v1.md). It verifies stable
receipt semantics, exact preview bytes and metadata, active revision, staged
Site preview health, and exposes one atomic success-commit seam. The product
route still fails closed until private artifact transfer, candidate acceptance
is available. Candidate acceptance, staged Site preview health and the
transactional version repository are now assembled behind the explicit
dispatch guard documented in
[`build-job-server-join-v1.md`](build-job-server-join-v1.md). The local
repository and owner-bound routes exist and are documented in
[`site-version-preview-v1.md`](site-version-preview-v1.md); they are not proof
that the migration has been applied or the controller join is live.

This build gate is subordinate to the mutating tool path. It does not define
the ordinary Chat-to-Sajtagent conversation protocol, and conversation alone
does not create a build job or version.

The product wording is user-to-Sajtagent; OpenClaw is Sajtagent's runtime, not a
second product persona. The network path remains browser -> SiteAgent
controller -> Sprite runtime -> OpenClaw. The browser never receives runtime
signing keys or calls OpenClaw directly.

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

Chat now uses one continuous Sajtagent `AgentSession`. The browser opens a
Site-owned session, POSTs strict `AgentTurnRequestV1`, consumes Site SSE and
resumes from its last verified global sequence. It never creates `BuildJobV1`:
that remains a subordinate server-owned mutation envelope when Sajtagent
invokes an approved build tool.

## Still unavailable

- the ratified runtime artifact-byte transfer needed to open dispatch;
- applied database migration and live use of the local version/preview routes;
- prompt assist, publish, ZIP export, import, and save actions.

These controls are disabled or return failure. They do not report simulated
success. A real `job.succeeded` is also held back from the current UI until an
authenticated preview route exists.

## Configuration boundary

Magic-link login uses only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Database writes still require the
separate server-only Postgres connection and the reviewed local migration.
No cloud migration is applied by this checkpoint.

The next implementation target is the shared private artifact-byte protocol;
the Site-owned acceptance, persistence and authenticated preview boundaries are
already wired behind that fail-closed capability. The accepted end-to-end contract remains
[`first-vertical-slice.md`](first-vertical-slice.md).
