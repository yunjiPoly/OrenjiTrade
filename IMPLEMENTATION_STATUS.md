# IMPLEMENTATION_STATUS.md

Living checklist for the OrenjiTrade MVP. Legend: `[ ]` NOT STARTED · `[-]` IN PROGRESS ·
`[x]` COMPLETE (workflow verified to work, tests pass) · `[!]` BLOCKED.

A feature is marked complete only when: implementation exists, API works, UI works where
applicable, authorization works, validation works, error handling works, tests pass,
documentation is updated. Each completed item lists location, tests, migrations, and debt.

**Last updated:** 2026-09-29 (session 1, Phase 1 backend complete and independently verified; web Phase 1 next)
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

_Backend complete (stage A `8531fd4` + stage B, workflow `web-mvp-local` stage 1, independently re-verified: 310 API tests green, OpenAPI re-exported, clients regenerated). Web Phase 1 is the next stage; mobile is deferred by owner decision._

- [x] Identity provider abstraction (`IdentityTokenVerifier`), Firebase adapter (emulator via static owner token, ADC in cloud), `StaticIdentityTokenVerifier` for tests, `IdentityAdminClient` — `apps/api/.../auth`; tests AuthenticationIT (13), unit verifier tests
- [x] Bearer token filter → `AuthenticatedUser` principal; provisioning on first login with derived handle; last-active throttled via Redis — `auth` + `users`
- [x] `user_account`, `user_role`, suspension + DELETION_REQUESTED gating (403 ACCOUNT_SUSPENDED), admin MFA authorization manager, service-token/OIDC auth for `/internal/**`, `jobs` module (`job_run`) — migration V003; tests RbacIT, AdminMfaIT, AdminUsersIT, ServiceAuthIT
- [x] Profile: display name, handle (`HandleRules`: 3–24 `[a-z0-9_]`, reserved list, 409 HANDLE_TAKEN, audited change), bio, games (`games` module `GameCatalog`, slugs from `orenji.games.slugs` until Phase 2), languages, avatar (multipart `POST/DELETE /me/profile/avatar` → `AvatarImageProcessor` 512×512, EXIF stripped, decompression-bomb guard → `ObjectStorage` (`LocalFileObjectStorage` default, `GcsObjectStorage` only with `STORAGE_PROVIDER=gcs`), served by `GET /public/media/{key}`) — `apps/api/.../profiles`, `common/storage`; migration V004; tests ProfileIT (8), AvatarImageProcessorTest, ObjectKeysTest, HandleRulesTest. Debt: avatars re-encoded as JPEG, not WebP (no JDK WebP encoder; TwelveMonkeys reads WebP only)
- [x] Tag system (`tag` with 22 curated tags, `profile_tag`, `GET /tags` search, `PUT /me/profile/tags` max 12 incl. CUSTOM labels 2–24 chars) with `moderation_rule` + `TextModerationService` banned-term check (rules cached 60 s) — `profiles`, `moderation`; migration V004; tests TagIT (4), CustomTagLabelsTest. Debt: admin tag/rule moderation UI lands with Phase 7
- [x] Privacy settings (`privacy_settings`, `GET/PUT /me/settings/privacy`, defaults: not discoverable, online status hidden, profile MEMBERS, messaging MEMBERS_WITH_PROFILE, wishlist hidden) + `PrivacyPolicyService` (profile visibility, messaging, distance/last-active/online display) — `profiles`; migration V004; tests SettingsIT, PrivacyPolicyServiceTest, LastActiveBucketTest
- [x] Approximate location (ADR 0004): `GET/DELETE /me/location`, `PUT /me/location/trading-area` (radius 1–50 km, MANUAL/DEVICE), `ApproximateLocationService` (0.009° grid snap + deterministic HMAC-SHA256 per-user jitter with 0.001° margin, 3 decimals), `StaticRegionGeocoder` (34 regions) public labels, `public_point` NULL while not discoverable / suspended / deletion pending, bucketed distances, startup guard on `LOCATION_JITTER_SECRET` outside local/test — `location`; migration V005; tests LocationIT (6), GeoPrivacyContractTest (collector profiles + admin user detail over all seeded users, logs scanned), CollectorProfileIT (5), ApproximateLocationServiceTest (10), StaticRegionGeocoderTest, LocationConfigTest. `GET /collectors/{handle}` public profile (privacy-respecting, 404 when PRIVATE/deleted/suspended). Debt: `LOCATION_JITTER_SECRET` not yet wired into Terraform/Secret Manager (deferred, docs/deployment/DEFERRED.md)
- [x] Account settings: notification preferences (`notification_preferences`, `GET/PUT /me/settings/notifications`, 8 categories × push/email/in-app, quiet hours), messaging permission and discoverability via privacy settings — `notifications`, `profiles`; migration V006; tests SettingsIT
- [x] Account deletion + export: `POST/GET /me/deletion-requests`, `DELETE /me/deletion-requests/{id}` (5-min re-auth window, 7-day grace, `DeletionParticipant.blockers()` → 409 DELETION_BLOCKED, sessions revoked, off the map), `POST /internal/jobs/account-deletion` + hourly `@Scheduled` under `local` (anonymise, purge participants, delete emulator/Firebase user, keep consents/audit, `job_run`), `GET /me/export` via `ExportContributor`s (attachment, 10/hour) — `users`, admin detail shows pending request; migration V007; tests DeletionIT (5), ExportIT (2). Deviations: sessions are revoked instead of disabling the Firebase user (keeps the cancel endpoint reachable); extra `GET /me/deletion-requests`; export limit follows the contract table (10/hour)
- [x] Terms acceptance: `legal_document` (8 seeded, v2026-09-01) + `user_consent` (version, timestamp, hashed IP, UA), 428 TERMS_ACCEPTANCE_REQUIRED enforcement, `GET /public/legal/documents`, `POST /me/consents` — tests TermsIT, ConsentIT
- [-] Web: register/login/verify/reset, onboarding (games, tags, trading area), settings pages — only unwired scaffolding so far (`apps/web-angular/src/app/core/auth`: `AuthService` + `FirebaseAuthPort`, `AppConfigService.whenLoaded()`, Problem Details extensions on `ApiError`, `firebase`/`leaflet` deps); pages are the next stage
- [ ] Mobile: login/register, profile tab, settings — deferred by owner decision (partial work parked on `wip/mobile-auth-partial`)
- [x] Tests (API): auth filter, RBAC, audit, rate limit, consent, seed, profiles, tags, location, geo privacy contract, settings, deletion job, export — 310 API tests (45 classes, unit + Testcontainers ITs), 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; web/mobile flow tests come with their UI stages
- [x] Audit log (`audit_log`, `AuditService`, `GET /admin/audit-logs`) and admin user endpoints (list/get/suspend/unsuspend/roles), every write audited — tests AuditIT
- [x] Rate limiting (Redis Lua token bucket, property-driven policies, X-RateLimit headers, fail-open) — tests RateLimitIT
- [x] Seed accounts: 12 fictional users + roles + consents, Firebase emulator users created by the runner, plus fictional profiles/tags (`db/seed/profiles.json`) and neighbourhood-level trading areas (`db/seed/locations.json`; collector7 and staff not discoverable) — SeedDataRunnerIT, SeedIT

