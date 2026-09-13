# V2 B — Builder multi-project UI

Depends on the reviewed project API/migration in PR #28 (`331a323`).

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
- [ ] Independent PR review.
- [ ] Browser visual/interactive check with two authenticated projects and reload.
- [ ] Merge and production rollout (requires PR #28 and its migration first).

These are local tests, not proof of live database state, browser E2E or deployment.
