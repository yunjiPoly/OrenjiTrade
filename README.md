# OrenjiTrade

**A regional discovery network for trading cards.** OrenjiTrade answers one question:
*Who in my region owns, trades, sells, wants, or accepts offers for this card?* Collectors say
which country and state or province they are in (never a position: ADR 0017), publish binders,
and other collectors of the same platform region (Americas North, Americas South, Europe) find
them by state or province on a map of binder counts, then message, offer, trade and rate each
other. Multi-game by design (Yu-Gi-Oh!, Pokémon, Magic: The
Gathering, Riftbound, and future TCGs) with one generic catalog model.

- Web: https://www.orenjitrade.com (admin at `/admin`)
- API: https://api.orenjitrade.com (`/api/v1/...`)

> Status: MVP under active construction. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
> for the phase checklist and the exact next task, and [CLAUDE.md](CLAUDE.md) for engineering rules.

## Architecture at a glance

```
Cloudflare (DNS · CDN · WAF)
    ↓
Google Cloud — External HTTPS LB → Cloud Run: web (Angular/nginx) · api (Spring Boot) · ml (FastAPI)
    ↓
Cloud SQL PostgreSQL + PostGIS · Memorystore Redis · Cloud Storage
    ↓
Pub/Sub (domain + analytics events) → BigQuery · ML workers · notifications (FCM)
```

- **Modular monolith** backend (Java 21, Spring Boot 4.1) with one package per domain module.
- **PostGIS** is the geographic source of truth; the map never receives exact collector
  coordinates ([ADR 0004](docs/architecture/adr/0004-collector-location-privacy.md)).
- **Firebase Authentication** for identity; roles and privacy settings live in our database.
- **Provider abstractions** (cards, payments, push, storage, events, maps) with local/mock
  implementations so everything runs without cloud credentials.

Full description: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) and the
[ADR index](docs/architecture/adr/README.md).

## Repository structure

```
OrenjiTrade/
├── apps/
│   ├── api/            Spring Boot API (Gradle, Java 21)
│   ├── web-angular/    Angular 22 web app (Material, Playwright)
│   ├── mobile/         Expo SDK 57 / React Native app (expo-router, Maestro)
│   └── ml/             FastAPI ML service (card identification, duplicates)
├── packages/
│   ├── api-client/     Generated Angular client from OpenAPI
│   ├── shared-types/   Generated TypeScript types + openapi-fetch helper (mobile)
│   └── design-tokens/  Colours, typography, spacing → CSS variables + TS
├── package.json        npm workspaces root (apps/web-angular, apps/mobile, packages/*): one `npm ci`, one lockfile
├── infrastructure/
│   ├── terraform/      GCP modules + environments (dev, staging, prod)
│   ├── docker/         Local emulator images, Postgres init
│   └── cloudflare/     DNS / WAF / cache configuration + Terraform
├── docs/               architecture · api · database · security · deployment · product · design
├── .github/workflows/  CI, Docker build, deploy, E2E, CodeQL
├── docker-compose.yml  Local infrastructure
└── .env.example        Environment template (never commit .env)
```

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Docker Desktop | 4.x+ (Compose v2) | PostGIS, Redis, Firebase Auth emulator, Testcontainers |
| Node.js | 24 (see `.nvmrc`), npm 11 | scripts, web, mobile, packages |
| JDK | 17+ installed | Gradle auto-provisions JDK 21 for the API (foojay toolchain) |
| Terraform | 1.9+ | optional: `npm run infra:validate` only |
| Python | 3.12+ | optional: ML service (on hold), `python` on Windows |

No Google Cloud, Stripe, Firebase, FCM, e-mail or map credentials are required locally:
every provider has a local fake or log implementation selected by default.

## Quick start (local)

```bash
git clone <repo> OrenjiTrade && cd OrenjiTrade
npm ci                  # once, at the repo root (npm workspace: web + mobile + packages)
npm run dev             # docker compose infra -> API (bootRun, profile local) -> ng serve -> URL table
```

