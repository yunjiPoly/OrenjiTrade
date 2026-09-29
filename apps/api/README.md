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
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_ROOT` | `local`, `./.local-storage` | media storage adapter |
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
that interface. Sign in locally with `<handle>@orenjitrade.test` (`premium@orenjitrade.test` for the
premium account) and `LocalDev!2026`; see `docs/development/test-accounts.md`.

### Profiles

| Profile | Environment | OpenAPI / Swagger | HSTS | Logging |
| --- | --- | --- | --- | --- |
| `local` (default) | developer machine + `docker compose` | on | off | coloured text with `[requestId]` |
| `dev` | shared cloud development | on | on | ECS structured JSON |
| `staging` | pre-production | off | on | ECS structured JSON |
| `prod` | production | off | on | ECS structured JSON |
| `test` | integration tests (Testcontainers) | on | off | text with `[requestId]` |

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
`job_run`. Details and column lists: `docs/database/schema.md`.

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
└── profiles location games cards inventory binders search wishlist messaging community
    notifications ratings reports offers trades payments billing credits donations ads moderation
    analytics featureflags delisting                      (documented in each package-info.java)
```

Inside a module: `api/` (controllers + DTOs), `domain/`, `infra/`, `events/`. Entities never leave a
module; cross-module calls go through service interfaces or published domain events.
