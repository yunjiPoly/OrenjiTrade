# OrenjiTrade

**A geographic discovery network for trading cards.** OrenjiTrade answers one question:
*Who near me owns, trades, sells, wants, or accepts offers for this card?* Collectors publish
binders, and other collectors find them on a map at deliberately approximate positions, then
message, offer, trade and rate each other. Multi-game by design (Yu-Gi-Oh!, Pokémon, Magic: The
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
| Docker Desktop | 4.x+ | PostGIS, Redis, Firebase Auth emulator, Testcontainers |
| Node.js | 24 (see `.nvmrc`) | web, mobile, packages |
| JDK | 17+ installed | Gradle auto-provisions JDK 21 for the build (foojay toolchain) |
| Python | 3.12+ | ML service (`python` on Windows) |
| Terraform | 1.9+ | infrastructure only |
| Expo Go / dev client | latest | mobile on a device or emulator |

No Google Cloud, Stripe, Firebase or Google Maps credentials are required locally.

## Local setup

```bash
git clone <repo> OrenjiTrade && cd OrenjiTrade
cp .env.example .env                      # defaults already match docker-compose
docker compose up -d                      # PostGIS :5432, Redis :6379, Firebase Auth emulator :9099 (UI :4000)
npm ci                                    # ONCE, at the repo root: installs web + mobile + packages/* (npm workspaces)
```

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
under the `local` profile. Reset everything with `docker compose down -v`.

### Backend (API)

```bash
cd apps/api
./gradlew bootRun --args='--spring.profiles.active=local'    # http://localhost:8080
# Swagger UI (local/dev only): http://localhost:8080/swagger-ui.html
# Health: http://localhost:8080/actuator/health/readiness
```

### Web

```bash
# after `npm ci` at the repo root
npm start -w apps/web-angular                                # http://localhost:4200 (builds design tokens first)
# or: cd apps/web-angular && npm start
```

Runtime configuration is read from `public/config.json` (API URL, Firebase web config, optional
Google Maps key). Without a Maps key the map falls back to Leaflet/OpenStreetMap.

### Mobile

```bash
# after `npm ci` at the repo root
cd apps/mobile
cp .env.example .env         # EXPO_PUBLIC_API_BASE_URL should point at your machine's LAN IP for devices
npx expo start
```

### ML service

```bash
cd apps/ml
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000        # http://localhost:8000/health
```

The API treats the ML service as optional; card scanning degrades gracefully when it is down.

## Environment variables

All variables are listed with comments in [.env.example](.env.example). Key groups: database,
Redis, Firebase (project id + emulator host), Google Cloud (project, region, buckets), events
transport (`local` | `pubsub`), storage provider (`local` | `gcs`), maps key, payments
(`fake` | `stripe`), push (`log` | `fcm`), email, ML URL, CORS origins. Production values live in
Secret Manager and Cloud Run environment configuration, never in Git.

## Running tests

| Area | Command | Notes |
| --- | --- | --- |
| API unit + integration | `cd apps/api && ./gradlew test` | Testcontainers starts PostGIS + Redis; Docker required |
| API OpenAPI export | `./gradlew exportOpenApi` | writes `docs/api/openapi.json` |
| Web unit | `npm run test -w apps/web-angular` | Angular test runner (`npm test` at the root runs web + mobile) |
| Web E2E | `npm run e2e -w apps/web-angular` | Playwright, starts the dev server |
| Mobile | `npm run typecheck -w apps/mobile && npm run test -w apps/mobile` | jest-expo; Maestro flows in `.maestro/` |
| ML | `cd apps/ml && pytest` | plus `ruff check .` and `mypy app` |
| Infra | `terraform validate` in each `infrastructure/terraform/environments/*` | |

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

GitHub Actions builds images on `main`, pushes to Artifact Registry using Workload Identity
Federation (no service-account keys), and deploys to Cloud Run per environment (dev automatic;
staging/prod behind approvals). Terraform provisions Cloud SQL, Redis, storage, Pub/Sub,
BigQuery, secrets, IAM, load balancer, monitoring. Cloudflare fronts everything with DNS, WAF and
cache rules (API responses are never cached). Step-by-step: [docs/deployment/README.md](docs/deployment/README.md)
and [infrastructure/cloudflare/README.md](infrastructure/cloudflare/README.md).

## Documentation map

- Engineering rules: [CLAUDE.md](CLAUDE.md)
- Progress and next task: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
- Architecture and ADRs: [docs/architecture/](docs/architecture/)
- Database schema: [docs/database/schema.md](docs/database/schema.md)
- Design system: [docs/design/design-system.md](docs/design/design-system.md)
- Security: [docs/security/README.md](docs/security/README.md)
- Deployment: [docs/deployment/](docs/deployment/)

## Licence

Proprietary. See [LICENSE](LICENSE).
