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
