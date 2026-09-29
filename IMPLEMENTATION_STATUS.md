# IMPLEMENTATION_STATUS.md

Living checklist for the OrenjiTrade MVP. Legend: `[ ]` NOT STARTED · `[-]` IN PROGRESS ·
`[x]` COMPLETE (workflow verified to work, tests pass) · `[!]` BLOCKED.

A feature is marked complete only when: implementation exists, API works, UI works where
applicable, authorization works, validation works, error handling works, tests pass,
documentation is updated. Each completed item lists location, tests, migrations, and debt.

**Last updated:** 2026-09-29 (session 1, stage 2 independently verified: web Phase 1 complete, backend Phase 2 catalog + platform rules complete; stage 3 next)
**Next task:** see "NEXT TASK" at the bottom.

---

## Phase 0 — Foundation

- [x] Monorepo structure (`apps/`, `packages/`, `infrastructure/`, `docs/`, `.github/`)
- [x] Root docs: `README.md`, `CLAUDE.md`, `IMPLEMENTATION_STATUS.md`
- [x] Architecture docs: `docs/architecture/ARCHITECTURE.md`, ADRs 0001–0014, phase contracts in `docs/api/contracts/`
- [x] Local infra: `docker-compose.yml` (PostGIS 17, Redis 7, Firebase Auth emulator), `.env.example` — verified healthy locally
- [x] Spring Boot API skeleton (`apps/api`) — Boot 4.1.1 / Java 21 toolchain; Problem Details handler, request-id filter, SecurityConfig, springdoc (non-prod), Flyway V001+V002, Testcontainers base (`postgis/postgis:17-3.5` + Redis), Spotless, layered Dockerfile. Tests: 30 unit + 20 integration, all green; independently verified. `./gradlew exportOpenApi` writes `docs/api/openapi.json`. Debt: google-java-format pinned 1.28 until Gradle runs on JDK 21; OpenAPI `info.license` lacks `identifier`/`url` (client generator needs `--skip-validate-spec`).
- [x] Angular web skeleton (`apps/web-angular`) — Angular 22 + Material 3 theme from tokens, app shell (top bar, bottom nav <960px, footer), lazy routes incl. map/inventory placeholders, admin shell, 8 legal draft pages, shared UI (empty/error/skeleton/badges/chips), `config.json` loader, interceptors (base URL, request id, ProblemDetail→ApiError), theme service, Playwright smoke (5 pass), 38 unit tests, Dockerfile + nginx + entrypoint. Builder verified; independent verifier was interrupted by the pause (re-run `npm run lint && npm run format:check && npm test && npm run build`). Root npm workspace added (Phase 1, `d85a93f`); the link script is gone.
- [x] Mobile skeleton (`apps/mobile`) — Expo 57 + expo-router six tabs, typed openapi-fetch client, tokens sync, offline banner, 29 jest tests, Maestro smoke flow, deep links; expo-doctor 21/21. Independently verified. Debt: RNTL pinned 13.3.3; fonts not bundled; EAS project id placeholder. shared-types is now a real workspace dependency (`d85a93f`).
- [x] ML skeleton (`apps/ml`) — FastAPI factory, `/health`, `/ready`, `/v1/identify` (stub identifier + perceptual hashing), `/v1/duplicates`, Pub/Sub push handler with SSRF guards, problem-details errors, pytest ≥85 % coverage, Dockerfile (3.12 image smoke-tested). Independently verified.
- [x] Shared packages: `packages/design-tokens` (JSON → CSS/TS), `packages/api-client` (typescript-angular generated; generator CLI isolated in `tools/`), `packages/shared-types` (openapi-typescript + fetch helper)
- [x] Dockerfiles for api, web (repo-root context), ml
- [x] CI (`.github/workflows/ci.yml` + docker-build, deploy, e2e, codeql, dependabot) — runs on PR #1; fixed in session: `pull-requests: read` for paths-filter, Trivy tag `v0.36.0`, `actions: read` for SARIF/CodeQL, CodeQL v4, executable bit on `gradlew`/entrypoints, shared-types install before mobile typecheck
- [x] Terraform skeleton: 15 modules + dev/staging/prod environments + Cloudflare Terraform, all `terraform validate` clean (providers google 7.46, cloudflare 5.26); Cloudflare setup documented in `infrastructure/cloudflare/README.md`; deployment/security docs in `docs/deployment/`, `docs/security/`. Independent verifier interrupted by the pause (re-run `terraform fmt -check -recursive infrastructure` + validate per env). Debt: plan/apply unproven without GCP credentials; `/internal/*` endpoints must verify Google OIDC tokens app-side; Memorystore TLS off until the API trusts the CA.
- [x] Everything builds — PR #1 CI on `0d68c8a`: API (Gradle incl. Testcontainers), Web, Mobile, ML, Terraform ×4 and change detection green; the web and infra verifications interrupted by the pause were re-executed by those CI jobs. Security job: Trivy gate fixed by the non-root web image; SARIF uploads gated on `CODE_SCANNING_ENABLED` (no GHAS on this private repo)

