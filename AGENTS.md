<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SiteAgent product boundaries

- SiteAgent is the complete web product; the Builder is one workspace inside it.
- `/` is SiteAgent's first page, `/builder` is the Builder, and `/siteagent`
  exists only as a compatibility redirect. Product APIs may use
  `/api/siteagent/...`.
- This repository owns the Next.js product, users, projects, chat, versions,
  Supabase/Postgres integration, preview UI, and Vercel publication.
- Privileged OpenClaw, Sprite creation, execution, services, checkpoints, and
  runtime secrets belong in the separate `sajtagent-sprites` repository.
- Never expose OpenClaw or Sprite/model tokens directly to the browser.
- Preserve unrelated working-tree changes and verify the exact Git root before
  staging, committing, or reporting delivery.
- `main` is the standard branch. If the user says `master`, ask whether they
  really mean `master` before acting.
- End every final response with this repository's live branch and absolute
  worktree path. If several repositories were touched, report each one.
- Never remove dirty, locked, unpushed, active-PR, or unique worktrees.

## Relation to Sajtmaskin

- Sajtagent is a new, thinner version of ideas proven in Sajtmaskin, not a
  fork, deployment target, shared runtime, or continuation of its repositories.
- Treat every Sajtmaskin repository, local checkout, database, auth setup,
  Vercel project, environment, and MCP connection as out of scope and read-only
  reference unless the user explicitly names the resource and asks to inspect
  or change it.
- When comparison is useful, prefer GitHub evidence. Ask before opening a local
  Sajtmaskin checkout, and never modify it as part of Sajtagent work.
- Reuse only selected behavior or assets after documenting their assumptions
  and adapting them to a Sajtagent-owned contract. Never raw-merge or link the
  products at runtime.

## Supabase and developer integrations

- This repository owns the independent Supabase project `sajtagent`
  (`ywoltuegeemqznbcgokg`, `eu-north-1`). Never substitute a Sajtmaskin,
  Spelsajt, or otherwise convenient project.
- Read `docs/integration-baseline.md` before changing Supabase, MCP, GitHub, or
  Vercel configuration. Developer plugins and MCP logins are tooling, not
  product runtime dependencies.
- Keep the project MCP read-only by default. Database writes, migrations, auth
  changes, Edge Functions, Supabase branches, deployments, and cloud resource
  lifecycle operations require explicit scope in the active task.

## Concurrent agent coordination

- Before editing, inspect the branch and working-tree diff. If another agent is
  active in the same branch, worktree, folder, or file scope, coordinate before
  touching overlapping files.
- Prefer direct agent messaging and keep updates to four short lines: task,
  files or area, what and why, and the next potentially conflicting action.
- If direct messaging is unavailable, use a secret-free temporary note at
  `.agents/coordination/<agent-id>.md`; the directory is local and ignored.
- On overlap, pause the overlapping edits and agree on ownership, ordering, or
  a compatible split. Use repository authority, product boundaries, tests, and
  concrete evidence when one option is clearly better.
- If materially different options remain equally defensible (roughly 50/50),
  or the resolution would change product scope, security, data, or an external
  resource, ask Jakob before proceeding.
- Never overwrite, discard, stage, commit, or rewrite another agent's changes
  without agreement. Recheck status and diff immediately before staging.
- `/kom <agent-or-task> <message>` contacts an existing agent through the
  available direct channel. It never creates a new agent and uses a secret-free
  local coordination note only when live delivery is unavailable.

## Executable card map

- `system-model/card-flow-v1.json` is the canonical model for current card
  registry, target card responsibilities, typed inputs/outputs and failure
  propagation. `docs/card-flow.md` is generated and must not be hand-edited.
- The current six-card prototype remains visible in the model while the target
  is five cards: Build choices, Blocks, Versions, Map and SiteAgent. Chat is
  retired only after its input is actually merged into SiteAgent.
- Run `npm run cards:docs` after an intentional model change and
  `npm run cards:check` before reporting PR or push verification.

## Current verification baseline

- `next.config.mjs` temporarily ignores build-time TypeScript errors inherited
  by the current prototype. A green `next build` is therefore not a typecheck.
- Read `docs/quality-baseline.md`, run focused checks for touched code, and do
  not add new suppressions or describe this waiver as full verification.
- Read `docs/runtime-baseline.md`. Simulated preview, prompt assist, publish,
  and download behavior are prototype paths and must never be presented as a
  working backend, deployment, or export.
- SiteAgent may normalize free text, analyzed documents, templates, and audits
  into a typed build request. The privileged model/tool loop belongs in the
  separate `sajtagent-sprites` repository.

## Development and deployment environments

- The developer host is Windows with PowerShell 7 by default. Label Git Bash
  commands explicitly; Git Bash is optional and does not prove Linux behavior.
- Vercel and Linux CI must receive portable code with exact filename casing,
  no hard-coded Windows paths, UTF-8 without BOM, and LF line endings.
- Use CRLF only for Windows-only `.ps1`, `.cmd`, and `.bat` entrypoints.
- Codex/Cursor subagents are development helpers. Product OpenAI/Anthropic
  clients and credentials belong server-side in `sajtagent-sprites`.
