# OrenjiTrade API (`apps/api`)

Spring Boot 4.1 / Java 21 modular monolith behind `api.orenjitrade.com`. One Gradle project, one
package per module under `com.orenjitrade.api` (see `CLAUDE.md` and
[ADR 0001](../../docs/architecture/adr/0001-modular-monolith.md)).

| | |
| --- | --- |
| Runtime | Java 21 (Gradle toolchain, auto-provisioned by the foojay resolver; JDK 17 is enough to *run* Gradle) |
| Framework | Spring Boot 4.1.1, Spring Framework 7, Security 7, Hibernate 7 (+ `hibernate-spatial`), Jackson 3 (`tools.jackson.*`) |
| Build | Gradle 9.7 Kotlin DSL (`./gradlew`), Spotless (google-java-format, AOSP style) |
| Data | PostgreSQL 17 + PostGIS via Flyway (`src/main/resources/db/migration`), Redis (Lettuce) |
| Events | Spring Modulith 2.1 JDBC event publication registry (transactional outbox) |
| Tests | JUnit 6, AssertJ, Testcontainers 2 (`postgis/postgis:17-3.5`, `redis:7-alpine`) |

## Run locally

```bash
# 1. infrastructure (PostGIS, Redis, Firebase Auth emulator) from the repository root
docker compose up -d

# 2. the API (profile `local` is also the default when none is given)
cd apps/api
./gradlew bootRun --args="--spring.profiles.active=local"
```

Then:

| URL | Purpose |
| --- | --- |
| `http://localhost:8080/api/v1/meta` | name, version, environment, server time (public) |
| `http://localhost:8080/swagger-ui.html` | Swagger UI (local, dev and test profiles only) |
| `http://localhost:8080/v3/api-docs` | OpenAPI 3.1 document (same profiles) |
| `http://localhost:8080/actuator/health/liveness` | liveness probe (`livenessState`, `ping`) |
| `http://localhost:8080/actuator/health/readiness` | readiness probe (`readinessState`, `db`, `redis`) |
| `http://localhost:8080/actuator/info` | build info |

Every response carries an `X-Request-Id` header (echoed when the client sends a safe one, generated
otherwise) and the same id appears in every log line of that request. Errors are RFC 9457 problem
documents with `errorCode`, `message`, `requestId`, `timestamp` and, for validation, `errors[]`.

## Configuration

`src/main/resources/application.yml` reads the variables defined in `/.env.example`; the defaults
match `docker compose`. The most relevant ones:

| Variable | Default | Used for |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | `local` | active profile (see below) |
| `ORENJI_ENV` | `local` | value reported as `environment` by `/api/v1/meta` |
| `SERVER_PORT` / `PORT` | `8080` | HTTP port (`PORT` is what Cloud Run injects) |
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | local compose values | PostgreSQL / Cloud SQL |
| `DATABASE_POOL_SIZE` | `10` (`20` in prod) | Hikari maximum pool size |
| `REDIS_URL` | `redis://localhost:6379` | cache, rate limits, realtime fan-out |
| `CORS_ALLOWED_ORIGINS` | web + Expo dev origins | comma separated browser origins allowed with credentials |
| `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_EMULATOR_HOST` | `orenjitrade-local`, `localhost:9099` (`local` profile only; empty elsewhere) | ID token verification (auth module) |
| `SERVICE_TOKEN` | `local-service-token` (refused in staging/prod) | `X-Service-Token` for `/internal/**` |
| `INTERNAL_AUDIENCE`, `INTERNAL_INVOKERS` | empty | Google OIDC alternative for `/internal/**` (audience = Cloud Run URL, comma separated service-account emails) |
| `CONSENT_IP_SALT` | `local-consent-salt` | salt of the hashed client IP stored with consents |
| `SEED_EMULATOR_PASSWORD` | `LocalDev!2026` | password of the seeded emulator users (`local`/`dev` only) |
| `EVENTS_TRANSPORT` | `local` | `local` in-process outbox or `pubsub` |
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_ROOT` | `local`, `./.local-storage` | media storage adapter (`local` files served by the API, or `gcs`) |
| `STORAGE_PUBLIC_BASE_URL` | empty | origin of media URLs; empty = this API (built from the request) for `local`, `https://storage.googleapis.com/<bucket>` for `gcs` |
| `GCS_BUCKET_MEDIA` | empty | media bucket, required only with `STORAGE_PROVIDER=gcs` (Application Default Credentials) |
| `LOCATION_JITTER_SECRET` | `local-jitter-secret` (`local`/`test` only) | HMAC key of the public-point jitter (ADR 0004); every other profile refuses to start when it is missing, the development default or shorter than 32 characters |
| `PAYMENT_PROVIDER`, `PUSH_PROVIDER`, `EMAIL_PROVIDER` | `fake`, `log`, `log` | provider abstractions |
| `ML_SERVICE_URL`, `ML_SERVICE_TIMEOUT_MS` | `http://localhost:8000`, `1500` | optional ML service |
| `RATE_LIMIT_DEFAULT_PER_MINUTE`, `RATE_LIMIT_ANONYMOUS_PER_MINUTE` | `120`, `60` | default rate limits (per user / per IP) |