## Phase 1 — Auth + Users

_Backend complete (stage A `8531fd4` + stage B, workflow `web-mvp-local` stage 1, independently re-verified: 310 API tests green, OpenAPI re-exported, clients regenerated). Web Phase 1 complete (workflow `web-mvp-local` stage 2, independently re-verified: 99 web unit tests + 18 Playwright specs against the real local stack, 0 skipped). Mobile is deferred by owner decision._

- [x] Identity provider abstraction (`IdentityTokenVerifier`), Firebase adapter (emulator via static owner token, ADC in cloud), `StaticIdentityTokenVerifier` for tests, `IdentityAdminClient` — `apps/api/.../auth`; tests AuthenticationIT (13), unit verifier tests
- [x] Bearer token filter → `AuthenticatedUser` principal; provisioning on first login with derived handle; last-active throttled via Redis — `auth` + `users`
- [x] `user_account`, `user_role`, suspension + DELETION_REQUESTED gating (403 ACCOUNT_SUSPENDED), admin MFA authorization manager, service-token/OIDC auth for `/internal/**`, `jobs` module (`job_run`) — migration V003; tests RbacIT, AdminMfaIT, AdminUsersIT, ServiceAuthIT
- [x] Profile: display name, handle (`HandleRules`: 3–24 `[a-z0-9_]`, reserved list, 409 HANDLE_TAKEN, audited change), bio, games (`games` module `GameCatalog`, DB-backed by `GameService` since Phase 2; `orenji.games.slugs` removed), languages, avatar (multipart `POST/DELETE /me/profile/avatar` → `AvatarImageProcessor` 512×512, EXIF stripped, decompression-bomb guard → `ObjectStorage` (`LocalFileObjectStorage` default, `GcsObjectStorage` only with `STORAGE_PROVIDER=gcs`), served by `GET /public/media/{key}`) — `apps/api/.../profiles`, `common/storage`; migration V004; tests ProfileIT (8), AvatarImageProcessorTest, ObjectKeysTest, HandleRulesTest. Debt: avatars re-encoded as JPEG, not WebP (no JDK WebP encoder; TwelveMonkeys reads WebP only)
- [x] Tag system (`tag` with 22 curated tags, `profile_tag`, `GET /tags` search, `PUT /me/profile/tags` max 12 incl. CUSTOM labels 2–24 chars) with `moderation_rule` + `TextModerationService` banned-term check (rules cached 60 s) — `profiles`, `moderation`; migration V004; tests TagIT (4), CustomTagLabelsTest. Debt: admin tag/rule moderation UI lands with Phase 7
- [x] Privacy settings (`privacy_settings`, `GET/PUT /me/settings/privacy`, defaults: not discoverable, online status hidden, profile MEMBERS, messaging MEMBERS_WITH_PROFILE, wishlist hidden) + `PrivacyPolicyService` (profile visibility, messaging, distance/last-active/online display) — `profiles`; migration V004; tests SettingsIT, PrivacyPolicyServiceTest, LastActiveBucketTest
- [x] Approximate location (ADR 0004): `GET/DELETE /me/location`, `PUT /me/location/trading-area` (radius 1–50 km, MANUAL/DEVICE), `ApproximateLocationService` (0.009° grid snap + deterministic HMAC-SHA256 per-user jitter with 0.001° margin, 3 decimals), `StaticRegionGeocoder` (34 regions) public labels, `public_point` NULL while not discoverable / suspended / deletion pending, bucketed distances, startup guard on `LOCATION_JITTER_SECRET` outside local/test — `location`; migration V005; tests LocationIT (6), GeoPrivacyContractTest (collector profiles + admin user detail over all seeded users, logs scanned), CollectorProfileIT (5), ApproximateLocationServiceTest (10), StaticRegionGeocoderTest, LocationConfigTest. `GET /collectors/{handle}` public profile (privacy-respecting, 404 when PRIVATE/deleted/suspended). Debt: `LOCATION_JITTER_SECRET` not yet wired into Terraform/Secret Manager (deferred, docs/deployment/DEFERRED.md)
- [x] Account settings: notification preferences (`notification_preferences`, `GET/PUT /me/settings/notifications`, 8 categories × push/email/in-app, quiet hours), messaging permission and discoverability via privacy settings — `notifications`, `profiles`; migration V006; tests SettingsIT
- [x] Account deletion + export: `POST/GET /me/deletion-requests`, `DELETE /me/deletion-requests/{id}` (5-min re-auth window, 7-day grace, `DeletionParticipant.blockers()` → 409 DELETION_BLOCKED, sessions revoked, off the map), `POST /internal/jobs/account-deletion` + hourly `@Scheduled` under `local` (anonymise, purge participants, delete emulator/Firebase user, keep consents/audit, `job_run`), `GET /me/export` via `ExportContributor`s (attachment, 10/hour) — `users`, admin detail shows pending request; migration V007; tests DeletionIT (5), ExportIT (2). Deviations: sessions are revoked instead of disabling the Firebase user (keeps the cancel endpoint reachable); extra `GET /me/deletion-requests`; export limit follows the contract table (10/hour)
- [x] Terms acceptance: `legal_document` (8 seeded, v2026-09-01) + `user_consent` (version, timestamp, hashed IP, UA), 428 TERMS_ACCEPTANCE_REQUIRED enforcement, `GET /public/legal/documents`, `POST /me/consents` — tests TermsIT, ConsentIT
- [x] Web: register/login/verify/reset, onboarding (games, tags, trading area), settings pages — `apps/web-angular/src/app`: `core/auth` (Firebase JS SDK lazily loaded behind `FirebaseAuthPort`, Auth emulator locally; `AuthService`, `SessionService` (`GET /me`, states anonymous/loading/ready/consent-required/suspended/deletion-pending/error with retry banner), auth interceptor (Bearer except `/public/**` and `/meta`, one forced-refresh retry on 401), session interceptor (428 → `/auth/consent`, 403 ACCOUNT_SUSPENDED → `/auth/suspended`), guards auth/account/onboarding/accountState/admin/guest + `safeReturnUrl`), `features/auth` (sign-in, sign-up with legal consents, verify-email, reset-password, consent, suspended/deletion-pending with cancel + export), `features/onboarding` (3-step wizard: profile with handle 409 field error, games/languages/tags, trading area on Leaflet), `features/settings` (profile + avatar, privacy, notifications, trading area, account: export, deletion with re-auth and cancel, appearance), `features/collectors` (`/collectors/:handle`, 404 and members-only states), `features/admin` (dashboard counts, users list/detail with roles editor, suspend/unsuspend, audit logs), `shared/map` (`MapAdapter`, lazy Leaflet/OSM default, Google only with a key), `shared/location` (`TradingAreaPicker`, 3-decimal rounding), `shared/profile`, `shared/ui` (avatar, card-art, confirm-dialog, game-chip, section-card). Generated `@orenji/api-client` only. Tests: 99 Vitest unit tests (19 files); Playwright `e2e/auth.spec.ts` (5), `e2e/settings.spec.ts` (4, incl. every JSON response ≤ 3 decimals for lat/lng), `e2e/admin.spec.ts` (4), `e2e/smoke.spec.ts` (5) — 18/18 pass against `api-phase2.jar` + docker compose + Auth emulator. Deviations/debt: `core/http/accept-header.interceptor.ts` widens `Accept` because the generated client sends `application/problem+json` on 204 operations and the API answers 406 (fix in the API or generator config later); generator types `uniqueItems` role lists as `Set` → `roleList()`/`rolePayload()` helpers; route is `/collectors/:handle` (not `/c/:handle`); onboarding guard requires only profile + interests (trading area skippable); Binder/Message/Report buttons disabled "Coming soon" until Phases 3/5/7; game list is still hard-coded in `shared/domain/games.ts` (switch to `GET /games` with web Phase 2); initial bundle 884 kB after the Phase 2 client regeneration (900 kB warning budget)
- [ ] Mobile: login/register, profile tab, settings — deferred by owner decision (partial work parked on `wip/mobile-auth-partial`)
- [x] Tests (API): auth filter, RBAC, audit, rate limit, consent, seed, profiles, tags, location, geo privacy contract, settings, deletion job, export — 310 API tests (45 classes, unit + Testcontainers ITs), 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; web/mobile flow tests come with their UI stages
- [x] Audit log (`audit_log`, `AuditService`, `GET /admin/audit-logs`) and admin user endpoints (list/get/suspend/unsuspend/roles), every write audited — tests AuditIT
- [x] Rate limiting (Redis Lua token bucket, property-driven policies, X-RateLimit headers, fail-open) — tests RateLimitIT
- [x] Seed accounts: 12 fictional users + roles + consents, Firebase emulator users created by the runner, plus fictional profiles/tags (`db/seed/profiles.json`) and neighbourhood-level trading areas (`db/seed/locations.json`; collector7 and staff not discoverable) — SeedDataRunnerIT, SeedIT

