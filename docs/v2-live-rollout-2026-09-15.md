# Sajtagent V2 — live-E2E grön 2026-09-15

Statusbild efter nattpasset 2026-09-15. Den stänger den öppna 503:an från
[integrationspasset 2026-09-14](v2-live-rollout-2026-09-14.md) och de
live-checkar som [E2E-drivern](v2-e2e-smoke.md) kan bevisa. Checklistan över
repon är fortsatt
[Platform `docs/v2-rollout-handoff.md`](https://github.com/Jakeminator123/sajtagent-platform/blob/main/docs/v2-rollout-handoff.md).

**Live V2 är fortfarande inte påslagen för kunder.** `SITEAGENT_NEXT_ENABLED=false`
i Production efter testfönstret.

Tillfällig Builder-switch för HTML-skiss vs React (Next) är en per-projektpreferens,
inte en formatmigrering; default när Next är tillgängligt förblir `next`.

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
och en auktoriserad omstart. Drivern kan inte passera dem från Site; samtliga
tre är sedan bevisade utanför drivern, se nedan och i
[runtime-bevisen](https://github.com/Jakeminator123/sajtagent-sprites/blob/main/docs/runtime-process-evidence-2026-09-15.md).

## Andra testfönstret: ny produktadress och dedikerade konton

| Vad | Resultat |
| --- | --- |
| Produktens origin | `https://sajtagent.se`. `www` och `sajtagent-site.vercel.app` är omdirigeringar dit, inte egna origins |
| Live-E2E på den nya adressen | **17/17 live-steg passed**, 3 `blocked`, exit 2 |
| Testkonton | `test1@sajtagent.se` … `test9@sajtagent.se`, bekräftade, lösenordsinloggning verifierad genom `/login` |
| Site-halvan av reopen | **Bevisad**, se nedan |
| Next efter fönstret | `false` som en post för alla targets; Production redeployad |

### Varför origin är en enda adress

Appen jämför webbläsarens `Origin` mot exakt `SITEAGENT_SITE_ORIGIN`. När
apex först fick certifikat levererade `https://sajtagent.se` hela appen medan
varje muterande Next-route svarade `origin_denied` — sidor som ser hela ut och
vägrar spara. Mätt live innan omdirigeringen sattes. Efter bytet gäller det
omvända: `sajtagent-site.vercel.app` som `Origin` ger `origin_denied`, vilket
är rätt, eftersom den adressen numera bara är en omdirigering.

Observera att publicerade kundsajter ligger på `*.sites.sajtagent.se`, alltså
**under** produktens origin. `publicationDomain()` kontrollerar bara det
omvända förhållandet, så bytet passerar valideringen. Mätt på ett riktigt
inloggat konto: sessionskakan är host-only på `sajtagent.se` och skickas inte
till någon publicerad kundsajt, och ingen kaka sätts på `.sajtagent.se`.
Kakan saknar dock `Secure` (och `HttpOnly`, vilket är avsiktligt i
`@supabase/ssr`). HSTS på `sajtagent.se` är `max-age=63072000`, så en
webbläsare som sett domänen en gång uppgraderar själv till HTTPS. Kvarstår:
sätt `Secure` explicit och behåll regeln att ingen kaka får domänattribut.

### Site-halvan av `runtime_restart_reopens_exact_accepted_source`

Samma inloggade ägare läste sitt accepterade projekt genom produkt-API:et före
och efter en auktoriserad omstart av `siteagent-runtime` (pid 20644 → 29746,
`openclaw-gateway` orörd). Identiskt i båda mätningarna: `jobId`,
`sourceRevisionId`, `previewRef`, `deploymentId`, `acceptedAt`,
`outputSha256`, antal källkodsfiler och deras digest. `POST .../next/access`
utfärdade fortfarande en grant (200). Runtime-halvan bevisades separat i
Sprites #36.

### Next av: verifierat på ett inloggat konto

Med `SITEAGENT_NEXT_ENABLED=false` svarar `GET .../next`,
`POST .../next/profile` och `POST .../next/access` alla **404**
`next_preview_unavailable` för projektets ägare. Det bekräftar live att
access-routens klassificering i [#45](https://github.com/Jakeminator123/sajtagent-site/pull/45)
fungerar: före den fixen gav samma anrop 403 `preview_access_denied` och såg
ut som ett nekande i stället för en avstängd funktion.

### Testkonton

Nio konton, `test1@sajtagent.se` … `test9@sajtagent.se`, skapade direkt i
`auth.users` med bcrypt-hash, bekräftad e-post, `email`-identitet och samma
metadataform som befintliga konton. De ersätter operatörens riktiga
brevlådor i `V2_E2E_*`. Lösenordet är gemensamt och finns bara i den ignorerade
`.env.rollout.local` och i databasen. **Dessa konton är laborationskonton och
får aldrig återanvändas för något verkligt.** Magiska länkar till den nya
adressen kräver att `https://sajtagent.se/auth/callback` finns i Supabase
Auth:s redirect-lista; lösenordsinloggning berörs inte och är den väg drivern
använder.

## Rotorsaker som hittades

Ingen av dem var DNS, domäner, nycklar eller Sprites-API. Alla var
Production-specifika och osynliga för de lokala verifieringarna.

| # | Symptom | Rotorsak | Fix |
| --- | --- | --- | --- |
| 1 | `POST .../next` → 503 `next_build_failed` efter ~48 s | Vercel injicerade Toolbar-skriptet (`vercel.live/_next-live/feedback/feedback.js`, +288 bytes) i `turbopack-*.js` på artefaktprojektets preview-deploys. `StaticNextDeployer` jämför bytes exakt → `deployment_bytes_mismatch`. Site mappar alla okända fel till 503. | Env på **artefaktprojektet** `sajtagent-next-artifacts`: `VERCEL_PREVIEW_FEEDBACK_ENABLED=0` (publik config). Kod (#44): samma fel är nu 500 med `reason:"deployment_bytes_mismatch"`. 404 är bara Next-av (#37), inte äkta serverfel. |
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
curl.exe -s -o NUL -w "%{http_code}`n" https://sajtagent.se/
curl.exe -s -o NUL -L -w "%{http_code} %{url_effective}`n" https://<hash>.sites.sajtagent.se/
npm run check:next-preview; npm run check:next-publication
```

Publicerade testsajter från körningarna ligger kvar (`V2 smoke …`-projekt på
testkontona) och kan användas som `<hash>`.

## Eftermiddag 2026-09-15: vanligt Next-chattfel

Gateway skrev giltig `{"files":[…]}` men join-path visade «Ingen preview
accepterades». Site [#49](https://github.com/Jakeminator123/sajtagent-site/pull/49)
(`f79f7fd`, Production READY) visar namngivet `turn.failed`. Runtime-fixen
ligger i Sprites #39. En operator-turn på **Surf live** accepterade Next;
zip `sajtagent-next-52f91a36de04.zip` är React (`app/page.tsx`). Inte
publicerad. Inte kundpåslag. Karta:
plattformens `docs/handover-2026-09-15-next-builder.md`.

## Kvar innan kundpåslag

- Automatisk wildcard-certförnyelse är obevisad (se plattformens checklista).
- `SITEAGENT_NEXT_ENABLED` är av för kunder. En operator-turn är inte påslag.
- Testkontona `test*@sajtagent.se` finns och är riktiga brevlådor, inte fixtures.
- Preflight `--live-vercel` kräver `VERCEL_PREVIEW_FEEDBACK_ENABLED=0` på
  artefaktprojektet för production, preview och development.

Stängt 2026-09-15 (inte öppna luckor): runtime-bevis för de tre
`blocked`-stegen; access-klassning (#45); namngiven `failureCode` / join-path
(#48, #49). Kartan ligger i plattformens `docs/repository-map.md`.
