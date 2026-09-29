# CLAUDE.md — OrenjiTrade engineering rules

Permanent instructions for every Claude Code session working in this repository. Read this,
then `IMPLEMENTATION_STATUS.md`, then the relevant ADR under `docs/architecture/adr/` before
changing code. Keep this file concise; put detail in `docs/`.

## What OrenjiTrade is

A geographic discovery network for trading cards. The product answers one question:
**"Who near me owns, trades, sells, wants, or accepts offers for this card?"**
Collectors publish binders; other collectors find them on a map at *approximate* positions.
Brand name is always written `OrenjiTrade`. Domain `orenjitrade.com`
(`www.orenjitrade.com` web + `/admin`, `api.orenjitrade.com` API). Text wordmark only until
branding assets are supplied.

## Non-negotiable decisions (see ADRs before changing any of these)

| Area | Decision |
| --- | --- |
| Web | Angular 22 + TypeScript strict + Angular Material (M3), standalone components, signals. `apps/web-angular` |
| Mobile | React Native + Expo SDK 57 + expo-router (bottom tabs), TypeScript strict. `apps/mobile` |
| Backend | Java 21 + Spring Boot 4.1 (Spring Framework 7, Security 7, Hibernate 7, Jackson 3), Gradle Kotlin DSL. `apps/api` |
| ML | Python 3.12+ / FastAPI / pytest, separate service, never a hard dependency. `apps/ml` |
| Database | PostgreSQL 17 + PostGIS, Flyway migrations (`V<NNN>__<snake_case>.sql`, never edit an applied one) |
| Cache | Redis (Memorystore in cloud) for cache, rate limits, presence, realtime fan-out. Never primary storage |
| Cloud | Google Cloud: Cloud Run, Cloud SQL, GCS, Memorystore, Pub/Sub, BigQuery, Secret Manager, Artifact Registry |
| Edge | Cloudflare Registrar/DNS/CDN/WAF in front of Google Cloud. Never cache authenticated API responses |
| Infra | Terraform in `infrastructure/terraform`; Docker for every runtime; GitHub Actions with WIF/OIDC (no SA keys) |
| Architecture | Modular monolith (one Spring Boot app, package-per-module). REST `/api/v1/...`, OpenAPI generated from code |
| Identity | Firebase Authentication / Identity Platform; backend verifies ID tokens; roles live in our DB (RBAC) |
| Events | Domain events via Spring Modulith event registry (transactional outbox); Pub/Sub adapter for cloud + analytics |
| Payments | Provider abstraction (`PaymentProvider`), Stripe Connect adapter, `FakePaymentProvider` locally, feature-flagged |
| Maps | PostGIS is the geographic source of truth. Google Maps in production; UI map code sits behind a `MapAdapter` (Leaflet fallback when no key) |
| Search | PostgreSQL full-text + `pg_trgm`. No Elasticsearch/OpenSearch |

### Explicitly out of scope for the MVP (do not build)
Stores, events/meetups, binder-to-binder matching, unboxing-video evidence, Kubernetes/GKE,
microservices, Kafka, Elasticsearch, service mesh, a homemade payment processor, storing card
payment data, "regulated escrow" claims.

## Privacy rule that overrides everything else

**Exact collector coordinates are never exposed.** Not in REST responses, HTML, JS objects,
logs, analytics events, admin exports, or seed screenshots.

- Private fields: `user_location.home_point` (optional, encrypted-at-rest by Cloud SQL) and
  the user-selected trading-area centre. These are read only inside the `location` module.
- Every public representation uses `user_location.public_point`, a **server-side derived**
  point: snapped to a ~1 km grid and offset with a *deterministic* jitter seeded by user id,
  recomputed only when the user changes their trading area. Deterministic jitter prevents
  triangulation through repeated queries.
- Distances returned to clients are rounded/bucketed (`~4 km`), never raw metres.
- DTO mappers must never touch `home_point`. Add a test whenever you add a geo endpoint
  (`GeoPrivacyContractTest` scans responses for coordinate precision > 3 decimals).
- Users may choose their approximate trading area manually instead of GPS. Default is
  "not discoverable" until the user opts in.

## Backend conventions (`apps/api`)

- Root package `com.orenjitrade.api`. One package per module:
  `auth users profiles location games cards inventory binders search wishlist messaging
  community notifications ratings reports offers trades payments billing credits donations
  ads moderation admin audit analytics featureflags delisting common config`.
