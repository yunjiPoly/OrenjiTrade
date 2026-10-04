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
| `EVENTS_TRANSPORT` | `local` | `local` in-process outbox (analytics events are logged) or `pubsub` (analytics events published to `PUBSUB_TOPIC_ANALYTICS` with Application Default Credentials; cloud only) |
| `ANALYTICS_ACTOR_SALT` | `local-analytics-salt` (`local`/`test` only) | HMAC key pseudonymising account ids in analytics events (`actor_hash`, `owner_hash`, `target_hash`); every other profile refuses to start when it is missing, the development default or shorter than 32 characters |
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_ROOT` | `local`, `./.local-storage` | media storage adapter (`local` files served by the API, or `gcs`) |
| `STORAGE_PUBLIC_BASE_URL` | empty | origin of media URLs; empty = this API (built from the request) for `local`, `https://storage.googleapis.com/<bucket>` for `gcs` |
| `GCS_BUCKET_MEDIA` | empty | media bucket, required only with `STORAGE_PROVIDER=gcs` (Application Default Credentials) |
| `LOCATION_JITTER_SECRET` | `local-jitter-secret` (`local`/`test` only) | HMAC key of the public-point jitter (ADR 0004); every other profile refuses to start when it is missing, the development default or shorter than 32 characters |
| `PAYMENT_PROVIDER`, `PUSH_PROVIDER`, `EMAIL_PROVIDER` | `fake`, `log`, `log` | provider abstractions |
| `FAKE_PAYMENTS_WEBHOOK_SECRET`, `FAKE_CHECKOUT_BASE_URL` | local value, empty | HMAC key of the fake provider's synthetic webhooks (not a secret of any service); origin prefixed to the fake checkout path `/checkout/fake/<ref>` (empty = relative) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WEB_BASE_URL` | empty, empty, `https://www.orenjitrade.com` | only with `PAYMENT_PROVIDER=stripe` (start-up fails without the two secrets); never needed locally |
| `BILLING_PROVIDER`, `FAKE_BILLING_WEBHOOK_SECRET` | `fake`, local value | Phase 10 subscriptions: the fake billing provider (no credentials, no money; synthetic webhooks signed with the local value) or `stripe` |
| `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_PRICE_PREMIUM` | empty | only with `BILLING_PROVIDER=stripe` (start-up fails without `STRIPE_SECRET_KEY` and the webhook secret; the price id maps the PREMIUM plan); never needed locally |
| `DONATION_PROVIDER`, `FAKE_DONATIONS_WEBHOOK_SECRET` | `fake`, local value | Phase 10 donations: only `fake` exists (any other value fails the start-up) |
| `ADS_TOKEN_SECRET`, `ADS_WEB_BASE_URL` | `local-ads-token-secret` (refused outside `local`/`test`/`dev`), `http://localhost:4200` | HMAC key of the ad serve tokens (impressions and clicks); origin of relative house-ad landing paths on click redirects |
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
Phase 2 adds `feature flags` (order 50, local/dev only) and `catalog` (order 400, the four mock
catalogs); see "Catalog and platform rules" below. Phase 3 adds `inventory` (order 500, binders and
items of the fictional collectors); see "Inventory, binders, freshness" below.
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
| `GET/PUT /api/v1/me/profile` | profiles | handle (3-24 `[a-z0-9_]`, trimmed + lower-cased, reserved list, `409 HANDLE_TAKEN` case-insensitively), display name (mirrored on the account), bio (≤ 500), games (slugs of the ACTIVE `game` rows through the games module's `GameCatalog`), ISO 639-1 languages; banned-term check on display name and bio (`moderation_rule`, scope `PROFILE`). First save sets onboarding `profileComplete` |
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

## Catalog and platform rules (Phase 2)

Contracts: `docs/api/contracts/phase2-catalog.md` (catalog) and
`docs/api/contracts/phase10-freemium-credits-ads-donations.md` "Plans and limits" (foundation). Catalog
and plan reads are public GET routes (`SecurityConfig.PUBLIC_GET_PATTERNS`): no token needed, and a
token of an account with pending consents or a suspension does not block them (same treatment as
`/api/v1/public/**`). Other methods on those paths stay protected.

| Route | Module | Notes |
| --- | --- | --- |
| `GET /api/v1/games`, `GET /api/v1/games/{slug}` | games | ACTIVE games in display order with their `GameSchema` (vocabularies, metadata fields, summary fields) |
| `GET /api/v1/cards?game=&query=&set=&rarity=&language=&edition=&metadata.<key>=&page=&size=` | cards | FTS (`websearch_to_tsquery('simple', unaccent(q))`, `ts_rank_cd`) on name/type/text; trigram fallback (`%`, `<%` on `normalized_name`) when fewer than 5 rows match; exact printing code (`azr-en001`) short-circuits to that card; `set` = id or code; `metadata.<key>` only for filterable GameSchema fields of the given `game` (typed: number, string with case-insensitive options, string_list — repeat the key to require several values —, boolean) and matched with `metadata @>` (GIN); summaries carry the game's `summaryFields` only |
| `GET /api/v1/cards/suggest?game=&q=&limit=8` | cards | printing-code prefixes first (`kind=PRINTING`), then cards by prefix / substring / FTS / trigram (`kind=CARD`, with the earliest printing's set and code) |
| `GET /api/v1/cards/{id}`, `GET /api/v1/cards/{id}/printings`, `GET /api/v1/printings/{id}` | cards | full metadata, printings (earliest set first) with images (placeholder when none) and indicative market price |
| `GET /api/v1/sets?game=&query=`, `GET /api/v1/sets/{id}?page=&size=` | cards | newest first; exact code first when querying; set detail pages its printings |
| `GET /api/v1/public/placeholder-images/{game}/{slug}.svg` | cards | server-generated SVG with the card name (XML-escaped, no scripts or external references, `Content-Security-Policy: default-src 'none'`), `Cache-Control: public, max-age=86400` + ETag / 304; 404 for unknown cards |
| `GET /api/v1/public/feature-flags` | featureflags | `{flag: boolean}`; anonymous callers see flags rolled out to 100 %, a bearer token evaluates partial rollouts for the caller |
| `GET /api/v1/plans` | billing | active plans with features and limits (`limit` null = unlimited) |
| `GET /api/v1/me/plan` | billing | the caller's plan, every limit with the effective value (entitlements applied), current usage, remaining and reset time (UTC day/month; none for totals and caps), effective features and active entitlements (without admin notes) |
| `GET /api/v1/admin/feature-flags`, `PUT /api/v1/admin/feature-flags/{key}` | featureflags | read ADMIN+, write SUPER_ADMIN; audited `feature_flag.update`; cache evicted |
| `GET /api/v1/admin/plans`, `PUT /api/v1/admin/plans/{code}` | billing | read ADMIN+, write SUPER_ADMIN (name, description, display price, active — FREE cannot be disabled —, order, feature upserts); audited `plan.update` |
| `GET /api/v1/admin/usage-limits?plan=`, `PUT /api/v1/admin/usage-limits/{id}` | billing | read ADMIN+, write SUPER_ADMIN (`{unlimited, maxValue, window, description}`, caps keep `TOTAL`); live, audited `usage_limit.update` |
| `GET/POST /api/v1/admin/users/{id}/entitlements`, `DELETE .../entitlements/{entitlementId}` | billing | ADMIN+; grant a limit override (`value` number or `unlimited`) or a feature (`true`/`false`), optional `expiresAt`/`note`; revocation keeps history; audited `entitlement.grant` / `entitlement.revoke` |
| `GET /api/v1/admin/games`, `POST /api/v1/admin/games`, `PUT /api/v1/admin/games/{slug}` | games | ADMIN+; slug immutable; schema validated (types, unique keys, summary fields exist); HIDDEN removes a game from public endpoints and profile choices; audited |
| `POST /api/v1/admin/sets`, `PUT /api/v1/admin/sets/{id}`, `POST /api/v1/admin/cards`, `PUT /api/v1/admin/cards/{id}`, `POST /api/v1/admin/cards/{id}/printings`, `PUT /api/v1/admin/printings/{id}` | cards | ADMIN+; values checked against the game's GameSchema (edition, language, finish, rarity vocabularies; declared metadata types); duplicate printing variant 409; audited `card_set.*`, `card.*`, `card_printing.*` |
| `POST /api/v1/admin/catalog/sync`, `GET /api/v1/admin/catalog/sync-runs[/{id}]`, `GET /api/v1/admin/catalog/providers` | cards | ADMIN+; 202 with the QUEUED run; the import runs after commit through `CatalogSyncRequestedEvent` (`@ApplicationModuleListener`, idempotent: only QUEUED runs start); audited `catalog.sync.request` |

### Feature flags, plans, limits (ADR 0014)

- `FeatureFlags.isEnabled(key[, userId])`, `FeatureFlags.require(key, userId)` → `404
  FEATURE_DISABLED` (extension `feature`). `ErrorCode.FEATURE_DISABLED` now defaults to 404 (the
  Phase 9 contract's "404 FEATURE_DISABLED").
- `Limits.check(userId, key)` → `LimitDecision {key, allowed, kind, window, limit, used, remaining,
  resetsAt, planCode, overridden, upgradeUrl}`; `Limits.consume(userId, key)` increments atomically in
  `usage_counter` (conditional upsert, never passes the limit) and throws `LimitReachedException` →
  `429 LIMIT_REACHED` with extensions `limitKey`, `limit`, `used`, `resetsAt`, `planCode`,
  `upgradeUrl: "/premium"`; `Limits.checkValue(userId, key, requested)` for caps
  (`map.radius.max_km`). The plan comes from `user_account.plan_code` (FREE when unknown or inactive);
  active entitlements win (most generous). `Entitlements.has(userId, featureKey)` resolves features the
  same way. `LimitUsageSource` beans let owning modules report TOTAL usage (Phase 3 binders).
- Rules are cached in Redis through `common.cache.RedisJsonCache` (60 s TTL, explicit eviction after
  every admin write and after commit, fail-open to the database). Usage counters are mirrored in
  Redis after commit (`orenji:usage:*`, TTL ≤ 10 minutes) for the `check` fast path.
- Phase 3 consumes `binders.max` (binder creation) and `binder.views.per_day` (public binder views);
  Phase 4 checks the radius cap `map.radius.max_km` on discovery and search (signed-out callers
  through `Limits.checkValueForAnonymous`, FREE plan). The integration tests also exercise the HTTP behaviour through
  a test-only, OpenAPI-hidden probe controller.

### Card catalog

- `CardProvider` (contract interface) with `MockCardProvider` (profiles `local`, `dev`, `test`)
  serving `db/seed/catalog/{yugioh,pokemon,mtg,riftbound}.json`: 4 sets, 20 cards and 40 printings per
  game, invented names, game-specific metadata, FR/JA printings and finish variants, indicative CAD
  prices, placeholder images. `YgoProDeckCardProvider` (all profiles, `YGOPRODECK_ENABLED`) imports
  the real Yu-Gi-Oh! catalog on request only (docs/providers/ygoprodeck.md); the test profile points
  it at closed local ports, the tests at an offline stub.
- `CatalogImportService` upserts by `external_ref` (sets by game + code, printings fall back to their
  variant key) under a per-game advisory lock, rewrites only changed rows (a repeated import reports 0
  upserts), keeps card slugs stable, and records every import in `catalog_sync_run`.
- `CatalogService` is the module's read interface; `printings(ids)` is ready for Phase 3 inventory.

### Card images (ADR 0015)

- One `card_image` row per provider artwork (V100); printings without their own image show their
  card's primary artwork (`card.image_id`). Every image URL of every DTO comes from
  `CardImageUrlResolver`: re-host-only providers (YGOPRODeck) -> `GET /api/v1/public/card-images/{id}`,
  hotlink-allowed providers -> their URL, no artwork -> the placeholder SVG. Re-host-only provider
  URLs never reach clients (`CardImageUrlContractIT`).
- Card pictures outside the catalog DTOs: notifications about one card (`WISHLIST_MATCH`, the
  `OFFER_*` types, `TRADE_UPDATE`, `PAYMENT_UPDATE`, `SHIPMENT_STATUS`, `DISPUTE_UPDATE`) add
  `data.cardName`, `data.game` and `data.cardImageUrl` (`NotificationCards`; stored as the
  resolver produced it, an API-relative path from the after-commit listeners, made absolute against
  the request origin by `GET /notifications` and `POST /notifications/{id}/read`; realtime pushes
  keep the relative path); `OfferLink.imageUrl` (OFFER_LINK and SYSTEM messages, resolved when
  read through the offers module, never stored with the message; `null` when only the stored
  state is known); `AdminListingItem.imageUrl` (admin listings, stale queue, restore and hide
  answers). The offers module's `OfferCard` (live item, else the offer's item snapshot) feeds the
  offer, trade, payment and dispute notifications.
- `CardImageCache`: capped local cache (`CARD_IMAGE_LOCAL_CACHE_MAX_MB`, default 5120 MiB = 5 GB
  since 2026-10-04, refused above 5120; 64-bit byte accounting, `int64` in the status DTO),
  reservations under a lock on `card_image_cache_usage`, one 320 px JPEG per artwork
  deduplicated by SHA-256, single-flight bounded downloads, expiring reservations, reconciliation at
  start-up and on demand. Serving: cached file with `immutable` caching + ETag, else a bounded
  on-demand fill, else the placeholder (5 minutes).
- Imports: `POST /admin/catalog/sync` and `POST /internal/jobs/catalog-import` take `imageMode`
  (`NONE`, `REFERENCED` default for `ygoprodeck`, `ALL`, `LIMIT` + `imageLimit`); 409 while another
  import of the game runs; `catalog_sync_run.report` holds the `CatalogImportReport`
  (`GET /admin/catalog/sync-runs/{id}/report`). Metadata is imported in chunks of 500 cards (a
  failing chunk is retried card by card); a provider outage fails the run and keeps the catalog.
- Admin: `GET /admin/card-images/status`, `POST /admin/card-images/clear`,
  `POST /admin/card-images/reconcile`, `DELETE /admin/card-images/{imageId}/cache` (audited).
  Internal: `GET /internal/jobs/card-images/status`, `POST /internal/jobs/card-images/clear`,
  `POST /internal/jobs/card-images/reconcile` (job runs) for `npm run card-images:*`.
- Rate limit policy `card-images`: 600 GET per minute and IP on card images and placeholders.

### Seed (Phase 2)

`feature flags` (order 50, `local`/`dev` only): enables `protectedPayments`, `advertising` and
`donations` unless an admin changed them; `mlScanning` stays off. `catalog` (order 400): imports the
four mock catalogs through `CatalogImportService` (idempotent; one sync run per game and start-up).

### Deviations from the Phase 2 / Phase 10 contracts

- `usage_limit.window` is stored as `limit_window` (`WINDOW` is reserved in PostgreSQL); the API field
  is `window`. Additive column `usage_limit.kind` (`COUNTER` / `CAP`) distinguishes counted limits from
  caps such as `map.radius.max_km`.
- Admin writes are per resource: `PUT /admin/feature-flags/{key}`, `PUT /admin/plans/{code}`,
  `PUT /admin/usage-limits/{id}`, `DELETE /admin/users/{id}/entitlements/{entitlementId}` (the contract
  names the collections `GET/PUT /admin/plans`, `/admin/usage-limits`, "grant/revoke").
- `GET /me/plan` adds `features`, `upgradeUrl` and (since Phase 10) the live `subscription`; limit
  entries add `kind`, `window`, `remaining`, `allowed`, `overridden`, `planCode`.
- `SetDetail` is `{set, metadata, printings: PageResponse}`; `PrintingDetail` is `{printing, card, set,
  metadata}`; `PrintingSummary.marketPrice` is `{amount, currency, updatedAt}`; `CardSuggestion` adds
  `kind` and `printingId`.
- Additive columns `card_set.external_ref` and `card.external_ref` (idempotent imports), and additive
  admin routes `GET /admin/games`, `POST/PUT /admin/sets`, `GET /admin/catalog/sync-runs/{id}`,
  `GET /admin/catalog/providers`, `GET /admin/users/{id}/entitlements`.
- `INCREMENTAL` syncs pass the last successful run's start to the provider; the mock provider has no
  change tracking and returns everything (still idempotent).

## Inventory, binders, freshness (Phase 3)

Contract: `docs/api/contracts/phase3-inventory.md`. Modules: `delisting` (policy, pure freshness
rules, freshness event log, `delist` job, admin policy endpoints) ← `binders` (binders, effective
visibility rules, public binder views, `BinderContents` extension point) ← `inventory` (items,
photos, bulk operations, public item lists, reconciliation of the publication events, `freshness`
job; implements `BinderContents`). Owner routes need a bearer token and accepted terms; the public
routes are permitAll GETs (`/api/v1/public/**` plus `SecurityConfig.PUBLIC_GET_PATTERNS`
`/api/v1/collectors/*/binders` and `/api/v1/collectors/*/inventory`) that still honour a token
(distance buckets, binder-view limit, the owner's own view).

| Route | Module | Notes |
| --- | --- | --- |
| `GET /api/v1/inventory/items?query=&game=&binderId=&unfiled=&visibility=&availability=&condition=&freshness=&sort=updated\|name\|price&direction=&page=&size=` | inventory | the caller's items; `query` = card name (FTS + substring, accent-insensitive), printing-code prefix, set code/name |
| `POST /api/v1/inventory/items` | inventory | 201 + `Location`; defaults: quantity 1, condition NEAR_MINT (must be one of the game's `GameSchema.conditions`), language/edition/finish of the printing, CAD, COLLECTION_ONLY; visibility PUBLIC inside a binder (the binder decides), PRIVATE unfiled; TEMPORARILY_PUBLIC needs `publicUntil` ≤ 30 days ahead |
| `GET/PATCH/DELETE /api/v1/inventory/items/{id}` | inventory | PATCH = any subset (absent = unchanged, `askingPrice`/`publicUntil`/`binderId`/`notes`/`publicNotes` may be null); DELETE = soft delete (photos removed) |
| `POST /api/v1/inventory/items/{id}/confirm` | inventory | `confirmed_at` = now, freshness ACTIVE (HIDDEN → RESTORED), also confirms its binder |
| `POST /api/v1/inventory/items/{id}/images`, `DELETE .../images/{imageId}` | inventory | multipart `file` (JPEG/PNG/WebP sniffed, ≤ 8 MB), re-encoded JPEG ≤ 1600 px without metadata into `ObjectStorage` (`inventory/<owner>/<random>.jpg`, served by `/api/v1/public/media/**`); ≤ 4 per item (409); 201 returns the item; rate-limited 60/hour |
| `POST /api/v1/inventory/items/bulk` | inventory | `SET_VISIBILITY`, `MOVE_TO_BINDER` (`binderId` null = unfiled), `SET_AVAILABILITY`, `CONFIRM`, `DELETE`; one transaction; every id checked against the caller (`skipped[].reason` NOT_FOUND / UNCHANGED) |
| `GET /api/v1/inventory/summary` | inventory | totals, `byVisibility`, `byGame`, `agingCount`, `staleCount`, `hiddenCount`, `effectivePublicCount`, `nextExpiry` (items and binders) |
| `GET/POST /api/v1/binders`, `GET/PATCH/DELETE /api/v1/binders/{id}` | binders | owner only (others 404); create consumes `binders.max` (429 LIMIT_REACHED, usage = binder count through a `LimitUsageSource`); DELETE unfiles the items (kept visibility only for a PUBLIC binder, otherwise PRIVATE) or soft-deletes them with `?deleteItems=true` |
| `POST /api/v1/binders/{id}/publish` `{mode}`, `.../unpublish`, `.../confirm`, `PUT /api/v1/binders/reorder` | binders | PUBLIC / UNTIL_DISABLED → PUBLIC; ONE_HOUR / ONE_DAY → TEMPORARILY_PUBLIC until now + 1 h / 24 h; publishing and confirming confirm the binder and its items |
| `GET /api/v1/binders/{id}/items` | inventory | the caller's items of one binder (same filters) |
| `GET /api/v1/collectors/{handle}/binders` | binders | public binders with ≥ 1 public item (`PublicBinderSummary`) |
| `GET /api/v1/public/binders/{id}` | binders | `PublicBinderResponse` with an owner block (handle, display name, avatar, `location: {publicLabel, distanceBucket}`, never a point); signed-in visitors other than the owner consume `binder.views.per_day` once per binder and UTC day (Redis de-duplication, 429 beyond the plan) |
| `GET /api/v1/public/binders/{id}/items`, `GET /api/v1/collectors/{handle}/inventory` | inventory | `PublicInventoryItem` pages (no `notes`, no coordinates) |
| `GET /api/v1/admin/delist-policies`, `PUT /api/v1/admin/delist-policies/{id}` | delisting | ADMIN+ (Phase 7 contract, built with the table); ordering validated, audited `delist_policy.update`, cache evicted |
| `POST /internal/jobs/freshness` (hourly), `POST /internal/jobs/delist` (daily) | inventory, delisting | service auth; `@Scheduled` stand-ins under `local` (`FreshnessScheduler` every hour, `DelistScheduler` daily); both record a `job_run` |

### Effective public visibility

Item public ⇔ visibility PUBLIC or TEMPORARILY_PUBLIC not expired ∧ binder public (or none) ∧
freshness ≠ HIDDEN ∧ not deleted ∧ game ACTIVE ∧ owner listed. Binder public ⇔ same visibility and
expiry rule ∧ binder freshness ≠ HIDDEN ∧ owner listed. Owner listed ⇔ account ACTIVE (or a temporary
suspension already over) ∧ (discoverable ∨ profile PUBLIC) ∧ profile ≠ PRIVATE. Public collectors are
404 when suspended, pending deletion, deleted, PRIVATE or blocked (`BlockRelationProvider`, Phase 5).
`PublicVisibilityRules` holds the SQL fragments and a pure Java twin (`VisibilityRulesTest`); every
public read evaluates them live (expiries apply at once).

### Publication events and freshness

- `ListingReconciler` stores the last evaluation in `publicly_listed` (items and binders) and emits
  `InventoryItemPublished {itemId, ownerId, printingId, cardId, gameSlug, availability, askingPrice,
  currency, publishedAt}`, `InventoryItemUnpublished`, `BinderPublished`, `BinderUnpublished` once per
  flip, inside the transaction (Modulith outbox). It runs after every write, on
  `UserSuspendedEvent` / `UserUnsuspendedEvent` / `PrivacySettingsChangedEvent` (async
  `@ApplicationModuleListener`s), from the deletion participant, and in the hourly job (expiries,
  suspensions that ended). Seed data is reconciled silently.
- The freshness job: expired temporary publications → PRIVATE; freshness re-derived from
  `confirmed_at` and the active `delist_policy` (items and binders, both directions; AGED / STALED /
  HIDDEN / RESTORED rows in `inventory_freshness_event`, `BinderFreshnessChanged`); reconciliation
  (HIDDEN → `InventoryItemUnpublished`); publicly listed items and binders in the warning window
  (`warn_before_hidden_days`) get one WARNED row per confirmation cycle and one
  `BinderFreshnessWarning {ownerId, binderId|null, itemCount, hidesAt}` per binder (null = unfiled
  items) and run. Nothing is ever deleted.
- Account deletion: the inventory participant unpublishes everything at the request (the owner is no
  longer listed), republishes on cancellation and purges items, photos (after commit) and, through the
  binders participant, binders. Export sections `inventory` (with private notes: the owner's own data)
  and `binders`.

### Seed (Phase 3)

`inventory` (order 500, `db/seed/inventory.json`): 10 binders / 36 items for the fictional
collectors from the seeded mock printings (CAD prices, several accepting offers): fresh public
binders for collectors 1, 2, 5, 8 (plus a private binder and an unfiled lot for collector1), a
STALE binder (40 days) for collector3, a HIDDEN binder (50 days, hidden until confirmed) for
collector6, a binder public for 24 h for collector4 and private-only inventory for collector7 (not
discoverable). Stable ids `00000000-0000-4000-8b00-…` (binders) and `…-8c00-…` (items); inserted once
(`ON CONFLICT DO NOTHING`), dates relative to the first seed run.

### Deviations from the Phase 3 contract

- The owner rule additionally excludes PRIVATE profiles (the contract says "discoverable or
  profile public"; a discoverable collector with a PRIVATE profile publishes nothing).
- Additive columns: `binder.freshness_state` / `warned_at` / `publicly_listed` /
  `listing_changed_at`, `inventory_item.warned_at` / `publicly_listed` / `listing_changed_at`,
  `inventory_freshness_event.owner_id`, `delist_policy.max_strikes` / `created_at`. Binder freshness
  is derived from `binder.confirmed_at` like items; a HIDDEN binder is not public.
- Additive response fields: `BinderResponse.sortOrder`, `effectivePublic`, `games`,
  `coverPrintingId`; `PublicInventoryItem.binder`; `PublicBinderResponse.kind`, `publicUntil`,
  `coverImageUrl`; summary `agingCount`, `effectivePublicCount`; list parameters `unfiled`,
  `direction`; `PublicBinderSummary` = `{id, name, description, kind, publicUntil, itemCount, games,
  coverImageUrl, freshness}`. Events carry `ownerId` and a timestamp; `BinderUnpublished` and
  `BinderFreshnessWarning` are additional.
- Defaults the contract leaves open: item visibility PUBLIC inside a binder / PRIVATE unfiled;
  unfiling (PATCH `binderId: null`, bulk move to none, binder deletion) keeps the item's visibility
  only when the source binder is PUBLIC without an end date; making an item public and publishing a
  binder count as confirmations; the job turns expired temporary publications PRIVATE.
- Photo upload answers 201 with the item; photos are JPEG (no JDK WebP encoder), ≤ 1600 px.
- `binder.views.per_day` is consumed on `GET /public/binders/{id}` only, for signed-in visitors
  other than the owner (web clients must send their token on that route for it to count).
- `POST /internal/jobs/delist` records runs but pauses nobody until strike tracking exists.
- Text of binders and public notes is not yet run through `TextModerationService` (Phase 7).

## Map discovery and search (Phase 4)

Contract: `docs/api/contracts/phase4-map-search.md`. Module `search` (reads the tables of the
location, profiles, users, binders, inventory and catalog modules read-only through SQL, uses the
public point only) and a minimal `analytics` module. Every route is a permitAll GET
(`SecurityConfig.PUBLIC_GET_PATTERNS`) that honours a bearer token when present.

| Route | Notes |
| --- | --- |
| `GET /api/v1/collectors/nearby?lat=&lng=&radiusKm=&game=&availability=&freshness=&tags=&hasPrintingId=&hasCardId=&query=&limit=200` | collectors **on the map** (public point set, `discoverable`, account ACTIVE, profile not PRIVATE) within `ST_DWithin(public_point, centre, radius)`; filters per the contract (`availability` TRADE / SALE / TRADE_OR_SALE / ACCEPTS_OFFERS, `freshness` ACTIVE / AGING, `tags` any, `hasPrintingId` / `hasCardId` / `availability` / `game` = an effectively public ACTIVE-or-AGING item, `game` also matches the profile games, `query` = handle, display name or tag text of collectors with `searchDiscoverable`); `matchingItems` (at most 5 per marker) when a printing, card or availability filter is set; ranking freshness (ACTIVE > AGING > no listings), distance bucket, rating, distance; `total` / `truncated`; Redis cache 60 s |
| `GET /api/v1/collectors/{handle}/preview?lat=&lng=` | the marker of one collector on the map + `canMessage` (PrivacyPolicyService) + `isBlocked`; 404 when not on the map |
| `GET /api/v1/search?q=&types=&game=&lat=&lng=&radiusKm=&limit=10` | cards (catalog FTS + trigram), printings (code prefix, or the printings of the resolved card), sets, collectors, public binders (`search_vector` + name substring, at least one public item, owner on the map within the radius when a centre is known; each with an `owner` block); `resolved` = `{printingId, cardId}`; with a resolution `collectors` lists the holders with `matchingItems` |
| `GET /api/v1/search/card-holders?printingId=&#124;cardId=&lat=&lng=&radiusKm=&availability=&condition=&minPrice=&maxPrice=&freshness=&edition=&language=&acceptsOffers=&sort=distance&#124;price&#124;freshness&page=&size=` | `PageResponse<CardHolderResult {collector: CollectorMarker, item: PublicInventoryItem}>`; effectively public ACTIVE/AGING items of collectors on the map within the radius; the own items of the caller are excluded |
| `GET /api/v1/search/suggest?q=&game=&lat=&lng=&limit=10` | `[{type, id, label, sublabel, imageUrl, game, slug, cardId}]` (type CARD, PRINTING, SET, COLLECTOR, BINDER or TAG), one entry per kind in turn |

### Geography (ADR 0004)

- **Centre**: `lat`/`lng` when given, else the trading area of the signed-in caller
  (`LocationService.searchCentreOf`, never another collector's); always snapped to 0.01 degree
  (about 1 km, `SearchCentre`) before it reaches SQL, the cache key (a SHA-256 of the canonical
  request) or the response (`center`, 2 decimals). Signed-out callers must pass `lat`/`lng` to
  `nearby` and `card-holders` (400 otherwise); `search` and `suggest` also work without a centre
  (then not geographic, no distances).
- **Radius**: default 10 km (`orenji.search.default-radius-km`), lowered to the cap of the caller; an
  explicit `radiusKm` beyond `map.radius.max_km` (FREE 25, PREMIUM 100, entitlements apply;
  signed-out callers: FREE through `Limits.checkValueForAnonymous`) is `429 LIMIT_REACHED` with
  `used` = the requested radius rounded up. 0.1 km steps; 0.1 to 20 000 km accepted as input.
- Markers carry the stored public point (3 decimals) and its label; `distanceBucket` is measured from
  the snapped centre to the public point and only returned to signed-in callers for collectors with
  `showDistance` (never for oneself). `lastActiveBucket` / `onlineStatus` follow
  `PrivacyPolicyService` (hidden from signed-out visitors of MEMBERS profiles). No raw distance ever
  leaves the server. `GeoPrivacyContractTest` walks nearby, preview, search, card holders and suggest
  for the seeded collectors, signed out and signed in.

### Cache

`NearbyCache`: `orenji:cache:nearby:<generation>:<sha256>` for 60 s (`orenji.search.nearby-cache-ttl`),
holding the viewer-independent rows (public point, privacy switches, statistics, matching items;
never a trading-area centre). Viewer-specific rules (distance buckets, last activity, blocks, rating
order) are applied per request. `NearbyCacheInvalidator` bumps the generation after commit on
`InventoryItemPublished` / `Unpublished`, `BinderPublished` / `Unpublished`, `BinderFreshnessChanged`,
`TradingAreaChangedEvent`, `LocationRemovedEvent`, `PrivacySettingsChangedEvent`, `UserSuspendedEvent`
and `UserUnsuspendedEvent` (plain listeners, not stored in the event publication registry); other
changes (a price edit) show within the TTL. Fails open without Redis.

### Analytics (minimal slice of Phase 12)

`AnalyticsEvent` `{event_id, event_type, event_version: 1, occurred_at, actor_hash, region_label,
geo_cell, payload}` (the columns of the BigQuery `events` table): `actor_hash` = HMAC-SHA256 of the
account id (`ANALYTICS_ACTOR_SALT`), geography = the ~1 km grid cell id and region label only,
payload values = scrubbed strings (e-mails, decimal numbers and long digit runs masked, 64
characters), whole numbers, booleans, string lists and `*_hash` hex digests; floating-point values
and keys such as `lat`, `lng`, `email`, `handle`, `user_id` are refused. `AnalyticsPublisher` sends
asynchronously and never fails a request. `LogAnalyticsTransport` (default, `EVENTS_TRANSPORT=local`)
writes `analytics {json}` lines on the logger `orenji.analytics`; `PubSubAnalyticsTransport` (only
with `EVENTS_TRANSPORT=pubsub`) publishes to `projects/<GOOGLE_CLOUD_PROJECT>/topics/<PUBSUB_TOPIC_ANALYTICS>`
through the Pub/Sub REST API with Application Default Credentials (or `PUBSUB_EMULATOR_HOST` without
credentials); nothing is created or contacted locally. Events: `search_performed` /
`search_no_results` (`GET /search`, `GET /search/card-holders`, and `GET /collectors/nearby` when
`query`, `hasPrintingId` or `hasCardId` is used; payload `surface`, scrubbed `query`, `game`,
`types`, `resolved`, `result_count`, `radius_km`, filter names), `collector_viewed` (profile and
preview, `target_hash`), `binder_viewed` (`binder_id`, `owner_hash`), `card_viewed` (`card_id`,
`printing_id`, `game`). They are derived from in-process notifications (`SearchPerformed`,
`CollectorPreviewed`, `CollectorProfileViewed`, `PublicBinderViewed`, `CardViewed`), so no module
depends on analytics. `AnalyticsIT` checks that no emitted event carries a coordinate, an e-mail
address, a raw account id or (views) a handle.

### Binder views

`binder.views.per_day` (Phase 3) is covered by `BinderViewLimitIT`: signed-in FREE visitors consume
one unit per binder and UTC day; repeated, owner and signed-out views never count; PREMIUM and
entitled visitors are not limited; a refused view consumes nothing.

### Deviations from the Phase 4 contract

- **Who is on the map**: discoverable collectors whose profile is not PRIVATE appear for signed-out
  visitors too (the contract rule "discoverable, ACTIVE, not deletion-requested"; `discoverable` is
  the explicit consent to be shown at the public point), with reduced detail: no distance, no
  messaging, last activity hidden for MEMBERS profiles (`PrivacyPolicyService.canAppearOnMap`). The
  profile page itself stays members-only for MEMBERS profiles.
- **Freshness**: collectors whose public listings are all STALE never appear; collectors without any
  public listing do appear (`binderFreshness: null`, ranked after AGING). STALE / HIDDEN items never
  match a filter or a card-holder search. `binderFreshness` is the best freshness of the public items.
- **Ranking**: freshness, then distance *bucket*, then rating, then exact distance (so the rating can
  decide between collectors at a similar distance; ratings arrive with Phase 7).
- The marker of the caller is not removed from `nearby` (it shows where others see them);
  `card-holders` excludes the items of the caller. Blocked collectors (real since Phase 5, one
  lookup per page) are filtered after the cached page is read: `total` excludes the blocked
  collectors of the page but may still count blocked ones beyond the limit.
- `card-holders` needs a centre like `nearby` (400 for signed-out callers without `lat`/`lng`).
- Additive: `center` is snapped to 2 decimals; `MatchingItem` adds `printingId`, `cardId`,
  `cardName`, `game`, `language`, `edition`, `acceptsOffers`, `freshness`; the preview accepts
  optional `lat`/`lng`; `PublicBinderSummary` gains an optional `owner` block (search results only);
  `suggest` accepts `game` and adds `slug` (COLLECTOR handle, TAG slug) and `cardId` (PRINTING);
  `limit` of `nearby` is 1 to 500.
- Resolution: an exact printing code carried by one printing resolves the printing; a code shared by
  several printings of one card, an exact card name, or a single card hit resolves the card.
- Collector text matching is substring-only (handle, display name, tag label or slug); fuzzy
  matching is kept for `suggest`.
- `nearby` is a reserved handle (the route `/collectors/nearby` shadows it).
- Phase 4 adds no seed data: discovery reads the Phase 1 to 3 seed (profiles, trading areas,
  binders, items).

## Messaging, realtime, community (Phase 5)

Contract: `docs/api/contracts/phase5-chat.md`. Modules `messaging` (conversations, messages, blocks,
uploads, realtime), `community` (channels, posts, replies) and `moderation` (`ModerationService`,
flags). Migrations V040–V042. Every route needs a signed-in, compliant account.

| Route | Notes |
| --- | --- |
| `GET /api/v1/conversations?cursor=&limit=20&archived=false` | `CursorPage<ConversationSummary>`, newest activity first; conversations hidden by a block (either direction) and empty conversations started by the other participant are omitted; `other.onlineStatus` is HIDDEN unless the participant shows it |
| `POST /api/v1/conversations {recipientId}` | idempotent per pair (`conversation_pair`): 201 new, 200 existing, never 409; 400 oneself, 404 unknown/suspended/deleted recipient, 403 `MESSAGING_BLOCKED` for a block or (new conversations only) the recipient's `messagingPermission` (`PrivacyPolicyService.canMessage`) |
| `PATCH /api/v1/conversations/{id} {muted?, archived?}` | per participant; a new message un-archives for both |
| `GET /api/v1/conversations/{id}/messages?cursor=&limit=50` | newest first; `readByOther` = the participant who did not send the message has read it; REMOVED messages keep their place with empty body and payload |
| `POST /api/v1/conversations/{id}/messages {kind, body, cardPrintingId?, binderId?, offerId?, imageUploadId?}` | TEXT, CARD_LINK, BINDER_LINK (public binders only), IMAGE, OFFER_LINK (an offer between the two participants, Phase 8); SYSTEM is 400; moderation (422 `MESSAGE_BLOCKED`, FLAG rules store the message `FLAGGED`), rate rule 30/min (429 `RATE_LIMITED` + `retryAfterSeconds`); publishes `MessageSent`; pushed to both participants on `/user/queue/messages` after commit |
| `POST /api/v1/conversations/{id}/read {lastReadMessageId}` | 204; the marker only moves forward; publishes `MessageRead`; receipt `{conversationId, userId, lastReadMessageId, readAt}` on `/user/queue/receipts` of both participants |
| `POST /api/v1/uploads/images` (multipart `file`, `kind=MESSAGE`) | 201 `{uploadId, url, width, height, expiresAt}`; sniffed JPEG/PNG/WebP up to 8 MB (413 / 415 / 400), re-encoded without metadata by the inventory `ItemImageProcessor`, `ImageUploadInspector` hook (allow-all default); attach within 1 h; rate-limited 30 per hour |
| `POST /api/v1/users/{id}/block {reason?}`, `DELETE /api/v1/users/{id}/block`, `GET /api/v1/me/blocks` | idempotent; the reason is private and never echoed; publishes `UserBlocked` / `UserUnblocked` |
| `GET /api/v1/community/channels?game=&region=` | active channels (the eight V041 launch channels and region channels) with `postCount24h` |
| `GET` / `POST /api/v1/community/channels/{slug}/posts` | newest first; `{body ≤ 2000, cardPrintingId?, binderId?}`; 409 `DUPLICATE_POST` (same normalised text by the author within 24 h), 429 above the channel's `post_rate_limit_per_hour` (default 10) or the moderation rate rule, 422 `POST_BLOCKED`; publishes `CommunityPostCreated` |
| `PATCH /api/v1/community/posts/{id} {body}`, `DELETE /api/v1/community/posts/{id}` | the author edits (403 for others); the author or MODERATOR+ deletes (moderator deletions audited) |
| `GET` / `POST /api/v1/community/posts/{id}/replies`, `DELETE /api/v1/community/replies/{id}` | oldest first; `{body ≤ 1000}`; same moderation |
| `GET` / `POST /api/v1/admin/community/channels`, `PATCH /api/v1/admin/community/channels/{id}`, `POST /api/v1/admin/community/posts/{id}/remove {reason}`, `POST /api/v1/admin/community/replies/{id}/remove {reason}` | MODERATOR+ (`SecurityConfig.MODERATOR_PATTERNS`), audited (`community.channel.create` / `update`, `community.post.remove`, `community.reply.remove`); removals resolve the content's open flags |
| `GET /api/v1/admin/moderation/flags?state=OPEN|RESOLVED|ALL&subjectType=&page=&size=`, `POST /api/v1/admin/moderation/flags/{id}/resolve {note?}` | MODERATOR+; flags reference content by id only (no message text); resolutions audited (`moderation.flag.resolve`) |
| `POST /internal/jobs/upload-cleanup` | service auth; deletes uploads not attached within 1 h with their objects; `job_run`; every 15 minutes under `local` |

Community member routes are gated by the `publicChat` feature flag (404 `FEATURE_DISABLED`,
extension `feature`). Posts and replies of collectors blocked in either direction, of suspended,
deletion-pending or deleted accounts, and deleted or REMOVED ones are never served; archived
channels are 404 for members.

### Realtime (STOMP over WebSocket)

- Endpoint `ws://<api host>/ws` (native WebSocket, no SockJS; allowed origins =
  `CORS_ALLOWED_ORIGINS`). Authenticate the handshake with `?access_token=<Firebase ID token>`
  (browsers cannot set headers on WebSocket requests) or `Authorization: Bearer` (native clients),
  or send `Authorization: Bearer <token>` in the STOMP `CONNECT` frame. The same
  `IdentityTokenVerifier` and `AccountResolver` as REST are used (Auth emulator locally, static
  tokens in tests). Invalid tokens get 401 at the handshake (403 for suspended or deleted accounts)
  or a STOMP `ERROR` frame. `/ws` is therefore open at the HTTP layer
  (`SecurityConfig.PUBLIC_PATTERNS`).
- Subscriptions are limited to the caller's own queues (`StompSecurityInterceptor`):
  `/user/queue/messages` (`MessageResponse`), `/user/queue/receipts`, `/user/queue/typing`
  (`{conversationId, userId}`), `/user/queue/presence` (`{userId, status: ONLINE|OFFLINE}`),
  `/user/queue/notifications` (Phase 6 `NotificationResponse`) and `/user/queue/errors`. `/user/<someone>/...`,
  raw `/queue/...` and `/topic/...` are refused with an `ERROR` frame. Clients may only `SEND` to
  `/app/typing {conversationId}`.
- Fan-out: `RealtimePublisher` publishes `{destination, payload}` to the Redis channel
  `rt:user:{userId}`; every instance subscribes to `rt:user:*` (`RealtimeRedisListener`) and delivers
  to its local sessions through the user destination resolver. Without Redis the payload reaches the
  local instance only. Pushes are best effort; clients re-sync over REST.
- Presence: `presence:{userId}` (TTL 60 s) is set on CONNECT, refreshed by the session's frames and
  STOMP heartbeats (server heartbeat 20 s) and cleared when the last local session disconnects.
  `onlineStatus` of collector profiles, map markers and conversation lists is real now
  (`PresenceProvider`) and shown only with `showOnlineStatus`; ONLINE/OFFLINE changes are announced to
  the conversation partners who may see them.

### Moderation (`ModerationService`, ADR 0014)

`check(scope, text, authorId)` applies the active `moderation_rule`s of `MESSAGE` or `POST` (replies
use `POST`): `RATE_LIMIT` `<count>/<seconds>` per author in Redis (BLOCK → 429, FLAG → one open USER
flag), `BANNED_TERM` regular expressions on accent-stripped lower-case text (BLOCK → 422, FLAG → the
content is stored `FLAGGED` with a flag), `THRESHOLD` `<count>/<seconds>` repeated-content detection
on the SHA-256 of the normalised text (never the text itself) per author. V042 seeds placeholder
banned terms, the contract's 30 messages per minute, 60 posts and replies per hour and the
repeated-content thresholds (5 identical messages in 10 minutes, 3 identical posts in an hour →
FLAG). Rules are cached 60 s per instance. No automatic ban; flags are unique per open subject and
reason.

### Blocks elsewhere

`BlockRelationProvider` (profiles SPI) is implemented by the messaging module: collector profiles
(`isBlocked`, `canMessage`), map markers and previews (one lookup per page through `blockedAmong`),
public binders, binder links and community feeds all see real blocks.

### Seed (Phase 5)

`MessagingSeedContributor` ("conversations"): collector1 ↔ collector2
(`00000000-0000-4000-8d00-000000000001`), six messages including a binder link (collector1's
Yu-Gi-Oh! trade binder) and a card link (`ygo-p001a`); collector2 has one unread message.
`CommunitySeedContributor` ("community"): five posts (`00000000-0000-4000-8e00-0000000001NN`) in
montreal-yugioh, looking-for, new-listings, general and trades, and three replies. The eight channels
themselves are V041 reference data (every environment). Region channels (e.g. Laval, Longueuil)
appear as seeded collectors are put on the map.

### Account data

Export sections `messaging` (conversation ids, own sent messages, own blocks; never the other
participant's text) and `community` (own posts and replies). Deletion: the content of sent messages
is erased (rows kept for the other participant's history), photos and pending uploads deleted,
blocks removed in both directions, posts and replies deleted and erased.

### Deviations from the Phase 5 contract

- `POST /conversations` answers 201 for a new conversation and 200 for an existing one.
- The recipient's messaging permission applies to **new** conversations; existing conversations
  continue unless a block exists. Messages to suspended, deletion-pending or deleted participants are
  403 `MESSAGING_BLOCKED`; conversations hidden by a block answer 404 to reads and 403 to sends.
- Additive: `MessageResponse.conversationId`; `CardLink.cardId` (its `id` is the printing id);
  `ConversationSummary.createdAt`; `LastMessage.id`; `GET /conversations?archived=`;
  `ImageUploadResponse.width` / `height` / `expiresAt`; `PostResponse.channelSlug` /
  `moderationState`; `PATCH /community/posts/{id}` (the contract lists `editedAt` and `canEdit`);
  `POST /admin/community/replies/{id}/remove`; `GET /admin/community/channels`;
  `POST /admin/moderation/flags/{id}/resolve`.
- `POST /uploads/images` with `kind=INVENTORY` is 400: inventory photos keep
  `POST /inventory/items/{id}/images` until an inventory flow consumes uploads.
- Message photos are served like other media from unguessable keys
  (`/api/v1/public/media/uploads/...`); signed URLs are left for the cloud storage work.
- `moderation_flag` adds `author_id` and `resolution_note`; `reason` is a code (`BANNED_TERM`,
  `RATE_THRESHOLD`, `REPEATED_CONTENT`).
- Region channels are created with the city of the collector's public label
  ("Plateau-Mont-Royal, Montréal" → Montréal) only when no REGION channel of that city exists (the
  seeded Montréal per-game channels count).
- Realtime pushes are made from the request thread after commit (so URLs are absolute like in the
  REST response) rather than from an event listener; `MessageSent` / `MessageRead` stay in the event
  registry for Phases 6 and 7. Open sessions of an account suspended later are not closed (it can no
  longer send through REST).

## Wishlist, matching, notifications (Phase 6)

Contract: `docs/api/contracts/phase6-wishlist-notifications.md`. Modules `wishlist` (items, matches,
`WishlistMatcher`, rematch job) and `notifications` (`NotificationService`, dispatcher, push/email
providers, push tokens, consumers of other modules' events). Migrations V050–V051. Every route needs
a signed-in, compliant account.

| Route | Notes |
| --- | --- |
| `GET /api/v1/wishlist` | the caller's items, newest first: `{id, game, card{id,name,imageUrl}, printing (PrintingSummary or null = any printing), rarity, conditionMin, edition, language, maxPrice, currency, radiusKm, tradePreference, notes (private), active, matchCount, lastMatchedAt, createdAt, updatedAt}` |
| `POST /api/v1/wishlist` | 201; `cardId` or `printingId` required (the card of a printing is derived); `rarity`, `conditionMin`, `edition`, `language` must belong to the game's `GameSchema` (codes are normalised: `lightly_played` → `LIGHTLY_PLAYED`, `FR` → `fr`); `maxPrice` ≥ 0 with 2 decimals, `currency` ISO 4217 (default CAD), `radiusKm` default 25 (lowered to the plan cap), `tradePreference` ANY/TRADE/SALE, `notes` ≤ 500; 409 `CONFLICT` for the same target with the same filters; 429 `LIMIT_REACHED` beyond `wishlist.items.max` (FREE 20 / PREMIUM 500) or a radius beyond `map.radius.max_km` (FREE 25 / PREMIUM 100). The new item is matched at once against the public inventory (no notification) |
| `PATCH /api/v1/wishlist/{id}` | any subset; `printingId` (another printing of the same card, or null = any), `rarity`, `conditionMin`, `edition`, `language`, `maxPrice`, `notes` may be null; changing the criteria re-matches the item (undismissed matches that no longer apply are removed, dismissed ones stay) |
| `DELETE /api/v1/wishlist/{id}` | 204; matches go with it |
| `GET /api/v1/wishlist/{id}/matches?cursor=&limit=20&includeDismissed=false` | `CursorPage<WishlistMatchResponse>` newest first: `{id, wishlistItemId, item (PublicInventoryItem, never private notes), collector (CollectorMarker at the public point), distanceBucket, matchedAt, dismissed}`; items no longer public and collectors blocked in either direction are left out |
| `POST /api/v1/wishlist/matches/{id}/dismiss` | 204, idempotent; 404 for other users' matches |
| `GET /api/v1/collectors/{handle}/wishlist` | `[{card, printing, conditionMin}]` of the active items, only when the collector shows their wishlist (`wishlistVisible`), may be seen by the caller (profile visibility) and no block exists; 404 otherwise (the owner always sees their own) |
| `GET /api/v1/notifications?cursor=&limit=20&unreadOnly=false` | `CursorPage<NotificationResponse>` `{id, type, title, body, data (ids + deepLink), createdAt, readAt}`, newest first; notifications whose in-app channel was off are never listed |
| `GET /api/v1/notifications/unread-count` | `{count}` (badge) |
| `POST /api/v1/notifications/{id}/read`, `POST /api/v1/notifications/read-all` | idempotent (the first read time is kept); read-all answers `{updated}`; 404 for other users' notifications |
| `POST /api/v1/me/push-tokens {platform: IOS\|ANDROID\|WEB, token}`, `DELETE /api/v1/me/push-tokens/{token}` | 204, idempotent; a token registered by another account moves to the caller, an invalidated one becomes valid again; deleting another account's token is a no-op; tokens are never returned or logged |
| `POST /internal/jobs/wishlist-rematch` | service auth; nightly safety net: re-matches inventory items published in the last 24 h (only lost publications create matches and notifications) and wishlist items edited in that window; `job_run`; `@Scheduled` daily under `local` (`WishlistRematchScheduler`) |

### Matching (ADR 0009, ADR 0004)

`InventoryItemPublished` → `WishlistInventoryListener` (`@ApplicationModuleListener`: after commit,
own transaction, Spring Modulith registry) → `WishlistMatcher.matchPublishedItem`: the contract SQL
(`WishlistMatchRepository.CANDIDATES`) over the item that is effectively public right now and fresh
(ACTIVE or AGING): active wishes of other collectors for the printing (or the card when no printing
is wished), condition rank (`array_position` in the game's ordered conditions), edition, language,
rarity, price (same currency; unpriced items pass), trade preference (`ANY`, or TRADE/SALE against
the availability), `ST_DWithin` between the **stored public points** of both collectors within the
wish's radius, active wisher account, no block in either direction. Each pair is inserted once
(`ON CONFLICT DO NOTHING`); only a new pair calls `NotificationService.notify` with the dedup key
`wishlist:<wishlistItemId>:<inventoryItemId>`, so re-publications and redelivered events never
notify twice. Body example: "Azure-Eyes Sky Dragon AZR-EN001 was listed ~5-10 km away for 45.00
CAD." Both collectors need a public point (discoverable); the wisher's trading-area centre is never
read. `WishlistMatched` / `WishlistItemCreated` feed the analytics events `wishlist_matched` (game,
distance bucket, notified, owner hash) and `wishlist_item_created` (game, target kind, radius, price
flag, trade preference; never notes).

### Notifications

`NotificationService.notify(NotificationRequest)` is the single entry point for other modules. It is
idempotent per `dedupKey` (advisory lock + unique key), skips unreachable recipients (suspended,
deletion pending, deleted), applies the preferences of `GET/PUT /me/settings/notifications` (master
switch and category channels; SYSTEM notices are in-app only; nothing is stored or counted when no
channel is wanted), holds push back during quiet hours (in the collector's time zone; in-app and email
unaffected), counts types with a daily limit through `Limits` (`wishlist.alerts.per_day`: FREE 5,
PREMIUM unlimited; beyond it the match is kept un-notified and one SYSTEM notice "More wishlist
matches are waiting" with `data.kind=LIMIT_REACHED` and the upgrade link is created per UTC day), then
stores the row with its channel plan and publishes `NotificationCreated`. `NotificationDispatcher`
(`@ApplicationModuleListener`) delivers the channels still `PENDING` and writes the outcome into
`channel_state`: the in-app payload (same shape as the REST response) on `/user/queue/notifications`
through the Phase 5 `RealtimePublisher`, push through `PushProvider` to the 20 most recently seen
valid tokens (tokens the provider reports invalid get `invalid_at`), email through `EmailProvider` to
a verified address only.

| Setting | Values | Notes |
| --- | --- | --- |
| `PUSH_PROVIDER` (`orenji.push.provider`) | `log` (default), `fcm` | `LogPushProvider` logs one line per push (notification id, type, device count; never tokens). `FcmPushProvider` (Firebase Admin SDK, ADR 0013) only with `fcm`: multicast batches of 500, `UNREGISTERED` / `INVALID_ARGUMENT` / `SENDER_ID_MISMATCH` tokens invalidated, never throws; needs the Admin SDK app and credentials of a deployed environment. Unknown values stop the start-up |
| `EMAIL_PROVIDER` (`orenji.email.provider`), `EMAIL_FROM` | `log` (default) | `LogEmailProvider` logs the email with a masked address (`c***@orenjitrade.test`); SendGrid/SES adapters are deferred and refused at start-up |

Events turned into notifications (`ActivityNotificationListener`, dedup-keyed):

- `MessageSent` → MESSAGE to the recipient ("<sender> sent you a message / shared a card with you
  / …", never the text; deep link `/messages/<conversationId>`), not for muted conversations, and at
  most one unread notification per conversation, none within 10 minutes of the previous one.
  `MessageRead` marks the conversation's MESSAGE notifications read.
- `BinderFreshnessWarning` → BINDER_STALE_WARNING ("Confirm your listings are still available", per
  binder or unfiled lot, deep link `/inventory?binder=<id|unfiled>`).
- `BinderFreshnessChanged` to HIDDEN and the new `InventoryListingsHidden` (inventory module, one per
  binder or unfiled lot and freshness run) → one BINDER_HIDDEN per binder or lot and day.

### Seed (Phase 6)

`WishlistSeedContributor` ("wishlist", after "community"): collector2 wishes `ygo-p001a` (Azure-Eyes
Sky Dragon AZR-EN001, at least LIGHTLY_PLAYED, up to 60 CAD, radius 25 km), which collector1 lists
publicly, so the seed runs the real matcher and collector2 gets a WISHLIST_MATCH notification; plus
`pkm-p002a` (collector1 keeps it in a private unfiled lot: publishing it locally triggers a fresh match
and notification) and the card of `mtg-p005b` for trade (collector5 lists it). Stable ids
`00000000-0000-4000-8f00-0000000002NN`; collector2's wishlist becomes visible on the first run.
`NotificationSeedContributor` ("notifications"): four history rows `00000000-0000-4000-9a00-…` (read
welcome and message notices for collector1, an unread message notice for collector2, an unread
freshness warning for collector3), never dispatched.

### Account data

Export sections `wishlist` (every item with its private notes), `notifications` (the latest 1 000)
and `pushTokens` (platform and dates, never the token). Deletion removes wishlist items and their
matches, notifications and push tokens.

### Deviations from the Phase 6 contract

- The daily limit is counted by the Phase 2 `Limits` service (`usage_counter` per UTC day with its
  Redis mirror `orenji:usage:*`) instead of a separate Redis key `notif:{userId}:{type}:{day}`; the
  limit values still come from `usage_limit` (ADR 0014).
- Additive: `WishlistMatchResponse.wishlistItemId`, `WishlistItemResponse.updatedAt`, `GET
  /wishlist/{id}/matches?includeDismissed=&limit=`, `GET /notifications?limit=`,
  `POST /notifications/read-all` answers `{updated}`; `notification.in_app` column (rows whose in-app
  channel was off exist for push/email bookkeeping but are never listed).
- Matching also requires the item to be fresh (ACTIVE or AGING, like the map) and the rarity filter
  (a contract field that the contract SQL omitted); items priced in another currency never meet a
  maximum price.
- A wish created or edited is matched at once against the current public inventory **without**
  notifications (the collector is looking at the result); only new publications notify.
- `DELETE /me/push-tokens/{token}` needs tokens without `/` (FCM and Expo tokens qualify; URL-encode
  `[` / `]`).

## Ratings, reports, moderation, delisting, admin console (Phase 7)

Contract: `docs/api/contracts/phase7-ratings-reports-admin.md`. Modules `ratings` (interactions,
ratings, references, `rating_summary`), `reports` (collector reports, moderator notes, the report
threshold, decisions, moderation history), `moderation` (report rules, rule CRUD), `delisting`
(listing pauses, unresponsiveness strikes), `inventory` / `binders` (admin listing and binder
views), `notifications` (statistics, broadcast), `analytics` (local aggregate, summary) and `admin`
(dashboard, system health). Migrations V060–V063.

| Route | Who | Notes |
| --- | --- | --- |
| `GET /api/v1/ratings/eligibility?userId=` | member | `{eligible, interactions: [{id, kind, occurredAt, alreadyRated}]}`; eligible = at least one interaction with the collector not rated yet by the caller; 400 for oneself |
| `POST /api/v1/ratings` | member | `{interactionId, overall 1-5, communication?, conditionAccuracy?, shipping?, meetupReliability?, comment ≤ 600}` → 201 `RatingResponse` (with `editableUntil`); 403 `RATING_NOT_ELIGIBLE` (unknown interaction or not the caller's), 409 `ALREADY_RATED` (extension `ratingId`), 400 for scores or banned terms (PROFILE rules); the rated collector gets RATING_RECEIVED (dedup `rating:<id>`, never the comment) |
| `PUT /api/v1/ratings/{id}` | author | same body without `interactionId`; 404 for others; 409 `RATING_EDIT_WINDOW_CLOSED` (extension `editableUntil`) after 14 days; no new notification |
| `GET /api/v1/collectors/{handle}/ratings?cursor=&limit=` | member | `{items: RatingResponse[], nextCursor, hasMore, summary: {average, count, communication, conditionAccuracy, shipping, meetupReliability}}` (averages one decimal, HIDDEN ratings neither listed nor counted); 404 when the profile is not visible to the caller |
| `POST /api/v1/references`, `GET /api/v1/collectors/{handle}/references` | member | one reference per author and collector (≤ 400, banned terms refused), needs an interaction (403 `RATING_NOT_ELIGIBLE`), 409 for a second one; cursor list of visible references |
| `GET /api/v1/admin/ratings?rateeId=&raterId=&state=`, `POST /api/v1/admin/ratings/{id}/hide {reason}` / `unhide`, `POST /api/v1/admin/references/{id}/hide` / `unhide` | MODERATOR+ | 409 when already (un)hidden; audited `rating.hide` / `rating.unhide` / `reference.hide` / `reference.unhide`; the summary is refreshed |
| `GET /api/v1/public/report-reasons` | anyone | `[{code, label, description}]` in dialog order (SCAM, COUNTERFEIT, HARASSMENT, SPAM, INAPPROPRIATE_BEHAVIOR, MISLEADING_LISTINGS, OTHER) |
| `POST /api/v1/reports/collectors` | member | `{reportedUserId, reason, details ≤ 1000, context?: {source: PROFILE\|CONVERSATION\|POST\|BINDER, conversationId?, postId?, binderId?}}` → 201 `{id, status: OPEN, createdAt, reason, reportedUserId}`; 422 `CANNOT_REPORT_SELF`, 404 unknown/deleted collector, 409 `REPORT_ALREADY_OPEN` (extension `reportId`), 400 when the context is not the caller's conversation with the collector / the collector's post / binder, 429 `RATE_LIMITED` beyond the REPORT rate rule (5 per day); `Idempotency-Key` header repeats the original answer for 24 h (Redis, fail-open); publishes `CollectorReported` |
| `GET /api/v1/me/reports` | member | the caller's reports (status, reason, reported collector; never notes or decisions) |
| `GET /api/v1/admin/reports?status=&reason=&reportedUserId=&assignedTo=&page=&size=` | MODERATOR+ | `PageResponse<ReportSummary>` with `openReportsAgainstUser` |
| `GET /api/v1/admin/reports/{id}` | MODERATOR+ | `ReportDetail`: reporter, reported collector (status, suspension, ban mark), context, `moderatorNotes`, `history` (recent reports, ratings received, posts/replies removed, suspension and pause audit entries, current listing status, open account flags) and, only when the context names a conversation, that conversation's latest 50 messages (audited `report.conversation.view`) |
| `POST /api/v1/admin/reports/{id}/assign {assigneeId?}` | MODERATOR+ | to the caller or another active moderator; OPEN → UNDER_REVIEW; 409 when decided; audited `report.assign` |
| `POST /api/v1/admin/reports/{id}/notes {body}` | MODERATOR+ | 201 note; audited `report.note` (note id only) |
| `POST /api/v1/admin/reports/{id}/resolve {status, action, note, notifyReporter, suspendUntil?}` | MODERATOR+ (SUSPENDED/BANNED: ADMIN+) | ACTIONED with WARNING (SYSTEM notice `data.kind=MODERATION_WARNING` to the collector), LISTINGS_PAUSED (pause source MODERATION), SUSPENDED (`UserAccountService.suspend` with the note as reason, optional future `suspendUntil`, identity user disabled, audited `user.suspend`) or BANNED (suspension without end + `user_account.banned_at`, audited `user.ban`); DISMISSED with NONE. An administrator's account needs a SUPER_ADMIN; nobody decides a report about themselves. Audited `REPORT_RESOLVED` with the action in the same transaction; `notifyReporter` sends REPORT_DECISION ("reviewed and took action" / "did not find a violation", no specifics). When no report against the collector stays open: their REPORT_THRESHOLD flags are resolved and, for NONE/WARNING, the review pause is lifted |
| `GET /api/v1/admin/users/{id}/history` | ADMIN+ | the same history as the report detail, never private messages |
| `GET /api/v1/admin/moderation/rules?scope=&kind=` | MODERATOR+ | every rule (`ModerationRule`) |
| `POST /api/v1/admin/moderation/rules`, `PUT …/{id}`, `DELETE …/{id}` | ADMIN+ (403 for moderators) | kind/scope combinations checked (BANNED_TERM for MESSAGE/POST/TAG/PROFILE, RATE_LIMIT for MESSAGE/POST/REPORT, THRESHOLD for MESSAGE/POST, REPORT_THRESHOLD for REPORT), regular expressions compiled, rate patterns `<count>/<seconds>`; audited `moderation.rule.create/update/delete`; caches dropped after commit (other instances within 60 s) |
| `GET /api/v1/admin/listings?query=&state=&game=&ownerId=`, `GET /api/v1/admin/listings/stale?state=STALE\|HIDDEN` | ADMIN+ | listings (items made public or temporarily public) / the review list oldest confirmation first: `StaleListing {item, owner {id, handle}, confirmedAt, state, warnedAt}`; never private notes |
| `POST /api/v1/admin/listings/{itemId}/restore`, `POST …/{itemId}/hide {reason}` | ADMIN+ | restore confirms the item on the owner's behalf (ACTIVE, RESTORED freshness event; audited `listing.restore`); hide makes it PRIVATE (audited `listing.hide`) |
| `GET /api/v1/admin/binders?query=&ownerId=&visibility=`, `POST /api/v1/admin/binders/{id}/unpublish {reason}` | ADMIN+ | every binder with the owner's handle; unpublish makes it PRIVATE (audited `binder.unpublish`) |
| `POST /api/v1/admin/users/{id}/pause-listings {reason, until?}`, `POST …/resume-listings {note?}`, `GET …/listing-status` | ADMIN+ | 409 when already paused / not paused; audited `listings.pause` / `listings.resume` |
| `GET /api/v1/me/listings/status`, `POST /api/v1/me/listings/resume` | member | the caller's pause (without the moderator's reason) and strikes; resume lifts UNRESPONSIVE pauses only (409 otherwise) and restarts the strikes |
| `GET /api/v1/admin/dashboard` | ADMIN+ | accounts (total, active, suspended, new 7 d), active collectors 7 d, public items and binders, open and unassigned reports, open moderation flags, stale and hidden listings, owners with paused listings, notifications whose push/email failed in 24 h; `openDisputes` and `webhookFailures24h` are 0 until Phase 9 |
| `GET /api/v1/admin/notifications/stats?days=7` | ADMIN+ | counts by type and channel state (realtime, push, email), unread, failures of 24 h, push tokens active/invalid |
| `POST /api/v1/admin/notifications/broadcast {title, body, audience: ALL\|STAFF, deepLink?}` | SUPER_ADMIN (403 otherwise) | one SYSTEM notice per reachable account (dedup `broadcast:<id>:<user>`, preferences apply); audited `notification.broadcast` |
| `GET /api/v1/admin/analytics/summary?days=7` | ADMIN+ | totals and daily counts per event type from the local aggregate (`source: local-aggregate`, `transport: log\|pubsub`) |
| `GET /api/v1/admin/system/health` | ADMIN+ | actuator status and component statuses (no details), outbox backlog (incomplete, oldest, failed publications), notifications waiting for dispatch, last run / last success / failures in 24 h of every job |
| `POST /internal/jobs/delist` | service auth | nightly strikes and pauses (below); `{ownersEvaluated, listingsPaused, ownersWithStrikes, pausesExpired}` |

RBAC (`SecurityConfig.MODERATOR_PATTERNS`): MODERATOR reaches `/admin/community/**`,
`/admin/moderation/**`, `/admin/reports/**`, `/admin/ratings/**` and `/admin/references/**`; every other
admin route needs ADMIN or SUPER_ADMIN; the services add ADMIN for moderation-rule writes and for
SUSPENDED/BANNED decisions, SUPER_ADMIN for feature flags, plans, usage limits and broadcasts
(`AdminAuthorizationIT` checks the matrix over every admin route).

### Interactions and ratings

`InteractionService.record(kind, userA, userB, subjectType, subjectId)` (TRADE / OFFER_ACCEPTED /
CONVERSATION_QUALIFIED; idempotent per kind and subject; the pair is stored in PostgreSQL uuid order
through `LEAST`/`GREATEST`) is the API Phase 8 calls for accepted offers and trades.
`ConversationQualificationListener` (`@ApplicationModuleListener` on `MessageSent`) records
CONVERSATION_QUALIFIED once both participants sent at least 3 messages (deleted and SYSTEM messages
not counted; only counts leave the messaging module). `rating_summary` is recomputed from the OK
ratings on every write, hide and unhide and feeds the profiles module's `RatingSummaryProvider`:
collector profiles, previews and markers show the average and count, and the nearby ranking reads a
whole page of summaries in one query (`RatingSummaryProvider.ratingsOf`, used by `MarkerAssembler`).
`RatingSubmitted` feeds the analytics event `rating_submitted` (interaction kind, score, comment flag,
ratee hash).

### Reports, threshold and moderation rules

Report rules are `moderation_rule` rows (ADR 0014): `RATE_LIMIT` scope REPORT `5/86400` BLOCK (per
reporter, Redis fixed window through `ModerationService.check(REPORT, null, reporter)`) and
`REPORT_THRESHOLD` scope REPORT `3/604800` BLOCK. After every committed report
(`ReportThresholdListener` on `CollectorReported`) `ReportThresholdService` counts the distinct
reporters of open reports against the collector within the window; at the limit it opens one
`moderation_flag` (subject USER, reason REPORT_THRESHOLD) and, for BLOCK, pauses the collector's
public listings pending review (source REPORT_THRESHOLD, audited as SYSTEM). It never suspends or
bans. `CollectorReported` also feeds the analytics event `collector_reported` (reason and context
source only).

### Listing pauses and strikes

A pause lives in `user_responsiveness` (`paused_at`, optional `paused_until`, `pause_source`
UNRESPONSIVE / REPORT_THRESHOLD / MODERATION / ADMIN, `pause_reason`, `paused_by`).
`ListingPauseRules.NOT_PAUSED` (a correlated lookup on the owner alias `u`) is part of
`PublicVisibilityRules.OWNER_LISTINGS_PUBLIC`, used by the effective public visibility of items
(`InventoryItemRepository.LISTED`) and binders (`binderEffectivelyPublic`): every public read, the
map's listing counts, search, card holders and wishlist matching ignore a paused collector's listings,
while the collector stays on the map. `ListingsPaused` / `ListingsResumed` make the inventory module
reconcile the owner (materialised flags and publication events) and `ListingsPaused` sends a SYSTEM
notice (`data.kind=LISTINGS_PAUSED`, `source`, never the reason). Nothing is ever deleted.

The nightly `delist` job (`DelistJob`, `@Scheduled` daily under `local`) asks every
`ResponsivenessSource` (implemented by the messaging module: conversations whose last message came
from the other participant, blocked pairs excluded) for conversations waiting since between 30 days
and `delist_policy.unanswered_after_hours` (72 h) ago, stores `unanswered_conversations_30d` and the
strikes (those waiting since after `strikes_reset_at`, the owner's last resume), pauses owners with
strikes ≥ `max_strikes` (3) who have something public (source UNRESPONSIVE) and clears timed pauses
that ended. The owner resumes by confirming (`POST /me/listings/resume`), which resets the strikes.

### Admin analytics aggregate

`AnalyticsPublisher` also counts every event in `analytics_daily_count` (V063; `JdbcAnalyticsAggregate`
on the async executor, whatever the transport; counts only). `GET /admin/analytics/summary` reads it
(`source: local-aggregate`); a BigQuery reader belongs to the deferred cloud work.

### Seed (Phase 7)

`RatingSeedContributor` ("ratings", after "notifications"): interactions
`00000000-0000-4000-9b00-00000000000N` (the seeded collector1–collector2 conversation, qualified but
left unrated; a completed trade between them with the reserved trade id
`00000000-0000-4000-9d00-000000000001`; an accepted offer from collector5 to collector1 with the reserved
offer id `00000000-0000-4000-9c00-000000000002` — Phase 8 seeds may create these rows), ratings
collector2 → collector1 (5), collector1 → collector2 (5), collector5 → collector1 (4), collector2's
reference for collector1, refreshed summaries (collector1: 4.5 from 2). `ReportSeedContributor`
("reports"): one OPEN SPAM report `00000000-0000-4000-9e00-000000000001` from collector4 against
collector6. Fictional texts only; inserted once; nothing notified.

### Account data

Export sections `ratings` (ratings given and received, references written and received) and
`reports` (the reports the account filed). Deletion removes the ratings and references the account
wrote (the rated collectors' summaries are refreshed), references about it and its summary, and erases
the free text of its decided reports (the reports stay as moderation records).

### Deviations from the Phase 7 contract

- The audit action of a decision is `REPORT_RESOLVED` as the contract says; the other new actions
  follow the existing dotted style (`report.assign`, `report.note`, `report.conversation.view`,
  `rating.hide`, `listings.pause`, `listing.restore`, `binder.unpublish`, `moderation.rule.update`,
  `notification.broadcast`, `user.ban`).
- The listing pause and the strikes share `user_responsiveness` (the contract columns plus
  `paused_at`, `pause_source`, `pause_reason`, `paused_by`, `strikes_reset_at`, `evaluated_at`);
  `paused_until` is the optional end of a pause (NULL = until resumed; strike pauses last until the
  owner confirms). `delist_policy.unanswered_after_hours` (72) is new policy data.
- A paused collector stays on the map (only their listings are hidden); the contract does not say.
- The ban mark is `user_account.banned_at`; unsuspending an account clears it (`AdminUserDetail.bannedAt`
  is additive).
- Report decisions: `note` is required; `suspendUntil` (future, SUSPENDED only) carries the
  "optional until"; SUSPENDED/BANNED need ADMIN (moderators get 403); DISMISSED needs action NONE.
- References reuse `403 RATING_NOT_ELIGIBLE` without an interaction and answer `409 CONFLICT` for a
  second reference. Moderators also hide/unhide references (`/admin/references/{id}/hide|unhide`).
- Additive routes: `GET /admin/ratings`, `PUT /ratings/{id}` (the "editable for 14 days"), `GET
  /admin/users/{id}/listing-status`, `GET /me/listings/status`, `POST /me/listings/resume` (the
  contract's "resume by confirming"), `POST /admin/listings/{itemId}/hide` (admin "hide" = PRIVATE),
  `POST/DELETE /admin/moderation/rules` (rules CRUD), `?assignedTo=` on the report list.
- `GET /collectors/{handle}/ratings` answers `{items, nextCursor, hasMore, summary}` (the cursor page
  plus the summary in one document); the report detail's notes are `moderatorNotes`.
- `openDisputes` and `webhookFailures24h` of the dashboard were 0 until Phase 9 (now: open disputes and
  failed or unverified payment webhooks of the last 24 h).

## Offers and trades (Phase 8)

Contract: `docs/api/contracts/phase8-offers-trades.md`. Modules `offers` (offers, counter chain,
history, expiry, the seller's offer settings, offer links of messages) and `trades` (trades opened by
accepted offers, meetups, completion, cancellation); `trades` depends on `offers` and implements its
`AcceptedOfferHandler` extension point, `offers` implements the messaging module's
`OfferLinkResolver`. Migrations V070–V071. Every route needs a signed-in, compliant account; only
the two parties of an offer or a trade ever see it (404 for anybody else).

| Route | Notes |
| --- | --- |
| `POST /api/v1/offers` | `{itemId, kind?, cashAmount?, currency?, tradeItemIds?: [{inventoryItemId, quantity?}], message? ≤ 500, expiresInHours? 1-168 (72), protectionRequested?}` → 201 `OfferResponse` (+ `Location`). The card must be effectively public and visible to the caller (404 otherwise, blocks in either direction included; 400 for one's own card); `kind` defaults from the parts; 422 `OFFERS_NOT_ACCEPTED` when `acceptsOffers` is false, for NOT_AVAILABLE / COLLECTION_ONLY cards, cash on TRADE-only and trades on SALE-only cards, MIXED unless the card is TRADE_OR_SALE and the seller's `acceptsMixed` is on; trade cards must be the buyer's own non-deleted items with enough copies (400, public visibility not required); 409 `OFFER_ALREADY_OPEN` (extension `offerId`) while the buyer negotiates that card; `protectionRequested` needs a cash part (400) and the `protectedPayments` flag (404 `FEATURE_DISABLED`); consumes `offers.per_day` (429 `LIMIT_REACHED`, FREE 20 / PREMIUM 100); `Idempotency-Key` repeats the original answer for 24 h (Redis, fail-open) |
| `GET /api/v1/offers?role=buyer\|seller&status=&cursor=&limit=20` | `CursorPage<OfferSummary>`: the live proposal of each negotiation, most recent activity first; `status` repeatable or comma separated; `yourTurn`, `allowedActions`, `counterparty` (`OfferParty`), the public card |
| `GET /api/v1/offers/{id}` | `OfferResponse {id, rootOfferId, counterOf, latestOfferId, item (PublicInventoryItem), seller, buyer (OfferParty), viewerRole, kind, cashAmount, currency, tradeItems [{inventoryItemId, quantity, item}], message, status, currentTurn, superseded, expiresAt, version, protectionRequested, allowedActions, tradeId, history [OfferEvent {event, actorRole, reason, terms}], createdAt, updatedAt, closedAt}`; the first view by the party who has to answer is recorded (VIEWED) |
| `POST /api/v1/offers/{id}/counter` | `{kind?, cashAmount?, currency?, tradeItemIds?, message?, expiresInHours?, version?}`; the party whose turn it is; without `kind` absent parts keep the current values and the kind follows the parts; the deal must change (400); the buyer's counter-offers follow the card's availability (422); answers the new proposal (status COUNTERED, other party's turn, fresh expiry) |
| `POST /api/v1/offers/{id}/accept` | `{version?}` (optional body); the party whose turn it is; opens the trade (`tradeId`), records the OFFER_ACCEPTED interaction; 409 `ITEM_UNAVAILABLE` when the card left the seller's inventory, a trade card left the buyer's or every copy is promised in open trades |
| `POST /api/v1/offers/{id}/decline`, `POST /api/v1/offers/{id}/cancel` | `{reason? ≤ 500, version?}` (optional body); decline: the party whose turn it is; cancel: the buyer while OPEN (403 for the seller) |
| `GET/PUT /api/v1/me/settings/offers` | `{acceptsMixed}` (default true) |
| `GET /api/v1/trades?role=&status=&cursor=&limit=20` | `CursorPage<TradeSummary>` with `nextAction` |
| `GET /api/v1/trades/{id}` | `TradeResponse {id, offer (OfferResponse), viewerRole, counterparty, kind, cashAmount, currency, status, protectionEnabled, meetup, buyerMarkedMeetup, sellerMarkedMeetup, buyerConfirmedAt, sellerConfirmedAt, nextAction {actor, action}, allowedOperations, timeline [TradeEvent], payment, dispute, shipment (Phase 9; null without payment protection), cancelReason, …}` |
| `POST /api/v1/trades/{id}/meetup` | AGREED / AWAITING_PAYMENT, idempotent per party; both marks → `meetup = true`, payment protection dropped (AWAITING_PAYMENT → AGREED, PROTECTION_REMOVED) |
| `POST /api/v1/trades/{id}/complete` | AGREED only (protected trades complete through Phase 9's receipt confirmation), idempotent per party; both confirmations → COMPLETED: `InventoryService.reserveAndTransfer` lowers the seller's card by 1 and the buyer's trade cards by their quantities (the last copy soft-deletes the item and unpublishes it), the TRADE interaction makes both parties eligible to rate |
| `POST /api/v1/trades/{id}/cancel` | `{reason}` (required, ≤ 500); AGREED / AWAITING_PAYMENT only |
| `POST /internal/jobs/offers-expire` | service auth; live OPEN / COUNTERED proposals past `expiresAt` → EXPIRED (actor NULL), `{expired}`, `job_run`; hourly `@Scheduled` under `local` (`OfferExpiryScheduler`) |

### State machine

`OfferStateMachine` (pure, `OfferStateMachineTest`): OPEN → COUNTERED → (COUNTERED)* → ACCEPTED |
DECLINED | EXPIRED; OPEN → CANCELLED (buyer) | DECLINED (seller) | EXPIRED; ACCEPTED, DECLINED,
CANCELLED, EXPIRED are terminal. Every proposal is an `offer` row: a counter-offer inserts a new
row (COUNTERED, `parent_offer_id` = the answered row, `root_offer_id` = the chain root, the other
party's turn) and the answered row becomes COUNTERED with `superseded_by`. Errors: 409 `NOT_YOUR_TURN`
(the other party answers), 409 `INVALID_STATE_TRANSITION` (extension `currentStatus`), 409
`STALE_OFFER` for a superseded proposal (extension `latestOfferId`) or a `version` other than the
current one (extension `currentVersion`; transitions also use `UPDATE … WHERE version = :expected`
under a row lock), 403 `FORBIDDEN` when the seller tries to cancel, 403 `TRADING_BLOCKED` to counter
or accept while a block exists or the other party is suspended or deleted (declining and cancelling
stay possible). Every transition appends an `offer_event` with a snapshot of the proposal.

### Side effects (after commit, idempotent)

`OfferCreated` / `OfferUpdated` → `OfferActivityListener` → `OfferActivity`: notifications
OFFER_RECEIVED (seller), OFFER_COUNTERED (the party whose turn it is), OFFER_ACCEPTED (both, deep
link `/trades/<id>`), OFFER_DECLINED, OFFER_CANCELLED (the other party), OFFER_EXPIRED (both;
`OFFER_CANCELLED` and `OFFER_EXPIRED` are new notification types of category OFFER), dedup key
`offer:<offerId>:<EVENT>:<recipient>`; and a SYSTEM message with the offer link in the pair
conversation (created when absent, whatever the messaging permission; skipped while a block exists)
through `ConversationService.postSystemMessage` (dedup `offer:<offerId>:<EVENT>`, pushed to both
participants, no `MessageSent`). `TradeUpdated` → `TradeActivity`: TRADE_UPDATE to the other party
(meetup proposed, completion confirmed, cancelled) or both (meetup agreed, completed) and SYSTEM
messages for completion and cancellation. Texts carry card names, terms and display names only.
OFFER_LINK messages (`POST /conversations/{id}/messages {kind: OFFER_LINK, offerId}`) are real now:
the offer must be between the two participants (400 otherwise); OFFER_LINK and SYSTEM messages show
the live proposal of the linked chain (`payload.offer {id, status, summary}`) through the offers
module's `OfferLinkResolver`. Analytics: `offer_created` (kind, game, message and protection flags,
seller hash), `offer_status_changed` (event, status, kind, round), `trade_status_changed` (event,
status, kind, protection and meetup flags); never amounts, ids or text.

### Seed (Phase 8)

`OfferSeedContributor` ("offers", after "reports") and `TradeSeedContributor` ("trades"): the
reserved Phase 7 ids get their rows — `00000000-0000-4000-9c00-000000000001` collector2's accepted
TRADE offer for collector1's `ygo-p018a` with trade `…9d00…0001` (in-person meetup, COMPLETED; its
OFFER_ACCEPTED interaction is added) and `…9c00…0002` collector5's accepted 30.00 CAD offer for
collector1's `pkm-p006a` with trade `…9d00…0002` (COMPLETED; its TRADE interaction is added) —
plus `…9c00…0003` collector5's OPEN 40.00 CAD offer for collector1's Azure-Eyes Sky Dragon
(`ygo-p001a`, collector1's turn) and `…9c00…0004` / `…0005` collector6's MIXED offer (20.00 CAD +
`mtg-p001b`) for collector2's `mtg-p001a`, countered by collector2 with 35.00 CAD + the card
(COUNTERED, collector6's turn). Inserted once; the live proposals expire 7 days after the first
seed run (the local hourly job then marks them EXPIRED). Nothing is notified, no SYSTEM message is
posted and the seeded inventory quantities are left as they are.

### Account data

Export sections `offers` (the account's proposals; notes only for its own proposals) and `trades`.
A deletion request withdraws the account's live negotiations; open trades block it (`409
DELETION_BLOCKED`, blocker `OPEN_TRADE`); the purge erases the account's notes and reasons and its
offer settings (the offer and trade rows stay for the other party).

### Deviations from the Phase 8 contract

- Counter chain: `parent_offer_id` is the answered proposal (the chain root is the additive
  `root_offer_id`); the counter-offer row itself is COUNTERED (the live proposal), the answered row
  COUNTERED with the additive `superseded_by` and `closed_at`. `offer_event.reason` (decline/cancel
  reason) and `offer_event.seq`, `offer.item_snapshot`, `offer.protection_requested`,
  `offer_trade_item.item_snapshot`/`position`, `trade.item_id`, the meetup and confirmation
  columns, `trade.cancelled_by`/`cancel_reason`/`cancelled_at`/`version` and `trade_event.seq` are
  additive; `offer.item_id` and the trade card ids are nullable (set null only by an account purge).
- `accepts_mixed` is an offers-module setting (`offer_preferences`, `GET/PUT /me/settings/offers`),
  not a column of the profiles module's tables. Kinds must fit the card's availability (CASH: SALE /
  TRADE_OR_SALE, TRADE: TRADE / TRADE_OR_SALE, MIXED: TRADE_OR_SALE) besides `acceptsOffers`; a
  seller's counter-offer may propose any kind.
- `tradeItemIds` holds `{inventoryItemId, quantity}` objects as the contract's create body shows;
  responses list `tradeItems [{inventoryItemId, quantity, item}]` rather than bare
  `PublicInventoryItem`s. `OfferResponse` adds `rootOfferId`, `latestOfferId`, `viewerRole`,
  `superseded`, `version`, `protectionRequested`, `allowedActions`, `tradeId`, `updatedAt`,
  `closedAt`; `counterOf` is the parent proposal. Parties are `OfferParty` (handle, display name,
  avatar, rating, region label and distance bucket; never a point).
- The optimistic `version` is optional in the action bodies (`accept`/`decline`/`cancel` accept an
  optional body); a counter-offer must change the deal (400); a counter resets the expiry to
  `expiresInHours` (default 72).
- Additive error codes `NOT_YOUR_TURN`, `INVALID_STATE_TRANSITION`, `ITEM_UNAVAILABLE`,
  `TRADING_BLOCKED`; accepting needs an unpromised copy of the card (open trades on the item <
  its quantity).
- Offers from blocked collectors answer 404 (the card is not visible to them), as public views do.
- Trades: `meetup` needs both parties' marks and then drops payment protection; `complete` is
  AGREED-only and needs both confirmations; `cancel` requires a reason. `TradeResponse` adds
  `viewerRole`, `counterparty`, the terms, the meetup and confirmation fields, `allowedOperations`,
  `cancelReason` and dates; `nextAction` of AGREED trades is MEET for the party who has not
  confirmed yet (the viewer first); `payment` and `dispute` (`PaymentSummary`, `DisputeSummary`
  schemas) stay null until Phase 9. The seller's card leaves the inventory on completion; receivers
  add received cards themselves (`POST /inventory/items`).
- Notifications add the types `OFFER_CANCELLED` and `OFFER_EXPIRED`; OFFER_ACCEPTED and
  OFFER_EXPIRED go to both parties. SYSTEM messages are posted for every offer transition and for
  trade completion and cancellation (the contract names the creation).

## Payment protection and disputes (Phase 9)

Contract: `docs/api/contracts/phase9-payments-disputes.md` (ADR 0011). Module `payments` (provider
abstraction, seller payout accounts, protected checkout, webhooks, shipping, receipt, payouts,
refunds, disputes, admin views, `platform_settings` `payments.*`); it depends on `trades` (moves
protected trades through `TradeService.advance` / `completeProtected` / `cancelProtected` and
implements the trades module's `TradeProtection` extension point, which fills `payment`, `shipment`
and `dispute` of the trade page). Migrations V080–V081. Feature flag `protectedPayments`: member
routes answer `404 FEATURE_DISABLED` (extension `feature`) when it is off for the trade's buyer (the
caller for `/me/seller-account`); the webhook and the internal fake-payment routes when it is off
for everybody; admin routes stay available so existing payments remain manageable. Never card data,
never "escrow" — user-facing wording is "payment protection".

| Route | Who | Notes |
| --- | --- | --- |
| `GET /api/v1/me/seller-account` | member | `{provider, status NOT_STARTED\|PENDING\|ACTIVE\|RESTRICTED, payoutsEnabled, ready, updatedAt}`; a PENDING account is refreshed from the provider |
| `POST /api/v1/me/seller-account/onboarding` | member | optional `{returnUrl}` (a web path, default `/settings/payouts`; 400 otherwise) → `{url, account}`; the fake provider activates at once and answers `<returnUrl>?onboarding=complete`, Stripe answers its hosted onboarding link |
| `POST /api/v1/trades/{id}/pay` | buyer | AWAITING_PAYMENT protected trades; 409 `SELLER_NOT_ONBOARDED` until the seller is ACTIVE (the seller gets PAYMENT_UPDATE "Set up payouts" when the trade opens); → `ProtectedPayment {paymentId, tradeId, provider, status, amount, currency, platformFee, sellerAmount, checkoutUrl, clientSecret}`; the fee is `payments.platform_fee_percent` of the amount; an open checkout is answered again, a FAILED/CANCELLED one restarted (new provider payment); 403 for the seller |
| `GET /api/v1/payments/fake/{ref}` | buyer | fake provider only (404 otherwise): what `/checkout/fake/<ref>` shows `{ref, paymentId, tradeId, status, amount, currency, summary}` |
| `POST /api/v1/payments/fake/{ref}/confirm` | buyer | fake provider only; optional `{outcome: SUCCEEDED\|FAILED}` → 202 `{received, duplicate, webhookEventId, type}`: a signed synthetic `payment.secured` / `payment.failed` goes through the regular webhook pipeline (poll the trade); 409 unless REQUIRES_ACTION |
| `POST /api/v1/webhooks/payments/{provider}` | provider (no token) | signature verified (`X-Fake-Signature` / `Stripe-Signature`, Stripe format `t=…,v1=…`, 5-minute tolerance); bad signature → 400 `WEBHOOK_SIGNATURE_INVALID`, stored IGNORED; verified events stored (`payment_webhook_event`), deduplicated by provider event id (a retry answers 200 `duplicate: true`), applied after the 200 through `PaymentWebhookReceived`; 404 for a provider other than the active one; 413 above 256 KB; rate limit 600/min per IP |
| `POST /api/v1/trades/{id}/ship` | seller | PAID → SHIPPED, optional `{carrier ≤ 80, trackingNumber ≤ 100, notes ≤ 500}`; the dispute window starts (`payment.disputeWindowEndsAt` = now + `payments.dispute_window_days`); the buyer gets SHIPMENT_STATUS |
| `POST /api/v1/trades/{id}/confirm-receipt` | buyer | SHIPPED → RECEIVED → payout released (`PaymentProvider.releasePayout`) → COMPLETED (inventory transfer, TRADE interaction); 409 while a dispute holds the payout |
| `POST /api/v1/trades/{id}/disputes` | buyer | `{reason NOT_RECEIVED\|NOT_AS_DESCRIBED\|COUNTERFEIT\|DAMAGED\|OTHER, description ≤ 2000}`; PAID or SHIPPED within the window (409 `DISPUTE_WINDOW_CLOSED` with `disputeWindowEndsAt`); 201 `Dispute`; payout frozen, trade DISPUTED, the seller gets DISPUTE_UPDATE |
| `GET /api/v1/disputes/{id}` | parties, admins | `Dispute {…, viewerRole, buyer, seller (handle and display name only), payment, shipment, summary, evidence, timeline, messages, canAddEvidence, canPostMessage, evidenceLeft}`; 404 for anybody else (moderators included); admins appear as "OrenjiTrade support" |
| `POST /api/v1/disputes/{id}/evidence` | parties | JSON `{kind TEXT\|TRACKING, body, url?}` or multipart (`file`, `kind` IMAGE\|DOCUMENT, `body?`) on the same path; ≤ 10 per party (409 `EVIDENCE_LIMIT_REACHED`, extension `limit`); IMAGE re-encoded as JPEG without metadata (≤ 8 MB), DOCUMENT PDF only (≤ 10 MB, 415 otherwise); TRACKING `url` https only; VIDEO reserved (400); 409 while FROZEN or resolved; admins 403 (notes instead) |
| `GET /api/v1/disputes/{id}/evidence/{evidenceId}/file` | parties, admins | the file, `Cache-Control: private, no-store`, PDFs as attachment, `Content-Security-Policy: sandbox`; evidence is never reachable through `/public/media` |
| `POST /api/v1/disputes/{id}/messages` | parties, admins | `{body ≤ 2000}` → 201; parties not while FROZEN; nobody after the resolution |
| `POST /internal/fake-payments/{ref}/succeed\|fail` | service auth | fake provider only: synthetic signed `payment.secured` / `payment.failed` through the webhook pipeline |
| `POST /internal/jobs/payments-auto-release` | service auth | hourly (`AutoReleaseScheduler` under `local`): reminds buyers `payments.release_reminder_hours` (48) before the window ends (PAYMENT_UPDATE once), then SHIPPED trades whose window ended without an open dispute are treated as received (RECEIPT_CONFIRMED `automatic: true`, payout released, COMPLETED); no-op while `payments.auto_release_enabled` is false; `{enabled, reminded, released, failed}`, `job_run` |
| `GET /api/v1/admin/transactions?status=&page=&size=` | ADMIN | trades with a protected payment (`AdminTransaction`: payment and trade status, amounts, fee, parties, shipment, window, dispute); `/pending-shipment` (secured, not shipped, no dispute; oldest payment first), `/pending-confirmation` (shipped, not received, no dispute; window end first) |
| `GET /api/v1/admin/disputes?status=`, `GET /api/v1/admin/disputes/{id}` | ADMIN | queue; detail `AdminDispute {dispute, internalNotes, tradeTimeline, paymentEvents, refunds, webhooks, buyerHistory, sellerHistory (the Phase 7 moderation history: reports, ratings, suspensions, pauses, flags), buyerRatings, sellerRatings}` |
| `POST /api/v1/admin/disputes/{id}/freeze` / `unfreeze` | ADMIN | OPEN/UNDER_REVIEW → FROZEN (optional `{reason}` kept as an internal note), FROZEN → UNDER_REVIEW; audited `dispute.freeze` / `dispute.unfreeze` |
| `POST /api/v1/admin/disputes/{id}/notes` | ADMIN | `{body ≤ 2000}` internal note; the first one moves OPEN to UNDER_REVIEW; audited `dispute.note` (id only) |
| `POST /api/v1/admin/disputes/{id}/resolve` | ADMIN | `{outcome BUYER\|SELLER\|SPLIT, refundAmount?, note ≤ 1000}`: BUYER refunds the whole refundable amount (trade CANCELLED by the platform), SELLER releases the payout (COMPLETED), SPLIT refunds `refundAmount` (0 < x < refundable) and pays out the rest minus the fee on it (COMPLETED); audited `dispute.resolve` (outcome, amounts) |
| `GET /api/v1/admin/payments?status=`, `GET /api/v1/admin/payments/{id}` | ADMIN | payments (same `AdminTransaction` rows); detail with events, refunds, linked webhooks and `refundAllowed` |
| `POST /api/v1/admin/payments/{id}/refund` | SUPER_ADMIN (ADMIN while `payments.admin_refunds_enabled`) | `{amount, reason ≤ 500}` at most the refundable amount; 409 for unsecured/refunded payments and while a dispute is open; a partial refund before the payout keeps the payment SECURED (the payout shrinks), after it PARTIALLY_REFUNDED; a full refund of an unfinished trade cancels it; audited `payment.refund` |
| `GET /api/v1/admin/payments/webhooks?status=&provider=`, `/webhooks/{id}` | ADMIN | every stored webhook, newest first; the payload only in the detail |
| `GET/PUT /api/v1/admin/payments/settings` | ADMIN reads, SUPER_ADMIN writes | `{disputeWindowDays 1-60, platformFeePercent 0-30, autoReleaseEnabled, releaseReminderHours 1-168, adminRefundsEnabled, updatedAt, updatedBy}`; absent fields keep their value; audited `payments.settings.update`; cached ≤ 60 s |

### Flow and money

AWAITING_PAYMENT —pay→ payment REQUIRES_ACTION —`payment.secured`→ SECURED, trade PAID —ship→
SHIPPED (window starts) —confirm-receipt or auto-release→ RECEIVED → payout released (PAID_OUT, or
PARTIALLY_REFUNDED after any refund; PAYOUT_PENDING until `payout.paid` when the provider reports the
transfer pending) → COMPLETED. PAID/SHIPPED —dispute→ DISPUTED (payout frozen) —resolve→ CANCELLED
(BUYER) or COMPLETED (SELLER, SPLIT). `payment.failed` → FAILED (pay again restarts the checkout); a
cancelled trade or an agreed meetup cancels an unpaid checkout (`PaymentProvider.cancelPayment`); a
`payment.secured` arriving after that is refunded at once (`AUTO_REFUNDED`, refund source SYSTEM).
Fee = amount × `fee_percent` / 100 half-up to the cent; payout = (amount − refunded) − fee(amount −
refunded). Every step appends `payment_event` and the matching trade timeline entry
(`PAYMENT_STARTED`, `PAYMENT_FAILED`, `PAYMENT_CANCELLED`, `PAYMENT_SECURED`, `SHIPPED`,
`RECEIPT_CONFIRMED`, `PAYOUT_RELEASED`, `DISPUTE_OPENED`, `DISPUTE_RESOLVED`, `REFUNDED`) in one
transaction (locks: trade row, then payment row); provider calls carry idempotency keys
(`pay:<paymentId>:<attempt>`, `payout:<paymentId>`, `refund:dispute:<disputeId>`, …). Timeline and
payment events name parties only; admins and the platform act with a NULL actor (the audit log keeps
the admin).

### Providers

`PAYMENT_PROVIDER=fake` (default everywhere unless set): `FakePaymentProvider`, no network and no
money; onboarding ACTIVE at once; payouts and refunds succeed immediately and idempotently;
synthetic webhooks signed with `FAKE_PAYMENTS_WEBHOOK_SECRET` (a local value, not a secret of any
service). `PAYMENT_PROVIDER=stripe`: `StripeConnectProvider` (Connect Express accounts + account
links, PaymentIntent on the platform with `transfer_group=trade_<id>` and the client secret for the
web form, Transfer to the connected account on release, Refunds; `payment_intent.succeeded`,
`payment_intent.payment_failed`, `account.updated`, `refund.updated`/`refund.failed` webhooks) over
the Stripe REST API with Spring's `RestClient` (no SDK dependency); start-up fails without
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; `WEB_BASE_URL` prefixes onboarding return links.
It is compile-only locally: `StripeConnectProviderTest` covers signature verification with a test
secret and the event/account/request mapping without network. Only the active provider has a webhook
route. Failed webhook processing and refused signatures are logged with the
`payment.webhook.failed` marker (monitoring alert) and counted on the admin dashboard.

### Notifications and analytics

PAYMENT_UPDATE: seller "Payment secured: ship …" and buyer confirmation, buyer "Payment failed",
buyer release reminder, seller "Payout released", buyer "Refund issued", seller "Set up payouts" when
a protected trade opens without an ACTIVE payout account; SHIPMENT_STATUS to the buyer on shipment;
DISPUTE_UPDATE (new type, category TRADE) for dispute openings (seller), evidence and messages (the
other side), holds and decisions (both). Dedup keys `payment:<id>:<event>:<time>:<recipient>`,
`dispute:<id>:<event>[:<subject>]:<recipient>`. The completion and a platform cancellation still
produce the Phase 8 TRADE_UPDATE notifications and SYSTEM messages. Analytics:
`payment_status_changed` (event, status, provider) and `dispute_status_changed` (event, status,
reason, actor role); never amounts, ids, references or text.

### Seed (Phase 9)

`OfferSeedContributor` adds `…9c00…0006` (collector8 → collector1, 55.00 CAD, protection requested,
ACCEPTED) and `…9c00…0007` (collector5 → collector2, 35.00 CAD, ACCEPTED); `TradeSeedContributor`
their protected trades `…9d00…0003` (SHIPPED) and `…9d00…0004` (DISPUTED) with the payment
timeline; `PaymentSeedContributor` ("payments", after "trades") fake ACTIVE payout accounts for
collector1 and collector2, payments `…9f00…0001` (SECURED, shipped, window 7 days from the shipment)
and `…9f00…0002` (SECURED, payout frozen) with shipments and dispute `…9f00…0101` (OPEN,
NOT_AS_DESCRIBED, a TEXT evidence of collector5 and one message from each party). Inserted once;
nothing is notified. The local hourly job releases `…0001` once its window ends. The local seed
enables `protectedPayments` (Phase 2 `FeatureFlagSeedContributor`).

### Account data

Export section `payments` (seller account status, payments as buyer or seller with amounts and
statuses, disputes opened with the account's own description). Open protected trades already block a
deletion (`OPEN_TRADE`); payment, refund and dispute rows stay for the other party and the legal
retention of financial records.

### Deviations from the Phase 9 contract

- `PaymentProvider` signatures carry what the adapters need: `onboardSeller(userId, accountRef,
  returnUrl)`, `sellerStatus(accountRef)`, `releasePayout(PayoutRequest)` (amount, destination,
  transfer group: split payouts), `refund(ref, amount, reason, idempotencyKey)`, plus
  `cancelPayment(ref)`; `capture` is not needed (automatic capture).
- The fake checkout adds `GET /payments/fake/{ref}` and the buyer's `POST /payments/fake/{ref}/confirm`
  besides the internal `succeed|fail` routes; the checkout URL is the relative web path
  `/checkout/fake/<ref>` (`FAKE_CHECKOUT_BASE_URL` prefixes it when set). Fake onboarding completes
  at once.
- Webhooks live at `/api/v1/webhooks/payments/{provider}`; idempotency is per `(provider,
  provider_event_id)`; `payment_webhook_event` adds `signature_valid` and `payment_id`; unreadable
  signed bodies are stored IGNORED and answered 400 `VALIDATION_FAILED`.
- Additive columns: `payment.buyer_id`, `seller_id`, `fee_percent`, `refunded_amount`,
  `payout_amount`, `payout_ref`, `payout_frozen`, `checkout_url`, `failure_code`,
  `release_reminded_at`; `payment_event.actor_id`, `seq`; `shipment.shipped_by`, `created_at`;
  `dispute.payment_id`, `updated_at`, `frozen_at`, `frozen_by`, `version`;
  `dispute_evidence.party_role`, `content_type`, `size_bytes`; new tables `payment_refund`,
  `dispute_message`, `dispute_note`; `platform_settings` also holds `payments.release_reminder_hours`
  and the refund policy `payments.admin_refunds_enabled`. VIDEO is part of the API's `EvidenceKind`
  but refused (400) and absent from the table's CHECK until it is enabled.
- A SPLIT or partial refund followed by the payout ends PARTIALLY_REFUNDED (the payout amount is in
  `payoutAmount`); a partial admin refund before the payout keeps the payment SECURED.
- FROZEN is an admin hold: the parties cannot add evidence or messages until `unfreeze`; the payout is
  frozen from the dispute's opening to its resolution whatever the status. Dispute resolution is
  ADMIN; the ad-hoc refund route is the policy-gated one.
- Additive error codes `SELLER_NOT_ONBOARDED`, `DISPUTE_WINDOW_CLOSED`, `EVIDENCE_LIMIT_REACHED`
  (409) and `WEBHOOK_SIGNATURE_INVALID` (400); notification type `DISPUTE_UPDATE`.
- `TradeResponse` fills `payment` (`PaymentSummary` gains provider, fee, seller amount, refunds,
  payout, `payoutFrozen`, the buyer's `checkoutUrl`, window and dates) and `dispute` (+ `resolvedAt`,
  `refundAmount`) and adds `shipment` (`ShipmentSummary` with `sellerNotes`); `allowedOperations`
  gains PAY, SHIP, CONFIRM_RECEIPT, OPEN_DISPUTE. Admin payment routes are not flag-gated.
- The admin dispute detail includes both parties' Phase 7 moderation histories (reports, ratings,
  suspensions, pauses, flags) and rating summaries; internal notes are `internalNotes`.
- Dispute evidence files are served by the API (`/disputes/{id}/evidence/{evidenceId}/file`), never by
  a signed URL (cloud storage work deferred).

## Subscriptions, credits, ads, donations (Phase 10)

Contract: `docs/api/contracts/phase10-freemium-credits-ads-donations.md` (ADR 0011 pattern for the
providers, ADR 0014 for every number). Built on the Phase 2 plans/limits/entitlements foundation
(V011). Modules: `billing` (subscriptions next to plans), `credits`, `ads`, `donations`. Migrations
V090–V093. Every provider is a local fake by default; nothing needs cloud or payment credentials.
Feature flags: `premiumPlans` (checkout and the fake billing checkout), `credits` (member credit and
referral routes), `advertising` (`GET /ads` answers `[]` when off), `donations` (member routes, the
donation webhook and the supporters list); member routes answer `404 FEATURE_DISABLED` (extension
`feature`) when off, admin routes stay available. Live subscriptions (cancel, webhooks, the period
job) work whatever `premiumPlans` says.

| Route | Who | Notes |
| --- | --- | --- |
| `GET /api/v1/me/plan` | member | adds `subscription` (the live one: PENDING checkout, TRIAL, ACTIVE, PAST_DUE; absent otherwise) |
| `POST /api/v1/me/subscription/checkout` | member | `{planCode, provider?}` → `{subscription, url, clientSecret, resumed}`; paid, active plans only (400 for FREE/unknown); `provider` must be the active one (apple/google → 400, use the mobile-receipt route); an open checkout of the same plan is answered again (`resumed`), one of another plan abandoned; 409 `ALREADY_SUBSCRIBED` (`subscriptionId`, `currentStatus`) while entitled |
| `POST /api/v1/me/subscription/cancel` | member | optional `{atPeriodEnd}` (default true: `cancelAtPeriodEnd`, the plan stays until `currentPeriodEnd`; false: CANCELLED and FREE at once); an open checkout is abandoned; idempotent; 404 without a live subscription |
| `POST /api/v1/me/subscription/mobile-receipt` | member | reserved for App Store / Google Play receipts: 501 `NOT_IMPLEMENTED` |
| `GET /api/v1/billing/fake/{ref}`, `POST .../confirm` | member (own checkout) | fake provider only (404 otherwise): what `/checkout/fake-billing/<ref>` shows; `{outcome: SUCCEEDED\|FAILED}` emits a signed synthetic `checkout.completed` / `checkout.failed` through the webhook pipeline (202; poll `GET /me/plan`); 409 unless PENDING |
| `POST /api/v1/webhooks/billing/{provider}` | provider (no token) | `X-Fake-Signature` / `Stripe-Signature` (Stripe format, 5-minute tolerance); bad signature → 400 `WEBHOOK_SIGNATURE_INVALID`, stored IGNORED; verified events stored in `billing_webhook_event`, deduplicated by provider event id (`duplicate: true`), applied after commit (`BillingWebhookReceived`); 404 for another provider; 413 above 256 KB; 600/min per IP |
| `POST /internal/jobs/subscriptions-period` | service auth | hourly (`SubscriptionPeriodScheduler` under `local`): cancellations at the period end take effect (CANCELLED, FREE); fake subscriptions renew through a synthetic signed `subscription.renewed`; real-provider subscriptions without a renewal expire after `orenji.billing.renewal-grace` (3 days); `job_run` |
| `GET /api/v1/admin/subscriptions?status=&plan=&userId=`, `/{id}`, `POST /{id}/cancel` | ADMIN | list (with handles), detail with history and linked webhooks (payload included), cancel `{immediately, reason}` (audited `subscription.cancel`, the reason is not stored) |
| `GET /api/v1/me/credits?cursor=&limit=` | member | `{balance, entries: CursorPage, products, withdrawable: false, transferable: false}`; entries without admin notes |
| `POST /api/v1/me/credits/spend` | member | `{featureKey (a credit product key), idempotencyKey}` → SPEND entry + `CREDIT_PURCHASE` entitlement for `duration_hours` (stacked after an active one); a retry answers the original (`duplicate: true`); the key reused for another product 409 `CONFLICT`; 409 `INSUFFICIENT_CREDITS` (`balance`, `cost`) |
| `GET /api/v1/me/referrals`, `POST /api/v1/me/referrals/redeem` | member | the caller's code (created on first read), rewards and redemption window; redeem `{code}` (case, spaces and dashes ignored): both earn credits once; 404 unknown code; 409 `REFERRAL_NOT_ALLOWED` with `reason` SELF / ALREADY_REDEEMED / ACCOUNT_TOO_OLD / REFERRER_LIMIT |
| `POST /api/v1/admin/credits/grant` | ADMIN | `{userId, amount (±, not 0, ≤ 100000), reason ADMIN\|PROMO\|REWARD\|CORRECTION, note}`: positive GRANT, negative ADJUST (never below 0); audited `credits.grant` |
| `GET /api/v1/admin/credits/ledger?userId=`, `/products`, `/settings` | ADMIN | ledger pages (with notes and balance), products, referral settings |
| `PUT /api/v1/admin/credits/products/{key}`, `PUT /api/v1/admin/credits/settings` | SUPER_ADMIN | product name, value, cost, duration, availability (audited `credits.product.update`); referral rewards and limits (audited `credits.settings.update`) |
| `POST /internal/jobs/credits-reconcile` | service auth | hourly (`CreditReconcileScheduler` under `local`): repairs cached balances that differ from `SUM(amount)`, reports accounts whose latest `balance_after` differs (ERROR `credits.ledger.mismatch`, never edits the ledger) |
| `GET /api/v1/ads?placement=&game=&geoCell=` | public (token optional) | `[]` while `advertising` is off for the caller or `ads.enabled` is false (PREMIUM, entitlement); otherwise up to the placement's `max_ads` ads `{creativeId, placement, sponsored: true, label: "Sponsored", advertiser, headline, body, imageUrl, ctaLabel, clickUrl, impressionToken}`; `Cache-Control: no-store` |
| `POST /api/v1/ads/{creativeId}/impression` | public | `{token}` → 204; once per serve token (24 h); 400 for a token of another creative, forged or expired |
| `GET /api/v1/ads/{creativeId}/click?token=` | public | 302 to the landing page (relative house-ad paths are sent to `ADS_WEB_BASE_URL`); a valid token records the click once; 404 unknown creative |
| `/api/v1/admin/ads/advertisers[/{id}]`, `/placements[/{key}]`, `/campaigns[/{id}]`, `/campaigns/{id}/targeting`, `/campaigns/{id}/creatives`, `/creatives/{id}`, `/campaigns/{id}/stats?from=&to=` | ADMIN | CRUD with validation (URLs https or site paths, targeting values checked, no coordinates), stats (totals, CTR in percent, derived spend, remaining budget, daily rows); every write audited (`ads.advertiser.*`, `ads.campaign.*`, `ads.targeting.update`, `ads.creative.*`, `ads.placement.update`) |
| `POST /internal/ads/clicks/{clickId}/conversions` | service auth | `{kind SIGNUP\|PURCHASE\|OTHER, value?, currency?}`, once per click and kind |
| `POST /api/v1/donations/checkout` | member | `{amount, currency, message?, publicThanks?}` → 201 `{donation, url}` (fake: `/checkout/fake-donation/<ref>`); amounts and currencies from `donations.*` settings (400 otherwise); labelled "Voluntary support" |
| `GET /api/v1/me/donations`, `GET /api/v1/donations/fake/{ref}`, `POST .../confirm` | member | history; the fake checkout (own donations only) emits a signed synthetic `donation.succeeded` / `donation.failed` (202) |
| `POST /api/v1/webhooks/donations/{provider}` | provider (no token) | like the billing webhooks (`donation_webhook_event`); 404 FEATURE_DISABLED while donations is off for everybody |
| `GET /api/v1/public/donations/supporters?limit=` | public | display names (and month) of active donors who chose `publicThanks`; never amounts, notes or handles |
| `GET /api/v1/admin/donations?status=`, `/{id}`, `/settings`; `POST /{id}/refund`, `PUT /settings` | ADMIN reads; SUPER_ADMIN refunds and settings | totals per currency, detail with webhooks; refund audited `donation.refund`; settings audited `donations.settings.update` |

### Subscriptions

`BillingProvider` (`billing/domain`): `startCheckout`, `cancel(ref, atPeriodEnd)`, `parseWebhook`.
`FakeBillingProvider` (default, `BILLING_PROVIDER=fake`): `fake_cs_…` checkouts at the web path
`/checkout/fake-billing/<ref>`, `fake_sub_…` subscriptions, 30-day periods, synthetic webhooks
signed with `FAKE_BILLING_WEBHOOK_SECRET` (`checkout.completed`, `checkout.failed`,
`subscription.renewed`, `invoice.payment_failed`, `subscription.cancelled`).
`StripeBillingProvider` (only with `BILLING_PROVIDER=stripe`): Checkout Sessions in subscription
mode with the plan's Stripe price (`STRIPE_PRICE_PREMIUM`), `cancel_at_period_end` or `DELETE
/v1/subscriptions/{id}`, webhooks `checkout.session.completed` / `.expired`, `invoice.paid` (period
of the first line), `invoice.payment_failed`, `customer.subscription.deleted`; compile- and
unit-tested only (`StripeBillingProviderTest`). An entitling subscription (TRIAL, ACTIVE, PAST_DUE)
sets `user_account.plan_code` to its plan and grants PREMIUM_USER (`UserAccountService.applyPlan`),
so limits, features and ads follow at once; its end sets FREE and revokes the role. States: PENDING
(checkout open) → ACTIVE (webhook) → PAST_DUE (failed renewal, plan kept) → CANCELLED / EXPIRED;
one live subscription per account (partial unique index, per-account advisory lock). Every change
appends `subscription_event` and publishes `SubscriptionChanged` (statuses and plan only). A payment
arriving for an abandoned checkout is cancelled at the provider at once.

### Credits

`CreditLedger`: entries appended under a transaction-scoped advisory lock per account (`balance_after`
= running sum, never negative), idempotent by a unique `idempotency_key`
(`spend:<userId>:<client key>`, `referral:<redemptionId>:referrer|referee`, `admin:<uuid>`,
`seed:…`). The database refuses UPDATE, DELETE and TRUNCATE (trigger
`credit_ledger_entry_append_only`). Balance = `SUM(amount)` (view `credit_balance`), cached in Redis
`orenji:credits:balance:<userId>` (10 minutes, evicted after every committed entry; spends always sum
under the lock). Credits are never bought, withdrawn or transferred through the API. Credit products
(`premium_search_day` 50 → `filters.advanced` 24 h, `binder_views_day` 30 → unlimited binder views
24 h, `map_radius_day` 30 → 100 km radius 24 h) and referral settings (`credits.*`: 100 / 50 credits,
30-day window, 50 redemptions per code) are data.

### Ads

`AdService` builds an `AdContext` from public values only — the requested `game` and `geoCell`, the
viewer's public grid cell and region label (`LocationService.publicLocationOf`), interest games and
tag slugs (`ProfileService.publicPartsOf`), the plan code (`ANONYMOUS` signed out) — and a
pseudonymous viewer hash (the analytics `ActorHasher`). `InternalCampaignAdProvider` keeps ACTIVE
creatives of the placement whose ACTIVE campaign (inside its schedule, advertiser ACTIVE) matches the
targeting rules (kinds AND, values OR; REGION_LABEL matches the label, one of its comma-separated
parts or the city of "Downtown X" / "Near X", accent-insensitive), respects the per-viewer daily
frequency cap and passes `AdPacing` (total budget covers the next unit; daily budget or the
remainder spread evenly until `end_at`; intraday pacing = daily × elapsed fraction + 10 %
allowance), ranks by priority, then pace, then randomly, one creative per campaign. Spend is derived
from `ad_campaign_daily` (CPM bid × impressions / 1000, CPC bid × clicks, FLAT = the flat fee once
served). Serve tokens (`AdToken`, HMAC with `ADS_TOKEN_SECRET`) name the creative, placement, public
cell, viewer hash, time and a nonce; impressions and clicks are unique per nonce. The ads module
never reads `user_location` (checked by `AdsTargetingIT`). A future `ExternalNetworkAdProvider` plugs
in behind `AdProvider`.

### Donations

`DonationProvider` with `FakeDonationProvider` (`fake_dn_…` checkouts at `/checkout/fake-donation/<ref>`,
synthetic `donation.succeeded` / `donation.failed` / `donation.refunded` webhooks signed with
`FAKE_DONATIONS_WEBHOOK_SECRET`, immediate idempotent refunds). Nothing in ratings, search ranking or
trust reads donations.

### Seed (Phase 10)

"subscriptions" (order 670): `premium_user` ACTIVE fake subscription `…a000…0001` (30 days from the
first seeding, renewed by the local job). "credits" (671): collector1 200 welcome credits and the code
`COLLECTOR1`, collector8 redeemed it (`…a100…0001`: 50 / 100 credits), premium_user 500 credits.
"ads" (672): fictional advertiser "Maple Sleeve Co." (`partners@maplesleeve.example`) with "Matte
sleeves (spring)" (CPM, GAME pokemon/yugioh, SEARCH_SPONSORED + MAP_PANEL) and "Harbour deck boxes
(Montréal)" (CPC, REGION_LABEL Montréal, INVENTORY_SIDEBAR + COLLECTOR_PROFILE), and the house ad
"OrenjiTrade Premium" (FLAT, PLAN FREE/ANONYMOUS, MAP_PANEL + MOBILE_FEED, landing `/premium`).
"donations" (673): collector2 25.00 CAD with public thanks, collector5 10.00 CAD without. All inserted
once; the local seed enables `advertising` and `donations` (Phase 2 `FeatureFlagSeedContributor`).

### Account data

Export sections `subscriptions` (plan, status, provider, price, dates), `credits` (balance, entries
without admin notes, referral code and redemptions) and `donations` (amounts, statuses, the donor's
own note and public-thanks choice). A deletion request stops renewals (cancel at the period end); the
purge ends the live subscription at once, deletes the referral code (the ledger stays, as ledgers do)
and erases donation notes and public thanks (the rows stay as financial records).

### Deviations from the Phase 10 contract

- Subscription states add `PENDING` (checkout open, not yet paid); `subscription` adds `checkout_ref`,
  `checkout_url`, `amount`, `currency`, `current_period_start`, `cancel_requested_at`,
  `activated_at`, `ended_at`, `failure_code`, `version`; new `subscription_event` and
  `billing_webhook_event`. Webhooks live at `/api/v1/webhooks/billing/{provider}`.
- The checkout answers `{subscription, url, clientSecret, resumed}`; the fake checkout adds `GET
  /billing/fake/{ref}` and `POST /billing/fake/{ref}/confirm`. Admin subscriptions add `GET /{id}` and
  `POST /{id}/cancel`. The subscription plan is set through `user_account.plan_code` (+ PREMIUM_USER),
  not through `SUBSCRIPTION` entitlements.
- `credit_ledger_entry` adds `balance_after`, `details` (jsonb), `note`, `seq`; `credit_balance` is a
  plain view (not materialised) read through a Redis cache. `POST /me/credits/spend` takes a credit
  product key as `featureKey`; products live in the new `credit_product` table. Referral routes add
  `GET /me/referrals`; `referral_redemption` records redemptions. Admin credits add products and
  settings; referral numbers are `platform_settings` rows `credits.*`.
- Advertising tables are prefixed (`ad_placement`, `ad_campaign`, `ad_creative`,
  `ad_targeting_rule`) and add `advertiser.created_by`, `ad_campaign.bid_amount`, `priority`,
  `frequency_cap_per_day`, `version`, `ad_placement.max_ads`, `ad_impression.serve_id`, `campaign_id`,
  `ad_click.impression_id`, and the counter table `ad_campaign_daily`; the ad user is a pseudonymous
  hash (`user_hash`). Impressions need the serve token (`{token}` body); clicks take `?token=`.
  Conversions arrive through `POST /internal/ads/clicks/{clickId}/conversions`.
- Donations add `GET /me/donations`, the fake checkout routes, admin routes and `donations.*` settings;
  the supporters list is `{label, note, supporters: [{displayName, month}]}`. Only the fake donation
  provider exists (a Stripe Checkout adapter is future work; any other `DONATION_PROVIDER` fails the
  start-up).
- Additive error codes `ALREADY_SUBSCRIBED`, `INSUFFICIENT_CREDITS`, `REFERRAL_NOT_ALLOWED` (409) and
  `NOT_IMPLEMENTED` (501); problem extensions `subscriptionId`, `currentStatus`, `balance`, `cost`,
  `reason`.


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
Phase 2 adds `V010__feature_flags.sql` (`feature_flag`), `V011__plans_limits.sql` (`plan`,
`plan_feature`, `usage_limit`, `usage_counter`, `entitlement`; `user_account.plan_code` becomes a FK),
`V012__games.sql` (`game` with GameSchema) and `V013__catalog.sql` (`card_set`, `card`,
`card_printing`, `card_image`, `catalog_sync_run`). Phase 3 adds `V020__delist_policy.sql`
(`delist_policy`), `V021__binder.sql` (`binder`) and `V022__inventory.sql` (`inventory_item` with the
`binder.item_count` trigger, `inventory_item_image`, `inventory_freshness_event`). Phase 4 adds
`V030__search_indexes.sql` (discovery and search indexes, no table). Phase 5 adds
`V040__messaging.sql` (`conversation`, `conversation_participant`, `conversation_pair`, `message`,
`message_attachment`, `image_upload`, `user_block`), `V041__community.sql` (`community_channel` with the
eight launch channels, `community_post`, `community_reply`) and `V042__moderation_flags.sql`
(`moderation_flag`, the rate-pattern check and the Phase 5 moderation rules). Phase 6 adds
`V050__wishlist.sql` (`wishlist_item`, `wishlist_match`) and `V051__notifications.sql`
(`notification`, `push_token`). Phase 7 adds `V060__ratings.sql` (`interaction`, `rating`,
`rating_summary`, `reference`), `V061__collector_reports.sql` (`collector_report`, `moderator_note`, the
REPORT moderation rules and flag reason, `user_account.banned_at`),
`V062__listing_pauses_and_strikes.sql` (`user_responsiveness`, `delist_policy.unanswered_after_hours`)
and `V063__analytics_daily_count.sql` (`analytics_daily_count`). Phase 8 adds `V070__offers.sql`
(`offer`, `offer_trade_item`, `offer_event`, `offer_preferences`, `uq_message_system_key`) and
`V071__trades.sql` (`trade`, `trade_event`). Phase 9 adds `V080__payments.sql` (`platform_settings`
with the `payments.*` rows, `seller_account`, `payment`, `payment_event`, `payment_refund`,
`payment_webhook_event`) and `V081__shipments_disputes.sql` (`shipment`, `dispute`,
`dispute_evidence`, `dispute_event`, `dispute_message`, `dispute_note`). Phase 10 adds
`V090__subscriptions.sql` (`subscription`, `subscription_event`, `billing_webhook_event`),
`V091__credits.sql` (append-only `credit_ledger_entry` with its trigger, the `credit_balance` view,
`credit_product`, `referral_code`, `referral_redemption`, `credits.*` settings),
`V092__advertising.sql` (`advertiser`, `ad_placement`, `ad_campaign`, `ad_creative`,
`ad_targeting_rule`, `ad_impression`, `ad_click`, `ad_conversion`, `ad_campaign_daily`) and
`V093__donations.sql` (`donation`, `donation_webhook_event`, `donations.*` settings).
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
├── admin/       /api/v1/admin/users (list, detail, suspend, unsuspend, roles), dashboard,
│                system health
├── jobs/        job_run records (+ JobRunSummaries), POST /internal/jobs/ping
├── profiles/    profile, avatar, tags, privacy settings + PrivacyPolicyService, collector view
├── location/    user_location, ApproximateLocationService, StaticRegionGeocoder (ADR 0004)
├── notifications/ preferences, NotificationService (dedup, quiet hours, daily limits), dispatcher
│                (realtime, PushProvider log/FCM, EmailProvider log), push tokens, event consumers
├── moderation/  moderation_rule + TextModerationService (banned terms), ModerationService
│                (rates, repeated content, report threshold), moderation_flag +
│                /admin/moderation/flags, rules CRUD /admin/moderation/rules
├── games/       game table + GameSchema, GameCatalog (profiles), /games, /admin/games
├── cards/       sets, cards, printings, images, CardProvider + MockCardProvider, idempotent
│                CatalogImportService, FTS + trigram search, placeholder SVGs, admin catalog
├── featureflags/ feature_flag, FeatureFlags (Redis cache), public + admin endpoints
├── billing/     plans, plan features, usage limits + counters, entitlements (Limits, Entitlements),
│                subscriptions: BillingProvider (fake / Stripe Billing), webhooks, period job (Phase 10)
├── delisting/   delist_policy, FreshnessPolicy / FreshnessLabels, freshness event log, delist job
│                (strikes), listing pauses (user_responsiveness), /admin/delist-policies
├── binders/     binders, PublicVisibilityRules, public binder views, BinderContents SPI
├── inventory/   items, photos, bulk operations, public item lists, ListingReconciler (publication
│                events), freshness job (implements BinderContents)
├── search/      /collectors/nearby + preview, /search, /search/card-holders, /search/suggest,
│                Redis nearby cache (Phase 4)
├── analytics/   AnalyticsEvent, AnalyticsPublisher, log / Pub/Sub transports, local daily
│                aggregate + /admin/analytics/summary
├── messaging/   conversations, messages, uploads, blocks, STOMP /ws + Redis fan-out, presence
├── community/   channels, posts, replies, /admin/community (Phase 5)
├── wishlist/    wishlist items, WishlistMatcher (InventoryItemPublished), matches, rematch job
├── ratings/     interactions, ratings (14-day edits, summaries), references, admin hide/unhide
├── reports/     collector reports, threshold, moderator review and decisions, history
├── offers/      offers (counter chain, current_turn, versions, history), expiry job, offer settings,
│                offer links of messages (Phase 8)
├── trades/      trades from accepted offers: meetup, completion (inventory transfer, TRADE
│                interaction), cancellation (Phase 8), TradeProtection extension point (Phase 9)
├── payments/    PaymentProvider (fake / Stripe Connect), seller accounts, protected checkout,
│                webhooks, shipping, receipt, payouts, refunds, disputes, auto-release job,
│                admin transactions / disputes / payments / webhooks / settings (Phase 9)
├── credits/     append-only credit ledger, balance cache + reconcile job, credit products,
│                referral codes, admin grants (Phase 10)
├── ads/         AdProvider + InternalCampaignAdProvider (targeting, pacing), signed serve tokens,
│                impressions / clicks / conversions, admin campaigns + stats (Phase 10)
└── donations/   DonationProvider (fake), donations, webhooks, supporters list, admin (Phase 10)
```

Inside a module: `api/` (controllers + DTOs), `domain/`, `infra/`, `events/`. Entities never leave a
module; cross-module calls go through service interfaces or published domain events.