## Phase 2 — Card Catalog

_Backend complete (workflow `web-mvp-local` stage 2, independently re-verified: 354 API tests / 55 classes green on `./gradlew spotlessCheck build --rerun-tasks`, OpenAPI re-exported (59 paths, no Phase 1 path/schema lost), clients regenerated, live smoke on `api-phase2.jar`). Web card search/detail is the next stage._

- [x] `game`, `card`, `card_set`, `card_printing`, `card_image` with JSONB metadata — migrations V012 (`game` with a `GameSchema` jsonb per game) and V013 (`card_set`, `card`, `card_printing`, `card_image`, `catalog_sync_run`; generated tsvector columns, trigram, jsonb GIN and printing-code indexes). `games` module: `GameService` implements `GameCatalog` from the DB (ACTIVE games only), replacing `ConfiguredGameCatalog`/`GamesProperties`/`orenji.games.slugs`. Tests GamesIT (3)
- [x] `CardProvider` interface + `MockCardProvider` + import/sync pipeline — `apps/api/.../cards`: `CardProvider` (contract shape), `MockCardProvider` (profiles local/dev/test), idempotent `CatalogImportService` (keyed by `external_ref`, per-game advisory lock, only changed rows rewritten, stable slugs), `POST /admin/catalog/sync` → 202 + `CatalogSyncRequestedEvent` handled by an `@ApplicationModuleListener`, `GET /admin/catalog/sync-runs[/{id}]`, `GET /admin/catalog/providers`. Tests CatalogImportIT (3). Debt: no real provider adapter yet (mock only, by design locally)
- [x] Seed catalog: Yu-Gi-Oh!, Pokémon, Magic: The Gathering, Riftbound (fictional-safe subset) — `db/seed/catalog/{yugioh,pokemon,mtg,riftbound}.json`, 4 sets / 20 cards / 40 printings per game, invented names, per-game metadata; imported at local/dev startup by `CatalogSeedContributor` (order 400). Server-generated SVG placeholders `GET /public/placeholder-images/{game}/{slug}.svg` (escaped, no scripts, CSP, 1-day cache, ETag/304) — tests CatalogMetadataIT (5), PlaceholderImageIT (3)
- [x] Catalog search: FTS + trigram, filters (game, set, rarity, language, edition) — `CatalogQueryRepository`: `ts_rank_cd` FTS, trigram fallback under 5 hits, accent-insensitive, printing-code short-circuit, set/rarity/language/edition filters and typed `metadata.<key>` filters (jsonb containment, validated against the `GameSchema`), `GET /cards/suggest` — tests CatalogSearchIT (9), CatalogTextTest (4)
- [x] `/api/v1/games`, `/api/v1/cards`, `/api/v1/cards/{id}/printings`, `/api/v1/sets` — plus `/games/{slug}`, `/cards/{id}`, `/printings/{id}`, `/sets/{id}`; public GET routes (`SecurityConfig.PUBLIC_GET_PATTERNS`, also exempt from the account-state and 428 terms checks); admin writes `POST/PUT /admin/games`, `/admin/sets`, `/admin/cards`, `POST /admin/cards/{id}/printings`, `PUT /admin/printings/{id}` (audited, schema-validated) — tests AdminCatalogIT (3), CatalogSearchIT. Deviation: OpenAPI path is `/public/placeholder-images/{game}/{file}` (file = `<slug>.svg`)
- [ ] Web + mobile card search UI (autocomplete) and card detail — web is the next stage; mobile deferred by owner decision
- [x] Tests: provider contract, search ranking, JSONB metadata per game — CatalogImportIT, CatalogSearchIT, CatalogMetadataIT, AdminCatalogIT, PlaceholderImageIT, GamesIT, CatalogTextTest
- [x] Platform rules (ADR 0014, plan item 2): feature flags — `featureflags` module, migration V010 (7 default flags), `FeatureFlags.isEnabled/require/evaluateAll` (60 s Redis cache evicted after commit, deterministic CRC32 rollout bucket per account), `GET /public/feature-flags`, `GET /admin/feature-flags`, `PUT /admin/feature-flags/{key}` (SUPER_ADMIN, audited); local/dev seed enables `protectedPayments`, `advertising`, `donations` (fake providers), `mlScanning` stays off; `FEATURE_DISABLED` now renders 404 with a `feature` extension — tests FeatureFlagsIT (4). Plans/limits/entitlements: see Phase 10. `common/cache/RedisJsonCache` fail-open read-through cache. Debt: no contract document covers the feature-flag endpoints (the exported `openapi.json` is the field-level truth)