Application-specific settings live under the `orenji.*` prefix (`orenji.security.*`,
`orenji.ratelimit.*`, `orenji.firebase.*`, `orenji.consents.*`, `orenji.seed.*`, `orenji.openapi.enabled`,
`orenji.async.*`, ...). Never commit secrets; production values come from Secret Manager through the
environment.

## Authentication and access control

`Authorization: Bearer <Firebase ID token>` on everything except `/api/v1/public/**`, `/api/v1/meta`,
the health probes and the OpenAPI endpoints (ADR 0008). Inside the security filter chain:

1. `BearerTokenAuthenticationFilter` verifies the token (`IdentityTokenVerifier`: Firebase Admin SDK,
   or the static verifier under the `test` profile), loads or **provisions** the account through the
   users module (`AccountResolver`: role `USER`, status `ACTIVE`, handle derived from the email local
   part, numeric suffix on collision) and sets an `AuthenticatedUser` principal with `ROLE_<role>`
   authorities. A present-but-invalid token is a `401 UNAUTHENTICATED` problem straight away.
   `last_active_at` is refreshed at most every 5 minutes (Redis `SET NX`).
2. `AccountAccessFilter`: `SUSPENDED` → `403 ACCOUNT_SUSPENDED` (with `suspendedUntil` when temporary;
   expired suspensions are lifted automatically); `DELETION_REQUESTED` → only `GET /me` and
   `/me/deletion-requests` work, everything else is `403 ACCOUNT_SUSPENDED` "deletion pending".
3. `RateLimitFilter` (see below).
4. Authorization: `/api/v1/admin/**` needs `ADMIN` or `SUPER_ADMIN` **and**, when
   `orenji.security.admin.require-mfa=true` (default; `false` in `local`/`test`), an ID token whose
   session used a second factor (`firebase.sign_in_second_factor`); otherwise `403` with the message
   "Multi-factor authentication is required for admin access". `/internal/**` needs the service
   authentication described below.
5. `TermsEnforcementFilter`: while `GET /me` lists `requiredConsents`, every other `/api/**` route
   (except `/me/consents`, `/me/deletion-requests`, `/public/**`, `/meta`) answers
   `428 TERMS_ACCEPTANCE_REQUIRED` with the `requiredConsents[]` extension. Accept with
   `POST /api/v1/me/consents {documentType, version}` (`409` when the version is not current).

Roles live in `user_role` (`USER` always kept). `PUT /api/v1/admin/users/{id}/roles` may grant or
revoke `ADMIN`/`SUPER_ADMIN` only when the caller is a `SUPER_ADMIN`, and nobody can drop their own
`SUPER_ADMIN`. Every admin write (`suspend`, `unsuspend`, `roles`) is recorded in `audit_log` with the
request id and mirrored to the identity provider (`IdentityAdminClient` disables/enables the Firebase
user). `GET /api/v1/admin/audit-logs` queries the log.

