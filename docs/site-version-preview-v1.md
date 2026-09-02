# Site-owned version and preview V1

Status: locally joined to AgentTurn and guarded ArtifactRead, not cloud-applied,
2026-09-02.

## Purpose

This is the deliberately small Site side of a successful build. The runtime
may return a worker candidate, but only the Site controller can accept it and
call `commitAcceptedCandidate`. One database transaction then creates:

1. one immutable canonical workspace revision;
2. one bounded, Site-owned HTML preview artifact;
3. one canonical project version; and
4. the project's new active revision pointer;
5. the authoritative `BuildResultV1`; and
6. the final, exactly sequenced `job.succeeded` event and job status.

The transaction returns only Site-minted opaque identifiers. A runtime URL,
Sprite workspace reference, provider token, signing key, or raw worker artifact
reference is never stored in these version/preview rows or returned to the
browser.

## Join contract

The Site-internal repository boundary is:

```text
commitAcceptedCandidate(principal, job, {
  report,
  preview: { state: "staged", previewRef, mediaType, sha256, sizeBytes, content },
  verifiedAt,
  receipts
}, expectedSequence) -> StoredBuildJobV1
```

The acceptance layer must first validate the shared `BuildJobV1` and candidate
`WorkerReportV1`, fetch the runtime artifact server-to-server, verify receipts,
bytes, media type, digest, and preview health, and then pass the verified bytes
to this repository. The Site-minted staged ref has the form `preview:<UUID>`;
the transaction activates exactly that ref rather than translating any runtime
ref. Persistence repeats the deterministic media type, size,
digest, receipt-status, job, base-revision, tenant, owner, and project checks.
Public receipts retain deterministic status and timestamps but drop both
free-text summaries and runtime evidence refs.
This repository fetches only the ratified private preview response through its
server-only ArtifactReadV1 adapter; persistence still does not know Runtime
ingress or parse Sprite refs. The AgentTurn server join injects this repository
as the atomic success committer and enables BuildJob dispatch only after strict Runtime
health proves the reviewed artifact-byte reader is available. See
[`build-job-server-join-v1.md`](build-job-server-join-v1.md).
No revision, version, preview, active pointer, success result, or terminal event
becomes visible unless all six writes commit. A failure rolls the entire unit
back. Materialized bytes before this call are staging data, not a product
version, and remain eligible for cleanup.

Retries for the same accepted job return the already-created terminal record only when
the project, base revision, run, digest, and size still match. A changed replay
fails closed. The project row is locked while the next version number and active
revision are changed, so two accepted builds cannot silently overwrite each
other.

## Data model

`public.site_preview_artifacts` contains exactly one inline `text/html` document
per accepted revision and build job. V1 is capped at 1 MiB, stores the exact
UTF-8 byte count and lowercase SHA-256, and requires the stored byte count to
match `octet_length(html_content)`. Inline content containing an internal
`sprite-worktree:` reference is rejected. A future Site-owned object-storage
adapter can replace inline bytes in a new reviewed migration; V1 does not accept
an arbitrary storage or runtime ref.

`public.site_versions` is the canonical, immutable version list. Composite
foreign keys bind version, preview, workspace revision, build job, project,
tenant, and owner. The version stores sanitized verification receipts without
runtime evidence refs.

Both public tables have RLS enabled. `site_versions` gives `authenticated`
explicit owner-bound `SELECT`, restricted by
`(select auth.uid()) = owner_user_id`. Preview artifacts give neither `anon` nor
`authenticated` a direct table grant: raw HTML is available only through the
authenticated Site route so its sandbox and response headers cannot be skipped.
Privileged server reads and writes use the existing server-only database connection.
Negative pgTAP cases cover anonymous access, direct authenticated writes,
cross-tenant reads, cross-bound foreign keys, media type, and byte integrity.

## Read routes

All routes require the existing verified Site principal, query by tenant and
owner, are dynamic, and respond with `private, no-store` caching:

- `GET /api/siteagent/projects/:projectId/state` returns the active revision and
  active canonical version, if one exists.
- `GET /api/siteagent/projects/:projectId/versions` returns at most the newest
  50 canonical versions.
- `GET /api/siteagent/previews/:previewRef` resolves the opaque ref for the
  current owner, rechecks bytes and SHA-256, and returns HTML.

Missing and cross-tenant preview refs are indistinguishable (`404`). Corrupt or
unverifiable stored bytes return a generic `503` and are never rendered.

The HTML response uses `Content-Security-Policy: sandbox` with scripts,
connections, objects, forms, base URLs, and workers disabled. It also sets
`frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, `nosniff`, same-origin
resource policy, no referrer, a restrictive permissions policy, and no-store
headers. The Builder constructs the route from the opaque `BuildResultV1`
`previewRef`; it must never interpret that value as a runtime URL.

## Local verification

No hosted Supabase migration is part of this checkpoint. The intended local
checks are:

```powershell
npm run check:version-read-model
npx supabase db reset --local
npx supabase test db --local
npx supabase db lint --local
npm run lint
npm run build
```

The focused TypeScript/runtime check is separate from the repository's known
global build-time typecheck waiver.
