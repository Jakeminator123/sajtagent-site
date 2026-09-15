# V2 configuration preflight before DNS

This CLI completes the repeatable configuration/permission audit without enabling
V2, creating deployments, running a build, writing SQL data or changing DNS.
It is an operator script, never a public admin endpoint. It complements
[live rollout](v2-live-rollout-2026-09-14.md), the
[2026-09-15 live E2E findings](v2-live-rollout-2026-09-15.md) and
[two-account E2E](v2-e2e-smoke.md).

## Approved resources and configuration

The secret-free [template](../config/v2-rollout.env.example) pins Sajtagent's
current domain choices and artifact project. It leaves secrets empty and V2 off.
Both wildcard zones route to the Site gateway; the artifact project stays private.

| Resource | Value |
| --- | --- |
| Site origin | `https://sajtagent.se` (bytt 2026-09-15; `www` och `sajtagent-site.vercel.app` omdirigerar dit) |
| Private preview zone | `preview.sajtagent.se` |
| Public publication zone | `sites.sajtagent.se` |
| Vercel team | `team_j7KE5zKTm5rdg7zfWzOZhJ89` |
| Site project | `prj_hMs2VN2gnj9YU42ZDcEv9U8fOpKf` |
| Artifact project | `prj_Fig75Ev2mLddBP1BKj8ebcYkw0zz` |
| Supabase project | `ywoltuegeemqznbcgokg` |

For Vercel, keep runtime signing key, Vercel token/bypass and database URLs in
server-only **Sensitive** variables in the intended Site environment. Project IDs,
domains and the Supabase publishable key are public configuration. Sprite admin
tokens belong exclusively on the controller. This script inspects an environment
snapshot; aside from the artifact Toolbar check it cannot infer Vercel variable
types/targets or whether a running deployment has picked up the latest
settings. Verify remaining metadata separately.

## Run without DNS

Install the repository's pinned dependencies (`npm ci`, Node 24/npm 11). Then
copy the template to the ignored local file and populate it through a secure
local editor; never paste credentials into command arguments or PRs.

PowerShell 7 on Windows:

```powershell
Copy-Item config/v2-rollout.env.example .env.rollout.local
node --env-file=.env.rollout.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/v2-rollout-preflight.mjs
$LASTEXITCODE
```

Bash on Linux:

```bash
cp config/v2-rollout.env.example .env.rollout.local
node --env-file=.env.rollout.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/v2-rollout-preflight.mjs
```

Node's existing process environment takes precedence over `--env-file`. Run in
the intended deployment context or a clean process with the exact Site settings.
When the environment is already loaded, `npm run preflight:v2` is equivalent.
The script does not auto-load `.env.local` or fetch/decrypt cloud secrets.

The default has no network calls. It reuses product origin/domain validators and
the app's DB environment precedence (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`,
`STORAGE_POSTGRES_URL`, `STORAGE_POSTGRES_URL_NON_POOLING`, `DATABASE_URL`). It
checks key presence, signer length, unsafe public aliases, Sprite token placement,
Sajtagent project scope and domain separation even with `SITEAGENT_NEXT_ENABLED=false`.
It does not validate credentials merely because a nonempty value exists.

## Optional read-only live checks

The following command is identical in PowerShell and Bash:

```text
node --env-file=.env.rollout.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/v2-rollout-preflight.mjs --live-vercel --live-db
```

- `--live-vercel` performs one GET to Vercel's fixed artifact project/team with an
  eight-second deadline and redirects refused. The supplied token needs project
  read access to this team. Response identity must match before protection is
  examined. It shares the production deployer's predicate: SSO protection must
  use `all`, `preview` or `all_except_custom_domains`. Password-only protection
  and unrecognized modes are blocked because the deployer rejects them. A
  second GET lists artifact environment metadata and requires one
  `VERCEL_PREVIEW_FEEDBACK_ENABLED=0` record covering production, preview and
  development. Split records, any other value, or a missing/partial setting
  fail the check. The response, credentials and environment values are never
  printed.
- `--live-db` imports the **actual `lib/db/client.ts` Pool** in a short-lived child
  process, preserving its connection selection and SSL settings. A narrow Node
  resolver handles its existing extensionless TypeScript import. Only the approved
  Supabase host/project username can be contacted; query-string host/user overrides
  are rejected. Fixed read-only SQL checks the V2 tables, worker column, server
  DML rights with effective RLS access, `auth.sessions` column privileges and
  effective access, and closed browser access to both V2 tables and session
  columns (including accidental column-only grants). The V2 server tables intentionally
  have no client policies: a bare DML grant to a role still subject to RLS is not
  sufficient. The diagnostic requires existing effective server access; it never
  grants a role BYPASSRLS or suggests opening client policies. It does
  not select user rows. Query timeout is five seconds; the parent kills the child
  after fifteen seconds and suppresses all raw DB logs/errors.
- A recognized unsafe setting prevents both live checks before sending credentials.

An inspection using locally copied credentials proves only that snapshot. Record
deployment SHA/environment and independently confirm parity before calling it an
application deployment check. Do not substitute the MCP's privileged DB role.
No grant or migration is automatically applied. Missing permissions are blockers
to investigate, not instructions to grant browser roles access to session tables.

## Report and release boundary

The JSON report includes fixed diagnostic codes/messages and no configured values.

| Exit | Meaning |
| --- | --- |
| `0` | Requested preparation checks passed; omitted live checks stay `pending`. |
| `1` | Unsafe configuration, wrong resource, invalid arguments or internal error. |
| `2` | Required settings or requested live evidence are missing/unavailable. |

Every report says `liveE2eVerified: false`, including exit 0. Still required:
actual worker Next install/build, process death at timeout/cancel, reopening after
restart, DNS/HTTPS and project gateway routing, partitioned preview cookies in a
real browser, two-account isolation, anonymous denial of original artifact URLs,
exact deployed bytes and publication of the accepted revision. A protected project
setting alone does not prove a particular deployment's anonymous denial or a valid
bypass token. Use the [E2E harness](v2-e2e-smoke.md) after DNS is ready.

`npm run check:v2-rollout` runs negative configuration cases, wrong-project and
credential-redaction regressions, CLI exit checks, and mocked API/DB-result checks.
CI runs this through `npm run check`. These tests do not prove live permissions.
Local verification was Linux/Node 24. A focused Windows workflow runs the same
CLI/child-process checks on relevant changes; its actual CI result must be recorded
separately before claiming Windows verification.

References verified 2026-09-14:
- [Vercel project GET schema](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name)
- [PostgreSQL privilege inspection](https://www.postgresql.org/docs/current/functions-info.html)
- [Supabase connection formats](https://supabase.com/docs/guides/database/connecting-to-postgres)