### Test tokens (profile `test`)

`StaticIdentityTokenVerifier` accepts `test-token:<uid>[:<email>][:<flags>]` where `flags` is a comma
list of `unverified` (email not verified), `mfa` (second factor used) and `stale` (`authTime` one hour
ago). The email defaults to `<uid>@orenjitrade.test`. Example: `Authorization: Bearer test-token:alice::mfa`.
No emulator is needed for `./gradlew test`.

### Service authentication for `/internal/**`

Internal routes (Cloud Scheduler, Pub/Sub push, the ML service; never exposed through Cloudflare)
accept either `X-Service-Token: <SERVICE_TOKEN>` (constant-time comparison) or
`Authorization: Bearer <Google OIDC ID token>` whose audience is `INTERNAL_AUDIENCE` and whose verified
email is listed in `INTERNAL_INVOKERS`. Staging and production refuse to start with the default token
(`ServiceTokenStartupValidator`). `POST /internal/jobs/ping` is the smoke test; it records a `job_run`.

### Rate limiting

Fixed windows in Redis (`INCR` + `PEXPIRE` in one Lua script), keyed
`rl:<policy>:{USER:<id>|IP:<addr>}:<windowStart>`. Policies come from `orenji.ratelimit.policies`
(name, path patterns, methods, limit, window, `key-by USER|IP`); the first matching policy wins, so
specific ones precede the defaults (120/min per user, 60/min per IP for anonymous calls, 10/h for
avatar upload and export, 5/day for deletion requests, 60/min for tag search). Responses carry
`X-RateLimit-Limit` / `X-RateLimit-Remaining`; a `429 RATE_LIMITED` problem adds `Retry-After`. When
Redis is unreachable the filter logs a warning and lets the request through. Disabled under the `test`
profile except where a test opts in (`RateLimitIT`).

### Seed accounts (profiles `local`, `dev`)

`SeedDataRunner` (`orenji.seed.enabled=true`) runs every `SeedContributor` bean in order at start-up,
idempotently. The users module contributes the 12 fictional accounts of
`docs/development/seed-data.md` (`db/seed/users.json`: ids `00000000-0000-4000-8000-0000000000NN`,
provider uid `seed-<handle>`, roles, `PREMIUM` plan for `premium_user`, consents to every required
document) and, when `FIREBASE_AUTH_EMULATOR_HOST` is set, the matching Auth-emulator users (verified
email, password `SEED_EMULATOR_PASSWORD`, existing users left untouched). Later modules add profiles,
locations and catalog data by registering their own `SeedContributor` with the ordering constants of
that interface. Phase 1-B adds `profiles` (order 200: profile, bio, games, languages, tags and
privacy settings from `db/seed/profiles.json`; discoverable: collectors 1-6, 8 and `premium_user`) and
`trading areas` (order 300: `db/seed/locations.json`, public neighbourhood centroids, 5 km radius;
public points derived by the server). Both only insert missing rows, so local edits survive restarts.
Sign in locally with `<handle>@orenjitrade.test` (`premium@orenjitrade.test` for the premium account)
and `LocalDev!2026`; see `docs/development/test-accounts.md`.

### Profiles

| Profile | Environment | OpenAPI / Swagger | HSTS | Logging |
| --- | --- | --- | --- | --- |
| `local` (default) | developer machine + `docker compose` | on | off | coloured text with `[requestId]` |
| `dev` | shared cloud development | on | on | ECS structured JSON |
| `staging` | pre-production | off | on | ECS structured JSON |
| `prod` | production | off | on | ECS structured JSON |
| `test` | integration tests (Testcontainers) | on | off | text with `[requestId]` |

## Profiles, location, settings, deletion (Phase 1-B)