## Phase 3 — Inventory + Binders

- [ ] `binder`, `inventory_item` (quantity, condition, language, printing, edition, price, availability, visibility, notes)
- [ ] Visibility: PRIVATE / PUBLIC / TEMPORARILY_PUBLIC (until timestamp); binder-level too
- [ ] Freshness fields: created/updated/confirmed/lastOwnerActivity + freshness status calc
- [ ] Bulk operations: select, change visibility, move binder
- [ ] Public binder views + collector public profile endpoint
- [ ] Web `/inventory` page (filters, table/grid, edit drawer, bulk bar, binder manager)
- [ ] Mobile inventory tab optimised for card management
- [ ] Tests: visibility enforcement, ownership, bulk ops, freshness

## Phase 4 — Map + Geographic Search (flagship)

- [ ] `/api/v1/collectors/nearby` (PostGIS `ST_DWithin` on `public_point`), bucketed distances
- [ ] `/api/v1/search` unified (cards, printings, sets, collectors, public binders)
- [ ] Card-holder search: collectors near me with printing X (filters: sale/trade/offers, price, freshness, condition)
- [ ] Web `/map` page: MapAdapter (Google Maps / Leaflet fallback), markers, preview card, messages panel (collapsible), filters bar
- [ ] Collector preview → full profile → public binder → message
- [ ] Mobile map tab with bottom-sheet preview
- [ ] Tests: geo search, no exact coordinates in any response (contract test), ranking fresh > stale

