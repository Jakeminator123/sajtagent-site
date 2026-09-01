# Builder runtime baseline

Status: local controller path, fail-closed before preview, 2026-09-01.

The Builder now uses Sajtagent-owned product routes:

- `POST /api/siteagent/projects/default` opens one deterministic, owner-bound
  starter project and base revision;
- `POST /api/siteagent/build-jobs` validates `BuilderIntentV1`, persists the
  job, and returns ordered `BuildEventV1` records;
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
and the transactional version repository are wired together. The local
repository and owner-bound routes now exist and are documented in
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

Chat is ultimately one continuous Sajtagent `AgentSession`. The current
`submitBuildIntent` call is an isolated compatibility seam while the shared
AgentSession/AgentEvent SSE contract is ratified. It must not be treated as a
final one-message/one-BuildJob chat architecture: `BuildJobV1` remains a
subordinate mutation envelope when Sajtagent invokes an approved build tool.

## Still unavailable

- the controller dependency join that turns an accepted candidate into
  canonical success;
- runtime artifact transfer into Site-owned preview bytes;
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

The next implementation target is the server-to-server runtime join followed
by deterministic candidate verification, canonical version persistence, and
authenticated preview health. The accepted end-to-end contract remains
[`first-vertical-slice.md`](first-vertical-slice.md).
