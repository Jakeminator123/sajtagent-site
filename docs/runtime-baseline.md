# Builder runtime baseline

Status: verified prototype gaps, 2026-08-27.

The Builder UI is not connected to the future Sajtagent runtime yet. Current
code in `lib/siteagent/adapter.ts` contains these explicit prototype paths:

- `streamChat` calls the Sajtmaskin-era `/api/engine/chats/stream`, which is not
  implemented in this repository, and converts any non-abort failure into a
  simulated HTML preview;
- `promptAssist` converts any failure into invented generic marketing guidance;
- `publish` waits and returns `{ ok: true }` without a deployment;
- `downloadZip` only writes a console message.

The `/siteagent` to `/builder` compatibility redirect is real and is defined in
`next.config.mjs`. The prototype operations above are not real integrations.

## Rules until replacement

- A simulated result must be visibly labeled as demo data and must not create a
  ready version, deployment success, or other durable success state.
- Production configuration must fail closed when its real backend is missing.
- Do not add the missing Sajtmaskin route merely to preserve its old name or
  request shape.
- Replace one operation end to end and remove its fallback in the same change.
- Keep UI event names only when they fit a new typed Sajtagent contract.

## First replacement target

Replace chat/build first: one validated SiteAgent request, one server-owned job,
one bounded call into `sajtagent-sprites`, and one real preview result with
failure evidence. Publish and export stay visibly unavailable until their own
real paths exist.

This file can be removed when no production code path reports simulated or
stubbed work as successful and the corresponding end-to-end checks exist.