Open <http://localhost:4200> and sign in with a seed account such as
`collector1@orenjitrade.test` / `LocalDev!2026` ([all seed accounts](docs/development/test-accounts.md)).
Ctrl+C stops the API and the web dev server; the Docker infrastructure keeps running.

| Command | Purpose |
| --- | --- |
| `npm run dev` | whole stack on the host (`-- --no-web` for the API only) |
| `npm run infra:up` / `infra:down` | start (and wait for health) / stop PostGIS, Redis, Firebase Auth emulator; data is kept |
| `npm run infra:reset` | delete all local data (project volumes + `apps/api/.local-storage`) and restart the infrastructure; the seed is re-applied at the next API start (`-- --yes` skips the prompt) |
| `npm run api:dev` / `npm run web:dev` | API only (`gradlew bootRun`, profile `local`) / web only (`ng serve`) |
| `docker compose --profile app up -d --build --wait` | everything in Docker (API and web images), same URLs |
| `npm run infra:validate` | `terraform fmt -check` + `validate` without backend (nothing is planned or applied) |

| Service | URL |
| --- | --- |
| Web | <http://localhost:4200> |
| API / Swagger UI | <http://localhost:8080/api/v1/...> / <http://localhost:8080/swagger-ui.html> |
| API readiness | <http://localhost:8080/actuator/health/readiness> |
| Firebase Auth emulator / UI | <http://localhost:9099> / <http://localhost:4000> |
| PostgreSQL / Redis | `localhost:5432` (`orenjitrade` / `orenjitrade_local`) / `localhost:6379` |

The complete guide (first-time setup, where data lives, reset and reseed, fake/log providers and
how to see their output, troubleshooting, Windows notes) is
[docs/development/local-setup.md](docs/development/local-setup.md).

The JavaScript side of the repository is a single npm workspace: the root `package.json` lists
`apps/web-angular`, `apps/mobile` and `packages/*`, and the root `package-lock.json` is the
only lockfile (`packages/api-client/tools` keeps its own on purpose, it is generator tooling).
Never run `npm install` inside an app folder; run `npm ci` at the root and then either `cd`
into the app or use `npm run <script> -w apps/<app>` from the root. Root shortcuts:
`npm run build:tokens`, `npm run generate:api`, `npm run lint`, `npm test`, `npm run typecheck`
(the last three fan out to every workspace that has the script).

### Database

The `postgres` container creates the `orenjitrade` database with PostGIS, `pg_trgm`, `unaccent`
and `pgcrypto`. Schema is owned by Flyway migrations in
`apps/api/src/main/resources/db/migration` and applied automatically when the API starts.
Seed data (fictional collectors, cards for four games, binders, wishlists, conversations) loads
under the `local` profile at every API start (idempotent). Clean slate: `npm run infra:reset`.

### Web

Runtime configuration is read from `apps/web-angular/public/config.json` (API URL, Firebase web
config). The map needs no key: it draws the bundled Natural Earth boundaries of
`apps/web-angular/public/boundaries/` (no tiles, no map provider; provenance in
[docs/development/regions-boundaries.md](docs/development/regions-boundaries.md)).

### Mobile (deferred)

Mobile feature work is deferred until the web app is complete; the suite is kept green
(`npm run test:mobile`).

```bash
# after `npm ci` at the repo root
cd apps/mobile
cp .env.example .env         # EXPO_PUBLIC_API_BASE_URL should point at your machine's LAN IP for devices
npx expo start
```

### ML service (on hold)

Phase 11 (card recognition) is on hold by owner decision; the API does not need the ML service.
The skeleton's tests run with `npm run test:ml` (uses `apps/ml/.venv` when present; see
`apps/ml/README.md` to create it).

## Environment variables

