# Siteagent

Siteagent är en Next.js-baserad AI-studio för att planera, bygga och förhandsgranska webbplatser.

SiteAgent är hela webbprodukten. Buildern är produktens byggyta, inte ett annat
namn för SiteAgent. Privilegierad OpenClaw- och Sprite-runtime ligger i det
separata **privata** systerrepot `sajtagent-sprites`. Familjekartan (OVERVIEW,
inte källkod) finns i [`OVERVIEW-sajtagent-platform`](https://github.com/Jakeminator123/OVERVIEW-sajtagent-platform).

## Canonical repository family

- This repository is the only active SiteAgent web-product repository.
- GitHub: [`Jakeminator123/sajtagent-site`](https://github.com/Jakeminator123/sajtagent-site), branch `main`.
- Vercel: project `sajtagent-site` (project ID `prj_hMs2VN2gnj9YU42ZDcEv9U8fOpKf`).
- Cross-repository decisions live in the private repo [`sajtagent-platform`](https://github.com/Jakeminator123/sajtagent-platform).
- Privileged OpenClaw and Sprite execution live in the private repo [`sajtagent-sprites`](https://github.com/Jakeminator123/sajtagent-sprites).
- Public family map (documentation only): [`OVERVIEW-sajtagent-platform`](https://github.com/Jakeminator123/OVERVIEW-sajtagent-platform).

The earlier `builder-v2` repository and Vercel project are legacy prototypes.
Do not send new commits, environment variables, deployments, or runtime
credentials there. Sajtmaskin remains a reference implementation, not a
runtime dependency.

## Hitta rätt

| Mapp | Ansvar |
| --- | --- |
| `app/`, `components/`, `hooks/` | Produktsidor, Builder och dess API-rutter/UI. |
| `lib/siteagent/` | Produktlogik; `server/` äger behörighet, jobb, preview och publicering. |
| `contracts/` | Delade kontrakt och fixtures, samordnade med Sprites. |
| `supabase/` | Granskade migrationer och databasprov. |
| `scripts/`, `tests/` | Kontroller, driftpreflight och E2E-harness. |
| `system-model/` | Kortmodellen som genererar `docs/card-flow.md`. |
| `docs/`, `config/` | Instruktioner och konfigurationsmallar utan hemligheter. |

Börja med [V1-runtime](docs/runtime-baseline.md) för det befintliga flödet,
[flerprojekt](docs/projects-v2-builder.md) för Builderns projektval och
[V2-preview](docs/next-preview-v2.md) / [publicering](docs/next-publication-v2.md)
för den opt-in-profilen. För drift används
[Platform-handoff](https://github.com/Jakeminator123/sajtagent-platform/blob/main/docs/v2-rollout-handoff.md),
[Site-preflight](docs/v2-rollout-preflight.md) och [tvåkontos-E2E](docs/v2-e2e-smoke.md).
De daterade leveransrapporterna är historik, inte en löpande driftstatus.

## Kom igång

Krav: Node.js 24 och npm 11. [Volta](https://volta.sh/) rekommenderas och
projektet låser automatiskt Node.js 24.20.0 samt npm 11.19.0 för den som har
Volta installerat.

```bash
npm ci
npm run dev
```

Öppna SiteAgents förstasida på [http://localhost:3000](http://localhost:3000).
Buildern finns på [http://localhost:3000/builder](http://localhost:3000/builder).
Agentprofilen kan formas i [Agent Studio](http://localhost:3000/agent-studio).
Gamla länkar till `/siteagent` skickas vidare till `/builder`.

## Verifiering

```bash
npm run check
node scripts/verify-v2-e2e-harness.mjs
npm run lint
npm run build
```

`next build` har för närvarande ett dokumenterat, tillfälligt undantag för
befintliga TypeScript-fel. Se [quality baseline](docs/quality-baseline.md) innan
du tolkar ett grönt buildsteg som full typverifiering.

Buildern använder Sajtagents autentiserade projekt- och build-job-controller.
V1 har ägarbunden HTML-preview och ZIP-nedladdning av accepterade versioner.
V2-koden för isolerade Next-byggen, privat preview och publicering är mergad;
första profilen är statisk export med klient-JavaScript. V2 kräver serverns
feature-flagga och full konfiguration, och är ännu inte verifierad genom hela
liveflödet. Mergad kod, grön CI och V1-framgång är inte bevis på live-V2.
Se [runtime baseline](docs/runtime-baseline.md) innan du ändrar Builder-flödet.
Den avsiktligt enkla V1-kedjan finns i
[one continuous agent, one verified truth](docs/simple-v1-loop.md). Det
auktoritativa samtals-, policy- och eventkontraktet beskrivs i
[AgentSession V1](docs/agent-session-v1.md).
Den lokala Agent Studio/OpenClaw-kompilatorn och den felsäkra bygggränsen
beskrivs i [agent-studio-and-build-runtime](docs/agent-studio-and-build-runtime.md).

## Valfri konfiguration

Kopiera variabelnamnen från `.env.example` till den Git-ignorerade
`.env.local`. Lägg aldrig `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, Sprite-token
eller OpenClaw-token i detta webb-repo; de hör hemma i runtime-repot.

Webbrepot använder det separata Supabase-projektet `sajtagent`
(`ywoltuegeemqznbcgokg`, `eu-north-1`). Projektets URL och moderna
publishable-nyckel ligger lokalt i `.env.local` som
`NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Publishable-nyckeln är inte en serverhemlighet, men all åtkomst till exponerade
tabeller måste ändå skyddas med RLS.

Databasfunktioner använder i första hand `POSTGRES_URL` eller
`POSTGRES_URL_NON_POOLING`, med `DATABASE_URL` som fallback. Interna API-anrop
härleder origin från den inkommande requesten och kräver därför ingen
`NEXT_PUBLIC_URL`. V2:s serverinställningar finns i
[driftmallen](config/v2-rollout.env.example); använd aldrig riktiga nycklar i Git.

GitHub lagrar Sajtagents egen kod. Kundernas aktuella accepterade V2-källkod
sparas ägarbundet i Site-databasen; kunden behöver inget GitHub-repo för att
bygga eller publicera. GitHub-export är en separat framtida integration.

Projektets regler för Supabase, MCP, GitHub, Vercel och Sajtmaskin-separation
finns i [integration baseline](docs/integration-baseline.md). Den repoägda
Codex-konfigurationen är projektavgränsad och hemlighetsfri; OAuth-inloggningen
stannar lokalt hos utvecklaren.
