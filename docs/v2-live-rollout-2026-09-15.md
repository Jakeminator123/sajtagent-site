# Sajtagent V2 — live-E2E grön 2026-09-15

Statusbild efter nattpasset 2026-09-15. Den stänger den öppna 503:an från
[integrationspasset 2026-09-14](v2-live-rollout-2026-09-14.md) och de
live-checkar som [E2E-drivern](v2-e2e-smoke.md) kan bevisa. Checklistan över
repon är fortsatt
[Platform `docs/v2-rollout-handoff.md`](https://github.com/Jakeminator123/sajtagent-platform/blob/main/docs/v2-rollout-handoff.md).

**Live V2 är fortfarande inte påslagen för kunder.** `SITEAGENT_NEXT_ENABLED=false`
i Production efter testfönstret.

## Resultat

| Vad | Bevis |
| --- | --- |
| Site-kod | [#42](https://github.com/Jakeminator123/sajtagent-site/pull/42) squash-mergad som `c257980`; Production redeployad från `main` |
| Live-E2E | `node --env-file=.env.rollout.local scripts/run-v2-e2e.mjs` mot Production: **17/17 live-steg passed**, 3 `blocked` by design, exit 2 (`partial`) |
| Accepterat Next-bygge | Riktig statisk export via Sprite-controllern, skyddad artefakt-deploy, byte-exakt verifiering och accepterat snapshot |
| Preview-gateway | One-use grant, riktig webbläsarform, interaktiv React i faktiska Builder-iframen |
| Publicering | Anonym publik sajt på `*.sites.sajtagent.se` med fungerande JavaScript; stale publish → 409; republish flyttar snapshot |
| Isolering | Andra kontot och anonym: 401/403/404 på alla projekt-, Next-, källkods- och access-routes |

`blocked`-stegen (`hard_timeout_kills_worker_process`,
`runtime_restart_reopens_exact_accepted_source`,
`cross_worker_files_and_isolated_execution`) kräver processbevis från runtime
och en auktoriserad omstart. De kan inte passeras från Site.

## Rotorsaker som hittades

Ingen av dem var DNS, domäner, nycklar eller Sprites-API. Alla var
Production-specifika och osynliga för de lokala verifieringarna.

| # | Symptom | Rotorsak | Fix |
| --- | --- | --- | --- |
| 1 | `POST .../next` → 503 `next_build_failed` efter ~48 s | Vercel injicerade Toolbar-skriptet (`vercel.live/_next-live/feedback/feedback.js`, +288 bytes) i `turbopack-*.js` på artefaktprojektets preview-deploys. `StaticNextDeployer` jämför bytes exakt → `deployment_bytes_mismatch`. Site mappar alla okända fel till 503. | Env på **artefaktprojektet** `sajtagent-next-artifacts`: `VERCEL_PREVIEW_FEEDBACK_ENABLED=0` (publik config). Ingen kodändring. |
| 2 | Ägarens `POST .../next/access` utan body → 403 `preview_access_denied` | På Vercel är `request.body` en tom stream vid body-lös POST (lokalt `null`). JSON-parse kastade och fångades som 403. | Routen avgör "binding skickad" via `content-length`/`transfer-encoding`. |
| 3 | Alla publicerade sajter → **500** | Publiceringsgatewayen svarade 307 med relativ `Location`. Next-proxyadaptern kräver absolut URL → `ERR_INVALID_URL`. | Absolut same-origin `Location`. |
| 4 | Slutlig publik URL saknade `/` | Next:s inbyggda 308 strippade katalog-snedstrecket på båda gateways, trots att kundexporten byggs med `trailingSlash: true`. | `skipTrailingSlashRedirect: true` + proxyn återinför default-redirecten för Site-hosten (byggd från vanlig `URL`, eftersom `NextURL` lägger tillbaka snedstrecket). |

Felsökningsmetod som fungerade: kör Sites egen `StaticNextDeployer.deploy()`
lokalt med riktiga env-värden (`vercel env pull`) och de faktiska worker-filerna
(hämtade från artefakt-deployen med `vercel curl`). Då får felet ett namn i
stället för 503. Motsvarande för routes: logga in med Playwright och anropa
routen med och utan body.

## E2E-drivern

Rättade testfel, inte produktfel:

- Login-formen är React-styrd. Text som skrivs före hydrering kastas och knappen
  förblir disabled. Drivern väntar nu på `networkidle` och skriver om vid behov.
- Klick i preview-iframen och på den publika sidan landar ofta före hydrering.
  Drivern klickar om tills räknaren registrerat exakt ett klick.
- Iframen hittas via stabila `name="sajtagent-next-preview"`; titeltexten ändras.
- `V2_E2E_DEBUG=1` skriver felklass och kort meddelande för icke-SmokeFailure
  (lokal diagnostik, fortfarande inga bodies, cookies eller grants).

Observerat: enstaka transienta fel direkt efter ett Production-alias-byte
(`redacted_execution_error` i ett tidigt steg). Kör om innan du felsöker.

## Vercel-env efter städning

Site `sajtagent-site` gick från 35 till 18 poster. Borttaget: alla
Supabase/Postgres-variabler som koden inte läser (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_PROJECT_REF`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `POSTGRES_HOST/USER/PASSWORD/DATABASE`,
`POSTGRES_PRISMA_URL`). Inga av dem var integrationsstyrda. Koden läser bara
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_POOL_*`,
`POSTGRES_CONNECT_TIMEOUT_MS`, `DB_SSL_REJECT_UNAUTHORIZED` och `SITEAGENT_*`.

`SITEAGENT_NEXT_ENABLED` och `SITEAGENT_NEXT_VERCEL_BYPASS` är nu **en** post
vardera för Production+Preview+Development. Preview/Development saknar
`SITEAGENT_RUNTIME_URL`, så Next är i praktiken av där oavsett flaggan.
Production redeployad efter städningen; login, DB och projekt-API verifierade.

## Så testar du (testfönster)

PowerShell, i `sajtagent-site` på `main`:

```powershell
# 1. Slå på Next (en post, alla targets) och deploya Production
vercel env update SITEAGENT_NEXT_ENABLED --value true --yes --scope jakeminator123s-projects
vercel deploy --prod --yes --scope jakeminator123s-projects

# 2. Kör live-E2E (V2_E2E_* i ignorerad .env.rollout.local; skriv aldrig ut den)
node --env-file=.env.rollout.local scripts/run-v2-e2e.mjs

# 3. Slå av Next igen och deploya
vercel env update SITEAGENT_NEXT_ENABLED --value false --yes --scope jakeminator123s-projects
vercel deploy --prod --yes --scope jakeminator123s-projects
```

Förväntat: 17 `passed`, 3 `blocked`, `overall: partial`, exit 2. Exit 1 är
fel. Med Next av ska `real_next_build_accepted` falla med
`unexpected_api_status` (404) — det är kontrollen att flaggan är av.

Snabbkontroller utan E2E:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://sajtagent-site.vercel.app/
curl.exe -s -o NUL -L -w "%{http_code} %{url_effective}`n" https://<hash>.sites.sajtagent.se/
npm run check:next-preview; npm run check:next-publication
```

Publicerade testsajter från körningarna ligger kvar (`V2 smoke …`-projekt på
testkontona) och kan användas som `<hash>`.

## Kvar innan kundpåslag

- Runtime-processbevis för de tre `blocked`-stegen (ägs av `sajtagent-sprites`).
- Automatisk wildcard-certförnyelse är obevisad (se plattformens checklista).
- Testkontona är riktiga brevlådor, inte fixtures. Byt till dedikerade konton
  innan drivern körs regelbundet.
- Preflight-skriptet kontrollerar inte `VERCEL_PREVIEW_FEEDBACK_ENABLED` på
  artefaktprojektet; lägg till när preflight nästa gång ändras.
