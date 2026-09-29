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
| `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_EMULATOR_HOST` | `orenjitrade-local`, `localhost:9099` | ID token verification (auth module) |
| `EVENTS_TRANSPORT` | `local` | `local` in-process outbox or `pubsub` |
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_ROOT` | `local`, `./.local-storage` | media storage adapter |
| `PAYMENT_PROVIDER`, `PUSH_PROVIDER`, `EMAIL_PROVIDER` | `fake`, `log`, `log` | provider abstractions |
| `ML_SERVICE_URL`, `ML_SERVICE_TIMEOUT_MS` | `http://localhost:8000`, `1500` | optional ML service |
| `RATE_LIMIT_DEFAULT_PER_MINUTE` | `120` | default per-user rate limit |

Application-specific settings live under the `orenji.*` prefix (`orenji.security.cors.allowed-origins`,
`orenji.security.hsts.enabled`, `orenji.openapi.enabled`, `orenji.async.*`, ...). Never commit secrets;
production values come from Secret Manager through the environment.

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
`event_publication` outbox table. Details and column lists: `docs/database/schema.md`.

## Module layout

```
com.orenjitrade.api
├── common/      error codes, ApiException, ProblemDetailsExceptionHandler, RequestIdFilter,
│                TimeProvider, PageResponse, CursorPage, MdcTaskDecorator  (OPEN module)
├── config/      SecurityConfig (+ ProblemDetail entry point / access-denied handler), OpenApiConfig,
│                AsyncConfig, WebConfig, property records                  (OPEN module)
├── meta/        GET /api/v1/meta
└── auth users profiles location games cards inventory binders search wishlist messaging community
    notifications ratings reports offers trades payments billing credits donations ads moderation
    admin audit analytics featureflags delisting          (documented in each package-info.java)
```

Inside a module: `api/` (controllers + DTOs), `domain/`, `infra/`, `events/`. Entities never leave a
module; cross-module calls go through service interfaces or published domain events.
