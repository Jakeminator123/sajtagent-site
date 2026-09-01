# Agent Studio and local build runtime

Status: local, fail-closed vertical slice, 2026-09-01.

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

Open `http://127.0.0.1:3147/agent-studio`, select **Export**, and use
**Kontrollera** or **Prova profil**. Profile compilation does not start a build
job or create a cloud Sprite.

## Product build boundary

`POST /api/siteagent/build-jobs` accepts one strict, idempotent typed intent.
It requires a server-resolved principal, verifies ownership of the project and
base revision, persists an accepted event, and invokes the signed runtime
adapter only after persistence. Supabase SSR validates the session claims and
derives a personal tenant server-side; anonymous or invalid claims return 401.
Local header identity is disabled unless an explicit development-only loopback
mode is selected.

The runtime worker report is non-authoritative. A candidate deliberately ends
as `verification_failed` until acceptance checks, preview health, immutable
workspace revision persistence, and version projection have been connected.
Missing persistence, missing runtime, transport errors, or an unconnected
OpenClaw Gateway never produce a preview or successful version.

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
