# Sajtagent V2 — integration och drift 2026-09-14

Historisk statusbild från integrationspasset 2026-09-14. Den ersatte då de öppna
integrations- och migrationspunkterna i [leveranschecklistan](v2-delivery-checklist.md).
Senare deployer, operatörsåtkomst och liveprov måste stämmas av mot
[Platform-handoff](https://github.com/Jakeminator123/sajtagent-platform/blob/main/docs/v2-rollout-handoff.md).
Nedan bevaras passets bevis och då återstående steg; full live-V2 är inte
godkänd av denna rapport. Den öppna 503:an och live-E2E:n stängdes dagen efter,
se [2026-09-15](v2-live-rollout-2026-09-15.md).

## Genomfört

| Del | Resultat och bevis |
| --- | --- |
| Site #28, projekt/API | Oberoende granskad på `a3020b716dbdcd2eab9ba596d103e320b5b637f7`; mergad som `14350a3e5f3d1745c6fd26f37c2e8da001938cf9`. [CI](https://github.com/Jakeminator123/sajtagent-site/actions/runs/34783553317) grön. |
| Site #29, flerprojekts-UI | Mergad som `e925a03e14c272d080adefdee5206f6ca01a7ee9`. Konflikten efter #28 gällde npm-script; samtliga kontroller bevarades. Slutligt head `24f0818e6a7765c0da33ce7df80c493b45a380c8`, exakt granskat träd `3e69cb631ff0cab7c7347cb54c8b681fcb1711ea`. [CI](https://github.com/Jakeminator123/sajtagent-site/actions/runs/34827092672) grön. |
| Sprites #29, kontraktsspegel | Byte-identiska Git-blobs för projektkontrakt och fixtures mot Site #28. Mergad som `6df810f708877f1fd23cecf4d4c5e8d7684efc42`. [CI](https://github.com/Jakeminator123/sajtagent-sprites/actions/runs/34782296981) grön. |
| Sprites #30, verklig Linux-verifiering | Mergad som `d66ea5c2f5479ad06e9da0399290367679ab1347`. [CI](https://github.com/Jakeminator123/sajtagent-sprites/actions/runs/34827668952) på head `5a7948883bb71a4b045acff7d5c3bcbc62839d04` kör exakt supervisor med UID 20000: frikopplat non-dumpable barn stoppas före output och i separat cancellation-sweep; symlink-root nekas. Fake npm/node, ingen live-Sprite. |
| Supabase | B, D och F applicerade i Sajtagent `ywoltuegeemqznbcgokg`, i den ordningen. Efterkontroll verifierar worker-kolumn/index, bibehållen ägarläsning och stängd klientåtkomst till alla tre nya tabeller. |
| Vercel efter projektsammanslagningen | Production READY på `e925a03e14c272d080adefdee5206f6ca01a7ee9`, deployment `dpl_6aZJ6pgHPALvjnWKsXtJyRs5jg51`. Browser visar projektväljaren; utloggad åtkomst ger inloggningskrav. Detta är inget tvåkontos-E2E. |
| Preview-konfiguration | Produktens origin får inte vara exakt preview-zonens apex. Den saknade likhetskontrollen är rättad med regressionsfall. Befintligt felkonfigurerade domäner måste korrigeras; proxy faller fortsatt säkert tillbaka till nekad åtkomst. |

Alla granskningar här är oberoende Codex-subagent/root-granskningar, inte Cursor
Bugbot. Den här insatsen ändrar bara Sajtagents två repon och dess egen databas.

Ett preliminärt runtime-fynd om non-dumpable processer drogs tillbaka efter
verklig Linux-körning. Linux behåller processkatalogens effektiva UID även när
vissa filer inne i katalogen byter ägare. Den befintliga kontrollen
`stat('/proc/<pid>').st_uid` var därför inte fel på det sätt som först påstods.
Ingen sådan runtime-fix behövs. [Kernelimplementation](https://github.com/torvalds/linux/blob/master/fs/proc/base.c).
Det extra supervisor-testet är nu grönt i riktig Ubuntu-CI enligt raden ovan.
Nettoändringen i #30 gäller bara test, CI och dokumentation; runtime-koden
är oförändrad. Faktisk Sprite-image och faktisk Next-installation återstår.

## Live-migrationer

| Repo-migration | Registrerad live-version | Namn |
| --- | --- | --- |
| `20260913202000_site_projects_worker_sprite_v2.sql` | `20260914091337` | `site_projects_worker_sprite_v2` |
| `20260913203600_next_preview_v2.sql` | `20260914091350` | `next_preview_v2` |
| `20260913203728_next_publications_v2.sql` | `20260914091352` | `next_publications_v2` |

Live-historikens V1-versioner skiljer sig också från repo-filnamnen, medan
migrationsnamn och förutsättningar stämmer. Kör därför inte blind `db push`
som försöker återskapa befintliga tabeller. Dessa tre migrationer ska inte köras
igen; stäm av namn och faktisk schema-status vid nästa utrullning.

Efterkontroll:

- `site_projects.worker_sprite_id` är nullable med formatvillkor och unikt index.
- Ägare har fortsatt SELECT-only med befintlig RLS-policy för `site_projects`.
- `next_preview_states`, `next_preview_access` och `next_publications_v2`
  har RLS och saknar SELECT för `anon`/`authenticated`; serverrollen har DML.
- Inga rättigheter till `auth.sessions` har ändrats. `postgres` kan läsa de
  behövda kolumnerna; `service_role`, `anon` och `authenticated` kan inte det.
- Databasens säkerhetsrådgivare visar avsiktligt server-only-tabeller utan
  klientpolicy. Det är inte skäl att öppna dem. Den tidigare varningen om
  avstängt skydd mot läckta lösenord kvarstår och är separat från V2-migrationerna.

## Driftsteg som återstod vid denna statusbild

1. Anslut Sajtagents auktoriserade Sprite-administration. I denna session finns
   ingen sådan anslutning eller token, och pluginsökningen hittade ingen Sprites-
   integration. Läs-/skrivåtkomst till GitHub är inte runtime-åtkomst.
2. Driftsätt granskad `sajtagent-sprites/main` och verifiera worker-image,
   privat URL, nätpolicy, faktisk UID-isolering, npm/Next-bygge samt processdöd
   vid normal avslutning, avbrott och hård timeout. Behåll kontrollplansnycklar
   utanför kundworkern. Se [worker-instruktionerna](https://github.com/Jakeminator123/sajtagent-sprites/blob/main/docs/next-worker-v2.md).
3. Konfigurera separat skyddat Vercel-artifactprojekt, servercredentials och
   exklusiva preview-/publiceringszoner med wildcard-DNS och certifikat.
   Den anslutna Vercel-appen ger deploymentinspektion, men denna session saknar
   skrivväg för projektets miljövariabler/domäner. Ingen sådan ändring hävdas.
   Exakta variabelnamn och ägargränser finns i [preview](next-preview-v2.md)
   och [publicering](next-publication-v2.md).
4. Verifiera DB-rollen via den faktiskt driftsatta appens `pg.Pool`, utan att
   skriva ut connection string. MCP:s privilegierade roll bevisar inte appens.
5. Kör [tvåkontos-E2E](v2-e2e-smoke.md) med dedikerade testkonton: skapa två
   projekt, acceptera och iterera riktig Next, interaktiv iframe, nekad direkt-
   och cross-account-åtkomst, misslyckat bygge, omstart och publicerad revision.
   Harnessen är `node scripts/run-v2-e2e.mjs`; exit 2 är ofullständigt bevis.

Appens DB-kontroll kan köras med dess befintliga pool:

```sql
select current_user as application_db_role,
  has_schema_privilege(current_user, 'auth', 'USAGE') as auth_schema_usage,
  has_column_privilege(current_user, 'auth.sessions', 'id', 'SELECT')
    and has_column_privilege(current_user, 'auth.sessions', 'user_id', 'SELECT')
    and has_column_privilege(current_user, 'auth.sessions', 'not_after', 'SELECT')
    as preview_session_read;
```

Aktivera inte kundernas V2-läge utifrån en grön CI eller migrationskontroll
ensam. Första profilen är Next statisk export med klient-JavaScript; SSR,
server actions och kund-API-rutter ingår fortfarande inte.
