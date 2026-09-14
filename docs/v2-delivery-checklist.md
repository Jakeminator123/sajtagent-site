# Sajtagent V2 — leveranschecklista

**Uppdatering 2026-09-14:** Site #28/#29 och Sprites #29 är nu mergade.
B/D/F-migrationerna är applicerade och behörighetskontrollerade i Sajtagents
live-databas. Se [aktuell integrations- och driftstatus](v2-live-rollout-2026-09-14.md)
för bevis och kvarvarande driftsteg. Tabellen nedan bevarar nattens historiska
status; dess öppna PR-/migrationspunkter är överspelade av uppdateringen.

Statusbild: 2026-09-13, efter verifierad F-merge och slutlig grön B-integration.
Detta är en spårbar kodleverans, **inte ett godkänt live-E2E**.
Uppdatera slutstatusfälten längst ned efter återstående integration/driftsättning.

## Avgränsning och vad som går att använda

Första V2-profilen bygger riktig Next.js som statisk export med interaktiv
klient-JavaScript. Genererad SSR, server actions, kund-API-rutter och godtycklig
buildkonfiguration ingår inte. GitHub-export är fortsatt valfri och behövs inte
för publicering.

Den nya koden är opt-in. V1-chatt/HTML-preview förblir befintlig väg när V2 är
avstängd eller saknar nödvändig konfiguration. Att kod ligger på `main`, en
Vercel-deploy är READY eller ett lokalt Next-bygge är grönt innebär inte att
kundens V2-arbetsflöde har aktiverats eller verifierats i drift.

## PR:ar, granskade heads och integration

Alla oberoende granskningar nedan är subagentgranskningar, inte Bugbot.
CI-länkar gäller angivet head, inte eventuella senare ändringar.

