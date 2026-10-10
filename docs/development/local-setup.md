# Local development setup

OrenjiTrade runs completely on a developer machine: PostgreSQL + PostGIS, Redis and the Firebase
Authentication emulator in Docker, the Spring Boot API and the Angular web app on the host (or in
Docker too). No Google Cloud, Firebase, Stripe, FCM, e-mail or map credentials are needed:
every external provider has a local fake or log implementation that is selected by default. Cloud
deployment is deliberately postponed, see [../deployment/DEFERRED.md](../deployment/DEFERRED.md).

All commands below run from the **repository root** and work the same in PowerShell, cmd, Git
Bash, macOS and Linux shells (they are Node scripts under `scripts/`, no extra dependencies).

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux) | Docker 24+, `docker compose` v2 | infrastructure, API integration tests (Testcontainers), optional all-in-Docker stack |
| Node.js + npm | Node 24 (`.nvmrc`), npm 11 | scripts, web, mobile, shared packages |
| JDK | 17 or newer on `PATH` | runs Gradle; Gradle downloads JDK 21 for the API build itself (foojay toolchain, into `~/.gradle/jdks`) |
| Git | any recent | |
| Terraform (optional) | 1.9+ | `npm run infra:validate` only |
| Python (optional) | 3.12+ (`python` on Windows) | `npm run test:ml` only; ML work is **on hold** |

Resources: give Docker Desktop at least 4 GB of memory (6 GB+ if you run the API test suite and the
dev stack at the same time). Disk: about 5 GB for Docker images, Gradle and npm caches, plus up to
5 GB for the local card image cache (`CARD_IMAGE_LOCAL_CACHE_MAX_MB`; the full Yu-Gi-Oh! catalog
at 320 px takes about 650 MB).

## First-time setup

```bash
git clone <repository-url> OrenjiTrade
cd OrenjiTrade
npm ci                      # once, at the root: web + mobile + packages (single npm workspace)
cp .env.example .env        # optional: the defaults already match docker-compose.yml
npm run dev                 # infrastructure + API + web, prints the URL table when ready
```