## Phase 2 — Card Catalog

- [ ] `game`, `card`, `card_set`, `card_printing`, `card_image` with JSONB metadata
- [ ] `CardProvider` interface + `MockCardProvider` + import/sync pipeline
- [ ] Seed catalog: Yu-Gi-Oh!, Pokémon, Magic: The Gathering, Riftbound (fictional-safe subset)
- [ ] Catalog search: FTS + trigram, filters (game, set, rarity, language, edition)
- [ ] `/api/v1/games`, `/api/v1/cards`, `/api/v1/cards/{id}/printings`, `/api/v1/sets`
- [ ] Web + mobile card search UI (autocomplete) and card detail
- [ ] Tests: provider contract, search ranking, JSONB metadata per game

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

- [ ] Plans, plan features, usage limits, usage counters, entitlements (DB-configurable)
- [ ] Limit-reached UX with upgrade prompt
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
| 1 | Register and log in | [ ] |
| 2 | Create/edit profile | [-] API proven (ProfileIT, TagIT); web UI pending |
| 3 | Configure privacy settings | [-] API proven (SettingsIT); web UI pending |
| 4 | Choose approximate trading location | [-] API proven (LocationIT, GeoPrivacyContractTest); web UI pending |
| 5 | Select TCG interests | [-] API proven (ProfileIT games/languages, TagIT); web UI pending |
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
| 18 | Search for a card | [ ] |
| 19 | Nearby collectors with that card | [ ] |
| 20 | Exact coordinates never exposed | [-] GeoPrivacyContractTest covers collector profiles, admin user detail and logs; map/search endpoints (Phase 4) pending |
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
| 33 | Admin suspends accounts | [ ] |
| 34 | Admin actions in audit log | [ ] |
| 35 | Freemium limits work | [ ] |
| 36 | Premium entitlements override | [ ] |
| 37 | Account deletion works | [-] API proven end to end (DeletionIT, ExportIT); web UI pending |
| 38 | Legal pages exist | [-] draft placeholders on web; counsel review pending |
| 39 | CI runs automatically | [-] runs on PRs; first fully green run pending |
| 40 | E2E covers critical workflows | [ ] |
| 41 | Runs locally | [-] infra + every app builds/tests locally; Phase 1 API flows run against docker compose + Auth emulator (snapshot jar `.local-dev/api-snapshots/api-phase1.jar`); web product flows pending |
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
   settings, collector page, admin users/audit (**next**).
2. Phase 2 — catalog + platform rules (feature flags, plans, usage limits, entitlements) → web
   card search/detail, admin games/cards/flags/limits, limit-reached dialog.
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

**Exact next task — stage 2 (web Phase 1 ∥ backend Phase 2):**
- Web: Firebase (Auth emulator) sign-up/sign-in/verify/reset and sign-out wired through the
  existing `core/auth` scaffolding, auth interceptor + guards, 428 consent screen
  (`POST /me/consents`), onboarding (profile + games/languages, tags, trading area on a Leaflet
  map with `PUT /me/location/trading-area`), settings (profile, avatar, privacy, notifications,
  location, export, deletion request/cancel), public collector page `/c/:handle`, admin users
  list/detail/suspend/roles and audit log. Use the generated `@orenji/api-client` only; Playwright
  E2E against the snapshot jar `.local-dev/api-snapshots/api-phase1.jar` on :8080 with seed
  accounts (`docs/development/test-accounts.md`).
- Backend: Phase 2 catalog per `docs/api/contracts/phase2-catalog.md` (games, sets, cards,
  printings, `CardProvider` + mock provider, seed catalog, FTS + trigram search) plus the
  platform rules from plan item 2 (feature flags, plans, usage limits, entitlements; ADR 0014 —
  no contract yet, write one first), migrations from V010.
