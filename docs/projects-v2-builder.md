# V2 B — Builder multi-project UI

The project API/migration [PR #28](https://github.com/Jakeminator123/sajtagent-site/pull/28)
and Builder UI [PR #29](https://github.com/Jakeminator123/sajtagent-site/pull/29)
are merged. Migration and Site deployment evidence was recorded in the
[2026-09-14 integration snapshot](v2-live-rollout-2026-09-14.md).
This establishes code/deployment status, not the two-account browser result.

- `Ny… → Nytt projekt` creates a separate named project with `POST /api/siteagent/projects`.
- Header selector lists owner-bound projects. Opening one navigates to
  `/builder?project=<id>`. Reload reopens that exact project; a denied project
  never silently falls back to the personal starter.
- Project metadata, canonical state and session requests all use server-owned
  authenticated endpoints. The browser submits a name only on creation, never
  tenant/principal/worker bindings.
- Switching uses a full-document navigation, intentionally clearing all card,
  conversation, preview and request-local state. The provider is also keyed by
  project for server-router transitions. Bootstrap/event generation checks reject
  stale asynchronous callbacks after reset or unmount.
- `Ny chatt` keeps the selected project and its accepted versions.
- The separate `Mer → Återställ personligt startprojekt…` action appears only
  when the personal starter is selected. Its destructive confirmation states
  exactly what will be removed; other projects are not reset.

## Verification / release checklist

- [x] `check:projects`: existing server ownership/repository assertions plus
  browser adapter execution with two project fixtures, name-only create,
  exact-ID checks, unauthenticated/foreign-project failures and abort propagation.
- [x] `check:site-ui` and `check:builder-adapter`: runtime assertions and focused
  TypeScript checks; previous destructive-New-project assertions updated.
- [x] `cards:check` and ESLint.
- [x] Independent subagent review of `04abc49`: no blockers. Minor failed-reset
  bootstrap loading state fixed in follow-up; no Bugbot run is claimed.
- [x] `npm run build -- --webpack`: successful production compilation.
  Default Turbopack rejects this worktree's shared `node_modules` symlink;
  no product configuration was changed to bypass it. Build skips TypeScript
  under the existing waiver; the focused typechecks above are separate.
- [ ] Browser visual/interactive check with two authenticated projects and reload.
- [x] API/UI merged and Site production deployment recorded on 2026-09-14.
  This does not complete the authenticated browser check above.

The automated checks above are local tests. Migration/deployment evidence is
limited to the cited snapshot; the authenticated browser E2E remains unverified.
