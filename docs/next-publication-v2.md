# Next publication V2

Publication pins the exact current accepted job, source revision, Vercel deployment
identity and verified static files in one transaction. It never promotes an
unaccepted candidate, changes private preview protection, or needs GitHub export.
An existing publication stays pinned through later builds; a new explicit publish
is required. A stale publication request returns 409. Identical replay is stable.

## Public surface

`POST /api/siteagent/projects/:projectId/publish` accepts only
`{sourceRevisionId,jobId}`. Site authenticates the owner, checks origin and exact
accepted state, then writes an immutable output snapshot. Public hostname is a
server-derived tenant/project hash under `SITEAGENT_PUBLISHED_DOMAIN`.
`GET` on the same authenticated route reports configuration/publication status.

The public gateway never falls through to Site auth, APIs, assets or redirects.
It serves only the pinned static bundle. Root redirects to the build's original
Next basePath so generated asset URLs and routing remain valid. No runtime,
Supabase or Vercel credentials are forwarded. Service-worker installation is
denied. Public content is intentionally accessible without login; editing and
republishing always require its owner.

## Required deployment configuration

- Apply D's migration and `20260913203728_next_publications_v2.sql` after review.
- Configure `SITEAGENT_SITE_ORIGIN` as the trusted HTTPS product origin.
- Configure separate `SITEAGENT_NEXT_PREVIEW_DOMAIN` and
  `SITEAGENT_PUBLISHED_DOMAIN` zones. They cannot be equal/nested or contain the
  product origin. Use project wildcard domains routed to this trusted application;
  never deploy generated scripts as control-plane server code.
- Complete D's protected artifact project, worker and session-access configuration.
- Keep Next disabled until the two-account/worker/preview checks succeed.

Publishing performs an HTTPS HEAD probe of the exact project public hostname and
requires the trusted gateway's health response before committing. Missing DNS,
deployment/configuration, accepted revision or auth fails closed. Do not call a
successful HTTP write a verified browser deployment; run the E harness and open
the returned public URL to verify final routing.

## Evidence and limits

`npm run check:next-publication` runs host/path/static-response tests, publication
repository tests and focused TypeScript. Repository tests use a mock SQL pool;
they verify query intent/bindings/rollback and do not prove live PostgreSQL
concurrency. CI also applies all migrations from zero. An independent subagent
review found and corrected extra client payload fields and hostname replay drift.

This first profile is genuine Next static export with client JavaScript, not
SSR, generated server actions or API functions. The Builder's opt-in Next panel
has its own prompt/import/source/open/cancel/publish controls. Legacy V1 chat and
HTML preview remain the fallback; no V2 readiness is inferred from V1 success.
