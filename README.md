# Siteagent

Siteagent är en Next.js-baserad AI-studio för att planera, bygga och förhandsgranska webbplatser.

## Kom igång

Krav: Node.js 22 och Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Öppna sedan [http://localhost:3000/siteagent](http://localhost:3000/siteagent).

## Verifiering

```bash
pnpm lint
pnpm build
```

## Valfri konfiguration

Databasfunktioner använder i första hand `POSTGRES_URL` eller
`POSTGRES_URL_NON_POOLING`, med `DATABASE_URL` som fallback. GitHub-noden kan
använda `GITHUB_TOKEN`, och `NEXT_PUBLIC_URL` kan ange applikationens publika
basadress.
