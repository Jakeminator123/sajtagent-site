# Product agent doctrine

Status: Site-owned Builder conversation rule, 2026-09-11.

Sajtagent is one continuous control conversation. The Builder is not a locked
card-deck or a one-shot build wizard. A user can ask a question, give a site
brief, look at the preview, and keep prompting.

```text
/builder Sajtagent
  -> AgentTurnRequestV1
  -> Site policy (conversation.respond always;
                  build.request only for a clear build path)
  -> signed Runtime / OpenClaw on Sprite
       -> message.delta / question            (no BuildJob)
       -> exact build.request handoff         (one BuildJobV1)
          -> candidate -> Site acceptance -> preview iframe
```

## Rules

| User turn | Site policy | BuildJob |
| --- | --- | --- |
| Question, status, explanation | `conversation.respond` only | none |
| Clear build brief, e.g. "hemsida med parallax, responsiv" | `conversation.respond` + `build.request` | only if Runtime emits the exact handoff |
| Structured answer to `question.requested` | same pair, no second confirm | only on exact handoff |

- Ordinary answers and questions never create a job, version or preview.
- A clear build instruction starts the Build skill without a Site-owned
  "ska jag bygga?" step. Runtime may still ask a product question when the
  brief is incomplete.
- `BuildJobV1` remains a subordinate mutation envelope. The browser cannot
  create it.
- Preview stays on the same Builder surface after a version exists so the
  next prompt can refine the same site.
- Events are persisted then forwarded as SSE. The UI reduces streamed
  `message.delta` incrementally.

## Configuration (no secrets in Git)

Configure these as a pair on the Site server only:

| Variable | Purpose |
| --- | --- |
| `SITEAGENT_RUNTIME_URL` | Sprite Runtime base URL. Local default `http://127.0.0.1:4317`. Non-loopback must be HTTPS. |
| `SITEAGENT_RUNTIME_SIGNING_KEY` | Server-only HMAC key, at least 32 characters, shared with Runtime. Never `NEXT_PUBLIC_*`. |

If either value is missing, Site fails the turn closed. It does not invent a
model answer, preview or version.

Health must advertise AgentSession contract 1, SSE, and either
`conversation.respond` or the ordered pair `conversation.respond`,
`build.request`. A conversation-only Runtime can answer questions. A build
brief still requires the second capability.

## Related contracts

- [`agent-session-v1.md`](agent-session-v1.md) — session, turn, events
- [`agent-session-server-v1.md`](agent-session-server-v1.md) — Site persistence and Runtime touchdown
- [`runtime-baseline.md`](runtime-baseline.md) — Builder runtime gate
- [`first-vertical-slice.md`](first-vertical-slice.md) — accepted end-to-end contract
