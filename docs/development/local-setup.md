# Local development setup

OrenjiTrade runs completely on a developer machine: PostgreSQL + PostGIS, Redis and the Firebase
Authentication emulator in Docker, the Spring Boot API and the Angular web app on the host (or in
Docker too). No Google Cloud, Firebase, Stripe, FCM, e-mail or Google Maps credentials are needed:
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
| PostgreSQL + PostGIS | `localhost:5432` | databases `orenjitrade` (app) and `orenjitrade_test` (manual integration runs); user `orenjitrade`, password `orenjitrade_local` |
| Redis | `localhost:6379` | cache, rate limits, presence; never primary storage |
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
| PostgreSQL (both databases) | Docker named volume `orenjitrade_postgres-data` | restarts, `infra:down`; deleted by `infra:reset` |
| Redis (append-only file) | Docker named volume `orenjitrade_redis-data` | restarts, `infra:down`; deleted by `infra:reset` |
| Firebase Auth emulator accounts | Docker named volume `orenjitrade_firebase-data`, exported to `/data/export` when the emulator stops and imported on the next start | clean stops (`infra:down`, `docker compose stop/restart`, Docker Desktop quit); a killed container loses accounts created since its last start (the seed users are re-created by the next API start) |
| Uploaded media (avatars, inventory and dispute images) of a host-run API | `apps/api/.local-storage/` (git-ignored), served by `GET /api/v1/public/media/{key}` | everything except `infra:reset` |
| Uploaded media of the Docker `app` profile API | Docker named volume `orenjitrade_api-media` | deleted by `infra:reset` |
| Card image cache of a host-run API (at most `CARD_IMAGE_LOCAL_CACHE_MAX_MB`, default 5 GB = 5120 MiB) | `apps/api/.local-storage/card-images/` (`CARD_IMAGE_CACHE_DIR`, git-ignored) | everything except `infra:reset` and `npm run card-images:clear` |
| Raw YGOPRODeck JSON snapshots (one directory per provider database version) | `apps/api/.local-dev/provider-data/ygoprodeck/<version>/` (`PROVIDER_DATA_DIR`, git-ignored) | everything (delete the folder to force a fresh download) |
| Script logs, E2E jar copy, Terraform plugin cache | `.local-dev/` (git-ignored) | |

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
| `npm run test:mobile` | `tsc --noEmit`, `expo lint`, `jest` for `apps/mobile` | mobile feature work is deferred; the suite must stay green |
| `npm run test:e2e` | the whole Playwright suite (`apps/web-angular/e2e`) against the real local stack | ensures the infrastructure, builds the API jar (`gradlew bootJar`), starts it on :8080 (with `CARD_IMAGE_ON_DEMAND_ENABLED=false`: uncached real catalog artworks show placeholders instead of being downloaded from the provider during the run) and `ng serve` on :4200, installs Chromium for Playwright if missing, runs every spec with one retry (CI uses two; a spec that only passes on retry is listed as *flaky*), then stops the API and the web server it started. Ports 8080/4200 must be free (stop `npm run dev` first) or pass `-- --reuse-running`. Extra args go to Playwright: `npm run test:e2e -- e2e/map.spec.ts --headed`, `-- --retries=0` |
| `npm run test:all` | api, web, mobile, e2e in sequence, then a summary with durations | exits non-zero when any suite fails (all suites still run) |
| `npm run test:ml` | `pytest` in `apps/ml` with `apps/ml/.venv` when present | optional; Phase 11 is on hold, this only runs the existing skeleton tests |
| `npm run infra:validate` | Terraform format + validate | optional; needs Terraform |

Reference timings (Windows 11, 16 cores, warm Gradle/npm caches, 2026-09-30): `test:api` about
5 min (704 tests), `test:web` about 40 s (lint + 578 unit tests), `test:mobile` 40–50 s (29
tests), `test:e2e` 3–4.5 min (51 specs, including building the jar and starting the stack),
`test:all` 9–11 min; `infra:reset` about 15 s, `infra:validate` about 20 s.

E2E logs: `.local-dev/logs/e2e-api.log` and `.local-dev/logs/e2e-web.log`; Playwright traces and
screenshots of failures under `apps/web-angular/test-results/`. The specs create additional
fictional accounts (`e2e-*@example.test`) in the local emulator and database; `infra:reset`
removes them.

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
  directory per database; a start-up reconciliation deletes files no row references).

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
| Protected payments | `FakePaymentProvider` (no money moves) | `PAYMENT_PROVIDER=fake` | the web shows the fake checkout page `/checkout/fake/<ref>` (approve / decline); synthetic webhooks are signed with a local HMAC key and logged at DEBUG (`Synthetic fake webhook`) |
| Premium subscriptions | `FakeBillingProvider` | `BILLING_PROVIDER=fake` | fake checkout page `/checkout/fake-billing/<ref>`; state in the admin console (Billing) |
| Donations | `FakeDonationProvider` | `DONATION_PROVIDER=fake` | fake checkout page `/checkout/fake-donation/<ref>`; admin console (Donations) |
| Push notifications | `LogPushProvider` | `PUSH_PROVIDER=log` | API log lines from logger `orenji.push`: `push (log provider) notification=... type=... title="..."` |
| E-mail | `LogEmailProvider` | `EMAIL_PROVIDER=log` | logger `orenji.email`: `email (log provider) ... to=c***@orenjitrade.test subject="..."` (recipient masked) |
| Analytics events | `LogAnalyticsTransport` | `EVENTS_TRANSPORT=local` | logger `orenji.analytics`: `analytics {"name":...}` (pseudonymous actor hash, no amounts or text) |
| Domain events | in-process Spring Modulith outbox (`event_publication` table) | `EVENTS_TRANSPORT=local` | table `event_publication` in the `orenjitrade` database |
| Object storage | `LocalFileObjectStorage` | `STORAGE_PROVIDER=local` | files under `apps/api/.local-storage/`, URLs `http://localhost:8080/api/v1/public/media/...` |
| Identity | Firebase Auth emulator | `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` (implied by the `local` profile) | Emulator UI <http://localhost:4000>; verification / reset e-mail links are printed in `docker compose logs firebase-auth` |
| Maps | Leaflet + OpenStreetMap tiles in the web app | empty Google Maps key | the map page; exact coordinates never leave the API (ADR 0004) |
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

**A port is busy.** `npm run dev` and `npm run test:e2e` refuse to start when 8080 or 4200 is
taken and name the owning process. Typical owners: an earlier `npm run dev` that was not stopped,
a running API jar, another `ng serve`, or the Docker `app` profile
(`docker compose --profile app stop api web`). Find the owner yourself with
`netstat -ano | findstr :8080` (Windows; stop it with `taskkill /PID <pid> /T /F` if it is yours)
or `lsof -iTCP:8080 -sTCP:LISTEN` (macOS/Linux). For 5432/6379/9099/4000 a locally installed
PostgreSQL/Redis is the usual culprit: stop it or move the compose port (`POSTGRES_PORT=5433` in
`.env` and `DATABASE_URL` accordingly).

**The API does not become ready.** Read `.local-dev/logs/api.log`. Common causes: infrastructure
not healthy (`docker compose ps`), a database migrated by another branch (Flyway validation error,
e.g. a checksum mismatch: `npm run infra:reset`), or the first Gradle run still downloading (be
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
