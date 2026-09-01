# Build-job server join V1

Status: Site dependencies wired, runtime dispatch guarded, 2026-09-01.

The build-job route now assembles one Site-owned server dependency graph:

```text
PostgresBuildJobRepositoryV1
  -> active-revision guard
  -> DeterministicCandidateAcceptanceV1
  -> InlineSiteCandidatePreviewStoreV1
  -> PostgresSiteVersionRepositoryV1.commitAcceptedCandidate
```

The preview store copies the verified bytes into a staged server value, mints a
`preview:<UUID>` reference, rechecks UTF-8, HTML, SHA-256, size, CSP headers and
the 1 MiB boundary, and returns deterministic health. It does not create a
visible version. The Postgres version repository remains the only success
committer and writes revision, preview, version, result and `job.succeeded` in
one transaction.

## Dispatch capability gate

Dispatch requires both capabilities:

1. the configured signed runtime client; and
2. an explicitly injected, reviewed `CandidateArtifactReaderV1` which returns
   the exact candidate bytes.

The current shared runtime protocol documents only:

- `GET /health`; and
- signed `POST /v1/build-jobs` returning `WorkerReportV1`.

It does not document or implement artifact-byte retrieval. The report's opaque
artifact ref is evidence, not a URL. Therefore the production route explicitly
uses `RUNTIME_ARTIFACT_TRANSFER_UNAVAILABLE_V1`. The join sets runtime to `null`
before the controller can dispatch, records `runtime_unavailable`, and explains
that the artifact-byte protocol is missing. It never starts the configured
runtime, creates a staged preview, or reports success in this state.

No artifact URL, route, environment variable, workspace-ref parser, or health
flag is inferred. A future runtime change must first ratify and test the actual
private transfer protocol in both repositories, then replace the unavailable
capability with its server-only reader.

Focused verification lives in `scripts/verify-build-job-server-join.mts` and is
part of `npm run check:build-jobs`.
