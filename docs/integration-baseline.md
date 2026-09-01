# Integration baseline

Status: accepted foundation, 2026-09-01.

## Resource ownership

| Capability | Sajtagent-owned resource | Rule |
| --- | --- | --- |
| Source | `Jakeminator123/sajtagent-site` | `main` is production authority; `preview` is the long-lived non-production branch. |
| Vercel | Team `jakeminator123s-projects`, project `sajtagent-site` | Recheck project, Git source, branch, and target before every mutation. A branch existing does not prove that its deployment is ready. |
| Database | Supabase `sajtagent`, ref `ywoltuegeemqznbcgokg`, `eu-north-1` | Never substitute Sajtmaskin, Spelsajt, or another project. |
| Privileged runtime | Separate `sajtagent-sprites` repository | No Sprite, OpenClaw, model, or signing credential belongs in this web repository. |

Sajtmaskin is reference material only. Sajtagent must not share its database,
auth, Vercel configuration, environment, MCP login, runtime, or live dependency.
Inspect a Sajtmaskin source only when the user places that exact source in scope;
ask before opening a local checkout.

## Codex Supabase MCP

The repository-owned `.codex/config.toml` is secret-free and scopes Codex to the one
accepted Sajtagent project. It uses Supabase OAuth, read-only database access,
a narrow feature set, and a tool allowlist that excludes migrations and other
write tools. OAuth requests only `projects:read`, `database:read`, and
`analytics:read`. Codex loads project configuration only for a trusted project.

After opening this repository as the Codex project, authenticate locally:

```powershell
codex mcp login sajtagent_supabase
codex mcp get sajtagent_supabase
```

OAuth credentials stay in the developer's Codex credential store and never in
Git. The MCP is a developer aid, not a runtime dependency or customer feature.
The Supabase schema and migration history were empty when this baseline was
accepted; recheck live state instead of treating that observation as permanent.

Official references:

- [Supabase MCP server](https://supabase.com/docs/guides/ai-tools/mcp)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp)

## Plugin baseline

The existing Supabase, GitHub, and Vercel plugins cover the current foundation.
Do not install another plugin without a concrete capability, an identified data
owner, a permission review, and a decision about whether it is developer tooling
or a product integration. A developer plugin must never silently become a
shipped SiteAgent dependency.

## Delivery order

1. Keep instructions, ownership, and security boundaries executable and small.
2. Verify project-scoped developer integrations without introducing secrets.
3. Replace the first simulated Builder path with one real, typed vertical slice.
4. Introduce the Sprite agent through the separate runtime contract only after
   creation, network, exposure, credentials, budget, and cleanup are explicitly
   authorized.