The first `npm run dev` takes several minutes: Docker pulls `postgis/postgis` and `redis` and
builds the emulator image, Gradle downloads its dependencies and JDK 21, and the API compiles.
Later starts take about a minute (measured on a Windows 11 laptop with warm caches, right after
`npm run infra:reset`: API ready after 30–45 s including Flyway migrations and the seed, web ready
15–20 s later). Then open <http://localhost:4200> and sign in with a seed account, for example
`collector1@orenjitrade.test` / `LocalDev!2026`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | `docker compose up -d --build --wait`, then the API (`gradlew bootRun`, profile `local`), waits for readiness, then `ng serve`, then prints the URLs. **Ctrl+C** stops the API and the web dev server (the Docker infrastructure keeps running). Options: `npm run dev -- --no-web`, `npm run dev -- --skip-infra`. |
| `npm run infra:up` | Starts PostGIS, Redis and the Firebase Auth emulator and waits until they are healthy (idempotent). |
| `npm run infra:down` | Stops and removes the project's containers (including the optional `app` / `pubsub` profiles). Data volumes are kept. |
| `npm run infra:reset` | **Deletes all local data** (see [Reset and reseed](#reset-and-reseed)) and brings the infrastructure back up. Asks for confirmation; `npm run infra:reset -- --yes` skips the prompt. |
| `npm run api:dev` | Only the API: `gradlew bootRun` (`gradlew.bat` on Windows) with the `local` profile on :8080. Needs `infra:up`. Extra args go to Gradle (`npm run api:dev -- --offline`). |
| `npm run web:dev` | Only the web app: `ng serve` on :4200 (builds the design tokens first). |
| `npm run infra:validate` | `terraform fmt -check` and `terraform init -backend=false` + `validate` for every environment. Never plans or applies anything. |
| `npm run generate:api` | Regenerates the Angular client and the mobile types from `docs/api/openapi.json`. |
| `npm run catalog:import -- --game yugioh --provider ygoprodeck --images referenced` | Imports the real Yu-Gi-Oh! catalog and caches the referenced card images (needs a running API), see [Card images](#card-images-and-the-real-yu-gi-oh-catalog). |
| `npm run card-images:status` / `card-images:clear -- --yes [--game yugioh]` | Shows / empties the local card image cache (at most 5 GB). |
| `npm run e2e:purge` | Removes every fictional E2E test account (`…@example.test`) from the **developer** database and the Auth emulator through the API's account-deletion path (one-shot maintenance mode of the jar; no running API needed); asks first (`-- --yes` skips the prompt). See [E2E test data](#e2e-test-data-and-the-purge). |

`npm run dev` writes the complete output of both children to `.local-dev/logs/api.log` and
`.local-dev/logs/web.log` (overwritten on every start) and echoes it with `[api]` / `[web]`
prefixes. To run the pieces in separate terminals instead: `npm run infra:up`, then
`npm run api:dev` in one terminal and `npm run web:dev` in another.

### Everything in Docker (optional `app` profile)

When you do not want a JDK or Node on the host, the compose file can also run the API and the web
app as containers (built from `apps/api/Dockerfile` and `apps/web-angular/Dockerfile`):

```bash
docker compose --profile app up -d --build --wait     # first build ~5 min, later ~1 min
docker compose logs -f api                            # API output (seed, fake/log providers)
docker compose --profile app stop api web             # stop only the two app containers
```

The URLs are the same as for a host run (web :4200, API :8080). The API container talks to
`postgres`, `redis` and `firebase-auth` by service name; the browser still uses `localhost:8080`
and the emulator on `localhost:9099` (rendered into the web container's `config.json`). It uses the
same database and emulator as `npm run dev`, so do not run both at once (ports 8080/4200). Uploaded
media of the containerised API lives in the `orenjitrade_api-media` volume. Host ports can be
changed with `API_PORT` / `WEB_PORT` in `.env`.

## URLs and ports

| Service | URL / address | Notes |
| --- | --- | --- |
| Web app | <http://localhost:4200> | `ng serve` (or the `web` container) |
| API | <http://localhost:8080/api/v1/...> | Spring Boot, profile `local` |
| Swagger UI | <http://localhost:8080/swagger-ui.html> | local/dev profiles only; OpenAPI JSON at `/v3/api-docs` |
| API readiness | <http://localhost:8080/actuator/health/readiness> | 200 when the database and Redis are reachable; liveness at `/actuator/health/liveness` |
| PostgreSQL + PostGIS | `localhost:5432` | databases `orenjitrade` (app, `npm run dev`), `orenjitrade_e2e` (web E2E suite, recreated per run), `orenjitrade_test` (manual integration runs); user `orenjitrade`, password `orenjitrade_local` |
| Redis | `localhost:6379` | cache, rate limits, presence; never primary storage. `npm run dev` uses logical db 0, the web E2E API db 2 (the mobile E2E harness db 1) |
| E2E API (only during `npm run test:e2e`) | <http://localhost:8180> | `E2E_API_PORT`; database `orenjitrade_e2e`, publishes `orenjiWebE2e` under `/actuator/info` |
| E2E web app (only during `npm run test:e2e`) | <http://localhost:4300> | `E2E_WEB_PORT`; `ng serve --configuration e2e`, its `config.json` points at the E2E API |
| Firebase Auth emulator | <http://localhost:9099> | project `orenjitrade-local`, any API key (`demo-local-key`) |
| Emulator UI | <http://localhost:4000> | browse / edit emulator accounts |
| ML service | <http://localhost:8000> | **on hold** (Phase 11); not started by any script; the API works without it |
| Pub/Sub emulator (optional) | `localhost:8085` | `docker compose --profile pubsub up -d`; the API uses the in-process event bus by default |

Host ports of the infrastructure can be moved with `POSTGRES_PORT`, `REDIS_PORT`,
`FIREBASE_AUTH_PORT` and `FIREBASE_UI_PORT` in `.env` (then also adjust `DATABASE_URL`,
`REDIS_URL` and `FIREBASE_AUTH_EMULATOR_HOST`, and the web `public/config.json`).

## Where the data lives

| Data | Location | Survives |
| --- | --- | --- |
| PostgreSQL (databases `orenjitrade`, `orenjitrade_e2e`, `orenjitrade_test`) | Docker named volume `orenjitrade_postgres-data` | restarts, `infra:down`; deleted by `infra:reset`. `orenjitrade_e2e` is also dropped and recreated by every `npm run test:e2e` |
| Redis (append-only file; db 0 developer, db 2 web E2E) | Docker named volume `orenjitrade_redis-data` | restarts, `infra:down`; deleted by `infra:reset` |
| Firebase Auth emulator accounts | Docker named volume `orenjitrade_firebase-data`, exported to `/data/export` when the emulator stops and imported on the next start | clean stops (`infra:down`, `docker compose stop/restart`, Docker Desktop quit); a killed container loses accounts created since its last start (the seed users are re-created by the next API start). Shared by every stack: a web E2E run deletes its own accounts (`e2e-<run id>-…@example.test`) at the end |
| Uploaded media (avatars, inventory and dispute images) of a host-run API | `apps/api/.local-storage/` (git-ignored), served by `GET /api/v1/public/media/{key}` | everything except `infra:reset` |
| Uploaded media of the Docker `app` profile API | Docker named volume `orenjitrade_api-media` | deleted by `infra:reset` |
| Card image cache of a host-run API (at most `CARD_IMAGE_LOCAL_CACHE_MAX_MB`, default 5 GB = 5120 MiB) | `apps/api/.local-storage/card-images/` (`CARD_IMAGE_CACHE_DIR`, git-ignored) | everything except `infra:reset` and `npm run card-images:clear` |
| Raw YGOPRODeck JSON snapshots (one directory per provider database version) | `apps/api/.local-dev/provider-data/ygoprodeck/<version>/` (`PROVIDER_DATA_DIR`, git-ignored) | everything (delete the folder to force a fresh download) |
| Web E2E stack files: uploaded media, card image cache (mock catalog: placeholders only), provider snapshot directory, API jar copy, `state.json` of a kept stack | `.local-dev/e2e/` (`media/`, `card-images/`, `provider-data/`, `api-e2e.jar`, `state.json`; git-ignored). The harness refuses to start when one of these resolves to a developer directory of any checkout/worktree or of `.env` (start-up reconciliation would delete the developer's cached card images) | emptied when `npm run test:e2e` recreates its database |
| Web E2E dev server config | `apps/web-angular/e2e/.runtime/config.json` (git-ignored, written per run) | |
| Script logs, Terraform plugin cache | `.local-dev/` (git-ignored; E2E logs `.local-dev/logs/e2e-api.log`, `e2e-web.log`) | |

Nothing is stored in the repository itself; `.local-dev/`, `.local-storage/` and `.env` are
git-ignored.

## Reset and reseed

- **Seed data is applied automatically** every time the API starts with the `local` profile
  (`SeedDataRunner`, idempotent): the twelve fictional accounts (database rows + emulator users),
  the four-game catalog, binders, conversations, offers, ratings, reports, wishlists, plans and
  feature flags. Restarting the API re-applies it without duplicating anything.
- **Clean slate:** `npm run infra:reset` (or `npm run infra:reset -- --yes`) runs
  `docker compose down -v` for this project only (volumes `orenjitrade_postgres-data`,
  `orenjitrade_redis-data`, `orenjitrade_firebase-data`, `orenjitrade_api-media`), deletes
  `apps/api/.local-storage`, and starts the infrastructure again with empty databases and an empty
  emulator. The next `npm run dev` / `npm run api:dev` recreates the schema (Flyway) and the seed.
  Stop a running API before resetting; the script warns when port 8080 is still in use.
- Schema changes always go through a new Flyway migration; never edit an applied one (a reset is
  not a substitute).

## Seed accounts

All accounts are fictional and exist only in the local emulator and database; the password of every
seed account is `LocalDev!2026`. Full list with roles and purpose:
[test-accounts.md](test-accounts.md) (`collector1`–`collector8`, `premium_user`, `moderator`,
`admin`, `superadmin`); seed content: [seed-data.md](seed-data.md).

Get an ID token without the UI (for curl / Swagger UI "Authorize"):

```bash
curl -s -X POST "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"collector1@orenjitrade.test","password":"LocalDev!2026","returnSecureToken":true}'
# then: curl -H "Authorization: Bearer <idToken>" http://localhost:8080/api/v1/me
```

## Running the tests

| Command | Runs | Notes |
| --- | --- | --- |
| `npm run test:api` | `gradlew test --rerun check` in `apps/api`: Spotless format check, unit tests, integration tests (always executed, never reported UP-TO-DATE) | Testcontainers starts its own PostGIS and Redis (Docker must run); independent of the dev stack |
| `npm run test:web` | `ng lint` + `ng test` (Vitest) for `apps/web-angular` | |
| `npm run test:mobile` | `tsc --noEmit`, `expo lint`, `jest` for `apps/mobile`, plus the mobile E2E harness guard tests (`node --test scripts/lib/mobile-e2e-guard.test.mjs`) | |
| `npm run test:mobile:e2e` | Playwright (`apps/mobile/e2e`) against the Expo **web** build and an isolated stack | see [Mobile app](#mobile-app-expo); never touches the developer database, files or ports 8080/4200 |
| `npm run test:mobile:maestro` | Maestro flows (`apps/mobile/.maestro`) in Expo Go on a running Android emulator, same isolated stack | needs an emulator and the Maestro CLI (`MAESTRO_BIN`); not part of `test:all` or CI |
| `npm run test:e2e` | the whole Playwright suite (`apps/web-angular/e2e`) on its **own isolated stack**, next to a running `npm run dev` | runs the isolation guard tests, checks the shared containers (healthy ones are never touched or restarted; `docker compose up` only when they are down), **drops and recreates `orenjitrade_e2e`** (Flyway + local seed, mock catalog only, never YGOPRODeck), builds the API jar (`gradlew bootJar`) and starts it on :8180 (Redis db 2, own realtime channels, media and card image cache under `.local-dev/e2e/`, `CARD_IMAGE_ON_DEMAND_ENABLED=false`, YGOPRODeck disabled), `ng serve --configuration e2e` on :4300, installs Chromium if missing, runs every spec with one retry (CI uses two; a spec that only passes on retry is listed as *flaky*), deletes the run's Auth emulator accounts, then stops what it started. The developer database, Redis db 0, files and ports 8080/4200 are never used. Options: see [E2E test data](#e2e-test-data-and-the-purge). Extra args go to Playwright: `npm run test:e2e -- e2e/map.spec.ts --headed`, `-- --retries=0`. The `launch-config` project (`e2e/launch-config.spec.ts`, every money flag off) runs alone after the `chromium` project; `-- e2e/launch-config.spec.ts --no-deps` runs it by itself |
| `npm run test:scripts` | `node --test scripts/lib/*.test.mjs` | unit tests of the E2E isolation guards and the purge rules (also run at the start of every `test:e2e`) |
| `npm run test:all` | scripts, api, web, mobile, e2e, mobile:e2e in sequence, then a summary with durations | exits non-zero when any suite fails (all suites still run) |
| `npm run test:ml` | `pytest` in `apps/ml` with `apps/ml/.venv` when present | optional; Phase 11 is on hold, this only runs the existing skeleton tests |
| `npm run infra:validate` | Terraform format + validate | optional; needs Terraform |

Reference timings (Windows 11, 16 cores, warm Gradle/npm caches, 2026-09-30): `test:api` about
5 min (704 tests), `test:web` about 40 s (lint + 578 unit tests), `test:mobile` 40–50 s (29
tests), `test:e2e` 3–4.5 min (51 specs, including building the jar and starting the stack; 5–6 min for 69
tests on its isolated stack on 2026-10-04, including recreating `orenjitrade_e2e`),
`test:all` 9–11 min; `infra:reset` about 15 s, `infra:validate` about 20 s. Mobile (2026-10-06,
stage M8): `test:mobile` about 1–2.5 min (748 jest tests in 85 suites + 28 harness guard tests),
`test:mobile:e2e` about 3–4 min (60 specs, including the API jar and the web export; about 2 min
when the stack is reused), `test:mobile:maestro` about 50 min (24 flows on the
`Pixel_6_API_34` emulator, including the API and Metro start; add a few minutes the first time,
while Expo CLI installs Expo Go).

E2E logs: `.local-dev/logs/e2e-api.log` and `.local-dev/logs/e2e-web.log`; Playwright traces and
screenshots of failures under `apps/web-angular/test-results/`.

## E2E test data and the purge

The web specs create fictional accounts (`e2e-<run id>-<prefix>-<suffix>@example.test`). Until
2026-10-04 `npm run test:e2e` started its API with the `local` profile against the **developer**
database, emulator and files (and `--reuse-running` reused the developer API itself), so every run
left hundreds of discoverable test collectors on the developer's map. Now:

- **Where E2E data lives.** Database `orenjitrade_e2e` (dropped and recreated at the start of every
  run; `-- --keep-db` keeps it), Redis db 2 (flushed together with the database), realtime channels
  `e2e-web:rt:user:*`, files under `.local-dev/e2e/`. The Firebase Auth emulator stays shared: the
  harness and Playwright's global teardown delete the run's accounts (`e2e-<run id>-…`) at the
  end, also after a failed run (best effort on Ctrl+C). The acceptance suite's `AcceptanceApi.cleanUp()` additionally retires every
  collector it created after each test: a deletion request through the API (off the map at once)
  or, when a deletion is blocked by an open trade, `discoverable: false`, then the emulator account
  is deleted; seed accounts are never touched and a teardown failure never fails a test.
- **Guards.** The harness refuses to start when the E2E API's database is not `orenjitrade_e2e`, its
  Redis db is 0, its port is one of the developer or mobile ports (8080, 4200, 8081, 8082, 8090,
  19006), or its media / card image cache directory resolves to a developer directory (start-up
  reconciliation would otherwise delete the developer's downloaded card images). These rules are
  unit-tested (`scripts/lib/web-e2e-guard.test.mjs`; one test fails when the E2E cache directory
  equals the developer one) and run before every `test:e2e`. Playwright's global setup refuses any
  API without the `orenjiWebE2e` identity block, so a bare `npx playwright test` can no longer hit
  the developer API.
- **Options.** `npm run test:e2e -- --keep-running` leaves the E2E API and web server running after
  the run (state in `.local-dev/e2e/state.json`); `-- --stack-only` starts them without running
  Playwright; `-- --reuse-running [specs]` reuses **only** such a kept E2E stack (same instance id
  in `/actuator/info`, web `config.json` pointing at it) and refuses with a clear message when it
  finds the developer API on :8080 or any API without the E2E identity; `-- --stop` stops a kept
  stack. `E2E_API_PORT` / `E2E_WEB_PORT` move the stack (never onto a developer or mobile port).

**Purging old test accounts from the developer database:** `npm run e2e:purge` (local only):

```bash
npm run e2e:purge                 # the developer database (DATABASE_URL of .env, default orenjitrade)
npm run e2e:purge -- --yes        # no prompt
npm run e2e:purge -- --e2e        # the E2E database orenjitrade_e2e instead
```

It shows what it found (`@example.test` accounts by status, their locations, discoverable points,
binders and items, and the `@example.test` emulator accounts) and asks for confirmation. The
database part runs inside the API jar (built with `gradlew bootJar`) in a one-shot maintenance
mode, so it uses the API's own account-deletion code and needs **no running API and no new
endpoint**: `orenji.maintenance.purge-test-accounts=true` with **no web server, Flyway off, the
seed runner off, the scheduled jobs off, no republication of other instances' outstanding events
and no card image start-up reconciliation**; the jar refuses to start (an environment check that
runs before Flyway or anything else) unless all of these hold, the profile is `local`/`dev`, the
PostgreSQL host is this machine and identities live in the local Auth emulator, and checks it again
before deleting anything. For every `@example.test` account that is not deleted yet it cancels open trades with
another test account, creates a deletion request (`AccountDeletionService.request`: blockers
checked, off the map, sessions revoked, audited) and processes exactly that request at once
(`AccountDeletionService.processNow`, the job's steps): every module purges its rows (location,
binders, inventory, wishlist, messages, …), the account row is anonymised, its emulator user deleted,
consents and audit kept, like any real deletion. No other account's deletion request is processed.
An account whose deletion stays blocked (an open trade with someone else, or past payment) is kept
and taken off the map. Then the remaining `@example.test` Auth emulator accounts are deleted (the
purge waits, up to `--wait-minutes` (20), while a mobile or web E2E run is active, since the emulator
is shared), and it prints how many accounts, locations, binders, items and emulator accounts it
removed. Seed accounts (`@orenjitrade.test`), other domains (`@mobile-e2e.test`), the card catalog
and the card image cache are never touched. The jar uses the developer's `.env` and Redis db 0, so
the deletion path's own events invalidate the developer API's discovery cache
(`LocationRemovedEvent`, the account deletion events); run it from the checkout whose `npm run dev`
you use, as its `apps/api/.local-storage` holds the uploaded media (avatars, item photos) the
deletion removes. Log: `.local-dev/logs/e2e-purge.log`.

## Mobile app (Expo)

The Expo app (`apps/mobile`, details in [apps/mobile/README.md](../../apps/mobile/README.md)) runs
against the same local stack. Phase 1 (accounts, onboarding, profile, settings) and Phases 2–3
(the Search tab and card detail; the Inventory tab with adding, editing and deleting cards;
binders, their publication and the public binder view) and Phase 4 ("Who has this in my region"
and the collector profile; since ADR 0017 the Map tab is a placeholder that names the home region
until it draws the web's boundary map) and Phases 5–6 (the Messages tab with the inbox,
conversations and the community channels, live over the realtime channel; the Wishlist tab
(stage S2: which copy, a public note, Near Mint only, a price term, wishlist alerts from the
region; no matches); the notification centre with a live bell) and Phases 7–8 (reporting a
collector and My reports; rating a collector and writing a reference after an interaction;
"Make an offer", the offers inbox, one offer with accept / counter / decline / withdraw; trades
with the meetup, confirming the exchange, cancelling, and rating once completed) and Phases 9–10
(payment protection on the trade: pay on the app's fake checkout, ship, confirm receipt, disputes
with statements and photos, Settings → Payouts; Premium through the fake billing checkout, credits
with referrals and day unlocks, voluntary donations through the fake donation checkout,
"Sponsored" placements) are implemented on the same API and the same local fake providers as the
web; the admin consoles stay on the web. Stage M7 (2026-10-06) closes the web parity gaps:
Google sign-in and sign-up (against the Auth emulator a simulated Google account chosen in the
app, no OAuth client needed; see `apps/mobile/README.md`), the Search tab's Collectors and Binders
segments, the card holders list with the web's filters, "Looking for" on profiles, Settings →
Blocked users, owner photos and bulk actions in the inventory, binder reordering, set pages. Stage M8 (2026-10-06, launch readiness on
mobile) adds the 18+ confirmation (the bilingual checkbox at sign-up and on the consent screen, a
first onboarding "Age" step for existing accounts: seed accounts see it once), the French legal
pages with an EN / FR switch (French by default on a French device, `npm run sync:legal` copies
both web files), consents recorded with the language shown, the dismissible "Trade safely"
notice in conversations and on offers / trades (dismissal kept on the device), Block / Unblock
on collector profiles, and no Premium pitch while the money flags are off. Locally the catalog is the fictional mock catalog of the seed (the real
Yu-Gi-Oh! catalog only after an explicit `npm run catalog:import`, see below), and every card
picture comes from the API (`/api/v1/public/card-images/{id}` or a placeholder), never from a
provider. The location is declared like on the web (ADR 0017): region, country, state or
province and an optional city, with pickers fed by `GET /api/v1/regions`; there is no map picker,
no GPS and no location permission. Region-scoped calls (search, card holders, ads) send the
collector's home region (`americas-north` without a location). The seed collectors are spread
over the three platform regions (see [test-accounts.md](test-accounts.md)).

```bash
npm run infra:up && npm run api:dev     # the developer stack (API on :8080)
cd apps/mobile && npx expo start        # a = Android emulator (Expo Go), w = web, or scan the QR code
```

Defaults need no `.env`: the Android emulator reaches the host at `10.0.2.2` (API
`http://10.0.2.2:8080`, Auth emulator `10.0.2.2:9099`), the iOS simulator and the web build use
`localhost`. A physical phone needs the machine's LAN address in `apps/mobile/.env`
(`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`; see `.env.example`, public
values only). Sign in with any seed account, e.g. `collector1@orenjitrade.test` / `LocalDev!2026`
(collector1 and collector2 share a seed conversation; collector2 has seed wishes and a wishlist alert about collector1's listing;
collector1 has collector5's open offer waiting for an answer and completed trades: Profile tab →
Offers / Trades; collector1 also sells a protected trade waiting for collector8's receipt, has
payouts set up, 300 credits and the referral code `COLLECTOR1`; collector5's protected trade with
collector2 is disputed: Trades → the trade → "View the dispute"; `premium_user` has a live fake
Premium subscription). The app's checkouts (`checkout/fake/…`, `checkout/fake-billing/…`,
`checkout/fake-donation/…`) are the local fake providers: a "Local test payment" banner, no card,
no money; whether a store build may sell Premium or take donations at all is an open owner
question (in-app purchase rules, ADR 0011).
The realtime channel is the API's `/ws` (STOMP over a plain WebSocket): the app connects while a
collector is signed in and shows "Live" on the Messages tab; on Android it reaches
`ws://10.0.2.2:8080/ws` with the ID token in the handshake's `Authorization` header (the web build
uses `?access_token=`). Notifications arrive in the app and over that channel only: device push
(Expo / FCM tokens) needs an EAS project and a real FCM sender and is not wired.
Everything is free and local: Expo Go (installed on an emulator by Expo CLI), a local Android
emulator, Metro; no EAS, no Expo account, no Maestro Cloud.

### Mobile end-to-end suites (isolated stack)

`npm run test:mobile:e2e` and `npm run test:mobile:maestro` never write into the developer's
database or files and leave a running `npm run dev` alone:

| Piece | Mobile E2E stack |
| --- | --- |
| Infrastructure | the shared containers; `npm run infra:up` only when one is not running, never restarted or reset |
| Database | `orenjitrade_mobile_e2e` on the shared PostgreSQL, dropped and recreated per run (Flyway + seed); `orenjitrade` is never touched |
| API | the API jar on **:8090** (profile `local`, Redis database 1 (flushed whenever the database is recreated, so no cached row of the dropped database reaches the new API) and realtime channels `e2e-mobile:rt:user:*`, fake/log providers, mock catalog only: YGOPRODeck disabled and pointed at a closed local port, no card image downloads), log `.local-dev/mobile-e2e/logs/api.log` |
| Files | media `.local-dev/mobile-e2e/storage`, card-image cache `.local-dev/mobile-e2e/card-images`, provider snapshots `.local-dev/mobile-e2e/provider-data`; the harness refuses to start when any resolves to a developer directory (start-up reconciliation deletes cache files its own database does not reference) |
| App | Playwright: `expo export --platform web` served on **:19006**; Maestro: Metro on **:8082** for Expo Go (`exp://10.0.2.2:8082`) |
| Accounts | created as `m-<run id>-...@mobile-e2e.test` and deleted from the Auth emulator at the end of the run; seed accounts are only signed in to |

The guards (`scripts/lib/mobile-e2e-guard.mjs`, unit tested in `mobile-e2e-guard.test.mjs`) reuse
the web E2E harness's helpers (`web-e2e-guard.mjs`, `local-db.mjs`, `auth-emulator.mjs`) and also
refuse Redis db 0 (developer) or 2 (web E2E), the developer's or the web E2E realtime prefix, a
non-local database, and dropping any database but `orenjitrade_mobile_e2e`; the mobile and web E2E
stacks and `npm run dev` can run side by side.

`--reuse-running` only reuses an API the harness itself started (identity block in
`/actuator/info`, instance id in `.local-dev/mobile-e2e/state.json`) and refuses the developer API
on :8080; `--keep-running` keeps the isolated API and web server (or Metro) for the next run and
`-- --stop` stops them. The native check: start an emulator
(`%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Pixel_6_API_34 -no-snapshot-save`), then
`MAESTRO_BIN=<path to maestro(.bat)> npm run test:mobile:maestro`. On an emulator without Expo Go,
the Metro started by the harness (`expo start --android`) installs it and the harness waits for
that install (up to 6 minutes) before running the flows. Flows that need data create it on the
host through the isolated API (`.maestro/scripts/create-collector.js`, `add-card.js`; the
second collector of the messaging, wishlist, offer and report flows comes from `messaging.js`,
`wishlist.js` and `offers.js`, the seller of the payment-protection flow and the member of the
Premium flow from `payments.js`; `offers.js` and `payments.js` post `{}` to body-less endpoints
because Maestro's `http.post` needs a body)
and check the result there (`check-location.js`, `check-inventory.js`, `community.js`; the collectors,
listings and block checks of the stage M7 flows come from `parity.js`); they refuse the developer API on :8080
and only touch the run's `@mobile-e2e.test` accounts. Edit nothing in the repository while flows
run (Metro re-crawls the workspace and Expo Go may report "Packager is not running"), and restart
Metro after source changes (`npm run test:mobile:maestro -- --stop`): on Windows a kept Metro did
not always serve them.

The Playwright specs open dynamic routes (`/cards/<id>`, `/binders/<id>`) inside the running app:
the static export served by `expo serve` has no rewrites for them, so a full page load of such a
URL answers 404 (deep links work in the native app).

## Card images and the real Yu-Gi-Oh! catalog

The start-up seed imports only the fictional mock catalog (offline, placeholder images). The real
Yu-Gi-Oh! TCG catalog comes from YGOPRODeck ([provider notes](../providers/ygoprodeck.md),
[ADR 0015](../architecture/adr/0015-card-images-provider-hosting-capped-cache.md)) and is imported
on request, with the API running:

```bash
npm run catalog:import -- --game yugioh --provider ygoprodeck --images referenced
```

- **Metadata** (14,592 cards, about 44,600 printings, 650 sets on 2026-10-01) is always imported
  completely into PostgreSQL. The first run downloads the catalog once (`checkDBVer.php`, then
  `cardinfo.php` + `cardsets.php`) and stores the raw JSON under
  `apps/api/.local-dev/provider-data/ygoprodeck/<database_version>/`; later runs only call
  `checkDBVer.php` and reuse the snapshot while the version is unchanged. A run takes about 15 s
  locally (about 5 s when nothing changed).
- **Images** go into the local cache. `--images` chooses which artworks are downloaded:
  `referenced` (default: cards in inventories, binders, wishlists, offers/trades, message and
  community card links), `all` (every artwork until the cache is full; the whole Yu-Gi-Oh!
  catalog, about 14,800 artworks / 650 MB at 320 px, fits in the default 5 GB), `limit:<n>` (the
  first `n`: referenced ones first, then by card name, so a second run downloads nothing new),
  `none`.
  Each image is stored once (320 px wide JPEG, about 45 KB; the 5 MB smoke cache held 52 files in
  2.3 MB) and served by
  `GET /api/v1/public/card-images/{id}`; YGOPRODeck URLs never reach the browser. Artworks that are
  not cached show the placeholder (or are fetched on first view while capacity remains).
- **Demo:** in the local/dev seed, collector1's public "Yu-Gi-Oh! trade binder" receives a few real
  printings (Blue-Eyes White Dragon LOB-EN001, Dark Magician LOB-EN005, Red-Eyes Black Dragon
  LOB-EN070, the five Exodia pieces) as soon as the real catalog exists, so a `referenced` import
  shows real pictures on its public binder page.
- **Limit:** `CARD_IMAGE_LOCAL_CACHE_MAX_MB` (default and maximum **5120** MiB = 5 GB since
  2026-10-04, previously 500; the API refuses to start above 5120 with "between 1 and 5120",
  smaller values are fine and are used as configured). Final files, temporary downloads and
  in-flight reservations together never exceed it. When the limit is reached the import still
  succeeds and reports `cacheLimitReached: true`. A `.env` copied from an older `.env.example`
  still says `CARD_IMAGE_LOCAL_CACHE_MAX_MB=500`: delete the line or set 5120 to get the new
  default.
- **Location:** `CARD_IMAGE_CACHE_DIR`, default `apps/api/.local-storage/card-images/` (one
  directory per database; a start-up reconciliation deletes files no row references, except
  files younger than 10 minutes, which it only counts). In the cloud the same cache keeps its
  renditions as objects under `card-images/` of the media bucket (`STORAGE_PROVIDER=gcs`,
  ADR 0015 amendment 2026-10-05) and uses the directory only for in-flight downloads;
  `CARD_IMAGE_STORAGE_PROVIDER`, `CARD_IMAGE_GCS_BUCKET` and `CARD_IMAGE_OBJECT_PREFIX` are
  cloud-only settings that stay empty locally.

The command polls the run and prints its report:

| Field | Meaning |
| --- | --- |
| `provider`, `providerDbVersion`, `imageMode`, `imageLimit` | what was imported |
| `totalCardsProcessed`, `cardsCreated`, `cardsUpdated`, `cardsUnchanged`, `cardsFailed` | card rows (a repeated import reports 0 created / 0 updated) |
| `setsUpserted`, `printingsUpserted`, `printingsSkipped` | sets and printings inserted or changed; printings skipped for provider data errors (listed in `warnings`) |
| `imagesReferenced` | artworks known for the game (source references stored, cached or not) |
| `imagesSelected`, `imagesAlreadyCached`, `imagesDownloaded`, `imagesDeduplicated` | the image mode's selection and what happened to it |
| `imagesSkippedCacheFull`, `imagesFailed`, `imagesMissingAtSource` | not cached: cache full, download/content error, 404 at the provider |
| `bytesDownloaded`, `cacheUsedMb`, `cacheReservedMb`, `cacheLimitMb`, `cacheLimitReached` | transfer and cache figures |
| `durationSeconds`, `errors`, `warnings` | run time, first errors (truncated), provider data notes |

Other commands (all need the API; `--api http://localhost:<port>` targets another port):

```bash
npm run card-images:status                          # used / reserved / remaining / limit, artworks per status and game
npm run card-images:clear -- --yes                  # delete every cached image file (metadata and references stay)
npm run card-images:clear -- --yes --game yugioh    # only one game
npm run card-images:reconcile                       # re-sync files, rows and accounting (also runs at start-up)
```

Admins have the same in the API (`GET /api/v1/admin/card-images/status`,
`POST /api/v1/admin/card-images/clear`, `DELETE /api/v1/admin/card-images/{id}/cache`,
`POST /api/v1/admin/catalog/sync` with `provider: ygoprodeck` and `imageMode`,
`GET /api/v1/admin/catalog/sync-runs/{id}/report`). **Reset the cache** with
`npm run card-images:clear -- --yes` (or stop the API and delete `apps/api/.local-storage/card-images`;
the next start reconciles). `npm run infra:reset` deletes it together with the database.

Etiquette while developing: never loop the importer; the provider allows 20 requests/second and
blocks the IP for an hour above it (OrenjiTrade paces at 5/s). Tests and CI never call YGOPRODeck.

## Fake and log providers (local defaults)

| Area | Local implementation | Selected by | Where to see it |
| --- | --- | --- | --- |
| Protected payments | `FakePaymentProvider` (no money moves) | `PAYMENT_PROVIDER=fake` | the web shows the fake checkout page `/checkout/fake/<ref>` (approve / decline), the mobile app the same checkout as its screen `checkout/fake/[ref]`; synthetic webhooks are signed with a local HMAC key and logged at DEBUG (`Synthetic fake webhook`) |
| Premium subscriptions | `FakeBillingProvider` | `BILLING_PROVIDER=fake` | fake checkout page `/checkout/fake-billing/<ref>` (mobile: `checkout/fake-billing/[ref]`); state in the admin console (Billing) |
| Donations | `FakeDonationProvider` | `DONATION_PROVIDER=fake` | fake checkout page `/checkout/fake-donation/<ref>` (mobile: `checkout/fake-donation/[ref]`); admin console (Donations) |
| Push notifications | `LogPushProvider` | `PUSH_PROVIDER=log` | API log lines from logger `orenji.push`: `push (log provider) notification=... type=... title="..."` |
| E-mail | `LogEmailProvider` | `EMAIL_PROVIDER=log` | logger `orenji.email`: `email (log provider) ... to=c***@orenjitrade.test subject="..."` (recipient masked) |
| Analytics events | `LogAnalyticsTransport` | `EVENTS_TRANSPORT=local` | logger `orenji.analytics`: `analytics {"name":...}` (pseudonymous actor hash, no amounts or text) |
| Domain events | in-process Spring Modulith outbox (`event_publication` table) | `EVENTS_TRANSPORT=local` | table `event_publication` in the `orenjitrade` database |
| Object storage | `LocalFileObjectStorage` | `STORAGE_PROVIDER=local` | files under `apps/api/.local-storage/`, URLs `http://localhost:8080/api/v1/public/media/...` |
| Identity | Firebase Auth emulator | `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` (implied by the `local` profile) | Emulator UI <http://localhost:4000>; verification / reset e-mail links are printed in `docker compose logs firebase-auth` |
| Maps | none: a Leaflet vector map of the bundled Natural Earth boundaries (`apps/web-angular/public/boundaries/`), no tiles | nothing to configure | the map page (`/map?region=...`); no coordinate exists anywhere (ADR 0017) |
| Card recognition (ML) | none (on hold) | `mlScanning` flag off | the API does not call the ML service |
| Card catalog | `MockCardProvider` (fictional, placeholder images) at start-up; YGOPRODeck only on request | seed + `npm run catalog:import` | `GET /api/v1/admin/catalog/sync-runs`; card images under `apps/api/.local-storage/card-images/` |

With `npm run dev` the API output is in `.local-dev/logs/api.log`, for example:

```bash
grep -E "orenji\.(push|email|analytics)" .local-dev/logs/api.log        # Git Bash / macOS / Linux
Select-String -Path .local-dev\logs\api.log -Pattern "orenji.push|orenji.email|orenji.analytics"   # PowerShell
docker compose logs api | grep orenji.push                             # Docker "app" profile
```

## Troubleshooting

**Docker is not running.** Every script checks `docker info` first and stops with
"Docker is not running". Start Docker Desktop, wait for "Engine running", retry. On Windows use the
WSL 2 backend.

**A port is busy.** `npm run dev` refuses to start when 8080 or 4200 is taken, `npm run test:e2e`
when 8180 or 4300 is taken (usually a stack left by `-- --keep-running`: `npm run test:e2e -- --stop`),
and both name the owning process. Typical owners: an earlier `npm run dev` that was not stopped,
a running API jar, another `ng serve`, or the Docker `app` profile
(`docker compose --profile app stop api web`). Find the owner yourself with
`netstat -ano | findstr :8080` (Windows; stop it with `taskkill /PID <pid> /T /F` if it is yours)
or `lsof -iTCP:8080 -sTCP:LISTEN` (macOS/Linux). For 5432/6379/9099/4000 a locally installed
PostgreSQL/Redis is the usual culprit: stop it or move the compose port (`POSTGRES_PORT=5433` in
`.env` and `DATABASE_URL` accordingly).

**The API does not become ready.** Read `.local-dev/logs/api.log`. Common causes: infrastructure
not healthy (`docker compose ps`), a database migrated by another branch (Flyway validation error,
e.g. a checksum mismatch: `npm run infra:reset`; for a scratch or E2E database only, drop and
recreate that one database instead, which keeps the dev database and the card-image cache; never
`flyway repair`), or the first Gradle run still downloading (be
patient; later runs use the cache). The readiness endpoint returns 503 while the database or Redis is down.

**Emulator warning "/data is not writable".** The `firebase-data` volume was created by an old
root-based emulator image; accounts would not persist across restarts. `npm run infra:reset`
recreates the volume with the current image.

**Signed out after a reset.** Tokens issued before `infra:reset` belong to accounts that no longer
exist; sign in again (seed accounts are re-created by the next API start).

**Windows specifics.**
- Use PowerShell, cmd, Windows Terminal or Git Bash; `npm run ...` behaves the same everywhere. The
  scripts call `gradlew.bat` on Windows and `./gradlew` elsewhere.
- Ctrl+C in `npm run dev` reaches the API (Gradle cancels `bootRun`) and `ng serve` through the
  console; the script waits for them, kills whatever is left (whole process tree, plus the API JVM
  that the Gradle daemon started, found by port 8080) and returns within a few seconds. Started
  without a console (a background job, a CI step), it kills the children directly when it receives
  a signal. npm may print its prompt before the script's last "Stopped" line; press Enter. Press
  Ctrl+C twice to force.
- Line endings are normalised by `.gitattributes`; do not enable `core.autocrlf=true` for shell
  scripts (`infrastructure/docker/**/entrypoint.sh` must stay LF or the container fails to start).
- Antivirus real-time scanning of `node_modules`, `~/.gradle` and the repository slows builds
  noticeably; exclude them if your policy allows.
- `localhost` resolves to IPv6 first on recent Windows builds; all services listen on both.

**Stray processes after a crash.** Stop only what you started: find the PID by port (see above)
and kill that tree. Never kill every `java.exe` / `node.exe` (other tools may be running).

**Playwright browser missing.** `npm run test:e2e` installs Chromium automatically
(`playwright install chromium`, cached under `%LOCALAPPDATA%\ms-playwright` or `~/.cache/ms-playwright`).

## Cloud deployment

Deferred by owner decision; nothing in the local setup needs cloud access. What stays in the
repository and what was switched off: [../deployment/DEFERRED.md](../deployment/DEFERRED.md).
