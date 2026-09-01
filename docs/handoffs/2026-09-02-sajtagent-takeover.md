# Sajtagent takeover handoff

Status captured: 2026-09-02, Europe/Stockholm.

Receiver: the existing Site coordination task `01a05dd3-afdd-74c1-ac21-6c62a3db2e92`.
Continue from this checkpoint; do not start a competing coordinator or redo
merged Runtime work.

## Product decision to preserve

- SiteAgent is one continuous user-facing conversation. Simple questions and
  build work share the same session and history.
- A build is a visible subordinate tool step, not a parallel hidden workflow.
- The model may propose work, but Site and an explicit user action authorize
  mutation. A normal chat message never grants build permission.
- The browser never calls OpenClaw, a Sprite, MCP, or model tools directly.
  Browser traffic goes through authenticated same-origin Site controllers.
- Runtime V1 currently accepts only `conversation.respond` with
  `maxToolCalls: 0`. Keep `build.request` fail-closed until a separate,
  ratified proposal/approval/tool contract and migration exist.
- Model routing is task-based: Luna for small low-latency work, Terra for
  routine balanced work, and Sol for complex planning or high-capability work.
  The OpenAI API control is `reasoning.effort`; “thinking” is an orchestration
  or UI label, not a second independent reasoning budget. Do not expose hidden
  chain-of-thought.

## Completed Runtime work

Repository: `Jakeminator123/sajtagent-sprites`.

- PR #2 added the signed local OpenClaw runtime baseline.
- PR #3 added the bounded continuous AgentSession SSE turn stream.
- PR #4 added the private, exact-bound ArtifactReadV1 adapter.
- PR #5 made health capability claims truthful when the signing key is absent
  or too short.
- All four PRs are merged. Current remote `main` is
  `985cb61fa30296bce44a9dc40494feb343f4fdb4`.
- AgentSessionV1 contract digest:
  `9b78d8793e08eaf8b7609894c4d0ab3f87399d977d0596fd44723085a4bc1c52`.
- ArtifactReadV1 contract digest:
  `d0a8e579d2c17d29b0eb60d53840a1d6c6160d5a64a7abbd0e095d285e8df55b`.
- Remote profile compilation requires the same HMAC canonicalization as the
  other private routes. `GET /health` is unsigned and is not authentication.
- No new Runtime revision was deployed to the live Sprite in this work. Treat
  any live Sprite as older until its version/health is verified after deploy.

Runtime worktree used for the final Runtime changes:
`C:\Users\jakob\.codex\visualizations\2026\09\01\01a05e15-796e-78e1-bc07-0c674c2e259c\sajtagent-sprites-artifact-read-v1`.

## Current Site delivery state

Repository: `Jakeminator123/sajtagent-site`.

- Draft PR #3, `codex/site-v1-vertical-slice` -> `main`:
  https://github.com/Jakeminator123/sajtagent-site/pull/3
- Current pushed PR head is
  `1a7286cd849ab29e4a2e88a783dac645b08ca8b2`.
- At that head, GitHub verify/database checks, GitGuardian, Vercel Preview, and
  Vercel Preview Comments are green. This is preview evidence, not production
  deployment or end-to-end proof against the new live Runtime.
- Draft PR #4, `codex/site-v1-cleanup` -> `codex/site-v1-vertical-slice`:
  https://github.com/Jakeminator123/sajtagent-site/pull/4
- Its current pushed head is
  `ec54790c09c027111c0b5d4af2385894146c1cd9`. PR #4 is mergeable and its
  current checks are green. Merge it into PR #3 only after confirming the two
  active closeout branches do not depend on code it removes.
- Remote Site `main` is
  `232bd7887d5e2c10176bbe845efa48883206a578`.

The vertical slice already contains the frozen Builder and AgentSession
contracts, Site-owned session persistence, fail-closed projection and preview
acceptance, private ArtifactRead adapter, database verification, and the
Builder chat connection to the continuous conversation path.

## Active closeout work

The Site coordination task owns these isolated worktrees:

1. Agent Studio proxy
   - Branch: `codex/site-v1-agent-studio-proxy`
   - Worktree:
     `C:\Users\jakob\.codex\visualizations\2026\09\01\01a05dd3-afdd-74c1-ac21-6c62a3db2e92\sajtagent-site-agent-studio-proxy`
   - Last observed at `1a7286c` with no file changes yet.
   - Required result: browser calls a same-origin authenticated Site route;
     Site signs `POST /v1/agent-profiles/compile` server-side and returns only a
     narrow health projection. Runtime URL and signing key never reach browser
     code.

2. Chat/build closure
   - Branch: `codex/site-v1-chat-closure`
   - Worktree:
     `C:\Users\jakob\.codex\visualizations\2026\09\01\01a05dd3-afdd-74c1-ac21-6c62a3db2e92\sajtagent-site-chat-closure`
   - Last observed dirty with 17 files changed, including deletion of
     `app/api/siteagent/build-jobs/route.ts`, card/UI semantics, docs, system
     model, and focused verification scripts.
   - Required result: remove the browser-callable parallel BuildJob route,
     preserve server-side BuildJob infrastructure for a later explicit session
     tool, and keep current chat turns at `conversation.respond` /
     `maxToolCalls: 0`.

Do not discard, stage, rewrite, or merge either worktree without receiving its
owner's checkpoint. The integration worktree is:
`C:\Users\jakob\.codex\visualizations\2026\09\01\01a05dd3-afdd-74c1-ac21-6c62a3db2e92\sajtagent-site-integration`.

## Recommended takeover sequence

1. Contact the two active Site agents through direct Codex task messaging and
   request branch, diff, commit, focused checks, and blockers.
2. Review each diff against the product decision above. Integrate one commit at
   a time into `codex/site-v1-vertical-slice`; never copy uncommitted files
   between worktrees.
3. Rebase or merge PR #4 only after checking its cleanup does not remove either
   closeout fix.
4. Run focused contract checks, then the repository's full check/build chain.
   Push PR #3, wait for fresh GitHub/database/security/Vercel checks, and keep
   local, committed, pushed, PR, merged, deployed, and live-verified states
   separate in every report.
5. When PR #3 is genuinely merge-ready, merge in the authorized order. Deploy
   the merged Runtime to the intended Sprite and Site to Vercel, configure only
   server-side Runtime URL/HMAC values, and run a live end-to-end smoke test:
   browser -> Site -> signed Runtime -> Site event persistence -> preview.
6. Open a separate ratified contract track for build proposal, explicit user
   approval, authorized `build.request`, migration, and visible tool events.
   Do not smuggle this expansion into the V1 closeout.

## Agent-to-agent communication rule

`/kom` is a human-facing convention only. The actual mechanism is the available
Codex task channel, for example `send_message_to_thread`, followed by task
status/waiting. Each message must identify repository, branch/worktree, current
state, claimed files, requested action, and the next possible conflict. The
receiver acknowledges scope or a write lock and reports commit/check evidence.
This coordination never creates product coupling or grants permission to read
secrets, mutate another repository, push, merge, deploy, or change external
resources.