Contract: `docs/api/contracts/phase1-auth-users.md`. All routes need a bearer token and accepted terms
unless stated.

| Route | Module | Notes |
| --- | --- | --- |
| `GET/PUT /api/v1/me/profile` | profiles | handle (3-24 `[a-z0-9_]`, trimmed + lower-cased, reserved list, `409 HANDLE_TAKEN` case-insensitively), display name (mirrored on the account), bio (≤ 500), games (`yugioh`, `pokemon`, `mtg`, `riftbound` from `orenji.games.slugs` until the games module exists), ISO 639-1 languages; banned-term check on display name and bio (`moderation_rule`, scope `PROFILE`). First save sets onboarding `profileComplete` |
| `POST/DELETE /api/v1/me/profile/avatar` | profiles | multipart `file`, JPEG/PNG/WebP ≤ 5 MB (type sniffed from the bytes; 413/415/400), header-checked dimensions (≤ 8192 px, ≤ 40 MP), centre cover-crop to 512×512, re-encoded **JPEG** without any metadata (see "Deviations"), stored through `ObjectStorage` under a random key; the previous object is deleted after commit |
| `GET /api/v1/tags?query=&category=&limit=` | profiles | active tags, accent/case-insensitive substring, prefix matches first, then by usage |
| `PUT /api/v1/me/profile/tags` | profiles | `tagIds` + `customLabels` (2-24 chars, banned-term check scope `TAG`), max 12; custom labels reuse the tag with the same slug or create a `CUSTOM` tag; usage counts recomputed |
| `GET /api/v1/collectors/{handle}` | profiles | public view per `PrivacyPolicyService`; 404 for unknown / suspended / deletion-pending / deleted accounts and for PRIVATE profiles (except the owner); `location` only for discoverable collectors (public point + label + distance bucket); `onlineStatus` OFFLINE/HIDDEN until presence exists; `publicBinderCount`, `rating`, `isBlocked` come from optional provider beans (`PublicBinderCountProvider`, `RatingSummaryProvider`, `BlockRelationProvider`, `PresenceProvider`) |
| `GET /api/v1/me/location`, `PUT /api/v1/me/location/trading-area`, `DELETE /api/v1/me/location` | location | the only endpoint returning the caller's own centre; radius 1-50 km, latitude within ±85 |
| `GET/PUT /api/v1/me/settings/privacy` | profiles | safe defaults (not discoverable, online status hidden, MEMBERS, MEMBERS_WITH_PROFILE, wishlist hidden); toggling `discoverable` derives or clears the public point in the same transaction |
| `GET/PUT /api/v1/me/settings/notifications` | notifications | channel master switches, per-category matrix (MARKETING off by default), quiet hours (HH:mm + IANA zone) |
| `GET /api/v1/me/export` | users | JSON attachment assembled by every `ExportContributor` (account + consents + deletion requests, profile, privacy settings, location trading area, notification preferences); rate-limited 10/h; allowed while a deletion is pending |
| `POST/GET /api/v1/me/deletion-requests`, `DELETE /api/v1/me/deletion-requests/{id}` | users | see below |
| `POST /internal/jobs/account-deletion` | users | service token / OIDC; `@Scheduled` hourly under `local` |
| `GET /api/v1/public/media/{key}` | common/storage | public, strict key syntax (`ObjectKeys`), `Cache-Control: public, max-age=31536000, immutable` |

### Approximate location (ADR 0004)