## Phase 5 — Chat

- [ ] Private conversations, messages (text, card/binder/offer links, images), read/unread
- [ ] WebSocket (STOMP) realtime + Redis fan-out across instances
- [ ] Block user, report entry points, moderation hooks, rate limits
- [ ] Public community channels (game / region / looking-for / new listings / trades / general)
- [ ] Web messaging panel + `/community`; mobile Messages tab
- [ ] Tests: participant authorization, blocking, rate limit, realtime delivery

## Phase 6 — Wishlist + Notifications

- [ ] `wishlist`, `wishlist_item` (game, card, printing, rarity, condition, edition, language, max price, radius, trade pref)
- [ ] Matching worker: new public inventory → wishlist match → geo filter → prefs → notification (dedup + rate limit)
- [ ] Notification centre (in-app), push via FCM abstraction, email preference stub
- [ ] Web + mobile wishlist UI and notification list
- [ ] Tests: matching, dedup, rate limit, preferences respected

## Phase 7 — Ratings + Collector Reporting + Admin

- [ ] Ratings (overall, communication, condition accuracy, shipping, meetup) with eligibility check
- [ ] References; duplicate prevention; admin moderation
- [ ] Collector report modal (reasons list), lifecycle OPEN → UNDER_REVIEW → ACTIONED/DISMISSED
- [ ] Audit log on every admin/moderator action
- [ ] Auto-delist policies (configurable table) + scheduler + warnings + restore
- [ ] Admin console `/admin` (dashboard, users, listings, binders, games, cards, community, reports, moderation, transactions, disputes, payments, ratings, ads, subscriptions, usage limits, credits, notifications, analytics, auto-delist rules, feature flags, audit logs, system health)
- [ ] Tests: rating eligibility, report flow, admin RBAC, audit generation, delist state machine

