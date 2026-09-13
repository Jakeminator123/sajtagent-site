# SiteAgent contracts

This directory is an intentionally mirrored snapshot shared by
`sajtagent-site` and `sajtagent-sprites`. The products remain separate Git
repositories and do not gain a live cross-repo package dependency.

## Conversation layer

`agent-session-v1.ts` is the primary SiteAgent/OpenClaw boundary:

1. `AgentSessionV1`: Site-owned product session. It is never an OpenClaw key.
2. `AgentTurnRequestV1`: strict browser-safe message and selected UI context.
3. `AgentTurnPolicyV1`: short-lived server-owned authority and budgets.
4. `AgentEventV1`: sanitized, replayable conversation, tool and build events.

The browser cannot select runtime tools, mutation policy, tenant binding or
credentials. OpenClaw `ask_user` secret fields are deliberately absent from
V1. A separate credential-input flow is required before they can be exposed.

## Build subsystem

`builder-v1.ts` is used only when a turn is authorized to mutate a site:

1. `BuilderIntentV1`: untrusted browser intent without runtime tool names.
2. `BuildJobV1`: server-authorized job and semantic execution policy.
3. `WorkerReportV1`: non-authoritative normalized upstream run evidence.
4. `BuildResultV1`: product-controller verified and persisted result.
5. `BuildEventV1`: replayable browser event with strict sequence ordering.

`BuildJobV1` is not the chat protocol. It is the exact Site-minted mutation
envelope for one subordinate build. OpenClaw session keys, sandbox, MCP and
tool-policy configuration remain private adapter details.

## Next-preview V2 vs HTML-preview V1

V1 stays live. HTML preview continues through `ArtifactReadV1` and
`.siteagent-preview.html` until both `sajtagent-site` and `sajtagent-sprites`
enforce V2. Adding V2 does not change V1 behavior.

`deployment-v2.ts` and `preview-access-v2.ts` are the smallest Next-preview
surface:

1. `DeploymentOwnerV2`: tenant, project and principal that own a deployment.
2. `PreviewAccessRequirementV2`: `owner_authenticated` only. Anonymous and
   other principals evaluate to deny.
3. `DeploymentSourceBindingV2`: exact `sourceRevisionId` plus `jobId`.
4. `NextPreviewDeploymentV2`: `building` / `failed` / `accepted`, with a sticky
   `acceptedRevision` so a later failed or building wave cannot replace an
   accepted revision. The current job wins: a failed `jobId` is terminal,
   `sourceRevisionId` is locked against the previous binding, and an older
   job cannot overwrite a newer current job. Retry requires a new `jobId`.

Site can start against `contracts/fixtures/next-preview-v2.fixtures.json`
without a worker. Do not import Site or Sprite runtime modules from these
files.

## Verification

```powershell
npm run check:contracts
npm run check:agent-session
```

The verifiers check positive and negative fixtures, browser-safe projections,
strict terminal ordering and the session-global event sequence. Resume batches
are sequence-validated separately; lifecycle validation uses the persisted
history, never a context-free suffix. Both repositories must print matching
fixture digests before either side changes a shared contract.

Change the source and fixtures in both repositories in one coordinated delivery.
Do not treat one repository's newer contract as silently backward compatible.