`user_location` keeps the private trading-area centre (stored at 3 decimals) and a derived
`public_point`: the centre's ~1 km grid cell (`floor(lat/0.009)`, `floor(lng/(0.009/cos(row lat)))`)
plus a deterministic offset from `HMAC-SHA256(LOCATION_JITTER_SECRET, userId)` with a 0.001° margin,
rounded to 3 decimals. The same user always gets the same point inside a cell; different users get
different points; the point never leaves the cell. The public point exists only while the collector
is discoverable (`DiscoverabilityPolicy`, implemented by the privacy settings) and is cleared while an
account is suspended or pending deletion. Labels come from `StaticRegionGeocoder` (offline table of
Montréal-area neighbourhoods and Canadian cities; no API key). Distances are bucketed
(`LT_1KM`, `KM_1_5`, `KM_5_10`, `KM_10_25`, `KM_25_50`, `GT_50KM`) from the viewer's own centre to the
target's public point. Events carry the grid cell id only; coordinates are never logged.
`GeoPrivacyContractTest` walks every seeded collector's public profile and admin detail and fails on
any coordinate with more than 3 decimals, any coordinate other than the stored public point, private
location keys, or coordinates in the captured logs.

### Account deletion and export

1. `POST /me/deletion-requests {reason?, exportFirst?}` needs an ID token whose `auth_time` is at most
   `orenji.account.reauth-window` (5 min) old, else `401 REAUTHENTICATION_REQUIRED`. Every
   `DeletionParticipant.blockers()` is consulted (`409 DELETION_BLOCKED` with `blockers[]`); a second
   request is `409 CONFLICT`. On success: `201` with the request (`PENDING`, `scheduledFor` = +7 days),
   account `DELETION_REQUESTED`, participants hide public traces (map point), every identity-provider
   session is revoked. The identity stays enabled so the owner can sign in again; while pending only
   `GET /me`, `GET /me/export` and the deletion endpoints answer (everything else `403 ACCOUNT_SUSPENDED`).
2. `DELETE /me/deletion-requests/{id}` (owner only, 404 otherwise; 409 once not pending) cancels and
   restores the account and its map point.
3. `POST /internal/jobs/account-deletion` processes due requests one transaction each
   (`FOR UPDATE SKIP LOCKED`): `purge()` on every participant (profile + tags + avatar + privacy
   settings, location, notification preferences, later modules), anonymise the account
   (`deleted+<id>@anonymized.invalid`, `deleted_<hex>`, "Deleted collector", only `USER` kept), delete
   the identity-provider user, complete the request (reason cleared), audit `account.deletion.complete`
   (SYSTEM). Consents and audit rows are kept. Records a `job_run`.

Every write is audited (`account.deletion.request`, `account.deletion.cancel`,
`account.deletion.complete`, `user.handle.change`).

### Storage

`ObjectStorage` (`common/storage`): `LocalFileObjectStorage` (default, files under
`STORAGE_LOCAL_ROOT`, served by `GET /api/v1/public/media/{key}`) or `GcsObjectStorage`
(`STORAGE_PROVIDER=gcs`, Google Cloud Storage client library, ADC; created lazily and never
instantiated locally). Keys are random (`avatars/<user>/<32 hex>.jpg`), so objects are immutable.

### Deviations from the Phase 1 contract

- Avatars are re-encoded as **JPEG** (not WebP): the JDK has no WebP encoder and the TwelveMonkeys
  plugin only decodes WebP. Uploads may still be WebP. Switching the encoder later only touches
  `AvatarImageProcessor` (keys carry the extension, URLs are derived).
- A deletion request **revokes sessions instead of disabling** the identity-provider user: a disabled
  user could never sign in again to cancel during the grace period (the Auth emulator rejects its
  tokens at once). The identity is deleted by the job.
- Additive: `GET /me/deletion-requests` (lets clients find the pending request after a reload).

## Build, format, test

```bash
./gradlew spotlessApply          # format (google-java-format, AOSP)
./gradlew build -x test          # compile + jar + spotlessCheck
./gradlew test                   # unit + integration tests (Docker required for the *IT classes)
./gradlew check                  # test + spotlessCheck
```

Integration tests extend `AbstractIntegrationTest`, which starts one PostGIS and one Redis
container per JVM (static singletons wired through `@ServiceConnection`) and boots the application
with the `test` profile on a random port. Docker Desktop (or any Docker socket Testcontainers can
reach) must be running; without it the `*IT` tests fail at container start-up while the unit tests
(`*Test`) still pass.