## Phase 8 — Offers + Trade Workflow

- [ ] Offers (cash/trade/mixed) lifecycle OPEN → COUNTERED → ACCEPTED → DECLINED/CANCELLED/EXPIRED with history
- [ ] Trades: created from accepted offer, statuses, buyer/seller views
- [ ] Web + mobile offer UI
- [ ] Tests: state machine, authorization, audit history

## Phase 9 — Payments + Disputes (feature-flagged)

- [ ] `PaymentProvider` abstraction, `FakePaymentProvider`, Stripe Connect adapter skeleton
- [ ] Protected transaction flow: secure payment → ship → confirm shipment → confirm receipt → payout
- [ ] Dispute window, dispute entity, evidence model (extensible), admin dispute interface
- [ ] Webhooks: signature verification, idempotency, event history
- [ ] Tests: webhook idempotency, state transitions, refund path

## Phase 10 — Freemium + Credits + Ads + Donations

- [x] Plans, plan features, usage limits, usage counters, entitlements (DB-configurable) — built early in stage 2 (plan item 2). `billing` module, migration V011 (`plan`, `plan_feature`, `usage_limit`, `usage_counter`, `entitlement`; FREE and PREMIUM seeded with the contract limits; `user_account.plan_code` now a FK to `plan.code`). `Limits.check/consume/checkValue/overview` (atomic conditional upsert, Redis mirror written after commit), `LimitReachedException` → 429 LIMIT_REACHED (`limitKey`, `limit`, `used`, `resetsAt`, `planCode`, `upgradeUrl: "/premium"`), `Entitlements.has` + admin grant/revoke (audited, most generous active entitlement wins), `PlanService` Redis cache, `LimitUsageSource` SPI for TOTAL counts (e.g. `binders.max` in Phase 3). Endpoints `GET /plans` (public), `GET /me/plan`, `GET/PUT /admin/plans[/{code}]`, `GET/PUT /admin/usage-limits[/{id}]`, `GET/POST /admin/users/{id}/entitlements`, `DELETE /admin/users/{id}/entitlements/{entitlementId}` — tests LimitsIT (5), LimitRulesTest (4). Debt: `subscription` table, `POST /me/subscription/checkout|cancel`, billing webhooks and `GET /admin/subscriptions` remain for Phase 10 proper; no feature consumes limits yet (Phase 3+)
- [-] Limit-reached UX with upgrade prompt — API side done (429 LIMIT_REACHED with extensions, generated `ProblemDetail` carries them); web limit-reached dialog pending (stage 3 web)
- [ ] Credit ledger (append-only) + derived balance
- [ ] Ads framework (campaign, advertiser, placement, creative, impression, click, conversion, budget, targeting) with internal admin-managed campaigns; "Sponsored" labelling
- [ ] Donations via provider abstraction
- [ ] Tests: limit enforcement, entitlement override, ledger integrity

## Phase 11 — ML

**[!] ON HOLD — owner instruction (2026-09-29): do not start the Python ML card recognition work until a new order is given. The Phase 0 FastAPI skeleton stays as-is.**

- [!] Card scanning pipeline: upload → storage → event → ML worker → candidates → user confirmation → inventory
- [!] ML service `/v1/identify` with confidence, graceful degradation
- [!] Mobile camera scan flow
- [!] Tests: pytest for service; API tolerance when ML unavailable

