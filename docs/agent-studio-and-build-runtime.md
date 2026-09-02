# Agent Studio and local build runtime

Status: authenticated Site proxy with compile and profile activation, 2026-09-02.

## What Jakob can use now

`/agent-studio` is a browser editor for an `AgentProfileV1`. It edits identity,
soul, operating instructions, requested capabilities, command approval mode,
exact MCP tool IDs, network and package allowlists, memory policy, and budgets.

The draft is versioned in browser storage under
`siteagent.agent-profile-v1`. Export creates a portable bundle containing the
profile, effective policy, `SOUL.md`, `AGENTS.md`,
`profiles/openclaw.yml`, and structured host configuration. It never contains
API keys, database credentials, or Sprite tokens.

Browser storage is a design surface, not product authorization. The runtime
intersects requested rights with its server-owned ceiling. An MCP tool ID is
effective only when the runtime registry also exposes that exact tool.

## Run both local processes

From `sajtagent-site`:

```powershell
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3147
```

From the separate `sajtagent-sprites` repository:

```powershell
npm ci
npm run dev:runtime
```

Configure `SITEAGENT_RUNTIME_URL` and `SITEAGENT_RUNTIME_SIGNING_KEY` only on
the Site server. Open `http://127.0.0.1:3147/agent-studio`, select **Export**,
then use **Prova profil** or **Aktivera i OpenClaw**. The browser calls
authenticated same-origin Site routes; Site signs the private Runtime requests
and returns only narrow compile or activation projections. The Runtime
materializes the activated bundle in its OpenClaw workspace and returns a
receipt with revision, activation ID, bundle SHA-256 and `next-run` semantics.
Profile compilation and activation do not start a build job or create a cloud
Sprite.

Activation first saves the current browser draft. A changed draft receives a
new revision and `updatedAt`; unchanged content reuses the already stored draft
revision. Site generates activation and idempotency IDs server-side. The UI
sends `expectedActiveRevision` only while it holds a verified activation
receipt, and discards that receipt after a revision conflict.

## Product build boundary

There is no browser-callable build-job route. The strict BuildJob controller,
server-resolved principal checks, candidate acceptance and signed runtime
adapter remain internal seams. The AgentTurn route now authorizes at most one
mutation intent and joins an exact `build.request` handoff to those seams.
Local header identity remains disabled unless an explicit development-only
loopback mode is selected.

The runtime worker report is non-authoritative. A candidate deliberately ends
as a failure until the implemented deterministic acceptance core, private
artifact reader, preview health, and atomic workspace revision/version commit
have all been injected into the internal join together. The acceptance rules
are documented in
[`candidate-acceptance-v1.md`](candidate-acceptance-v1.md).
Missing persistence, missing runtime, transport errors, or an unconnected
OpenClaw Gateway never produce a preview or successful version. Runtime may
finish a normal conversation without using its single authorized tool call;
only the exact handoff can dispatch the join.

## Database boundary

The migration under `supabase/migrations/` creates Sajtagent-owned project,
workspace revision, build job, and build event tables in the independent
Sajtagent Supabase project. Authenticated users receive owner-scoped read-only
RLS; writes remain server-side. The migration and pgTAP test are generated and
tracked locally but are not linked or applied to a cloud project by this
checkpoint.

## Next connection checkpoint

1. Persist approved AgentProfile revisions server-side and select one per
   project/build job.
2. Apply the reviewed migration to the confirmed Sajtagent project only after
   explicit cloud scope, then verify RLS and grants there.
3. Approve Sprite organization, naming, count, expiry, spend, cleanup, network,
   package, and preview-exposure policy.
4. Connect the runtime adapter to an actual OpenClaw Gateway run.
5. Verify the candidate, persist an immutable workspace revision, then and only
   then create preview/version/sitemap read models.
