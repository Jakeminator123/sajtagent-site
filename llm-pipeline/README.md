# Build-request intake

This folder currently records four ways a user request may enter SiteAgent:

- `free-text/`
- `analyzed/`
- `template/`
- `audit/`

They are input adapters, not four separate LLM pipelines. Each should
eventually produce the same small, typed build-request contract with provenance,
user intent, project identity, constraints, and referenced material.

The web repository owns collection, user confirmation, normalization, and
progress presentation. Privileged model orchestration, OpenClaw, tool grants,
file mutation, checks, and preview execution belong in `sajtagent-sprites`.

Do not recreate Sajtmaskin's full prompt stack here. Add implementation only
with the first end-to-end consumer; until then these folders are planning
labels, not required architectural layers.