- Inside a module: `api/` (controllers + request/response DTOs), `domain/` (entities, value
  objects, domain services), `infra/` (repositories, external adapters), `events/`.
  Entities are never returned from controllers. Cross-module calls go through the other
  module's service interface or its published events, never its repositories.
- Errors: RFC 9457 Problem Details via a single `@RestControllerAdvice`. Every problem has
  `errorCode`, `message` (safe), `requestId`, `timestamp`. Never leak stack traces, SQL, or
  infrastructure details. Log at ERROR with the same `requestId`.
- Every request carries `X-Request-Id` (generated if missing) and it is in the MDC.
- Authorization is enforced in Spring Security + service layer (`@PreAuthorize` and
  ownership checks). Never trust client-provided user ids; derive the actor from the token.
- Pagination: offset (`page`,`size`) for admin lists, cursor (`cursor`,`limit`) for feeds,
  messages, notifications.
- Configurable business rules (freemium limits, auto-delist thresholds, feature flags) live
  in DB tables edited through `/admin`, cached in Redis, never hard-coded constants.
- Money is `NUMERIC(12,2)` + ISO currency code. Credits are an append-only ledger.
- Flyway: `apps/api/src/main/resources/db/migration/V001__...sql`. Seed data lives in
  `db/seed/` and is applied only by the `local`/`dev` profiles through `SeedDataRunner`.
- Tests: JUnit 6 + Spring Boot Test + Testcontainers 2 (`org.testcontainers.postgresql.PostgreSQLContainer`
  with image `postgis/postgis:17-3.5`). Integration tests extend `AbstractIntegrationTest`.
  Unit tests for pure domain logic. A module is not "done" without both.
- Jackson 3 lives in `tools.jackson.*` (`tools.jackson.databind.json.JsonMapper`); annotations stay in
  `com.fasterxml.jackson.annotation`. Test starters are per-module in Boot 4
  (`spring-boot-starter-webmvc-test`, `spring-boot-starter-data-jpa-test`, ...).

## Frontend conventions

- Angular: feature folders under `src/app/features/<feature>`, shared UI in `src/app/shared`,
  API access only through the generated client in `packages/api-client` (never hand-written
  interfaces for server DTOs). Design tokens come from `packages/design-tokens` as CSS custom
  properties; light/dark ready. Skeleton loaders, empty states, error states with retry, and
  keyboard navigation are required for every screen. No giant components.
- Mobile: expo-router tabs `Map | Inventory | Search | Messages | Wishlist | Profile`, bottom
  sheets for collector previews, offline-tolerant queries (`@tanstack/react-query`), typed
  API via `packages/shared-types` + `openapi-fetch`.
- Never put secrets in frontend bundles. Only public keys (Firebase web config, Maps browser
  key restricted by referrer) may appear.

## Working rules for Claude Code

1. Before modifying code: inspect the existing implementation, this file, and
   `IMPLEMENTATION_STATUS.md`. Extend working code; do not rewrite it to look cleaner.
2. After implementing: build it, run the relevant unit + integration tests (and E2E when the
   flow is user-facing), fix failures, update docs and `IMPLEMENTATION_STATUS.md`.
3. A feature is complete only when the workflow actually works end to end with authorization,
   validation, error handling, and tests. Generated boilerplate is not implementation.
4. Never commit secrets or `.env` files. Use `.env.example`. Seed/test data is fictional only.
5. Never modify an applied Flyway migration; add a new one.
6. Major architectural changes require a new or updated ADR. Do not change them silently.
7. Keep the repository buildable at the end of every session and record the exact next task
   in `IMPLEMENTATION_STATUS.md`.
8. Prefer framework-provided solutions over new dependencies; pin versions.

## Local development quick reference

```bash
docker compose up -d                 # PostGIS, Redis, Firebase Auth emulator, MinIO-free local storage
cd apps/api && ./gradlew bootRun     # http://localhost:8080  (Swagger UI at /swagger-ui.html, local profile only)
cd apps/web-angular && npm start     # http://localhost:4200
cd apps/mobile && npx expo start     # Expo dev client
cd apps/ml && uvicorn app.main:app   # http://localhost:8000
```

Test accounts for local use are documented in `docs/development/test-accounts.md`.