## Phase 12 — Data Platform

- [ ] Analytics event schema + publisher (Pub/Sub adapter, local logging adapter)
- [ ] BigQuery dataset/tables (Terraform) + sample queries
- [ ] No PII/precise location in events (test)

## Phase 13 — Hardening

- [ ] E2E coverage for all acceptance flows (Playwright + Maestro)
- [ ] Security review, secure headers, CORS, rate limits, upload validation
- [ ] Accessibility pass, load test script, DB index review, backup/restore docs, failure testing

## Phase 14 — Production Deployment

- [ ] Terraform apply docs, Cloud Run services, Cloudflare records, secrets, runbooks
- [ ] Deployment documentation (`docs/deployment/`)

---

## Acceptance criteria tracker (spec §60)

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Register and log in | [x] web E2E `auth.spec.ts` (sign-up with consents, emulator email verification, sign-out, sign-in) + AuthenticationIT |
| 2 | Create/edit profile | [x] web E2E `auth.spec.ts` onboarding + `settings.spec.ts` profile edits shown on the public profile; ProfileIT, TagIT |
| 3 | Configure privacy settings | [x] web E2E `settings.spec.ts` (discoverability toggle saved); SettingsIT |
| 4 | Choose approximate trading location | [x] web E2E `auth.spec.ts` (Leaflet trading-area picker, radius) + `settings.spec.ts`; LocationIT, GeoPrivacyContractTest |
| 5 | Select TCG interests | [x] web E2E `auth.spec.ts` onboarding (games + tags); ProfileIT, TagIT |
| 6 | Open dedicated inventory page | [ ] |
| 7 | Create private inventory | [ ] |
| 8 | Create multiple binders | [ ] |
| 9 | Move cards between binders | [ ] |
| 10 | Toggle private/public visibility | [ ] |
| 11 | Publish a binder | [ ] |
| 12 | Another user opens the map | [ ] |
| 13 | Public collectors at approximate positions | [ ] |
| 14 | Click collector marker | [ ] |
| 15 | Collector preview appears | [ ] |
| 16 | Open full profile | [ ] |
| 17 | View public binder | [ ] |
| 18 | Search for a card | [-] API proven (CatalogSearchIT: FTS, typo, accent, printing code, filters; suggest); web UI pending |
| 19 | Nearby collectors with that card | [ ] |
| 20 | Exact coordinates never exposed | [-] GeoPrivacyContractTest covers collector profiles, admin user detail and logs; web E2E `settings.spec.ts` asserts every JSON response has ≤ 3 decimals for lat/lng; map/search endpoints (Phase 4) pending |
| 21 | Private messaging | [ ] |
| 22 | Public community chat | [ ] |
| 23 | Create wishlist | [ ] |
| 24 | New public inventory triggers match | [ ] |
| 25 | In-app/push notification received | [ ] |
| 26 | Send offers | [ ] |
| 27 | Eligible users can rate | [ ] |
| 28 | Report collector via popup | [ ] |
| 29 | Reason required + confirm | [ ] |
| 30 | Admin reviews reports | [ ] |
| 31 | Auto-delisting detects stale inventory | [ ] |
| 32 | Admin reviews stale listings | [ ] |
| 33 | Admin suspends accounts | [x] web E2E `admin.spec.ts` (suspend + unsuspend, role restrictions); AdminUsersIT |
| 34 | Admin actions in audit log | [x] web E2E `admin.spec.ts` (audit log shows suspend/unsuspend); AuditIT; Phase 2 admin writes audited (AdminCatalogIT, FeatureFlagsIT, LimitsIT) |
| 35 | Freemium limits work | [-] API proven (LimitsIT: FREE limit → 429 LIMIT_REACHED, live admin edits); no feature consumes limits yet, web dialog pending |
| 36 | Premium entitlements override | [-] API proven (LimitsIT, LimitRulesTest: PREMIUM plan and entitlements override FREE limits); web pending |
| 37 | Account deletion works | [x] web E2E `settings.spec.ts` (re-authentication, grace period, cancel; JSON export download); DeletionIT, ExportIT |
| 38 | Legal pages exist | [-] draft placeholders on web; counsel review pending |
| 39 | CI runs automatically | [-] runs on PRs; first fully green run pending |
| 40 | E2E covers critical workflows | [-] Phase 1 web flows covered (18 Playwright specs: auth, onboarding, settings, deletion, admin); later phases pending |
| 41 | Runs locally | [-] infra + every app builds/tests locally; web Phase 1 runs end to end against docker compose + Auth emulator + snapshot jar `.local-dev/api-snapshots/api-phase2.jar` (catalog seeded at startup); later phases and one-command tooling pending |
| 42 | Deploys to Google Cloud | [ ] |
| 43 | Cloudflare configuration documented | [x] |
| 44 | Production architecture supports www.orenjitrade.com | [ ] |

