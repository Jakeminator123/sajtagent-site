# Build-job server join V1

Status: ArtifactReadV1 adapter wired, runtime dispatch health-gated, 2026-09-01.

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

Dispatch requires all of these server-side facts:

1. `SITEAGENT_RUNTIME_URL` and the non-public signing key are configured as a
   pair, with an HTTPS or loopback HTTP endpoint and a key of at least 32
   characters;
2. strict, non-cacheable `GET /health` advertises the ready signed-job runtime,
   `artifactReadContractVersion: 1` and `artifactReadEnabled: true`; and
3. the resulting server-only `CandidateArtifactReaderV1` is injected into the
   acceptance core.

The mirrored Runtime contract now documents:

- `GET /health`; and
- signed `POST /v1/build-jobs` returning `WorkerReportV1`; and
- signed `POST /v1/artifacts/read` returning exact candidate bytes.

`SignedRuntimeArtifactReaderV1` signs the exact compact JSON body with the same
canonical HMAC payload as build jobs. It disables redirects, owns bounded
health/read timeouts, caps the request at 32 KiB and the raw response at
1,572,864 bytes, and independently validates strict JSON, the complete
binding, ref, path, media type, decoded size, 1 MiB content limit, SHA-256,
fatal UTF-8 and an HTML document marker. Both health and read responses must be
private JSON with `cache-control: no-store`; the reader is never imported by a
client surface.

The opaque report ref remains evidence, not a URL or Site-parsed workspace
path. When configuration is absent, health is unavailable, the capability is
disabled or its exact version/shape drifts, the route injects
`RUNTIME_ARTIFACT_CAPABILITY_UNAVAILABLE_V1`. The join sets runtime to `null`
before the controller can dispatch, so there are zero build-job dispatch calls
and no staged preview or success. The health probe is the read-only call that
establishes the unavailable capability.

Focused contract and adapter verification lives in
`scripts/verify-artifact-read-contract.mts` and
`scripts/verify-runtime-artifact-reader.mts`; the route/join regression remains
in `scripts/verify-build-job-server-join.mts`. They are part of `npm run check`.