| Del | PR / exakt head | Kod och granskning | Merge vid statusbilden |
| --- | --- | --- | --- |
| A Site | [#27](https://github.com/Jakeminator123/sajtagent-site/pull/27), `39bc19315c2417e2114db3745ba94a363ddd58f7` | Oberoende granskad; tre ursprungliga övergångsfel rättade; 39 kontraktskontroller. | Mergad till `beae803d7c5210b7cf8d7d2add86b790bf77266c`. |
| A Runtime | [Sprites #26](https://github.com/Jakeminator123/sajtagent-sprites/pull/26), `d4ea291cc2c2d10fa80f884cec5b6923fd0f0b22` | Byte-identisk A-spegel, samma 39 kontroller/digest. | Mergad till `8a2a8b49b052c373aaa79fb411b0072398575477`. |
| B projekt-API | [Site #28](https://github.com/Jakeminator123/sajtagent-site/pull/28), `331a323b02f20f7fd200eb5efae4bc56d502d052` | Oberoende godkänd som API-grund; auth/tenant/workerbindning kontrollerad. [CI 34780588344](https://github.com/Jakeminator123/sajtagent-site/actions/runs/34780588344) grön. | **Öppen, lokal agent äger merge.** API-PR:n ensam ändrar inte Builderns destruktiva ”Nytt projekt”. |
| B projekt-UI | [Site #29](https://github.com/Jakeminator123/sajtagent-site/pull/29), integrerat remote-head `99e43c50f9dbd9a34f5ffeddc8d549893eb5c624` | Skapa/lista/öppna, URL-bundet projekt, separat tydlig återställning. Slutlig [CI 34783114045](https://github.com/Jakeminator123/sajtagent-site/actions/runs/34783114045) grön; oberoende integrationsreview godkänd. | Öppen, bygger fortsatt på lokalt ägda #28. Integrerar granskade F/main; #28:s branch oförändrad. |
| C1 worker | [Sprites #27](https://github.com/Jakeminator123/sajtagent-sprites/pull/27), `08f1a26b29d863a765d7885d5165a46e91e45399` | Oberoende säkerhetsgranskning klar; [Runtime CI 34781897055](https://github.com/Jakeminator123/sajtagent-sprites/actions/runs/34781897055) grön. | Mergad till `03e6519f49db624ce2bbc8a585a06fbad90f72d5`. **Inte driftsatt på Sprite.** |
| C2 promptkälla | [Sprites #28](https://github.com/Jakeminator123/sajtagent-sprites/pull/28), `81824423d1846a1232675755a58ae6f76f649c06` | Oberoende granskad; paketbindningsfel rättat; [Runtime CI 34782190549](https://github.com/Jakeminator123/sajtagent-sprites/actions/runs/34782190549) grön. | Mergad; runtime `main` är `ecd4a83da2e9db9430c496762d1b687bbea56ee0`. **Inte verifierad live-generation.** |
| B kontraktsspegel | [Sprites #29](https://github.com/Jakeminator123/sajtagent-sprites/pull/29), `4bc884c291436aba33fd42c459ad1c2c13976df2` | Oberoende byte-/blobgranskning; 20 delade kontroller; [Runtime CI 34782296981](https://github.com/Jakeminator123/sajtagent-sprites/actions/runs/34782296981) grön. | Öppen och redo, inväntar samordnad Site #28-merge. |
| D preview | [Site #31](https://github.com/Jakeminator123/sajtagent-site/pull/31), `2ee1276cbc69982de6f72bb08e59600ea2f3e648` | Oberoende slutgranskad; 50 riktade assertions, separat TypeScript; [CI 34782599457](https://github.com/Jakeminator123/sajtagent-site/actions/runs/34782599457) grön. | Mergad till `a75fa5b94d6a2f0224979ce5cc547dbefc5fe850`. |
| E exekverbart smoke | [Site #30](https://github.com/Jakeminator123/sajtagent-site/pull/30), `12030f69919069287bc5ecbb53f70184f9eda336` | Oberoende granskad; två potentiella falska positiva testutfall rättade. [CI 34781994072](https://github.com/Jakeminator123/sajtagent-site/actions/runs/34781994072) grön. | Mergad till `ab28a949a0d21ee2e13e612e2e86dddcf44cd6c8`. **Harnessen levererad, full E2E inte körd.** |
| F publicering | [Site #32](https://github.com/Jakeminator123/sajtagent-site/pull/32), `a8b05df10d559dad130ead9d7c18bc7fa97648b2` | Oberoende godkänd inklusive projektexponering/importfix. [CI 34782957591](https://github.com/Jakeminator123/sajtagent-site/actions/runs/34782957591), både verify/database gröna. | Mergad till Site `main` `ab3ea06d15158fefe51e2925d23ff2d370f4ff31`. **Publik kundsajt inte live-verifierad.** |

Kontraktsdigests:

- A Next-preview: `76e758a204196a86810927b9c43127ba69b9efc6483b62a52ad629c0b5391bfd`.
- B project-v2/fixtures: `fbd4f72978be02d95b6af0942afaec89ff971053d7c504856112f262026518eb`.

Produktens production-alias `sajtagent-site.vercel.app` har verifierats som READY
på deployment `dpl_AZuQb27acik9HtFh4mVVWZyC3PL1`, Git-SHA
`ab3ea06d15158fefe51e2925d23ff2d370f4ff31`. **Site-koden är alltså driftsatt.**
Det bevisar inte aktiverad V2, driftsatt Sprite-runtime, kund-preview eller publicerad kundsajt.

## Implementerat respektive faktiskt testat

- [x] A låser aktuell jobbidentitet/källrevision och terminalt failed-tillstånd.
- [x] B:s server-API kan skapa flera ägarbundna projekt utan återställning av tidigare projekt.
- [x] B:s separata UI-PR skiljer projektskapning från destruktiv starter-reset.
- [x] C implementerar dedikerad worker-Sprite per projekt, serverstyrd mappning,
  låsning, begränsningar, beständiga källrevisioner och processstädning/karantän.
- [x] C2 återanvänder den befintliga modellvägen med alla verktyg nekade för källgenerering.
- [x] D binder preview till jobb/projekt/revision, verifierar deployment och
  bevarar accepterad version vid fel/avbrott/timeout/sent svar. Det kvarvarande
  A-fallet med äldre failed-jobb täcks i serverövergångarnas regressioner.
- [x] D implementerar separat projektspecifik origin, engångsgrant, HttpOnly-cookie
  och sessionskontroll för varje HTML-/assetförfrågan; inga generella bypassnycklar till kundkod.
- [x] F monterar Next-panelen och låser publicering till exakt accepterad revision;
  nya misslyckade byggen ändrar inte en tidigare publicerad snapshot.
- [x] Lokal betrodd Next 16.3.3-fixture kompilerade som riktig statisk export
  med sex emitterade JavaScript-filer. Detta bevisar **inte** isolerad Sprite-körning.
- [x] Riktade kontrakts-/regressionskontroller och TypeScript-kontroller körda;
  runtime-/SQL-testdubblar är uttryckligen inte live-modell eller live-databas.
- [x] CI återapplicerar migrationer från noll och kör pgTAP. Det är inte bevis på
  att samma migrationer har applicerats på driftens Supabase.
- [ ] Full tvåkontos-browser-E2E med riktiga workers, cookies och projektflöden.
- [ ] Faktisk processdöd vid hård timeout och avbrott i rätt projektworker.
- [ ] Verifierad runtime-omstart följd av återöppning av exakt accepterad källa.
- [ ] Publik URL verifierad mot rätt projekts publicerade revision.

`next.config.mjs` har fortfarande den dokumenterade globala TypeScript-waivern.
Grön `next build` är därför inte en full typkontroll; separata scoped checks är
den redovisade typevidensen. Chromium-hämtning misslyckades i arbetsmiljön och
inga två autentiserade testkonton användes för ett live-E2E.

## Konkreta driftförutsättningar och åtkomstgräns

1. **Sprite-administration saknas i denna körning.** GitHub-merge ger inte
   runtime-köråtkomst. Ingen ny Sprite eller uppdaterad runtime-deployment har
   verifierats. Auktoriserad Sprite-anslutning och faktisk image-/UID-/process-
   och nätverksverifiering krävs innan kundkod aktiveras.
2. **Skyddad artifact-deployment saknar verifierad konfiguration.** D behöver
   ett separat statiskt Vercel-artifactprojekt samt serverlagrade deployment-
   och verifieringscredentials. Produktens vanliga Vercel-projektåtkomst är
   inte liktydigt med att detta är konfigurerat.
3. **Dedikerade preview/public-domäner saknar verifierad DNS/certifikat/routing.**
   Preview-domän och public-domän ska hållas separata från produkten och från
   varandra. Wildcard-origin, partitionerade cookies och faktisk iframe måste
   provas i browsern; en grön produktdeployment räcker inte.
4. **Live-databasmigrationerna är ännu inte applicerade i denna leverans.**
   D/F-migrationerna är säkerhetsgranskade och gröna i CI. Driftutrullning hålls
   avsiktligt samordnad med runtime/domäner och lokala B #28:s worker-migration.
   Supabase läs-/administrationsåtkomst finns; detta är inte ett allmänt
   Supabase-åtkomsthinder.
5. **Applikationens DB-rolls tillgång till `auth.sessions` är inte verifierad.**
   Att MCP kan läsa som en privilegierad databasroll bevisar inte applikationsrollens
   tillgång. Inga auth-grants har ändrats. Ge aldrig sessionsläsning till browserns
   `anon`/`authenticated`-roller för att få en kontroll grön.

Berörda migrationsfiler för samordnad rollout:

- B: `20260913202000_site_projects_worker_sprite_v2.sql` (Site #28).
- D: `20260913203600_next_preview_v2.sql`.
- F: `20260913203728_next_publications_v2.sql`.

Behåll V2 feature-gated tills dessa beroenden och säkerhetskontroller faktiskt
fungerar. Ingen användardata, hemlighet eller privat driftlogg ska läggas i PR
eller i denna checklista.

## Körbar verifiering och slutstatus att fylla i

Se [E2E-smoke](v2-e2e-smoke.md), [preview/driftkrav](next-preview-v2.md)
och [publicering/driftkrav](next-publication-v2.md). Körbar ingång:

```sh
node scripts/run-v2-e2e.mjs
```

Testharnessen använder enbart miljökonfigurerade serverinställningar och två
dedikerade testkonton. Den skriver redigerad evidens, aldrig auth-/grantvärden.
Exit 2 betyder att de körbara browser/API-kontrollerna passerat men separat
runtime-evidens fortfarande saknas; det får inte omtolkas som fullgod V2.

| Slutfält | Senast kända status / fyll i vid faktisk ändring |
| --- | --- |
| Site #28 överlämnad och mergad | **KVAR:** lokal agent äger fortfarande merge; ange merge-SHA när verifierad. |
| Site #29 slutligt integrerat remote-head | `99e43c50f9dbd9a34f5ffeddc8d549893eb5c624`, tree `84132a139114dd5c9549c3e64bfdea4e6be7da91`. Lokal full check/E-harness-check och CI 34783114045 gröna; oberoende slutreview godkänd. **KVAR:** efter #28-merge, retarget till main och samordnad merge. Merga inte UI-PR:n in i lokala agentens branch. |
| Sprites #29 samordnad merge | **KVAR:** grön `4bc884c...`, inväntar Site #28. |
| Slutliga Site/Runtime main-SHA | Site `ab3ea06d15158fefe51e2925d23ff2d370f4ff31`; Runtime `ecd4a83da2e9db9430c496762d1b687bbea56ee0`. Uppdatera efter kvarvarande merge. |
| Produktkod på Vercel production | **READY:** `dpl_AZuQb27acik9HtFh4mVVWZyC3PL1` på Site-main ovan. Inte ett V2-aktiveringsbevis. |
| Live-migrationer | **EJ APPLICERADE:** ange projekt, migrationsnamn och kontrolltid när genomförda. |
| Runtime-deploy och worker-smoke | **EJ VERIFIERAT:** ange runtime-SHA och redigerad process-/isoleringsevidens. |
| Gateway/artifact/public drift | **EJ VERIFIERAT:** ange deployment-id samt kontroller av skydd/DNS/routing, aldrig credentials. |
| Tvåkontos-E2E och publicerad revision | **EJ KÖRT:** ange datum, revisionsbindningar och passerade/blockerade scenarier. |

Slutlig Definition of Done får bockas av först när kvarvarande integration,
driftsättning och live-bevis finns. Denna checklista ersätter inte dessa bevis.