## OpenAPI export

`docs/api/openapi.json` is generated from the running application, never edited by hand:

```bash
./gradlew exportOpenApi          # requires Docker; rewrites ../../docs/api/openapi.json
```

The task runs the `openapi`-tagged `OpenApiExportTest`, which the regular `test` task excludes. Run it
after every API change so `packages/api-client` and `packages/shared-types` can be regenerated.

## Docker image

```bash
# from the repository root
docker build -t orenjitrade-api apps/api
docker run --rm -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=local \
  -e DATABASE_URL=jdbc:postgresql://host.docker.internal:5432/orenjitrade \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  orenjitrade-api
```

Multi-stage build: `eclipse-temurin:21-jdk` runs the Gradle wrapper (dependency cache layer first,
then `bootJar`) and explodes the jar with `java -Djarmode=tools -jar app.jar extract --layers`;
the runtime stage is `eclipse-temurin:21-jre-alpine`, runs as the non-root `orenji` user, exposes
8080, honours `SERVER_PORT`/`PORT` and starts the JVM with `-XX:MaxRAMPercentage=75` (extra flags via
`JAVA_OPTS`).

## Database migrations

Flyway migrations are `V<NNN>__<snake_case>.sql` in `src/main/resources/db/migration` and are never
edited once applied. `V001__extensions.sql` installs PostGIS, `pg_trgm`, `unaccent`, `pgcrypto` and
the `unaccent_immutable(text)` helper; `V002__event_publication.sql` creates the Spring Modulith
`event_publication` outbox table; `V003__users.sql` creates `user_account`, `user_role`,
`legal_document` (with the eight documents of version `2026-09-01`), `user_consent`, `audit_log` and
`job_run`; `V004__profiles.sql` (`profile`, `tag`, `profile_tag`, `moderation_rule`,
`privacy_settings`), `V005__location.sql` (`user_location`), `V006__settings.sql`
(`notification_preferences`) and `V007__deletion.sql` (`account_deletion_request`) complete Phase 1.
Details and column lists: `docs/database/schema.md`.

## Module layout

```
com.orenjitrade.api
├── common/      error codes, ApiException, ProblemDetailsExceptionHandler, RequestIdFilter,
│                TimeProvider, PageResponse, CursorPage, MdcTaskDecorator, seed runner (OPEN module)
├── config/      SecurityConfig (+ ProblemDetail entry point / access-denied handler), OpenApiConfig,
│                AsyncConfig, WebConfig, property records, startup validators (OPEN module)
├── meta/        GET /api/v1/meta
├── auth/        IdentityTokenVerifier (Firebase / static), bearer + service-auth filters,
│                AuthenticatedUser, Role, AccountStatus, admin MFA rule, rate limiting
├── users/       UserAccount + roles, provisioning, consents + legal documents, /me endpoints,
│                terms filter, seed accounts (implements auth's AccountResolver)
├── audit/       AuditService (append-only audit_log), GET /api/v1/admin/audit-logs
├── admin/       /api/v1/admin/users (list, detail, suspend, unsuspend, roles)
├── jobs/        job_run records, POST /internal/jobs/ping
├── profiles/    profile, avatar, tags, privacy settings + PrivacyPolicyService, collector view
├── location/    user_location, ApproximateLocationService, StaticRegionGeocoder (ADR 0004)
├── notifications/ notification preferences (dispatch arrives in Phase 6)
├── moderation/  moderation_rule + TextModerationService (banned terms)
├── games/       GameCatalog (property-backed until the Phase 2 catalogue)
└── cards inventory binders search wishlist messaging community ratings reports offers trades
    payments billing credits donations ads analytics featureflags delisting
                                                          (documented in each package-info.java)
```

Inside a module: `api/` (controllers + DTOs), `domain/`, `infra/`, `events/`. Entities never leave a
module; cross-module calls go through service interfaces or published domain events.