---

## NEXT TASK

**Owner priorities (2026-09-29):** cloud deployment deferred (see docs/deployment/DEFERRED.md),
everything must run locally, build a functional **web** application first, then mobile. Phase 11
(ML card recognition) is on hold. Mobile partial auth work is parked on branch
`wip/mobile-auth-partial`.

Execution plan (workflow `web-mvp-local`, one vertical slice per phase, backend N+1 overlapping
web N, every stage independently re-verified, clients regenerated and committed):

1. Phase 1 remainder — profiles, tags, approximate location, settings, collector profile,
   deletion/export (backend **done**, V004–V007, stage 1 verified) → web auth, onboarding,
   settings, collector page, admin users/audit (**done**, stage 2 verified).
2. Phase 2 — catalog + platform rules (feature flags, plans, usage limits, entitlements)
   (backend **done**, V010–V013, stage 2 verified) → web card search/detail, admin
   games/cards/flags/limits, limit-reached dialog (**next**).
3. Phase 3 — inventory, binders, freshness → web /inventory, public binder pages.
4. Phase 4 — nearby collectors, unified search, card holders, minimal analytics events → web
   /map (Leaflet) and /search.
5. Phase 5 — private chat (STOMP realtime), blocking, community channels → web messages panel,
   /messages, /community.
6. Phase 6 — wishlist, matching, notifications (log push/email) → web wishlist, notification centre.
7. Phase 7 — ratings, references, collector reports, moderation, delisting admin → web report
   dialog, ratings, admin console sections.
8. Phase 8 — offers and trades → web offer dialog, inbox, trade page.
9. Phase 9 — payment protection with the fake provider, shipping, disputes → web flows + admin.
10. Phase 10 — plans/billing (fake), credits, ads (internal), donations (fake) → web pages + admin.
11. Local environment tooling (one-command dev, reset/seed, docs) and the web acceptance E2E suite.

Migration ranges reserved per phase: P1 V004–V009, P2 V010–V019, …, P10 V090–V099.

**Exact next task — stage 3 (web Phase 2 ∥ backend Phase 3):**
- Web: card search with autocomplete (`GET /cards`, `/cards/suggest`, game/set/rarity/language/
  edition and `metadata.<key>` filters from the `GameSchema`), card detail with printings
  (`/cards/{id}`, `/cards/{id}/printings`, `/printings/{id}`), set pages (`/sets`, `/sets/{id}`),
  game list from `GET /games` (replace the hard-coded `shared/domain/games.ts` list), public
  feature flags (`GET /public/feature-flags`) and plan (`GET /plans`, `GET /me/plan`), a
  limit-reached dialog for 429 `LIMIT_REACHED` (upgrade link `/premium`), and admin sections
  games (schema editor), cards/sets/printings, catalog sync runs, feature flags (SUPER_ADMIN),
  plans and usage limits, user entitlements. Generated `@orenji/api-client` only; Playwright E2E
  against `.local-dev/api-snapshots/api-phase2.jar` on :8080 (catalog seeded at startup).
- Backend: Phase 3 inventory + binders per `docs/api/contracts/phase3-inventory.md` (binders,
  inventory items, visibility incl. TEMPORARILY_PUBLIC, freshness, bulk operations, public binder
  views; `binders.max` through the `LimitUsageSource` SPI and `binder.views.per_day` through
  `Limits.consume`), migrations from V020, GeoPrivacyContractTest extended to any new response
  that carries a location.
