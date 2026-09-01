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

The product wording is user-to-Sajtagent; OpenClaw is Sajtagent's runtime, not a
second product persona. The network path remains browser -> SiteAgent
controller -> Sprite runtime -> OpenClaw. The browser never receives runtime
signing keys or calls OpenClaw directly.

## Still unavailable

- authenticated preview serving and canonical success projection;
- acceptance checks and immutable revision/version persistence for candidates;
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