All variables are listed with comments in [.env.example](.env.example). Copy it to `.env` only
when you need to change something: docker compose reads the port variables from it and the npm
scripts pass its non-empty values to the API. Key groups: database, Redis, Firebase (project id +
emulator host), Google Cloud (project, region, buckets), events transport (`local` | `pubsub`),
storage provider (`local` | `gcs`), payments / billing (`fake` | `stripe`), donations
(`fake`), push (`log` | `fcm`), email (`log`), ML URL, CORS origins. Production values would live
in Secret Manager and Cloud Run configuration, never in Git.

## Running tests

| Command | Runs |
| --- | --- |
| `npm run test:api` | `gradlew check` in `apps/api`: Spotless, unit and integration tests (Testcontainers; Docker required) |
| `npm run test:web` | web lint + unit tests (Vitest) |
| `npm run test:mobile` | mobile typecheck + lint + jest |
| `npm run test:e2e` | whole Playwright suite on its own isolated stack next to `npm run dev`: recreates the database `orenjitrade_e2e`, builds and starts the API jar (:8180, Redis db 2, files under `.local-dev/e2e/`) and `ng serve --configuration e2e` (:4300), runs every spec (one retry; flaky specs are listed), deletes the run's emulator accounts, stops what it started (`-- --keep-running`, `-- --reuse-running` for a kept E2E stack only, `-- --stop`) |
| `npm run test:scripts` | unit tests of the E2E isolation guards and the purge rules (`node --test`) |
| `npm run e2e:purge` | removes every `@example.test` test account from the developer database and the Auth emulator through the account-deletion path (local only, asks first, no running API needed) |
| `npm run test:all` | scripts + api + web + mobile + e2e with a timing summary |
| `npm run test:ml` | optional ML skeleton tests (on hold) |
| `npm run infra:validate` | Terraform format + validate for every environment |

API OpenAPI export: `cd apps/api && ./gradlew exportOpenApi` (writes `docs/api/openapi.json`).
Test accounts for local use: [docs/development/test-accounts.md](docs/development/test-accounts.md).

## API contract and generated clients

The OpenAPI document is generated from the Spring Boot application (`./gradlew exportOpenApi`)
into `docs/api/openapi.json`. Regenerate clients afterwards:

```bash
npm run generate:api                            # at the repo root: Angular services + TypeScript types for mobile
# individually: npm run generate -w packages/api-client / npm run generate -w packages/shared-types
```

CI fails if the committed spec drifts from the code.

## Docker images

```bash
docker build -t orenjitrade/api apps/api
docker build -t orenjitrade/web -f apps/web-angular/Dockerfile .     # context = repo root (root lockfile + packages/)
docker build -t orenjitrade/ml apps/ml
```

## Deployment overview

> **Deferred (owner decision 2026-09-29):** nothing is deployed yet; the project runs locally only.
> What stays ready and what was switched off: [docs/deployment/DEFERRED.md](docs/deployment/DEFERRED.md).

GitHub Actions builds images on `main`, pushes to Artifact Registry using Workload Identity
Federation (no service-account keys), and deploys to Cloud Run per environment (dev automatic;
staging/prod behind approvals). Terraform provisions Cloud SQL, Redis, storage, Pub/Sub,
BigQuery, secrets, IAM, load balancer, monitoring. Cloudflare fronts everything with DNS, WAF and
cache rules (API responses are never cached). Step-by-step: [docs/deployment/README.md](docs/deployment/README.md)
and [infrastructure/cloudflare/README.md](infrastructure/cloudflare/README.md).

## Documentation map

- Engineering rules: [CLAUDE.md](CLAUDE.md)
- Progress and next task: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
- Local development: [docs/development/local-setup.md](docs/development/local-setup.md)
- Architecture and ADRs: [docs/architecture/](docs/architecture/)
- Database schema: [docs/database/schema.md](docs/database/schema.md)
- Design system: [docs/design/design-system.md](docs/design/design-system.md)
- Security: [docs/security/README.md](docs/security/README.md)
- Deployment: [docs/deployment/](docs/deployment/)

## Licence

Proprietary. See [LICENSE](LICENSE).
