# Siteagent

Siteagent är en Next.js-baserad AI-studio för att planera, bygga och förhandsgranska webbplatser.

## Kom igång

Krav: Node.js 22 och npm 10. [Volta](https://volta.sh/) rekommenderas och
projektet låser automatiskt Node.js 22.23.1 samt npm 10.9.8 för den som har
Volta installerat.

```bash
npm ci
npm run dev
```

Öppna sedan [http://localhost:3000/siteagent](http://localhost:3000/siteagent).

## Verifiering

```bash
npm run lint
npm run build
```

## Valfri konfiguration

Databasfunktioner använder i första hand `POSTGRES_URL` eller
`POSTGRES_URL_NON_POOLING`, med `DATABASE_URL` som fallback. GitHub-noden kan
använda `GITHUB_TOKEN`, och `NEXT_PUBLIC_URL` kan ange applikationens publika
basadress.
