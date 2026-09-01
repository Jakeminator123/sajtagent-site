# Siteagent

Siteagent är en Next.js-baserad AI-studio för att planera, bygga och förhandsgranska webbplatser.

SiteAgent är hela webbprodukten. Buildern är produktens byggyta, inte ett annat
namn för SiteAgent. Privilegierad OpenClaw- och Sprite-runtime ligger i det
separata systerrepot `sajtagent-sprites`.

## Canonical repository family

- This repository is the only active SiteAgent web-product repository.
- GitHub: [`Jakeminator123/sajtagent-site`](https://github.com/Jakeminator123/sajtagent-site), branch `main`.
- Vercel: project `sajtagent-site` (project ID `prj_hMs2VN2gnj9YU42ZDcEv9U8fOpKf`).
- Cross-repository decisions live in [`sajtagent-platform`](https://github.com/Jakeminator123/sajtagent-platform).
- Privileged OpenClaw and Sprite execution live in [`sajtagent-sprites`](https://github.com/Jakeminator123/sajtagent-sprites).

The earlier `builder-v2` repository and Vercel project are legacy prototypes.
Do not send new commits, environment variables, deployments, or runtime
credentials there. Sajtmaskin remains a reference implementation, not a
runtime dependency.

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
npm run lint
npm run build
```

`next build` har för närvarande ett dokumenterat, tillfälligt undantag för
befintliga TypeScript-fel. Se [quality baseline](docs/quality-baseline.md) innan
du tolkar ett grönt buildsteg som full typverifiering.

Builderns backend-, preview- och publiceringsintegrationer är fortfarande en
prototyp med simulerade reservvägar. Se [runtime baseline](docs/runtime-baseline.md)
innan du ändrar Builder-flödet.
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
`POSTGRES_URL_NON_POOLING`, med `DATABASE_URL` som fallback. GitHub-noden kan
använda `GITHUB_TOKEN`, och `NEXT_PUBLIC_URL` kan ange applikationens publika
basadress. `GITHUB_TOKEN` är endast ett valfritt prototyphjälpmedel och ska
ersättas av den framtida, avgränsade SiteAgent GitHub App-integrationen.

Projektets regler för Supabase, MCP, GitHub, Vercel och Sajtmaskin-separation
finns i [integration baseline](docs/integration-baseline.md). Den repoägda
Codex-konfigurationen är projektavgränsad och hemlighetsfri; OAuth-inloggningen
stannar lokalt hos utvecklaren.
