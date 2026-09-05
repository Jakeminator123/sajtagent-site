# Deterministic candidate acceptance V1

Status: Site-owned acceptance core, 2026-09-01.

This is the small gate between a non-authoritative `WorkerReportV1` candidate
and an authoritative SiteAgent version. It deliberately has one straight
path:

```text
WorkerReport candidate
  -> bind job and active base revision
  -> verify receipts and one preview artifact
  -> read exact bytes through an injected private artifact reader
  -> stage one Site-owned preview
  -> health-check the staged preview and its exact metadata
  -> atomically commit revision + version + BuildResult + job.succeeded
```

Any failed step ends as one explicit failure. A candidate, a Sprite reference,
or model text can never become product success by itself.

This gate belongs only to the mutating build-tool subsystem. It is not the
Chat-to-Sajtagent conversation protocol, and a normal Sajtagent reply does not
need a `BuildJobV1`, candidate, preview, or version. The Site controller invokes
this path only after typed product intent authorizes a workspace mutation.

## Stable acceptance rules

- `jobId` and `baseRevisionId` must match the issued `BuildJobV1` exactly.
- A candidate revision must use the strict Runtime projection form
  `revision:sha256:<64 lowercase hex>`. Site persists that exact accepted ID as
  the next `workspaceRevisionId`; it never substitutes a browser- or
  controller-minted revision ID.
- The base revision is checked as active both before artifact access and after
  preview health, immediately before the prepared candidate is returned.
- Reports outside the job lifetime, no-op candidates, duplicate changed paths,
  duplicate receipt IDs, and failed or cancelled receipts are rejected.
- A job with `checks.run` requires at least one passed `check` receipt. Display
  names such as `npm run check` are not shared protocol identifiers. An
  installation may inject additional exact required names without changing the
  frozen Builder contract.
- Exactly one `preview` artifact is required. It must declare `text/html` and a
  SHA-256 digest. A separate diff artifact never counts as preview evidence.
- One passed `preview` receipt must bind `evidenceRef` to that exact preview
  artifact reference.
- The private artifact reader must return the same opaque source reference,
  media type, digest, byte count, bounded portable path, and bytes. SiteAgent
  recomputes SHA-256 and verifies a UTF-8 HTML document itself.
- V1 prefers the runtime-generated `.siteagent-preview.html` bundle and keeps
  `dist/index.html`, `build/index.html`, and `index.html` as explicit legacy
  inputs. The default maximum remains 1 MiB shared with preview persistence.
  Both path and byte limits are explicit acceptance policy.
- Materialization returns a staged `preview:<UUID>` reference plus the same
  bounded content, digest, media type, and size. It is Site-owned but not yet a
  visible product version.
- Preview health must return HTTP 200 and the same reference and metadata.

## Atomic success boundary

Acceptance returns a prepared candidate only after all deterministic checks.
The controller then calls exactly one injected
`commitAcceptedCandidate(principal, job, prepared, expectedSequence)` method.
That method owns one transaction which must:

1. lock and revalidate the project, build job, owner, and expected sequence;
2. persist and activate the workspace revision and Site-owned preview;
3. create the immutable version and sitemap projection;
4. construct and persist `BuildResultV1`;
5. set the job to `succeeded`; and
6. append the terminal `job.succeeded` event.

After the canonical result is joined into a terminal `preview.ready` /
`turn.completed` sequence, the Site-owned agent session advances from the old
base to that exact accepted workspace revision in the same terminal-event
transaction. A second turn in the same open Builder therefore starts from the
accepted tree; the pre-build base becomes stale immediately.

There is no public or controller path that first creates a visible version and
then appends success separately. A thrown transaction or invalid returned event
stream is never reported as success. Staged preview artifacts may be reclaimed
independently when a transaction never commits.

## Injection boundaries

`DeterministicCandidateAcceptanceV1` depends only on:

- a current-revision guard;
- a private candidate-artifact reader; and
- a Site-owned staged preview store with a health check.

It contains no Sprite URL, local workspace path, runtime signing key, provider
credential, Supabase mutation, or browser-facing runtime call. The concrete
server-only ArtifactReadV1 adapter remains outside this deterministic core.

Focused verification lives in `scripts/verify-candidate-acceptance.mts` and is
part of `npm run check:build-jobs`.

The concrete route assembly is documented in
[`build-job-server-join-v1.md`](build-job-server-join-v1.md). It keeps runtime
dispatch disabled unless the separate runtime repository advertises the
ratified ArtifactReadV1 capability through strict health.
