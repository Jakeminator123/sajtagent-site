# Quality baseline

Status: known temporary waiver, 2026-08-27.

`next.config.mjs` currently sets `typescript.ignoreBuildErrors` to `true`.
Consequently, `npm run build` can succeed while `tsc --noEmit` fails. A direct
typecheck on 2026-08-27 found existing errors in imported landing/motion code,
workflow node typings, icon type imports, Builder state, and the lanyard scene.

This exception is not the desired end state and must not spread to new checks.

## Rules while the waiver exists

- Do not claim that a successful build proves TypeScript correctness.
- Do not add new `ignore`, `any`, or build-suppression settings to hide errors.
- Run lint/build plus a focused type or runtime check for the area changed.
- Fix errors in small groups owned by one feature; do not mix a broad type
  rewrite into unrelated product work.
- Record any newly discovered category here if it cannot be fixed immediately.

## Removal trigger

Remove `typescript.ignoreBuildErrors`, add a blocking `npm run typecheck` CI
step, and close this waiver when a clean direct typecheck passes on Node 24 with
the pinned lockfile. Until then, CI is a lint/build gate, not a complete type
gate.
