# IMPLEMENTATION_STATUS.md

Living checklist for the OrenjiTrade MVP. Legend: `[ ]` NOT STARTED · `[-]` IN PROGRESS ·
`[x]` COMPLETE (workflow verified to work, tests pass) · `[!]` BLOCKED.

A feature is marked complete only when: implementation exists, API works, UI works where
applicable, authorization works, validation works, error handling works, tests pass,
documentation is updated. Each completed item lists location, tests, migrations, and debt.

**Last updated:** 2026-10-05 (low-cost first-year production profile, ADR 0016, branch `feature/prod-low-cost`: Terraform, API and docs prepared for a ≈ US$128–140/month Google Cloud prod, go-live blockers fixed, nothing applied; see "Low-cost first-year production profile"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Next task:** see "NEXT TASK" at the bottom.

---

## Phase 0 — Foundation

- [x] Monorepo structure (`apps/`, `packages/`, `infrastructure/`, `docs/`, `.github/`)
- [x] Root docs: `README.md`, `CLAUDE.md`, `IMPLEMENTATION_STATUS.md`
- [x] Architecture docs: `docs/architecture/ARCHITECTURE.md`, ADRs 0001–0014, phase contracts in `docs/api/contracts/`
- [x] Local infra: `docker-compose.yml` (PostGIS 17, Redis 7, Firebase Auth emulator), `.env.example` — verified healthy locally
- [x] Spring Boot API skeleton (`apps/api`) — Boot 4.1.1 / Java 21 toolchain; Problem Details handler, request-id filter, SecurityConfig, springdoc (non-prod), Flyway V001+V002, Testcontainers base (`postgis/postgis:17-3.5` + Redis), Spotless, layered Dockerfile. Tests: 30 unit + 20 integration, all green; independently verified. `./gradlew exportOpenApi` writes `docs/api/openapi.json`. Debt: google-java-format pinned 1.28 until Gradle runs on JDK 21; OpenAPI `info.license` lacks `identifier`/`url` (client generator needs `--skip-validate-spec`).
- [x] Angular web skeleton (`apps/web-angular`) — Angular 22 + Material 3 theme from tokens, app shell (top bar, bottom nav <960px, footer), lazy routes incl. map/inventory placeholders, admin shell, 8 legal draft pages, shared UI (empty/error/skeleton/badges/chips), `config.json` loader, interceptors (base URL, request id, ProblemDetail→ApiError), theme service, Playwright smoke (5 pass), 38 unit tests, Dockerfile + nginx + entrypoint. Builder verified; independent verifier was interrupted by the pause (re-run `npm run lint && npm run format:check && npm test && npm run build`). Root npm workspace added (Phase 1, `d85a93f`); the link script is gone.
- [x] Mobile skeleton (`apps/mobile`) — Expo 57 + expo-router six tabs, typed openapi-fetch client, tokens sync, offline banner, 29 jest tests, Maestro smoke flow (replaced by the M1 flows in `apps/mobile/.maestro`), deep links; expo-doctor 21/21. Independently verified. Debt: RNTL pinned 13.3.3; fonts not bundled; EAS project id placeholder. shared-types is now a real workspace dependency (`d85a93f`).
- [x] ML skeleton (`apps/ml`) — FastAPI factory, `/health`, `/ready`, `/v1/identify` (stub identifier + perceptual hashing), `/v1/duplicates`, Pub/Sub push handler with SSRF guards, problem-details errors, pytest ≥85 % coverage, Dockerfile (3.12 image smoke-tested). Independently verified.
- [x] Shared packages: `packages/design-tokens` (JSON → CSS/TS), `packages/api-client` (typescript-angular generated; generator CLI isolated in `tools/`), `packages/shared-types` (openapi-typescript + fetch helper)
- [x] Dockerfiles for api, web (repo-root context), ml
- [x] CI (`.github/workflows/ci.yml` + docker-build, deploy, e2e, codeql, dependabot) — runs on PR #1; fixed in session: `pull-requests: read` for paths-filter, Trivy tag `v0.36.0`, `actions: read` for SARIF/CodeQL, CodeQL v4, executable bit on `gradlew`/entrypoints, shared-types install before mobile typecheck
- [x] Terraform skeleton: 15 modules + dev/staging/prod environments + Cloudflare Terraform, all `terraform validate` clean (providers google 7.46, cloudflare 5.26); Cloudflare setup documented in `infrastructure/cloudflare/README.md`; deployment/security docs in `docs/deployment/`, `docs/security/`. Independent verifier interrupted by the pause (re-run `terraform fmt -check -recursive infrastructure` + validate per env). Debt: plan/apply unproven without GCP credentials; `/internal/*` endpoints must verify Google OIDC tokens app-side; Memorystore TLS off until the API trusts the CA.
- [x] Everything builds — PR #1 CI on `0d68c8a`: API (Gradle incl. Testcontainers), Web, Mobile, ML, Terraform ×4 and change detection green; the web and infra verifications interrupted by the pause were re-executed by those CI jobs. Security job: Trivy gate fixed by the non-root web image; SARIF uploads gated on `CODE_SCANNING_ENABLED` (no GHAS on this private repo)

## Phase 1 — Auth + Users

_Backend complete (stage A `8531fd4` + stage B, workflow `web-mvp-local` stage 1, independently re-verified: 310 API tests green, OpenAPI re-exported, clients regenerated). Web Phase 1 complete (workflow `web-mvp-local` stage 2, independently re-verified: 99 web unit tests + 18 Playwright specs against the real local stack, 0 skipped). Mobile Phase 1 done in stage M1 (2026-10-04, verifier fixes 2026-10-05, branch `feature/mobile-m1`, builder; see "Mobile app (stage M1)")._

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
- [x] Mobile: login/register, profile tab, settings — stage M1 (builder, 2026-10-04): the parked `wip/mobile-auth-partial` work reconciled with today's API and the web flows. `apps/mobile`: `src/config/env.ts` (one typed config, Android `10.0.2.2` / iOS + web `localhost` defaults, `.env.example` public values only); `src/auth` (Firebase behind an `AuthPort`, React Native persistence on AsyncStorage / browser persistence on web, Auth emulator, sign-up with display name, sign-in, reset, re-auth, sign-out, friendly errors); `src/api` (openapi-fetch on `@orenji/shared-types`, ID token + one forced-refresh retry after 401, RFC 9457 → `ApiError`, 428/403 account signals, React Native response class handled); `src/account` (`/me`, consent / suspended / banned / deletion-pending / onboarding gate); screens sign-in, sign-up with versioned legal documents read in-app, verify email, reset password, consent, account status (cancel deletion, export), onboarding (profile, interests, trading area picked like on the web: a tap on the map or a dragged pin, "Use map centre", city quick picks with their suggested radius, a 1–50 km radius, or the device at reduced accuracy rounded to 3 decimals and sent only to the API, never drawn; map opt-in off by default), Profile tab + public preview, Settings (profile + avatar, location and discoverability, privacy, notifications, account with export and deletion, appearance, legal); building blocks `CardImage` (API picture URLs only + provider credit), form controls, `QueryState`, snackbar, confirm dialog, query keys. Maps follow ADR 0010 (amended 2026-10-05): Apple Maps on iOS, Google Maps on Android only in a build with the project's key, otherwise (Expo Go, whose bundled Google key the Maps SDK refuses) Leaflet + OpenStreetMap in a WebView. Tests: 231 jest tests (33 suites), 12 Playwright specs on the Expo web build (`npm run test:mobile:e2e`, 3 of them run the Android WebView map page in Chromium), 5 Maestro flows on Android in Expo Go (`npm run test:mobile:maestro`). First independent verification failed on the trading-area picker (city presets only, no map); fixed (see "Mobile app (stage M1)", verifier fixes); re-verification pending
- [x] Tests (API): auth filter, RBAC, audit, rate limit, consent, seed, profiles, tags, location, geo privacy contract, settings, deletion job, export — 310 API tests (45 classes, unit + Testcontainers ITs), 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; web/mobile flow tests come with their UI stages
- [x] Audit log (`audit_log`, `AuditService`, `GET /admin/audit-logs`) and admin user endpoints (list/get/suspend/unsuspend/roles), every write audited — tests AuditIT
- [x] Rate limiting (Redis Lua token bucket, property-driven policies, X-RateLimit headers, fail-open) — tests RateLimitIT
- [x] Seed accounts: 12 fictional users + roles + consents, Firebase emulator users created by the runner, plus fictional profiles/tags (`db/seed/profiles.json`) and neighbourhood-level trading areas (`db/seed/locations.json`; collector7 and staff not discoverable) — SeedDataRunnerIT, SeedIT

## Phase 2 — Card Catalog

_Backend complete (workflow `web-mvp-local` stage 2, independently re-verified: 354 API tests / 55 classes green on `./gradlew spotlessCheck build --rerun-tasks`, OpenAPI re-exported (59 paths, no Phase 1 path/schema lost), clients regenerated, live smoke on `api-phase2.jar`). Web Phase 2 complete (stage 3, independently re-verified: 153 web unit tests / 31 files, 26/26 Playwright specs against `api-phase3.jar`, 0 skipped). Mobile: stage M2 (2026-10-05, see "Mobile app (stage M2)")._

- [x] `game`, `card`, `card_set`, `card_printing`, `card_image` with JSONB metadata — migrations V012 (`game` with a `GameSchema` jsonb per game) and V013 (`card_set`, `card`, `card_printing`, `card_image`, `catalog_sync_run`; generated tsvector columns, trigram, jsonb GIN and printing-code indexes). `games` module: `GameService` implements `GameCatalog` from the DB (ACTIVE games only), replacing `ConfiguredGameCatalog`/`GamesProperties`/`orenji.games.slugs`. Tests GamesIT (3)
- [x] `CardProvider` interface + `MockCardProvider` + import/sync pipeline — `apps/api/.../cards`: `CardProvider` (contract shape), `MockCardProvider` (profiles local/dev/test), idempotent `CatalogImportService` (keyed by `external_ref`, per-game advisory lock, only changed rows rewritten, stable slugs), `POST /admin/catalog/sync` → 202 + `CatalogSyncRequestedEvent` handled by an `@ApplicationModuleListener`, `GET /admin/catalog/sync-runs[/{id}]`, `GET /admin/catalog/providers`. Tests CatalogImportIT (3). Real provider since 2026-10-01: `YgoProDeckCardProvider` (see "Card images + real Yu-Gi-Oh! catalog")
- [x] Seed catalog: Yu-Gi-Oh!, Pokémon, Magic: The Gathering, Riftbound (fictional-safe subset) — `db/seed/catalog/{yugioh,pokemon,mtg,riftbound}.json`, 4 sets / 20 cards / 40 printings per game, invented names, per-game metadata; imported at local/dev startup by `CatalogSeedContributor` (order 400). Server-generated SVG placeholders `GET /public/placeholder-images/{game}/{slug}.svg` (escaped, no scripts, CSP, 1-day cache, ETag/304) — tests CatalogMetadataIT (5), PlaceholderImageIT (3)
- [x] Catalog search: FTS + trigram, filters (game, set, rarity, language, edition) — `CatalogQueryRepository`: `ts_rank_cd` FTS, trigram fallback under 5 hits, accent-insensitive, printing-code short-circuit, set/rarity/language/edition filters and typed `metadata.<key>` filters (jsonb containment, validated against the `GameSchema`), `GET /cards/suggest` — tests CatalogSearchIT (9), CatalogTextTest (4)
- [x] `/api/v1/games`, `/api/v1/cards`, `/api/v1/cards/{id}/printings`, `/api/v1/sets` — plus `/games/{slug}`, `/cards/{id}`, `/printings/{id}`, `/sets/{id}`; public GET routes (`SecurityConfig.PUBLIC_GET_PATTERNS`, also exempt from the account-state and 428 terms checks); admin writes `POST/PUT /admin/games`, `/admin/sets`, `/admin/cards`, `POST /admin/cards/{id}/printings`, `PUT /admin/printings/{id}` (audited, schema-validated) — tests AdminCatalogIT (3), CatalogSearchIT. Deviation: OpenAPI path is `/public/placeholder-images/{game}/{file}` (file = `<slug>.svg`)
- [x] Web card search UI (autocomplete) and card detail — `apps/web-angular/src/app`: `shared/catalog` (top-bar `CardSearchBoxComponent` on `GET /cards/suggest`: 250 ms debounce, keyboard navigation, printing suggestions open the card with `?printing=`, Enter without a highlight searches `/cards?q=`, deferred chunk; `GamesStore` on `GET /games`, card image/tile/grid, catalog labels), `features/catalog` (`/cards` with query, game pills and set/rarity/language/edition filters from the `GameSchema`, all state in the URL, paginated grid, printing-code badge; `/cards/:id` with schema-driven attributes, selected printing and printings table with market prices; `/sets/:id` with a paginated checklist), `/search` previews matching cards, profile game picker now from `GET /games`. Skeleton/empty/error-with-retry states. Tests: Vitest units (card search params, card metadata, catalog labels, search box), Playwright `e2e/catalog.spec.ts` (4: keyboard autocomplete → card detail → printings → set page; filters kept in the URL across reload; printing-code search from the page and the autocomplete; not-found state). Deviations/debt: `metadata.<key>` filters not exposed (the generator emits no dynamic query parameters); no `/sets` index page yet; "Who has this near me" / "Add to wishlist" disabled until Phases 4/6; E2E specs serve placeholder card images from memory (`stubCardImages`) because the API counts each image against the anonymous 60/min per-IP rate limit shared by the parallel suite
- [x] Mobile card search UI and card detail — stage M2 (builder, 2026-10-05): Search tab (`app/(tabs)/search.tsx`: live typo-tolerant `GET /cards` search across games, 350 ms debounce, game pills, set (`GET /sets?game=`) / rarity / language / edition filters from the game schema with the web's `withFilter` rules, infinite pages, printing-code match badge, recent searches per account on the device, empty / error-with-retry / offline states, links into the tab apply a set) and card detail (`app/cards/[id].tsx`, `?printing=`: `CardImage` (API picture URLs only) with the YGOPRODeck credit line, schema-ordered attributes, the selected printing with market price, every printing (`PrintingList`), the set opens the Search tab filtered by it, "Add to inventory" (the add flow with card and printing preselected), "Who has this near me" opens the Map tab with `?card=` until the card filter of stage M3; not-found / error states). "Add to wishlist" is left out: the web adds wishes through the wishlist dialog (criteria, radius), the mobile wishlist stage brings it. Tests: jest (`search.test.tsx`, `card-detail.test.tsx`, `cardSearch.test.ts`, `catalog.test.ts`, catalog hooks), Playwright `catalog.spec.ts` (2), Maestro `search-card-detail.yaml`
- [x] Tests: provider contract, search ranking, JSONB metadata per game — CatalogImportIT, CatalogSearchIT, CatalogMetadataIT, AdminCatalogIT, PlaceholderImageIT, GamesIT, CatalogTextTest
- [x] Platform rules (ADR 0014, plan item 2): feature flags — `featureflags` module, migration V010 (7 default flags), `FeatureFlags.isEnabled/require/evaluateAll` (60 s Redis cache evicted after commit, deterministic CRC32 rollout bucket per account), `GET /public/feature-flags`, `GET /admin/feature-flags`, `PUT /admin/feature-flags/{key}` (SUPER_ADMIN, audited); local/dev seed enables `protectedPayments`, `advertising`, `donations` (fake providers), `mlScanning` stays off; `FEATURE_DISABLED` now renders 404 with a `feature` extension — tests FeatureFlagsIT (4). Plans/limits/entitlements: see Phase 10. `common/cache/RedisJsonCache` fail-open read-through cache. Debt: no contract document covers the feature-flag endpoints (the exported `openapi.json` is the field-level truth)
- [x] Web platform rules + catalog admin (stage 3) — `core/feature-flags` (`FeatureFlagsService` on `GET /public/feature-flags`, sends the ID token when signed in via the new `ATTACH_ID_TOKEN` context so rollouts are per account, flags off until known, reload on sign-in/out; `featureGuard(key, label)` guards `/community` (`publicChat`)), `core/limits` (429 `LIMIT_REACHED` interceptor + lazy dialog: limit label/key, used/limit, reset time, plan, Premium value from `GET /plans`, "See Premium" while `premiumPlans` is on; snackbar fallback; opt out with `SKIP_LIMIT_DIALOG`), `features/premium` (`/premium`: plans + `GET /me/plan` usage; upgrade disabled until Phase 10), `features/admin/games` (list incl. hidden, schema JSON editor with live validation, format and preview), `features/admin/cards` (search, `/admin/cards/:id` editor with schema-driven attributes and printing dialog, mock catalog sync panel polling runs), `features/admin/feature-flags` (switch with confirmation, SUPER_ADMIN; read-only for ADMIN), `features/admin/usage-limits` (plans × limits matrix, inline edit, Enter/Escape, SUPER_ADMIN), audit labels for Phase 2 actions. Fixes: `SearchFieldComponent` now handles the native submit event (it used `(ngSubmit)` without a form directive); footer `/meta` probe sends the token when signed in and loads lazily. Tests: Vitest units (feature flags, feature guard, limit-reached parsing/interceptor/dialog, schema validation, limit matrix, cell editor, plan labels), Playwright `e2e/admin-rules.spec.ts` (4: SUPER_ADMIN flag switch with cancel + confirm persisting after reload, inline PREMIUM limit edit persisting and shown on `/premium`, ADMIN read-only, game schema validation + mock sync; state restored through the API). Verifier fix: `packages/api-client/package.json` now declares `"sideEffects": false` so unused generated services are tree-shaken (initial bundle 927.77 kB → 835.50 kB after the Phase 3 regeneration; 900 kB warning budget). Debt: set/printing creation has no admin UI yet (the user entitlements panel and the plan editor landed with web Phase 10, stage 11); the limit-reached dialog is covered end to end since stage 4 (`inventory.spec.ts`) and stage 11 (`freemium.spec.ts`)

## Phase 3 — Inventory + Binders

_Backend complete (workflow `web-mvp-local` stage 3, independently re-verified: 413 API tests / 67 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (81 paths, previously 59, no path or schema lost; every contract route present); clients regenerated; live check on `.local-dev/api-snapshots/api-phase3.jar` (seeds 10 binders / 36 items)). Web `/inventory` and public binder pages complete (workflow `web-mvp-local` stage 4, independently re-verified: 185 web unit tests / 38 files, 30/30 Playwright specs against `api-phase4.jar`, 0 skipped); mobile: stage M2 (2026-10-05, see "Mobile app (stage M2)"). Module order `delisting` ← `binders` ← `inventory` (inventory implements the `binders` `BinderContents` extension point, no cycle)._

- [x] `binder`, `inventory_item` (quantity, condition, language, printing, edition, price, availability, visibility, notes) — migrations V021 (`binder`, generated `search_vector` + GIN) and V022 (`inventory_item` with the contract indexes and the `trg_inventory_item_binder_count` trigger maintaining `binder.item_count`, `inventory_item_image`, `inventory_freshness_event`); `binders` (`BinderService`: CRUD, publish PUBLIC/ONE_HOUR/ONE_DAY/UNTIL_DISABLED, unpublish, confirm, reorder, delete that unfiles or `?deleteItems=true`; `binders.max` via `Limits.consume` + a `LimitUsageSource`) and `inventory` (`InventoryService`: CRUD, PATCH with absent-vs-null semantics through `common/PartialUpdate`, soft delete, confirm, ≤ 4 photos re-encoded to JPEG ≤ 1600 px through `ObjectStorage` (rate-limited 60/hour), summary); export contributors and deletion participants for both; seed `db/seed/inventory.json` (`InventorySeedContributor`, order 500) — tests InventoryIT (9), BinderIT (8, incl. `binders.max` → 429), ItemImageProcessorTest (4), PartialUpdateTest (4), DeletionIT (extended), SeedDataRunnerIT (extended)
- [x] Visibility: PRIVATE / PUBLIC / TEMPORARILY_PUBLIC (until timestamp); binder-level too — `binders/domain/PublicVisibilityRules` (SQL fragments + pure Java twin evaluated live on every public read; `publicUntil` ≤ 30 days ahead), `ListingReconciler` keeps a materialised `publicly_listed` flag so `InventoryItemPublished`/`Unpublished` and `BinderPublished`/`Unpublished` fire once per transition (Modulith outbox), re-run on suspend/unsuspend/`PrivacySettingsChangedEvent` (new, published by `PrivacySettingsService.update`) — tests VisibilityIT (4), VisibilityRulesTest (5), EventsIT (3)
- [x] Freshness fields: created/updated/confirmed/lastOwnerActivity + freshness status calc — V020 `delist_policy` (exactly one active row; seed ACTIVE 0–14 / AGING 15–30 / STALE 31–45 / HIDDEN 46+, warn 5 days before hiding, `max_strikes` 3), `delisting` (`FreshnessPolicy`, `FreshnessLabels` "Updated 3 hours ago", `DelistPolicyService` Redis-cached + audited admin update, `FreshnessEventLog`), `FreshnessService`/`FreshnessJob` `POST /internal/jobs/freshness` (hourly `@Scheduled` under `local`; expired temporary publications → PRIVATE, AGED/STALED/HIDDEN/RESTORED/WARNED events, `BinderFreshnessChanged`, `BinderFreshnessWarning`; never deletes), `DelistJob` `POST /internal/jobs/delist` (records a `job_run`, no-op until strikes exist), `GET/PUT /admin/delist-policies` (Phase 7 contract, ADR 0014) — tests FreshnessPolicyTest (5), FreshnessJobIT (5), AdminDelistPolicyIT (2)
- [x] Bulk operations: select, change visibility, move binder — `POST /inventory/items/bulk` (`SET_VISIBILITY`, `MOVE_TO_BINDER`, `SET_AVAILABILITY`, `CONFIRM`, `DELETE`; one transaction; per-id ownership, `skipped[].reason` NOT_FOUND/UNCHANGED) — tests BulkOperationsIT (4)
- [x] Public binder views + collector public profile endpoint — `GET /collectors/{handle}/binders`, `GET /public/binders/{id}` (owner block with region label + distance bucket only; `binder.views.per_day` consumed once per binder and UTC day for signed-in non-owners), `GET /public/binders/{id}/items`, `GET /collectors/{handle}/inventory` (`PublicInventoryItem`, never `notes`); routes added to `SecurityConfig.PUBLIC_GET_PATTERNS` — tests PublicBinderIT (3), GeoPrivacyContractTest `publicListingsNeverCarryCoordinatesOrPrivateNotes` (every public listing route of the seeded collectors, anonymous and signed in: no coordinates, ≤ 3 decimals, no private notes, logs clean). Contract deviations (documented in `apps/api/README.md`, contract docs not yet edited): PRIVATE profiles never publish; additive columns (`binder.freshness_state`/`warned_at`/`publicly_listed`/`listing_changed_at`, `inventory_item.warned_at`/`publicly_listed`/`listing_changed_at`, `inventory_freshness_event.owner_id`, `delist_policy.max_strikes`/`created_at`) and response fields (`BinderResponse.sortOrder`/`effectivePublic`/`games`/`coverPrintingId`, `PublicInventoryItem.binder`, `PublicBinderResponse.kind`/`publicUntil`/`coverImageUrl`, summary `agingCount`/`effectivePublicCount`, list params `unfiled`/`direction`); photo upload answers 201 with the item. Debt: photos JPEG not WebP; binder names/descriptions and public notes not yet run through `TextModerationService` (Phase 7); web must send the token on `GET /public/binders/{id}` for `binder.views.per_day` to count
- [x] Web `/inventory` page (filters, table/grid, edit drawer, bulk bar, binder manager) — `apps/web-angular/src/app/features/inventory` (stage 4): container page with all state in the URL (`?binder=<id>|unfiled&q&game&visibility&availability&condition&freshness&sort&view&page&size`), `InventoryStore` + `BinderActionsService` shared with the dialogs; binder list (All cards / Unfiled / binders with visibility icon and counts, horizontal strip < 960 px); summary strip (cards/copies, public, private, temporarily public with next end, stale + hidden "needs confirmation" with "Confirm all"); privacy notice when public content cannot be seen (not discoverable / profile not PUBLIC) and per-item/binder visibility explanations; toolbar (search, All/Private/Public/Temporarily public segmented control, game, availability, condition, freshness, sort, grid/table); selected-binder header (publish 1 h / 24 h / until disabled, make private, public page, edit, confirm, delete); grid cards + table rows with quantity stepper (PATCH in place), visibility and server-labelled freshness badges; bulk bar (visibility incl. temporary 1 h / 24 h / 3 / 7 / 30 days, move to binder/unfiled, availability, confirm, delete; skipped cards and reasons listed); "Add card" dialog (`/cards/suggest` → printing picker → details, Private by default); edit side panel (changed fields only as PATCH, ≤ 4 photos, confirm, delete); binder form dialog (`binders.max` → limit-reached dialog + inline message); binder manager (drag and drop, keyboard move buttons keeping focus, inline rename, publish/private, delete, create). Public binder page `features/binders` (`/binders/:id`, ID token attached when signed in so `binder.views.per_day` counts; owner card = region label + distance bucket only; game pills/search/availability in the URL; never private notes; 404 / 429 / error-with-retry states). Collector page: "View public binder" wired, public binders + 8-card inventory preview; card detail "Add to inventory"; signed-out `/inventory` shows a sign-in invitation. Shared `shared/inventory`, `shared/ui/visibility-badge`, `FreshnessBadge` `label`/`compact` inputs. Generated `@orenji/api-client` only. Tests: Vitest units (inventory-params, item-form, bulk-actions, visibility-status, inventory.store, quantity-stepper, inventory-labels, freshness-badge) — 185 web unit tests / 38 files; Playwright `e2e/inventory.spec.ts` (4: add card → binder → move → public → edit + photo + publish until disabled + reload; bulk temporary publication / availability with skipped reason / move / private / delete; a second collector opens the published binder from the owner's profile with every JSON lat/lng ≤ 3 decimals; `binders.max` limit-reached dialog + keyboard reorder persisted + delete) — 30/30 Playwright specs green against `api-phase4.jar`. Debt: a `/sets` index page still pending (stage 3 carry-over; admin user entitlements and plan editing landed in stage 11)
- [x] Mobile inventory tab optimised for card management — stage M2 (builder, 2026-10-05): Inventory tab (`app/(tabs)/inventory.tsx`, Cards | Binders): cards with search, binder (all / unfiled / one) / game / intent (`availability`) filters and sorting (recently updated, name, price both ways) in bottom-sheet selects, infinite list rows (picture, printing code, condition, copies, price, intent, offers, visibility, freshness), totals (`GET /inventory/summary`), stale or hidden cards with "Confirm all" (bulk `CONFIRM`), listing health (`GET /me/listings/status`: paused banner with "Resume listings" after a confirmation, or moderation review; strikes reminder); add a card (`app/items/new.tsx`: `GET /cards/suggest` → `GET /cards/{id}` printing → details (copies, condition / language / edition / finish from the game schema, intent + accepts offers exactly as the API models them, price and currency, private / public / temporarily public 1 h–30 days, binder, public and private notes; the web's validation) → `POST /inventory/items`); edit (`app/items/[id].tsx`: `PATCH` of the changed fields only, visibility explained, "Still available" → `POST .../confirm` for stale / hidden cards, delete with a confirmation); binders (`app/binders/[id].tsx` own view: status and freshness, publish 1 h / 24 h / until disabled, make private, confirm, rename (`binders/edit`), delete (cards become unfiled), "Add cards" (bulk `MOVE_TO_BINDER`), remove a card (`binderId: null`), public page; public view for any other binder: owner area label + distance bucket, public cards and notes only, availability filter, 404 and binder-views limit states; `binders/new` with the `binders.max` limit explained in place). Public binder reads carry the ID token when signed in (the web's `ATTACH_ID_TOKEN`). Not on mobile yet: item photos, the multi-select bulk bar, binder reordering, set pages
- [x] Tests: visibility enforcement, ownership, bulk ops, freshness — InventoryIT, VisibilityIT, BulkOperationsIT, BinderIT, PublicBinderIT, FreshnessJobIT, EventsIT, AdminDelistPolicyIT, BinderViewLimitIT (3, stage 4: FREE visitors consume one view per binder and day, owner/signed-out views never count, PREMIUM and entitled visitors unlimited) + unit FreshnessPolicyTest, VisibilityRulesTest, ItemImageProcessorTest, PartialUpdateTest; shared `TestDomainEventsConfiguration` records committed events; web flow tests: Playwright `inventory.spec.ts` (4); mobile (stage M2): jest (`inventory.test.tsx`, `items.test.tsx`, `binders.test.tsx`, `itemForm.test.ts`, inventory / binder hooks), Playwright `inventory.spec.ts` (2) and `binders.spec.ts` (3), Maestro `inventory-add-edit-delete.yaml` and `binder-create-add-item.yaml`

## Phase 4 — Map + Geographic Search (flagship)

_Backend complete (workflow `web-mvp-local` stage 4, independently re-verified: 463 API tests / 77 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (86 paths, previously 81; every contract route present; no path or schema lost, only `PublicBinderSummary` gains an optional `owner`); clients regenerated; live check on `.local-dev/api-snapshots/api-phase4.jar` with an emulator token). Migration V030 only (range V030–V039). Web `/map` and `/search` complete (workflow `web-mvp-local` stage 5, independently re-verified: 247 web unit tests / 51 files, lint + format clean, production build 841.71 kB initial with no warnings, 32/32 Playwright specs against `.local-dev/api-snapshots/api-phase5.jar`, 0 skipped); mobile: stage M3 (2026-10-05, see "Mobile app (stage M3)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 4 contract"; the contract document itself is not edited): the caller's own marker stays in `nearby`; collectors without public listings appear (`binderFreshness: null`, ranked after AGING), all-STALE collectors never do; ranking freshness → distance bucket → rating → distance; `center` snapped to 2 decimals; additive `MatchingItem`/`suggest` fields; `card-holders` needs a centre (400 for signed-out callers without `lat`/`lng`); the plan cap key is `map.radius.max_km` (V011) where the contract says `map.radius.max`; `nearby` is a reserved handle. Since Phase 5 blocks are real (`BlockRelationProvider.blockedAmong`, one lookup per page) but still applied after the cached page is read, so `total` may count blocked collectors beyond the limit (debt: join blocks into the discovery SQL)._

- [x] `/api/v1/collectors/nearby` (PostGIS `ST_DWithin` on `public_point`), bucketed distances — new module `apps/api/.../search`: `DiscoveryController` (`GET /collectors/nearby`, `GET /collectors/{handle}/preview`), `CollectorDiscoveryService`, `GeoScopeResolver` (centre = `lat`/`lng` or the caller's own trading area via `LocationService.searchCentreOf`, snapped to 0.01° inside the `location` module; radius capped by `Limits` `map.radius.max_km` → 429 LIMIT_REACHED, FREE rule for signed-out callers via the new `Limits.checkValueForAnonymous`; default 10 km), `MarkerAssembler` (per-viewer `PrivacyPolicyService` rules incl. new `canAppearOnMap`/`canAppearInNameSearch`: distance buckets for signed-in callers only, last active, online status, blocks, rating), `MarkerRanking`, `infra/CollectorSearchRepository` (SQL on `user_location.public_point` only, reusing `PublicVisibilityRules` and `InventoryItemRepository.LISTED`; STALE/HIDDEN items never match), `NearbyCache` (Redis 60 s, key `orenji:cache:nearby:<generation>:<sha256 of the snapped request>`) + `NearbyCacheInvalidator` (generation bumped after commit on item/binder publish/unpublish, `BinderFreshnessChanged`, `TradingAreaChanged`, `LocationRemoved`, `PrivacySettingsChanged`, `UserSuspended`/`UserUnsuspended`); routes added to `SecurityConfig.PUBLIC_GET_PATTERNS` (anonymous reads with reduced detail); `DistanceBucket.upperKm()`, `location/domain/SearchCentre`; migration V030 (`ix_inventory_item_owner_discovery`, `ix_inventory_item_printing_discovery`, `ix_privacy_settings_map`, `ix_binder_name_trgm`) — tests NearbyCollectorsIT (8: radius/freshness ranking/details by sign-in state, filters, hidden collectors, plan radius 429, preview messaging state, centre required for signed-out callers and defaulting to the own trading area, limit truncation, cache invalidation), SearchCentreTest (2). Debt: blocked collectors are filtered after the page is read (so `total` may count them) until Phase 5 blocks are joined in SQL; ratings arrive with Phase 7
- [x] `/api/v1/search` unified (cards, printings, sets, collectors, public binders) — `SearchController` (`GET /search`, `/search/suggest`), `SearchService` (resolution via new `CatalogService.resolve`/`CatalogResolution`: an exact printing code resolves the printing, a shared code / exact name / single card hit resolves the card; `collectors` then lists nearby holders with the `nearby` engine; public binders with an optional owner block via `PublicBinderService.publicBinders`; collector text matching substring-only; `suggest` mixes CARD/PRINTING/SET/COLLECTOR/BINDER/TAG), `infra/BinderSearchRepository` — tests SearchIT (4), SearchDomainTest (5)
- [x] Card-holder search: collectors near me with printing X (filters: sale/trade/offers, price, freshness, condition) — `GET /search/card-holders` (`printingId`|`cardId`, availability, condition, min/max price, freshness, edition, language, acceptsOffers, `sort=distance|price|freshness`, paged `PageResponse<CardHolderResult>`; the caller's own items excluded), `infra/CardHolderRepository`, `PublicInventoryService.publicItems(ids)` — tests CardHoldersIT (4)
- [x] Web `/map` page: MapAdapter (Google Maps / Leaflet fallback), markers, preview card, messages panel (collapsible), filters bar — `apps/web-angular/src/app/features/map` (stage 5): `MapPageComponent` container + `data/map-discovery.store.ts`; filters in the URL (game, availability, freshness, tags, radius, card/printing, `view=list`), never the map position; signed-in collectors with a trading area are centred by the server (first `GET /collectors/nearby` without `lat`/`lng`; the page never calls `GET /me/location`), signed-out visitors / collectors without an area get Montréal + city picker + "Sign in / Set my area" prompt (`area-prompt`, `shared/discovery/discovery-centre.ts`); viewport moves debounced 400 ms, re-query only when the view leaves the circle last answered, visible radius capped by the plan's `map.radius.max_km` (`GET /me/plan`, FREE when signed out), centre rounded to 2 decimals, 429 LIMIT_REACHED → limit-reached dialog + retry at the cap, 400 (no trading area) → Montréal; avatar markers with a freshness ring (`markerIconHtml`, HTML-escaped, both adapters), in-house screen-space clustering above 60 (selected collector never clustered, cluster click zooms), keyboard-focusable markers (Enter/Space → preview); `collector-preview` card on `GET /collectors/{handle}/preview` + first public binder (View profile / View public binder / Message disabled until web Phase 5; Escape restores focus; bottom sheet on phones); `collector-list` accessible "List" toggle; `map-canvas`, `map-filters-bar` (game, radius slider, availability, freshness, lazily loaded tags), `map-legend` ("Positions are approximate to protect privacy"; since 2026-10-03 "Locations are approximate (about 2 km) to protect privacy", see "Map location privacy rendering"), `discovery-panel` (map search box on `GET /search/suggest` grouped by type: card/printing → "Holders of X" side list with chips and prices, collector → preview, tag → filter, set/binder → their pages; Messages placeholder panel); `shared/map` gains `zoomControlPosition`, `shared/search`. `/search` (`features/search`: `?q=` tabs Cards / Collectors / Binders on `GET /search` with a nearby-holders banner when resolved; `?card=`/`?printing=` card-holders view on `GET /search/card-holders` with every filter, inline-validated price range, sort and pagination); card detail "Who has this near me" → `/map?card=<id>&view=list`. Generated `@orenji/api-client` only. Tests: Vitest (map page, store, adapter, list, preview, filters, search pages) — 247 web unit tests / 51 files; Playwright `e2e/map.spec.ts` (2, see below); `e2e/support/stack.ts` gains `stubMapTiles` (OSM tiles served from memory) and `createOnboardedCollector({area, displayName})`. Debt: the Messages panel is a placeholder until web Phase 5; admin entitlements / plan editing UI and a `/sets` index page still pending (carry-over)
- [x] Collector preview → full profile → public binder → message — API: `GET /collectors/{handle}/preview` (marker + `canMessage`/`isBlocked`, 404 for collectors not on the map; NearbyCollectorsIT; `canMessage`/`isBlocked` real since Phase 5); web: marker → preview → full profile → public binder proven by Playwright `map.spec.ts`; "Message" from the preview opens (or creates, `POST /conversations`) the conversation in the map's Messages panel and the collector page's Message opens `/messages/:id` (stage 6, Playwright `messaging.spec.ts`)
- [x] Mobile map tab with bottom-sheet preview — stage M3 (2026-10-05, branch `feature/mobile-m3`, builder done, verification pending): collectors as zones 3 km wide (radius 1500 m, never pins) on react-native-maps / Leaflet in a WebView (Expo Go, no key) / Leaflet on web, zoom capped at 14 for gestures and every camera request, game / intent / distance filters, "Who has this near me" (`hasCardId`), list view, preview bottom sheet (View profile, public binder, Message when allowed, Show on map), the collector profile with its approximate area, ratings, references and binders; jest, Playwright (`map.spec.ts`, `collector-map-page.spec.ts`) and Maestro (`map-preview-profile.yaml`, `card-who-near-me.yaml`). See "Mobile app (stage M3)"
- [x] Tests: geo search, no exact coordinates in any response (contract test), ranking fresh > stale — NearbyCollectorsIT, SearchIT, CardHoldersIT, SearchDomainTest (`rankingIsFreshnessThenDistanceBucketThenRatingThenDistance`, canonical cache keys never holding the raw centre), GeoPrivacyContractTest `mapAndSearchResponsesOnlyEverCarryPublicPoints` (nearby, preview, unified search, binder search, card holders, suggest; anonymous and signed in: every point is the stored public point or the snapped centre, ≤ 3 decimals, no private location keys or notes, non-discoverable collectors 404/absent, no distance buckets for signed-out callers, logs free of coordinates), PrivacyPolicyServiceTest (extended); web Playwright `map.spec.ts` (collector A publishes a card, collector B opens `/map`, finds A's avatar marker, opens the preview, uses the List toggle by keyboard, opens A's profile and public binder; card search in the map box → "Holders of" list with price and chips → card-holders view with an inverted price-range message and URL-kept max price/availability → `/search?q=AZR-EN011` banner + Collectors tab; both scenarios assert every JSON lat/lng has ≤ 3 decimals and never equals A's or B's stored trading-area centre; random rural areas per run so earlier data never crowds the map)

## Phase 5 — Chat

_Backend complete (workflow `web-mvp-local` stage 5, independently re-verified: 517 API tests / 86 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (105 paths, previously 86; every contract route present; no path, operation or schema lost; `ProblemDetail.errorCode` gains `MESSAGE_BLOCKED`, `POST_BLOCKED`, `DUPLICATE_POST`); clients regenerated; live check on `.local-dev/api-snapshots/api-phase5.jar` (= `api-latest.jar`) with emulator tokens: seeded conversation, messages, send 201, channels, posts, `/me/blocks`, moderator flags 200, collector on admin flags 403, no token 401, no coordinates in any body, `message_sent` analytics event without text). Migrations V040–V042 (range V040–V049). Web messages panel, `/messages`, `/community` and Admin → Community complete (workflow `web-mvp-local-continue` stage 6, independently re-verified: 333 web unit tests / 68 files, lint + format clean, production build 847.13 kB initial with no warnings, 36/36 Playwright specs against `.local-dev/api-snapshots/api-phase6.jar`, 0 skipped); mobile: stage M4 (2026-10-05, see "Mobile app (stage M4)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 5 contract"; the contract document itself is not edited): `POST /conversations` 201 new / 200 existing; the recipient's messaging permission applies to new conversations only; additive fields/routes (`MessageResponse.conversationId`, `CardLink.cardId`, `ConversationSummary.createdAt`, `LastMessage.id`, `?archived=`, upload `width`/`height`/`expiresAt`, `PostResponse.channelSlug`/`moderationState`, `PATCH /community/posts/{id}`, `POST /admin/community/replies/{id}/remove`, `GET /admin/community/channels`, `POST /admin/moderation/flags/{id}/resolve`); `POST /uploads/images` `kind=INVENTORY` is 400; `moderation_flag` adds `author_id`/`resolution_note`; realtime pushes are sent from the request thread after commit._

- [x] Private conversations, messages (text, card/binder/offer links, images), read/unread — `apps/api/.../messaging`: `ConversationService` (one DIRECT conversation per pair via `conversation_pair`, cursor pages through `common/TimeCursor`, TEXT / CARD_LINK / BINDER_LINK (public binders only) / IMAGE messages, forward-only read markers, per-participant mute/archive, a new message un-archives), `ImageUploadService` (`POST /uploads/images` kind=MESSAGE: sniffed JPEG/PNG/WebP ≤ 8 MB, re-encoded without metadata, `ImageUploadInspector` hook, attach within 1 h, 30/hour) + `UploadCleanupJob` (`POST /internal/jobs/upload-cleanup`, every 15 min under `local`), `MessagingAccountData` (export + deletion participant), `MessagingSeedContributor` (collector1 ↔ collector2, six messages incl. card and binder links); shared `cards/CardLink` + `CatalogService.cardLink`, `binders/BinderLink` + `PublicBinderService.binderLink`, `profiles/MemberDirectory`/`MemberCard`; migration V040 (`conversation`, `conversation_participant`, `conversation_pair`, `message`, `message_attachment`, `image_upload`, `user_block`) — tests ConversationIT (9), MessagePreviewsTest (3), TimeCursorTest (7). OFFER_LINK messages are real since Phase 8 (an offer between the two participants; OFFER_LINK and SYSTEM messages show the live proposal through the offers module's `OfferLinkResolver`). Debt: message photos are served from unguessable media keys, signed URLs wait for the cloud storage work; `MessageSent`/`MessageRead` are in the event registry for Phase 6 notifications
- [x] WebSocket (STOMP) realtime + Redis fan-out across instances — `messaging/infra`: `RealtimeConfig` (native WebSocket `/ws`, no SockJS, origins = `CORS_ALLOWED_ORIGINS`), `TokenHandshakeInterceptor` (`Authorization` header or `?access_token=`, never logged; 401/403 at the handshake), `StompSecurityInterceptor` (CONNECT auth, SUBSCRIBE only to the caller's own `/user/queue/messages|receipts|typing|presence|notifications|errors`, SEND only to `/app/typing`), `RedisRealtimePublisher` / `RealtimeRedisListener` (`rt:user:{userId}` fan-out), `PresenceTracker` / `PresenceStore` (`presence:{userId}` TTL 60 s, shown only with `showOnlineStatus`; `PresenceProvider` makes profile/marker/conversation `onlineStatus` real), `RealtimeTypingController` — tests RealtimeIT (3: messages, receipts, typing and presence reach the partner over two real STOMP clients; foreign `/user/<id>/queue` subscriptions refused; bad or missing tokens never get a session). Debt: open sessions of an account suspended later are not closed (REST sends are refused)
- [x] Block user, report entry points, moderation hooks, rate limits — blocks: `BlockService`, `POST/DELETE /users/{id}/block`, `GET /me/blocks` (idempotent, private reason), messaging implements the profiles `BlockRelationProvider` (new batch `blockedAmong`, used by `MarkerAssembler`) so profiles, map markers, previews, public binders, binder links and community feeds honour blocks both ways; moderation: `ModerationService.check(scope, text, authorId)` (Redis per-author `RATE_LIMIT` rules, accent-insensitive `BANNED_TERM` regexes via `TextModerationService.matches`, `THRESHOLD` repeated-content detection on SHA-256 of normalised text; BLOCK → 422 `MESSAGE_BLOCKED`/`POST_BLOCKED` or 429, FLAG → `moderation_flag`), `AdminModerationController` (`GET /admin/moderation/flags`, `POST /admin/moderation/flags/{id}/resolve`, MODERATOR+ via the `AdminAuthorizationManager(requireMfa, allowModerators)` overload, audited); migration V042 (`moderation_flag`, rate-pattern check, seed rules: placeholder banned terms, 30 messages/min, 60 posts+replies/hour, repeated-content thresholds) — tests MessagingAuthorizationIT (4: non-participants 404, anonymous 401, blocks hide conversations both ways and forbid new ones, recipient messaging permission, suspended recipients), ModerationIT (4), ModerationRulesTest (11), ConversationIT `theRateRuleAllowsThirtyMessagesPerMinute`. Web (stage 6): block/unblock with confirmation from the thread menu and the community post menu (`shared/messaging/block-actions.service.ts`), Settings → Blocked users (`GET /me/blocks`, Unblock), 403 `MESSAGING_BLOCKED` / 422 `MESSAGE_BLOCKED` / `POST_BLOCKED` / 429 shown inline — Playwright `messaging.spec.ts`, `community.spec.ts`. "Report collector" entry points enabled in stage 8 (profile, map preview, thread menu, community post menu, public binder owner card → Phase 7 report dialog; Playwright `reporting.spec.ts`). Debt: blocks are not yet joined into the discovery SQL (Phase 4 debt)
- [x] Public community channels (game / region / looking-for / new listings / trades / general) — `apps/api/.../community`: `CommunityService` (channels with `postCount24h`, posts/replies with author cards, edit/delete, per-channel `post_rate_limit_per_hour`, 409 `DUPLICATE_POST` within 24 h, moderation), `AdminCommunityController` (channels list/create/update, post/reply removal resolving open flags; audited), `RegionChannelListener` (a REGION channel per public-label city as collectors appear), `CommunitySeedContributor` (five posts, three replies), export + deletion participant, gated by the `publicChat` flag; migration V041 (`community_channel` with the eight launch channels, `community_post` with `body_hash`, `community_reply`) — tests CommunityIT (8), RegionChannelsTest (2)
- [x] Web messaging panel + `/messages` + `/community` + Admin → Community — `apps/web-angular/src/app` (stage 6): `core/realtime` (`RealtimeService` started by `provideRealtime()` while a ready account is signed in; hand-written STOMP 1.2 client over a native WebSocket in a lazy chunk (`stomp-frames.ts`, `stomp-connection.ts`, no new dependency), `ws://<api>/ws?access_token=<ID token>`, subscribes only to `/user/queue/messages|receipts|typing|presence`, sends only `/app/typing`, heartbeats, exponential backoff 1 s → 30 s with jitter, fresh token after a refused handshake, `resync$` → REST re-read after every (re)connection); `features/messages` (`MessengerComponent` + `ConversationsStore` (cursor inbox, live previews/order/unread counts, presence, mute/archive `PATCH`, pages older conversations until a linked one is found) → `ConversationListComponent` (keyboard navigation) and `ThreadViewComponent` + `ThreadStore` (newest page first, older pages on scroll, read marker only while visible, typing notices throttled, "Sent" → "Seen" receipts, inline 403 `MESSAGING_BLOCKED` / 422 `MESSAGE_BLOCKED` / 429) with header (profile, mute, archive, block/unblock, "Report collector" disabled until Phase 7), message list/bubbles (text, card, binder, photo, offer, removed) and composer (Enter sends, card link via `/cards/suggest`, own public binder, JPEG/PNG/WebP ≤ 8 MB photo via `POST /uploads/images` kind MESSAGE), realtime status "Live"/"Reconnecting…"); map right-hand Messages panel with unread badge on its toggle and the preview's Message button; full-page `/messages`, `/messages/:id`; `shared/links` (card/binder link pickers, link card), `shared/messaging` (`ConversationStarterService`, `BlockActionsService`), `shared/pipes/media-url.pipe.ts` (API-relative media paths of pushed payloads); Settings → Blocked users; `features/community` (`/community`, `/community/:slug` behind `featureGuard('publicChat')`: `CommunityStore`, channel sidebar with game filter folding behind a button on narrow screens, post composer with card/binder links and inline 409 `DUPLICATE_POST` / 422 `POST_BLOCKED` / 429, post edit/delete, inline replies, author block, moderator removal with a required reason); `features/admin/community` (moderators and admins: channels create/edit/archive/restore, moderation flags by state with resolve + optional note, `?tab=flags`; community audit labels). Generated `@orenji/api-client` only. Tests: Vitest units (STOMP frames/connection, realtime service, message text, drafts, thread items, conversations/thread stores, composer, conversation list, community helpers/store, link choices, blocked-users settings, conversation starter, admin community labels, media URL pipe) — 333 web unit tests / 68 files; Playwright `e2e/messaging.spec.ts` (2: A finds B on the map → Message → text + card via autocomplete; B on `/messages` gets it live with unread badge 2, A sees "Seen", B's typing, reply and photo reach A live; A blocks B from the thread menu, B's next message is refused inline and `POST /conversations` answers 403 `MESSAGING_BLOCKED`; A unblocks in Settings; a conversation started from a collector profile full page: text file rejected, photo sent, 422 banned-term refusal inline, reopened from the list by keyboard; every JSON lat/lng ≤ 3 decimals) and `e2e/community.spec.ts` (2: post with a card link in Montréal / Pokémon, duplicate 409 and banned-term 422 inline, edit, reply from a second collector, delete; moderator removal with a reason and resolving the raised flag in Admin → Community). Existing specs adjusted (`map.spec.ts`/`settings.spec.ts` Message enabled, `smoke.spec.ts` exact "Sign in", `support/inventory.ts` bounded coordinate settle). Debt: no single-conversation REST endpoint (deep links page back through the inbox); STOMP payloads other than `MessageResponse` are typed by hand in `core/realtime/realtime-events.ts` (not in the OpenAPI document); "Report collector" enabled in stage 8; the composer cannot send OFFER_LINK messages yet (API ready since Phase 8; web offer UI is stage 9)
- [x] Mobile Messages tab — stage M4 (2026-10-05, branch `feature/mobile-m4`, builder done, verification pending): the realtime STOMP client over the app's WebSocket (handshake `Authorization` header natively, `?access_token=` on the web build; backoff, background pause, NUL-safe frames on React Native), the Messages tab (Inbox | Community) with unread counts and the tab badge, the conversation at web parity (card / binder / offer links, photos, read markers, typing, "Seen", mute / archive / block with a confirmation, refusals explained) and the community channels (posts, replies, own edits and deletes, per-channel limits explained); since stage M5 the conversation options also rate and report the other collector, offer links open the offer and the composer shares one. See "Mobile app (stage M4)" and "(stage M5)"
- [x] Tests: participant authorization, blocking, rate limit, realtime delivery — ConversationIT, MessagingAuthorizationIT, RealtimeIT, CommunityIT, ModerationIT + unit TimeCursorTest, MessagePreviewsTest, ModerationRulesTest, RegionChannelsTest; extended GeoPrivacyContractTest `messagingAndCommunityResponsesNeverCarryCoordinates` (conversations, messages with card/binder links, channels, posts, replies, blocks; logs clean), AnalyticsIT (`message_sent`, `community_post_created` without text or raw ids), SeedDataRunnerIT, AdminAuthorizationManagerTest, OpenApiExportTest; web flow tests: Playwright `messaging.spec.ts` (2, two browser contexts over real STOMP) and `community.spec.ts` (2) against `api-phase6.jar`; mobile (stage M4): jest (`realtime/*`, `features/messaging`, `features/community`, `screens/messages-tab`, `screens/conversation`, `screens/community-channel`), Playwright `messages.spec.ts` (2) and `community.spec.ts` (1), Maestro `messages-inbox-thread.yaml` and `community-post.yaml`

## Phase 6 — Wishlist + Notifications

_Backend complete (workflow `web-mvp-local-continue` stage 6, independently re-verified: 560 API tests / 97 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (117 paths, previously 105; the 12 contract routes present; no path, operation or schema lost or changed, 13 schemas added); clients regenerated (`WishlistService`, `NotificationsService`); live check on `.local-dev/api-snapshots/api-phase6.jar` (= `api-latest.jar`) with emulator tokens: V050/V051 applied, collector2's seeded wishlist, matches with collector markers at 3-decimal public points and `KM_5_10` buckets, notifications + unread count, collector2's public wishlist summary for collector1, push token register/delete 204, anonymous 401, rematch job without service auth 401; no tokens, e-mail addresses or coordinates in the log). Migrations V050–V051 (range V050–V059). Web `/wishlist` (matches drawer, add/edit dialog), top-bar notification bell and `/notifications` complete (workflow `web-mvp-local-continue` stage 7, independently re-verified: 392 web unit tests / 79 files, lint + format clean, production build 865.69 kB initial with no warnings, 38/38 Playwright specs against `.local-dev/api-snapshots/api-phase7.jar`, 0 skipped); mobile: stage M4 (2026-10-05, see "Mobile app (stage M4)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 6 contract"; the contract document itself is not edited): the daily alert limit is counted by the Phase 2 `Limits` service (`usage_counter` per UTC day + Redis mirror `orenji:usage:*`) instead of a `notif:{userId}:{type}:{day}` key (limit values still from `usage_limit`); additive `WishlistMatchResponse.wishlistItemId`, `WishlistItemResponse.updatedAt`, `?includeDismissed=`/`?limit=`, read-all answers `{updated}`, `notification.in_app` column; matching also requires a fresh item (ACTIVE/AGING) and applies the rarity filter, items priced in another currency never meet a maximum price; a wish created or edited is matched at once **without** notifications; `DELETE /me/push-tokens/{token}` needs tokens without `/`._

- [x] `wishlist`, `wishlist_item` (game, card, printing, rarity, condition, edition, language, max price, radius, trade pref) — `apps/api/.../wishlist`: migration V050 (`wishlist_item` with the contract indexes + owner/updated indexes, `wishlist_match` unique per pair with a distance bucket, never a point); `WishlistService` (`GET/POST /wishlist`, `PATCH/DELETE /wishlist/{id}`, `GET /wishlist/{id}/matches` cursor pages, `POST /wishlist/matches/{id}/dismiss`, `GET /collectors/{handle}/wishlist` only when `wishlistVisible` via new `PrivacyPolicyService.canSeeWishlist`), filters validated against the game's `GameSchema` (`WishlistRules`), radius capped by `map.radius.max_km` (429), `wishlist.items.max` (FREE 20 / PREMIUM 500 → 429), identical wish 409, other users 404, anonymous 401; match markers through new `CollectorDiscoveryService.markersFor` (one block lookup per page); export (with private notes) + deletion; seed `WishlistSeedContributor` (order 620: collector2 wishes collector1's public AZR-EN001 within 25 km, the real matcher notifies at seed time; `pkm-p002a` private lot to trigger a fresh match locally; `mtg-p005b` for trade) — tests WishlistIT (5), WishlistRulesTest (4), SeedDataRunnerIT (extended)
- [x] Matching worker: new public inventory → wishlist match → geo filter → prefs → notification (dedup + rate limit) — `WishlistInventoryListener` (`@ApplicationModuleListener` on `InventoryItemPublished`, Modulith outbox) → `WishlistMatcher` running the contract SQL (`WishlistMatchRepository.CANDIDATES`: effectively public + fresh item, printing or card, condition rank from the `GameSchema` order, edition, language, rarity, price in the same currency, trade preference vs availability, `ST_DWithin` between the two **stored public points** within the wish radius, active wisher, blocks excluded both ways), `ON CONFLICT DO NOTHING` inserts, dedup key `wishlist:<wish>:<item>`, body "… was listed ~5-10 km away"; `POST /internal/jobs/wishlist-rematch` (service auth, `job_run`) + daily `@Scheduled` under `local` (`WishlistRematchScheduler`); `WishlistItemCreated`/`WishlistMatched` → analytics `wishlist_item_created`/`wishlist_matched` (no notes, raw ids or coordinates) — tests WishlistMatchingIT (7), AnalyticsIT `phase6WishlistEventsCarryNoNotesIdsOrCoordinates`
- [x] Notification centre (in-app), push via FCM abstraction, email preference stub — `apps/api/.../notifications`: migration V051 (`notification` with unique `dedup_key`, `in_app`, `channel_state` jsonb; `push_token` unique token, `invalid_at`); `NotificationService.notify` (single entry point: idempotent per dedup key with an advisory lock, unreachable recipients skipped, preferences and master switch, quiet hours hold push only (`QuietHoursRules`), `wishlist.alerts.per_day` (FREE 5 / PREMIUM unlimited) through `Limits` with one "More wishlist matches are waiting" SYSTEM notice per UTC day, `ChannelPlan`), `NotificationDispatcher` (after commit: realtime `/user/queue/notifications` through the Phase 5 `RealtimePublisher`, `PushProvider` to the 20 most recent valid tokens, `EmailProvider` to verified addresses only; outcome in `channel_state`); `LogPushProvider` (default, never logs tokens) / `FcmPushProvider` only with `PUSH_PROVIDER=fcm` (multicast batches of 500, unregistered tokens invalidated, never throws); `LogEmailProvider` (default, masked address) — SendGrid/SES refused at start-up; `GET /notifications` (cursor, `unreadOnly`), `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `POST /me/push-tokens`, `DELETE /me/push-tokens/{token}` (never returned or logged); `ActivityNotificationListener` + `ActivityNotifications`: `MessageSent` → MESSAGE (never the text; not for muted conversations via new `ConversationService.isMutedFor`; one unread per conversation, 10-minute throttle; `MessageRead` marks them read), `BinderFreshnessWarning` → BINDER_STALE_WARNING, `BinderFreshnessChanged` HIDDEN + new `inventory/events/InventoryListingsHidden` (published by `FreshnessService`) → one BINDER_HIDDEN per binder/lot and day; export (latest 1 000 notifications, push token platforms/dates only) + deletion; seed `NotificationSeedContributor` (order 630, four history rows) — tests NotificationCentreIT (3), NotificationPreferencesIT (4), NotificationLimitIT (2), NotificationRealtimeIT (1, real STOMP client), ActivityNotificationsIT (2), PushDeliveryIT (1), NotificationRulesTest (6), PushAndEmailProvidersTest (5). Debt: `FcmPushProvider` unproven without Firebase Admin credentials (cloud half deferred, docs/deployment/DEFERRED.md); real e-mail adapters deferred; blocks still not joined into the Phase 4 discovery SQL (carry-over)
- [x] Web wishlist UI and notification list — `apps/web-angular/src/app` (stage 7): `core/realtime` also subscribes `/user/queue/notifications` (`notifications$`); `core/notifications` (`NotificationCenter` started by `provideNotifications()`: unread count `GET /notifications/unread-count`, latest 8 `GET /notifications`, optimistic `POST /notifications/{id}/read` / `POST /notifications/read-all`, each push counted once, count re-read after reconnection and after the caller's own read receipts; `notification-kinds.ts` icon/tone per type and safe in-app deep links (`data.deepLink` only when it is a same-app path, else rebuilt from ids; SYSTEM limit notice → `/premium`); `NotificationEntryComponent`); top-bar bell `core/layout/notification-bell` (live badge "99+", `aria-label` "Notifications, N unread", menu with mark read / mark all / see all, sign-in prompt when signed out); `features/notifications` (`/notifications`: `NotificationFeedStore` cursor pages, `?unread=1`, day sections, live prepends); `features/wishlist` (`/wishlist` + `/wishlist/:id` on one route via `core/routing/optional-param.matcher.ts`: `WishlistStore` with plan usage of `wishlist.items.max`, filters All / With matches / Paused, `WishCardComponent` (card art, printing or "Any printing", criteria chips, private note, alerts switch `PATCH {active}`, edit, remove with confirmation), `MatchReadinessComponent`; `WishlistMatchesStore` + side-sheet matches drawer (`GET /wishlist/{id}/matches` cursor pages, live matches for the open wish, collector approximate place + distance bucket + rating, listing chips/price/freshness, Message via `ConversationStarterService`, View binder, On the map, optimistic dismiss)); `shared/wishlist` (lazy add/edit dialog opened by `WishlistActions`: `/cards/suggest` → printing or any printing, minimum condition / edition / language / rarity from the `GameSchema`, max price + currency, radius slider bounded by `map.radius.max_km` from `GET /me/plan`, trade preference, private notes; inline 409, 429 `LIMIT_REACHED` inline + limit dialog, 400 field errors); "Add to wishlist" enabled on card detail (with `?printing=`), card holders view and the map holders panel; collector page "Looking for" section (`GET /collectors/{handle}/wishlist`, 404 hides it). Generated `@orenji/api-client` only, no new dependency. Tests: Vitest units (notification kinds, `NotificationCenter`, bell, feed store + day groups, optional-param matcher, wishlist labels and form, `WishlistActions`, `WishlistStore`, `WishlistMatchesStore`, wish card; realtime spec extended) — 392 web unit tests / 79 files; Playwright `e2e/wishlist.spec.ts` (2: A adds a wish through the dialog, the identical one is refused inline 409; B lists the card nearby → A's bell badge and match count rise live, the bell entry opens `/wishlist/<id>` with B's approximate place, distance bucket and price, a second copy arrives live and is dismissed, A messages B from the match, `/notifications` unread filter + mark all read, public wishlist on A's profile, every JSON lat/lng ≤ 3 decimals; a full FREE wishlist pauses alerts, filters, shows the trading-area hint and the `wishlist.items.max` limit dialog); `catalog.spec.ts` now opens the dialog instead of the old disabled button. Verifier fix (stage 7): `e2e/settings.spec.ts` reads response bodies through the bounded `watchCoordinates` helper (an unbounded `Promise.all` over response bodies hung once under full-suite load). Debt/limits: matching only works for wishers who are discoverable with a trading area (stored public points; the page explains it); no web push registration (no FCM locally)
- [x] Mobile wishlist UI and notification list — stage M4 (2026-10-05): the Wishlist tab (wishes with the API's criteria, radius bounded by the plan, plan usage, filters, alerts switch, edit, remove), the matches of a wish (card picture, price, distance bucket only, Message, profile, map, dismiss), "Add to wishlist" on the card detail, the bell with a live unread badge in every tab header and the notification centre (day sections, All / Unread, mark read / all, a deep link or an explanation per notification kind). Device push stays deferred (EAS project and real FCM needed): in-app and realtime only. See "Mobile app (stage M4)"
- [x] Tests: matching, dedup, rate limit, preferences respected — WishlistIT, WishlistMatchingIT, NotificationCentreIT, NotificationPreferencesIT, NotificationLimitIT, NotificationRealtimeIT, ActivityNotificationsIT, PushDeliveryIT + unit WishlistRulesTest, NotificationRulesTest, PushAndEmailProvidersTest; extended GeoPrivacyContractTest `wishlistAndNotificationResponsesOnlyCarryPublicPoints` (wishlist items carry no point, match markers are stored public points ≤ 3 decimals with a bucket, public summary and notifications free of coordinates/private notes, logs clean), AnalyticsIT, SeedDataRunnerIT, OpenApiExportTest; web flow tests: Playwright `wishlist.spec.ts` (2, stage 7); mobile (stage M4): jest (`features/wishlist`, `features/notifications`, `screens/wishlist`, `screens/notifications`, `app/tabs-layout`), Playwright `wishlist.spec.ts` (1), Maestro `wishlist-match-notification.yaml`

## Phase 7 — Ratings + Collector Reporting + Admin

_Backend complete (workflow `web-mvp-local-continue` stage 7, independently re-verified: 598 API tests / 108 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (155 paths, previously 117; every contract route present; no path, operation or schema lost; 65 schemas added; changed existing schemas only additively: `ProblemDetail.errorCode` values, `ModerationFlag` reason `REPORT_THRESHOLD`, `AdminUserDetail.bannedAt`, `DelistPolicyResponse`/`UpdateDelistPolicyRequest.unansweredAfterHours`, `DelistJobResponse`); clients regenerated (new `AdminAnalyticsService`, `AdminBindersService`, `AdminConsoleService`, `AdminListingsService`, `AdminNotificationsService`, `AdminRatingsService`, `AdminReportsService`, `ListingHealthService`, `RatingsService`, `ReportsService`); live check on `.local-dev/api-snapshots/api-phase7.jar` (= `api-latest.jar`) with emulator tokens: V060–V063 applied, `/public/report-reasons` anonymous 200 in dialog order, collector1's ratings summary 4.5 from 2 seeded ratings, collector1 → collector2 eligibility (TRADE already rated, CONVERSATION_QUALIFIED open), `/me/reports` 200, admin reports as MODERATOR 200, dashboard 403 for MODERATOR / 200 for ADMIN, system health UP with db/redis, stale listings 200, self report 422 `CANNOT_REPORT_SELF`, anonymous admin reports 401; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V060–V063 (range V060–V069). Web report dialog, My reports, ratings/references, paused-listings banner and admin console sections complete (workflow `web-mvp-local-continue` stage 8, independently re-verified: 441 web unit tests / 92 files, lint + format clean, production build 873.25 kB initial with no warnings, 42/42 Playwright specs against `.local-dev/api-snapshots/api-phase8.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 7 contract"; the contract document itself is not edited): dotted audit action names besides `REPORT_RESOLVED`; the pause and strikes share `user_responsiveness` (+ `paused_at`, `pause_source`, `pause_reason`, `paused_by`, `strikes_reset_at`, `evaluated_at`) and `delist_policy.unanswered_after_hours` (72) is new policy data; a paused collector stays on the map (only listings hidden); ban mark `user_account.banned_at` (cleared by unsuspend); report decisions require `note`, `suspendUntil` carries the optional end, SUSPENDED/BANNED need ADMIN, DISMISSED needs NONE; references reuse 403 `RATING_NOT_ELIGIBLE` and answer 409 `CONFLICT` for a second one; additive routes `GET /admin/ratings`, `PUT /ratings/{id}`, `GET /admin/users/{id}/listing-status`, `GET /me/listings/status`, `POST /me/listings/resume`, `POST /admin/listings/{itemId}/hide`, `POST/DELETE /admin/moderation/rules`, `/admin/references/{id}/hide|unhide`, `?assignedTo=`; `GET /collectors/{handle}/ratings` answers `{items, nextCursor, hasMore, summary}`; dashboard `openDisputes`/`webhookFailures24h` are 0 until Phase 9._

- [x] Ratings (overall, communication, condition accuracy, shipping, meetup) with eligibility check — `apps/api/.../ratings`: migration V060 (`interaction` unique `(kind, subject_id)` with the pair in PostgreSQL uuid order, `rating` unique `(interaction_id, rater_id)` with `moderation_state`, `rating_summary`, `reference`); `InteractionService.record(kind, userA, userB, subjectType, subjectId)` (idempotent; the API Phase 8 calls for OFFER_ACCEPTED/TRADE), `ConversationQualificationListener` (`@ApplicationModuleListener` on `MessageSent`: CONVERSATION_QUALIFIED once both sides sent ≥ 3 messages, deleted/SYSTEM messages not counted, only counts leave messaging); `RatingService` (`GET /ratings/eligibility?userId=`, `POST /ratings` 201 / 403 `RATING_NOT_ELIGIBLE` / 409 `ALREADY_RATED`, `PUT /ratings/{id}` within 14 days else 409 `RATING_EDIT_WINDOW_CLOSED`, comments through the PROFILE banned-term rules, `rating_summary` refreshed on every write/hide/unhide, RATING_RECEIVED notification without the comment); `GET /collectors/{handle}/ratings` (cursor page + summary, HIDDEN ratings neither listed nor counted, 404 when the profile is hidden from the caller via new `CollectorProfileService.requireVisibleCollector`); the profiles `RatingSummaryProvider` is now real (profiles, previews, markers; batch `ratingsOf` read once per page by `MarkerAssembler` for the nearby ranking); `RatingSubmitted` → analytics `rating_submitted` (kind, score, comment flag, ratee hash); export + deletion (summaries refreshed); `RatingSeedContributor` (qualified collector1–collector2 conversation left unrated, a completed trade and an accepted offer on reserved Phase 8 ids, three ratings, one reference; collector1 4.5 from 2) — tests RatingEligibilityIT (5), RatingRulesTest (5), AnalyticsIT `phase7RatingAndReportEventsCarryNoIdsOrText`, SeedDataRunnerIT `seedsRatingsAReferenceAndAnOpenReport`. Web (stage 8): `features/collectors/ratings` (`CollectorRatingsStore`: summary + cursor pages of 5, references, `GET /ratings/eligibility?userId=`; `CollectorRatingsSectionComponent` with per-criterion bars, own-rating Edit while `editableUntil`, "Rate this collector" only with an unrated interaction, otherwise an explanatory hint; `?tab=ratings` scrolls there) and `shared/ratings` (`RateCollectorDialogComponent`: interaction picker, required overall, optional criteria, comment ≤ 600, `POST /ratings` / `PUT /ratings/{id}`, 403/409/banned terms inline; keyboard `StarRatingInputComponent`; `RatingActionsService`); "Rate <name>" in the conversation menu when eligible — Vitest (rating labels, dialog, star input, ratings section), Playwright `rating.spec.ts` (1)
- [x] References; duplicate prevention; admin moderation — `ReferenceService` (`POST /references` ≤ 400 chars, banned terms refused, needs an interaction (403 `RATING_NOT_ELIGIBLE`), 409 for a second reference; `GET /collectors/{handle}/references` cursor list); `AdminRatingController` (`GET /admin/ratings?rateeId=&raterId=&state=`, `POST /admin/ratings/{id}/hide {reason}` / `unhide`, `POST /admin/references/{id}/hide` / `unhide`; MODERATOR+, 409 when already (un)hidden, audited `rating.hide`/`rating.unhide`/`reference.hide`/`reference.unhide`, summary refreshed) — tests RatingEligibilityIT `referencesNeedAnInteractionAndAreUniquePerAuthor`, `moderatorsHideAndUnhideRatings`. Web (stage 8): `WriteReferenceDialogComponent` (≤ 400, `POST /references`) on the collector page after any interaction; Admin → Ratings (`features/admin/ratings`: visible / hidden, one collector, Hide with a reason, Restore) — Playwright `rating.spec.ts` writes a reference
- [x] Collector report modal (reasons list), lifecycle OPEN → UNDER_REVIEW → ACTIONED/DISMISSED — backend: `apps/api/.../reports`: migration V061 (`collector_report` with the partial unique open pair, `moderator_note`, `moderation_rule` kind REPORT_THRESHOLD + scope REPORT with seed rules RATE_LIMIT `5/86400` and REPORT_THRESHOLD `3/604800`, `moderation_flag` reason REPORT_THRESHOLD, `user_account.banned_at`); `CollectorReportService` (`GET /public/report-reasons` in dialog order, `POST /reports/collectors` 201 with context validation PROFILE/CONVERSATION/POST/BINDER, 409 `REPORT_ALREADY_OPEN`, 422 `CANNOT_REPORT_SELF`, 404 unknown collector, 429 beyond the REPORT rate rule, `Idempotency-Key` repeats the original answer for 24 h through Redis; `GET /me/reports` status only); `ReportThresholdService` + `ReportThresholdListener` on `CollectorReported` (≥ 3 distinct reporters of open reports within 7 days → one `moderation_flag` + listing pause source REPORT_THRESHOLD pending review, audited as SYSTEM, never a suspension or ban); `AdminReportService` (`GET /admin/reports?status=&reason=&reportedUserId=&assignedTo=&page=&size=`, `GET /admin/reports/{id}` with reporter, reported collector, context, `moderatorNotes`, `ModerationHistoryService` history and, only when the context names a conversation, that conversation's latest 50 messages audited `report.conversation.view`; `assign` OPEN → UNDER_REVIEW, `notes`, `resolve` ACTIONED with WARNING / LISTINGS_PAUSED / SUSPENDED / BANNED or DISMISSED with NONE, audited `REPORT_RESOLVED` in the same transaction, REPORT_DECISION to the reporter without specifics, threshold flags resolved and review pause lifted when no report stays open); `GET /admin/users/{id}/history`; `CollectorReported` → analytics `collector_reported` (reason and context source only); export + deletion (free text of decided reports erased); `ReportSeedContributor` (one OPEN SPAM report collector4 → collector6) — tests ReportFlowIT (4), ReportThresholdIT (2), ReportRulesTest (3). Web (stage 8): `apps/web-angular/src/app/shared/reports` (`ReportActionsService` → `ReportCollectorDialogComponent`: reasons of `GET /public/report-reasons` as radio buttons in server order (cached, retry), optional details ≤ 1000, Confirm disabled until a reason is chosen, `Idempotency-Key` fixed per dialog, context PROFILE / CONVERSATION / POST / BINDER, inline 409 `REPORT_ALREADY_OPEN` / 422 `CANNOT_REPORT_SELF` / 404 / 429 / 400 via `report-errors.ts`, "Report sent" confirmation) opened from the collector profile, the map preview (signed in), the conversation menu, the community post menu and the public binder owner card; Settings → My reports (`features/settings/reports`, `GET /me/reports`, status only; REPORT_DECISION links there); Admin → Reports (`features/admin/reports`: filters in the URL, detail with reporter/reported cards, context, the reported conversation only when present, history, moderator notes, Assign to me, resolve dialog with action / required note / notify reporter, SUSPENDED (optional end) and BANNED for admins only) — Vitest (report labels, report dialog, resolve dialog, My reports, map preview Report button), Playwright `reporting.spec.ts` (2)
- [x] Audit log on every admin/moderator action — every Phase 7 admin write goes through `AuditService.record` in the same transaction: `REPORT_RESOLVED`, `report.assign`, `report.note`, `report.conversation.view`, `rating.hide`/`unhide`, `reference.hide`/`unhide`, `listings.pause`/`resume`, `listing.restore`, `listing.hide`, `binder.unpublish`, `moderation.rule.create/update/delete`, `notification.broadcast`, `user.suspend`, `user.ban`, delist policy edits (earlier phases already audit user, catalog, rules and community writes) — tests ReportFlowIT, DelistingAdminIT, RatingEligibilityIT, AdminAuthorizationIT `superAdminsBroadcastToStaffAndTheBroadcastIsAudited`, AuditIT
- [x] Auto-delist policies (configurable table) + scheduler + warnings + restore — built early with Phase 3: `delist_policy` (V020), `GET/PUT /admin/delist-policies` (audited), hourly freshness job with WARNED/HIDDEN/RESTORED events — tests FreshnessJobIT, AdminDelistPolicyIT. Warning notifications done with Phase 6 (BINDER_STALE_WARNING, BINDER_HIDDEN; ActivityNotificationsIT). Strikes and pauses done with Phase 7 (`apps/api/.../delisting`): migration V062 (`user_responsiveness` strikes + pause columns, `delist_policy.unanswered_after_hours` = 72); `ListingPauseRules.NOT_PAUSED` joined into `binders/PublicVisibilityRules.OWNER_LISTINGS_PUBLIC` (items `LISTED`, `binderEffectivelyPublic`: every public read, map listing counts, search, card holders and wishlist matching ignore a paused collector's listings, the collector stays on the map); `ListingPauseService` + `ListingsPaused`/`ListingsResumed` events (inventory reconciles, SYSTEM notice without the reason); `ResponsivenessSource` SPI implemented by messaging (`MessagingResponsivenessSource`, blocked pairs excluded); nightly `DelistJob` (`POST /internal/jobs/delist` service auth + daily `@Scheduled` under `local`): unanswered conversations 30 d, strikes since the last resume, pause (source UNRESPONSIVE) at `max_strikes` (3) when something is public, timed pauses expire; `GET /me/listings/status`, `POST /me/listings/resume` (UNRESPONSIVE pauses only, strikes reset); admin `GET /admin/listings/stale?state=STALE|HIDDEN` (`StaleListing {item, owner, confirmedAt, state, warnedAt}`, never private notes), `POST /admin/listings/{itemId}/restore` / `hide`, `POST /admin/users/{id}/pause-listings` / `resume-listings`, `GET /admin/users/{id}/listing-status` — tests StrikesIT (2), DelistingAdminIT (3), StrikeRulesTest (4). Web (stage 8): owner's paused-listings banner on `/inventory` (`features/inventory/listing-status`: `GET /me/listings/status`, Resume with confirmation for UNRESPONSIVE pauses via `POST /me/listings/resume`, "under review" wording otherwise, strike reminder); Admin → Listings (`features/admin/listings`: STALE / HIDDEN review queue + search by card, game, freshness and owner; Restore, Hide with a reason), Admin → Auto-delist rules (`features/admin/delist`: policy editor with a live freshness timeline and the API's ordering rules checked inline, `unansweredAfterHours`, `maxStrikes`), user detail listing status with Pause (reason, optional end) / Resume and moderation history (`user-moderation-panel.component.ts`) — Vitest (paused banner, delist-policy validation), Playwright `admin-moderation.spec.ts` (hide a listing with a reason, pause → owner sees the banner without a Resume button → admin resume, delist editor validation without saving, audit entries). Restoring a STALE listing from the web review queue is covered end to end since the final verification (acceptance `stale-listings.spec.ts`: backdated confirmation → freshness job → Restore → audited; the former debt)
- [-] Admin console `/admin` (dashboard, users, listings, binders, games, cards, community, reports, moderation, transactions, disputes, payments, ratings, ads, subscriptions, usage limits, credits, notifications, analytics, auto-delist rules, feature flags, audit logs, system health) — Phase 7 API done: `GET /admin/dashboard` (`AdminConsoleService`: accounts, active collectors 7 d, public items/binders, open/unassigned reports, open flags, stale/hidden listings, paused owners, failed notifications 24 h; disputes/webhooks 0 until Phase 9), `GET /admin/system/health` (actuator components without details, outbox backlog, notifications waiting, last runs/failures of every job via `jobs/JobRunSummaries`), `GET /admin/listings?query=&state=&game=&ownerId=` (`AdminListingService`), `GET /admin/binders` + `POST /admin/binders/{id}/unpublish` (`AdminBinderService`), `GET/POST/PUT/DELETE /admin/moderation/rules` (`ModerationRuleService`: MODERATOR reads, ADMIN writes, kind/scope combinations and patterns validated, caches dropped after commit), `GET /admin/notifications/stats` + `POST /admin/notifications/broadcast` (SUPER_ADMIN, ALL/STAFF, dedup per user, audited), `GET /admin/analytics/summary` (local aggregate `analytics_daily_count`, migration V063, `JdbcAnalyticsAggregate`; a BigQuery reader is deferred cloud work); RBAC `SecurityConfig.MODERATOR_PATTERNS` adds `/admin/reports/**`, `/admin/ratings/**`, `/admin/references/**` — tests AdminAuthorizationIT (role matrix over every admin route), DashboardIT (2). Web Phase 7 sections done (stage 8, `apps/web-angular/src/app/features/admin`): nav enables Dashboard (admin tiles from `GET /admin/dashboard` with quick links; moderators get report/flag counts since the endpoint is admin-only), Reports, Moderation (rules editor read-only for moderators, flags queue), Ratings, Listings, Binders (Unpublish with a reason), Notifications (stats; broadcast for SUPER_ADMIN only), Analytics, Auto-delist rules, System health; moderators see only Dashboard, Community, Reports, Moderation, Ratings; every write asks for a confirmation or reason, ends with "The action is in the audit log." and has an Audit logs label — Vitest (dashboard tiles, analytics summary, moderation rule labels, resolve dialog, delist validation), Playwright `admin-moderation.spec.ts` (1), `reporting.spec.ts`. Phase 9 API adds transactions (+ pending shipment / confirmation), disputes, payments + refund, webhooks and payment settings (see Phase 9); the dashboard's `openDisputes` / `webhookFailures24h` are now real (stage 9 live check: 1 / 1 after the seeded dispute and a refused webhook; DashboardIT only asserts they are present). Pending: web transactions/disputes/payments sections (stage 10), ads/subscriptions/credits sections (Phase 10); admin user entitlements and plan editing UI (carry-over)
- [x] Web report dialog, ratings/references UI and admin console sections — stage 8 (see the rows above; generated `@orenji/api-client` only, no client change needed; notification kinds RATING_RECEIVED, REPORT_DECISION → `/settings/reports`, SYSTEM LISTINGS_PAUSED → `/inventory`, MODERATION_WARNING added in `core/notifications/notification-kinds.ts`); public chat moderation stays in Admin → Community. Mobile: stage M5 (next row)
- [x] Mobile report dialog, My reports, ratings and references — stage M5 (2026-10-05, branch `feature/mobile-m5`, builder done, verification pending): "Report collector" (`app/report.tsx`: the API's reasons in order, details ≤ 1000, `Idempotency-Key`, 409 / 422 / 404 / 429 / 400 explained, the confirmation) from profiles, the map preview (PROFILE), conversations (CONVERSATION), community posts (POST) and public binders (BINDER); Settings → My reports (statuses only; REPORT_DECISION opens it); rating a collector after an eligible interaction (`app/ratings/rate.tsx`: the interaction, overall + communication / card condition / shipping / meetup reliability, comment ≤ 600, the own rating edited within 14 days) from profiles, conversations and completed trades; one reference per collector (`app/ratings/reference.tsx`, ≤ 400, banned terms explained); the profile's ratings and references with the API's cursor pages, the interaction kind and criteria of each rating, and why rating is not possible yet; RATING_RECEIVED opens the own profile at the ratings. Admin and moderator consoles stay web-only. See "Mobile app (stage M5)"
- [x] Tests: rating eligibility, report flow, admin RBAC, audit generation, delist state machine — RatingEligibilityIT, ReportFlowIT, ReportThresholdIT, AdminAuthorizationIT, DelistingAdminIT, StrikesIT, DashboardIT + unit RatingRulesTest, ReportRulesTest, ModerationRuleValidationTest, StrikeRulesTest; extended GeoPrivacyContractTest `ratingsReportsAndAdminConsoleResponsesNeverCarryCoordinates` (ratings, references, eligibility, `/me/reports`, `/me/listings/status`, report reasons and every new admin console response incl. report detail with history; logs clean), AnalyticsIT, SeedDataRunnerIT, OpenApiExportTest; web flow tests (stage 8): Playwright `reporting.spec.ts` (2), `rating.spec.ts` (1), `admin-moderation.spec.ts` (1), `messaging.spec.ts`/`community.spec.ts` now expect "Report collector" enabled, all asserting every JSON lat/lng ≤ 3 decimals; mobile (stage M5): jest (`features/reportsRatings`, `screens/reports`, `screens/ratings`, the report and rate entry points in `screens/{collector,conversation,map,binders,community-channel}`), Playwright `reports.spec.ts` (2) and the rating part of `offers.spec.ts`, Maestro `report-collector.yaml` and `offer-trade-rating.yaml`. Debt: blocks still not joined into the Phase 4 discovery SQL; binder names/descriptions and public notes still not checked by `TextModerationService` (Phase 3 debt); open STOMP sessions of accounts suspended through a report decision stay open (REST refused)

## Phase 8 — Offers + Trade Workflow

_Backend complete (workflow `web-mvp-local-continue` stage 8, independently re-verified: 631 API tests / 116 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (168 paths, previously 155; every contract route present; no path, operation or schema lost; 24 schemas added; existing schemas changed only additively: `NotificationResponse.type` gains `OFFER_CANCELLED`/`OFFER_EXPIRED`, `ProblemDetail.errorCode` gains `OFFERS_NOT_ACCEPTED`, `OFFER_ALREADY_OPEN`, `STALE_OFFER`, `NOT_YOUR_TURN`, `INVALID_STATE_TRANSITION`, `ITEM_UNAVAILABLE`, `TRADING_BLOCKED`, `SendMessageRequest` descriptions); clients regenerated (new `OffersService`, `TradesService`); live check on `.local-dev/api-snapshots/api-phase8.jar` (= `api-latest.jar`) with emulator tokens: V070/V071 applied, 15 seed contributors, collector1's seller inbox (seeded OPEN offer on its turn + two ACCEPTED), offer detail with `allowedActions` ACCEPT/COUNTER/DECLINE, a stranger 404, trades COMPLETED with `nextAction` NONE, `/me/settings/offers`, accepting the superseded seeded offer 409 `STALE_OFFER` with `latestOfferId`, anonymous 401; parties carry only a region label and a distance bucket; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V070–V071 (range V070–V079). Web Phase 8 complete (workflow `web-mvp-local-continue` stage 9, independently re-verified: 485 web unit tests / 102 files + 44/44 Playwright specs against the real local stack on `api-phase9.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 8 contract"; the contract document itself is not edited): `parent_offer_id` is the answered proposal with an additive `root_offer_id` and `superseded_by` (the live proposal is the row without it); `accepts_mixed` lives in the offers module (`offer_preferences`, `GET/PUT /me/settings/offers`); kinds must also fit the card's availability; responses list `tradeItems [{inventoryItemId, quantity, item}]` and add `rootOfferId`, `latestOfferId`, `viewerRole`, `superseded`, `version`, `protectionRequested`, `allowedActions`, `tradeId`; `version` optional in action bodies; a counter-offer must change the deal (400); additive error codes; offers from blocked collectors 404; `meetup` needs both parties' marks and drops protection, `complete` is AGREED-only with both confirmations, `cancel` requires a reason; notifications add OFFER_CANCELLED/OFFER_EXPIRED and SYSTEM messages are posted for every offer transition and trade completion/cancellation._

- [x] Offers (cash/trade/mixed) lifecycle OPEN → COUNTERED → ACCEPTED → DECLINED/CANCELLED/EXPIRED with history — `apps/api/.../offers`: migration V070 (`offer` one row per proposal of a counter chain with `root_offer_id`, `parent_offer_id`, deferrable `superseded_by`, `current_turn`, optimistic `version`, `closed_at`, public `item_snapshot`, `protection_requested`; `offer_trade_item`; `offer_event` (snapshot, reason, seq); `offer_preferences`; partial unique `uq_offer_live_buyer_item` backing 409 `OFFER_ALREADY_OPEN`; unique `message.payload->>'systemKey'` making SYSTEM messages idempotent); `OfferService` (create: card effectively public and visible to the buyer, blocks → 404, 422 `OFFERS_NOT_ACCEPTED` for `acceptsOffers` false / NOT_AVAILABLE / COLLECTION_ONLY / kind not fitting the availability / MIXED without `acceptsMixed`, trade cards the buyer's own non-deleted items with enough copies, `offers.per_day` through `Limits` (429), `Idempotency-Key` (Redis, fail-open), `protectionRequested` needs a cash part and the `protectedPayments` flag; inbox `GET /offers?role=&status=&cursor=`; detail with the whole chain's history (VIEWED recorded once); counter / accept / decline / cancel; export + deletion (open trades block deletion, live negotiations withdrawn)); pure `OfferStateMachine` (409 `NOT_YOUR_TURN`, `INVALID_STATE_TRANSITION` with `currentStatus`, `STALE_OFFER` with `latestOfferId`/`currentVersion`, 403 seller cancel, 403 `TRADING_BLOCKED` under a block or with an inactive party); every transition appends an `offer_event` and publishes `OfferCreated`/`OfferUpdated` → `OfferActivityListener` (`@ApplicationModuleListener`) → `OfferActivity` (OFFER_RECEIVED / OFFER_COUNTERED / OFFER_DECLINED / new OFFER_CANCELLED to the other party, OFFER_ACCEPTED / new OFFER_EXPIRED to both; SYSTEM message with the offer link in the pair conversation through new `ConversationService.postSystemMessage`, deduplicated per key); acceptance opens the trade through the `AcceptedOfferHandler` extension point and records `InteractionService` OFFER_ACCEPTED; `POST /internal/jobs/offers-expire` (service auth, `job_run`) + hourly `OfferExpiryScheduler` under `local`; OFFER_LINK messages real (`OfferLinkResolver`); analytics `offer_created`, `offer_status_changed` (no amounts, ids or text); seed `OfferSeedContributor` (reserved `…9c00…0001`/`…0002` accepted, `…0003` OPEN on collector1's turn, `…0004`/`…0005` MIXED countered chain) — tests OfferStateMachineIT (4), OfferAuthorizationIT (6), OfferExpiryJobIT (2), OfferLimitIT (1), OfferStateMachineTest (4), OfferRulesTest (6), SeedDataRunnerIT `seedsOffersAndTradesOnTheReservedIds`. Debt: `Idempotency-Key` replay is fail-open when Redis is down
- [x] Trades: created from accepted offer, statuses, buyer/seller views — `apps/api/.../trades` (implements `AcceptedOfferHandler`): migration V071 (`trade` unique per offer with meetup/confirmation/cancel columns and `version`, `trade_event` with seq); `TradeService` (`GET /trades?role=&status=&cursor=`, `GET /trades/{id}` with `nextAction`, `allowedOperations`, timeline, `payment`/`dispute` null until Phase 9; `POST /trades/{id}/meetup` (both marks → `meetup`, protection dropped AWAITING_PAYMENT → AGREED), `complete` (AGREED only, both confirmations → COMPLETED, `InventoryService.reserveAndTransfer` lowers the seller's card by 1 and the buyer's trade cards by their quantities, last copy soft-deleted and unpublished, `interaction(TRADE)` → rating eligibility), `cancel` (reason required, AGREED / AWAITING_PAYMENT only)); accepting needs an unpromised copy (409 `ITEM_UNAVAILABLE`); `TradeUpdated` → `TradeActivity` (TRADE_UPDATE notifications, SYSTEM messages on completion/cancellation); analytics `trade_status_changed`; seed `TradeSeedContributor` (reserved `…9d00…0001` meetup COMPLETED, `…9d00…0002` COMPLETED) — tests TradeLifecycleIT (4), TradeRulesTest (3). Debt: receivers add received cards to their inventory themselves (`POST /inventory/items`; the web trade page links "Add to my inventory"); Phase 9 payment states (`/pay`, `/ship`, `/confirm-receipt`) built in stage 9 (see Phase 9)
- [x] Web offer UI — `apps/web-angular/src/app` (stage 9, generated `@orenji/api-client` only: `OffersService`, `TradesService`, `MessagingService`, `RatingsService`): `shared/offers` (offer/trade labels, `OfferTarget` view model + builders, `offer-form.ts` validation and create/counter bodies, `offer-problems.ts` error mapping, `MakeOfferButton` + `MakeOfferDialog` (only the kinds the card's availability and `acceptsOffers` allow: cash / trade / cash + cards; trade cards picked from the caller's own inventory incl. private cards with copy counts; note ≤ 500; expiry; `Idempotency-Key` fixed per dialog; inline 422 `OFFERS_NOT_ACCEPTED`, 409 `OFFER_ALREADY_OPEN` with a link to the open offer, 404/403/400; 429 through the limit dialog), trade card picker, reason dialog, `DealSummary`, `OfferPartyCard` (region label + distance bucket only), `StatusChip`, `OfferLinkCard`, `OfferLinkPicker`, `CursorList`, `OfferActionsService`); entry points on public binder cards, the collector page's public cards, card-holder results, the map's holders list and wishlist matches; `features/offers` (`/offers` inbox: Received / Sent tabs, status filter, cursor pages, "Your turn" badges, live reload on offer notifications; `/offers/:id`: card, deal side by side, both parties, full history timeline, Accept / Counter / Decline / Withdraw only from `allowedActions`, `version` always sent, 409 `STALE_OFFER` moves to `latestOfferId`, `NOT_YOUR_TURN` / `INVALID_STATE_TRANSITION` / `ITEM_UNAVAILABLE` re-read the offer, `TRADING_BLOCKED` explained, follows a counter live); `features/trades` (`/trades` list; `/trades/:id` with the next-action banner, both parties' meetup marks and confirmations, deal, timeline, Cancel with a required reason, "Rate <name>" and "Add to my inventory" (`/inventory?add=`) after completion); messaging renders OFFER_LINK and the API's SYSTEM offer messages as offer cards, composer "Share an offer", messages page links to Offers and Trades; Settings → Offers "Accept mixed offers" (`GET/PUT /me/settings/offers`); notification kinds OFFER_CANCELLED / OFFER_EXPIRED with offer/trade link fallbacks; account menu Offers and Trades; quantity stepper moved to `shared/ui/quantity-stepper` — Vitest (offer form, labels, problems, link card/picker, make-offer dialog, action bar, offer detail/inbox stores, trade detail store, notification kinds, message draft), Playwright `offers.spec.ts` (2: cash offer → 409 duplicate → shared in the composer → notification + SYSTEM/OFFER_LINK cards → refused unchanged counter → counter → accept from the inbox → meetup + both confirmations → COMPLETED, seller copies 2 → 1 → rating from the trade page; mixed offers off → inline 422, trade offer with two copies of a private card, stale answer 409 → live proposal, decline with a reason, withdraw, inbox status filter, stranger 404 page; every JSON lat/lng ≤ 3 decimals). Debt: the generated `ProblemDetail` does not declare the per-endpoint extensions `latestOfferId`, `offerId`, `currentStatus` (read defensively through `problemExtension()`)
- [x] Mobile offer and trade UI — stage M5 (2026-10-05, branch `feature/mobile-m5`, builder done, verification pending): "Make an offer" on public cards from public binders, profiles, the map preview's holders and wishlist matches (`app/offers/new.tsx`: only the kinds the availability allows, amount and currency, the buyer's own cards with copies, note, expiry, `Idempotency-Key`; 422 / 409 with the open offer / 404 / 400 / 429 `offers.per_day` explained), the offers inbox (`app/offers/index.tsx`: Received / Sent, All / Active / Accepted / Closed incl. EXPIRED, "N offers wait for your answer", cursor pages), one offer (`app/offers/[id].tsx`: whose turn, only `allowedActions`, accept after a confirmation, counter (`app/offers/counter.tsx`), decline / withdraw with an optional reason, the deal, both parties with a region label and a distance bucket only, the chain's history, follows a counter-offer live, 409 `STALE_OFFER` → latest proposal), offer settings, offer links in chat open the offer and "Share an offer" in the composer; trades (`app/trades/{index,[id]}.tsx`: both sides, the next move, meetup, confirm the exchange, cancel with a reason, timeline, received cards, rating once completed; protected trades explain that paying, shipping and disputes stay on the website until the Phase 9 stage). Offer and trade notifications open their screens. See "Mobile app (stage M5)"
- [x] Tests: state machine, authorization, audit history — OfferStateMachineIT, OfferAuthorizationIT, TradeLifecycleIT, OfferExpiryJobIT, OfferLimitIT + unit OfferStateMachineTest, OfferRulesTest, TradeRulesTest; extended GeoPrivacyContractTest `offersAndTradesNeverCarryCoordinatesOrPrivateNotes` (offer detail for both parties, inboxes, countered chain, trades, offer settings: public listings only, parties with a region label and no point, strangers 404, logs clean), AnalyticsIT `phase8OfferAndTradeEventsCarryNoAmountsIdsOrText`, SeedDataRunnerIT, OpenApiExportTest; web flow tests (stage 9): Playwright `offers.spec.ts` (2), `messaging.spec.ts` updated for the "Attach a card, binder, offer or photo" button; mobile (stage M5): jest (`features/offers`, `features/trades`, `screens/offers`, `screens/trades`, the offer entry points and "Share an offer" in `screens/{collector,map,binders,wishlist,conversation}`), Playwright `offers.spec.ts` (2), Maestro `offer-trade-rating.yaml`

## Phase 9 — Payments + Disputes (feature-flagged)

_Backend complete (workflow `web-mvp-local-continue` stage 9, independently re-verified: 661 API tests / 126 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (199 paths, previously 168; 227 operations, previously 195; 295 schemas, previously 257; every contract route present; no path, operation or schema lost; no duplicate operationIds; existing schemas changed only additively: `PaymentSummary`, `DisputeSummary`, `TradeResponse.shipment`, `TradeEvent` event values, `NotificationResponse.type` `DISPUTE_UPDATE`, `ProblemDetail.errorCode`); clients regenerated (new `PaymentsService`, `DisputesService`, `AdminPaymentsService`, `WebhooksService`); live check on `.local-dev/api-snapshots/api-phase9.jar` (= `api-latest.jar`) on the local stack with emulator tokens: V080/V081 applied, 16 seed contributors (new "payments"), anonymous `GET /me/seller-account` 401, collector1's fake payout account ACTIVE/ready, seeded protected trade `…9d00…0003` for collector8 SHIPPED/SECURED with `nextAction` CONFIRM_RECEIPT and CONFIRM_RECEIPT/OPEN_DISPUTE, seeded dispute `…9f00…0101` for collector5 OPEN (1 evidence, 2 messages), a stranger 404, a collector on `/admin/disputes` 403, a bad-signature webhook 400 `WEBHOOK_SIGNATURE_INVALID` stored IGNORED, admin dispute queue and dashboard `openDisputes` 1 / `webhookFailures24h` 1; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V080–V081 (range V080–V089). Flag `protectedPayments` (seeded on locally): member routes 404 `FEATURE_DISABLED` when off; admin routes stay available. Web payment/dispute flows and admin sections complete (workflow `web-mvp-local-continue` stage 10, independently re-verified: 537 web unit tests / 113 files, lint + format clean, production build 875.02 kB initial with no warnings, 46/46 Playwright specs against `.local-dev/api-snapshots/api-phase10.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 9 contract"; the contract document itself is not edited): adapter-friendly `PaymentProvider` signatures (+ `cancelPayment`, `PayoutRequest`, idempotency keys); the fake checkout adds `GET /payments/fake/{ref}` and the buyer's `POST /payments/fake/{ref}/confirm` (checkout URL = web path `/checkout/fake/<ref>`); webhook idempotency per `(provider, provider_event_id)`; additive columns and tables (`payment_refund`, `dispute_message`, `dispute_note`, `platform_settings` `payments.release_reminder_hours` / `payments.admin_refunds_enabled`); VIDEO evidence reserved (400); SPLIT or partial refunds followed by the payout end PARTIALLY_REFUNDED; FROZEN is an admin hold; additive error codes `SELLER_NOT_ONBOARDED`, `DISPUTE_WINDOW_CLOSED`, `EVIDENCE_LIMIT_REACHED`, `WEBHOOK_SIGNATURE_INVALID`; admin payment routes are not flag-gated._

- [x] `PaymentProvider` abstraction, `FakePaymentProvider`, Stripe Connect adapter skeleton — `apps/api/.../payments` (`domain/PaymentProvider`, `infra/PaymentProviderConfig` selects exactly one from `PAYMENT_PROVIDER`): `FakePaymentProvider` (default everywhere: no network, no money, instant ACTIVE onboarding, `fake_pi` refs, checkout URL `/checkout/fake/<ref>` (`FAKE_CHECKOUT_BASE_URL` prefix), idempotent payouts/refunds, synthetic webhooks signed `X-Fake-Signature` in the Stripe `t=…,v1=…` format with the local `FAKE_PAYMENTS_WEBHOOK_SECRET`); `StripeConnectProvider` (only with `PAYMENT_PROVIDER=stripe`; Connect Express accounts + account links, PaymentIntent with `transfer_group`, Transfer on release, Refunds, `Stripe-Signature` verification with a 5-minute tolerance; Spring `RestClient`, no SDK dependency; start-up fails without `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`; never required locally); seller payout accounts `GET /me/seller-account`, `POST /me/seller-account/onboarding` (`SellerAccountService`, return URL a web path) — migration V080 (`seller_account`, `platform_settings` with the `payments.*` rows) — tests FakePaymentProviderTest (3), StripeConnectProviderTest (5: signature verification with a test secret, event/account/form mapping, no network). Debt: the Stripe adapter is compile- and unit-tested only (no Stripe account; cloud/real-provider work deferred, docs/deployment/DEFERRED.md)
- [x] Protected transaction flow: secure payment → ship → confirm shipment → confirm receipt → payout — `ProtectedPaymentService` on the Phase 8 `trade` through the trades module's new `TradeProtection` extension point (fills `TradeResponse.payment` / `shipment` / `dispute`) and `TradeService.advance` / `recordProtectedEvent` / `completeProtected` / `cancelProtected` / `lockForPayment` (completion logic extracted into `finish()`, no rewrite): `POST /trades/{id}/pay` (buyer, AWAITING_PAYMENT, 409 `SELLER_NOT_ONBOARDED` until the seller is ACTIVE; fee `payments.platform_fee_percent`; open checkouts answered again, failed ones restarted) → webhook `payment.secured` → payment SECURED, trade PAID; `POST /trades/{id}/ship` (seller, optional carrier / tracking / notes; the dispute window starts); `POST /trades/{id}/confirm-receipt` (buyer) → RECEIVED → `releasePayout` → COMPLETED / PAID_OUT with inventory transfer and the TRADE interaction; `payment.failed` → FAILED (pay again restarts); a cancelled trade or agreed meetup cancels an unpaid checkout, a late `payment.secured` is refunded at once; `POST /internal/jobs/payments-auto-release` (service auth, `job_run`) + hourly `AutoReleaseScheduler` under `local` (buyer reminder `payments.release_reminder_hours` before the window end, releases only after the window without an open dispute, no-op while `payments.auto_release_enabled` is false); fake checkout `GET /payments/fake/{ref}` + buyer `POST /payments/fake/{ref}/confirm` and `POST /internal/fake-payments/{ref}/succeed|fail` through the regular webhook pipeline; money `numeric(12,2)` + currency, locks trade row then payment row, provider calls with idempotency keys, never card data, wording "payment protection"; PAYMENT_UPDATE / SHIPMENT_STATUS notifications (`PaymentActivity`), analytics `payment_status_changed` (event, status, provider; no amounts, ids or references); export section `payments`; seed `PaymentSeedContributor` (fake ACTIVE accounts for collector1/collector2, payments `…9f00…0001` SECURED + shipped and `…0002` SECURED with the payout frozen, protected trades `…9d00…0003` SHIPPED / `…0004` DISPUTED) — migration V080 (`payment` with `version`, `payment_event`, `payment_refund`) — tests ProtectedPaymentFlowIT (3: pay → ship → confirm → PAID_OUT with the full timeline; failed payment retried; secured after cancellation refunded), AutoReleaseJobIT (1), PaymentRulesTest (5), TradeRulesTest (4, PAY / SHIP / CONFIRM_RECEIPT / OPEN_DISPUTE), SeedDataRunnerIT
- [x] Dispute window, dispute entity, evidence model (extensible), admin dispute interface — `DisputeService`: `POST /trades/{id}/disputes` (buyer, PAID or SHIPPED within the window, 409 `DISPUTE_WINDOW_CLOSED`; payout frozen, trade DISPUTED), `GET /disputes/{id}` (parties + admins, 404 for anybody else; parties by handle and display name only), `POST /disputes/{id}/evidence` (JSON TEXT / TRACKING (https URL) or multipart IMAGE (re-encoded JPEG without metadata, ≤ 8 MB) / DOCUMENT (PDF ≤ 10 MB) through `ObjectStorage`; VIDEO reserved → 400; ≤ 10 per party → 409 `EVIDENCE_LIMIT_REACHED`), `GET /disputes/{id}/evidence/{evidenceId}/file` (`private, no-store`, CSP sandbox; never under `/public/media`), `POST /disputes/{id}/messages`; admin `PaymentAdminService` + `AdminDisputeController` / `AdminTransactionController` / `AdminPaymentController`: `GET /admin/transactions` (+ `/pending-shipment`, `/pending-confirmation`), `GET /admin/disputes[/{id}]` (both parties' Phase 7 moderation histories and rating summaries, internal notes, trade timeline, payment events, refunds, webhooks), `POST /admin/disputes/{id}/freeze|unfreeze|notes|resolve` (BUYER full refund → CANCELLED, SELLER payout → COMPLETED, SPLIT partial refund + payout minus the fee → COMPLETED), `GET /admin/payments[/{id}]`, `POST /admin/payments/{id}/refund` (SUPER_ADMIN, or ADMIN while `payments.admin_refunds_enabled`), `GET/PUT /admin/payments/settings` (SUPER_ADMIN writes); every admin write audited with the request id (`dispute.freeze` / `unfreeze` / `note` / `resolve`, `payment.refund`, `payments.settings.update`); DISPUTE_UPDATE notifications (new type), analytics `dispute_status_changed`; dashboard `openDisputes` / `webhookFailures24h` real (proven live, see above) — migration V081 (`shipment`, `dispute`, `dispute_evidence`, `dispute_event`, `dispute_message`, `dispute_note`) — tests DisputeFlowIT (3: open within the window, freeze, notes, resolve for the buyer with a refund and the audit trail; window closed, SPLIT payout; ten pieces of evidence per party), PaymentsAuthorizationIT (2), AdminAuthorizationIT (role matrix incl. Phase 9 routes), DashboardIT. Web dispute pages and admin sections: see the web item below (stage 10)
- [x] Webhooks: signature verification, idempotency, event history — `WebhookService` + `PaymentWebhookController` (`POST /api/v1/webhooks/payments/{provider}`, permitAll in `SecurityConfig`, only the active provider, 413 above 256 KB, rate limit 600/min per IP): signature verified (`WebhookSignatures`), bad signature → 400 `WEBHOOK_SIGNATURE_INVALID` and stored IGNORED, every verified event stored in `payment_webhook_event` and deduplicated by `(provider, provider_event_id)` (a retry answers 200 `duplicate: true`), applied after commit through `PaymentWebhookReceived` + `@ApplicationModuleListener`, failures marked FAILED and logged with the `payment.webhook.failed` marker; admin `GET /admin/payments/webhooks[/{id}]` — migration V080 (`payment_webhook_event` + `signature_valid`, `payment_id`) — tests WebhookIdempotencyIT (2), WebhookSignatureIT (2)
- [x] Tests: webhook idempotency, state transitions, refund path — WebhookIdempotencyIT, WebhookSignatureIT, ProtectedPaymentFlowIT, DisputeFlowIT, AutoReleaseJobIT, PaymentsAuthorizationIT, FeatureFlagOffIT (every payment route 404 `FEATURE_DISABLED` while the flag is off) + unit PaymentRulesTest, FakePaymentProviderTest, StripeConnectProviderTest, TradeRulesTest; extended GeoPrivacyContractTest `paymentsAndDisputesNeverCarryCoordinatesOrProviderAccounts` (protected trades for both parties, dispute for both parties, seller account, stranger 404, every admin transaction / dispute / payment / webhook / settings response; no coordinates, provider account ids or storage keys; logs clean), AdminAuthorizationIT, DashboardIT, SeedDataRunnerIT. Debt: AnalyticsIT does not yet exercise `payment_status_changed` / `dispute_status_changed` (payloads carry enum values only)
- [x] Web payment protection, shipping, dispute and admin payment UI — `apps/web-angular/src/app` (stage 10, generated `@orenji/api-client` only: `PaymentsService`, `DisputesService`, `AdminPaymentsService`, `TradesService`; wording always "payment protection", never "escrow" (unit + E2E checks); everything hidden while `protectedPayments` is off): `shared/payments` (payment labels and problem mapping, protection explainer, `SellerAccountService`, dispute overview / thread / timeline, evidence list and `EvidenceFilesService` loading photos/PDFs through the authenticated file route); offer dialog "Use payment protection" for cash and cash + cards offers (`protectionRequested`, "How it works" explainer, summary wording, counters keep the choice), protection chips on the offer page, trade page and trade list; Settings → Payouts `/settings/payouts` (`GET /me/seller-account`, "Set up payouts" → `POST /me/seller-account/onboarding`, return with `?onboarding=complete`, "Back to your trade" link); trade page (`features/trades`): five protected steps (accepted → payment secured → shipped → received or dispute → payout released), payment / shipment / dispute cards, timeline labels for every Phase 9 event, actions only from `allowedOperations` — Pay (409 `SELLER_NOT_ONBOARDED` explained), Mark as shipped dialog (carrier, tracking, notes), Confirm receipt, Open a dispute dialog (409 `DISPUTE_WINDOW_CLOSED` explained with the date), "Meet in person instead"; "Set up payouts" reminder for a seller awaiting payment; `features/checkout` `/checkout/fake/:ref` (local stand-in for the provider checkout with a "Local test payment" banner, Pay / "Simulate a failed payment", polls until the synthetic webhook lands, back to `/trades/:id?payment=secured|failed`); `features/disputes` `/disputes/:id` (parties only, not-found for anybody else; decision and refund summary, both sides' evidence, TEXT / TRACKING forms and IMAGE / PDF uploads validated and previewed locally counting down `evidenceLeft`, message thread, timeline, read-only while on hold or resolved); PAYMENT_UPDATE / SHIPMENT_STATUS / DISPUTE_UPDATE notification kinds refresh the trade and deep-link to it or the dispute; admin (`features/admin/payments`, `features/admin/disputes`, nav sections enabled): Transactions (all / pending shipment / pending confirmation), Disputes (queue, detail with both parties' rating summaries and moderation histories, internal notes, trade timeline, payment events, refunds, webhooks; hold / lift hold, notes, support messages, Resolve BUYER / SELLER / SPLIT with refund amount, note and a review step), Payments (list, detail, Refund only when `refundAllowed` with amount, reason and confirmation), Webhook events (payload on demand), Payment settings (SUPER_ADMIN edits after confirmation); every admin write ends with "The action is in the audit log."; audit labels for `dispute.*`, `payment.refund`, `payments.settings.update`; dashboard dispute/webhook tiles link to the queues. Tests: 52 new Vitest tests (485 → 537 / 113 files: labels, error wording, forms, stores, uploader, payout settings, payment card, dispute resolution and refund amounts, transaction rows, notification links); Playwright `e2e/payments.spec.ts` (2: a fresh seller sets up payouts, the buyer's protected offer is paid on the fake checkout, shipped with tracking, received and completed with the payout (amount minus fee) shown to both; a second protected trade is disputed with a photo and a message, a stranger gets not-found and a 404, an admin holds, notes and resolves it for the buyer with a refund, the payment shows the refund, the audit log shows `dispute.freeze` / `dispute.note` / `dispute.resolve`, the buyer sees the decision and the cancelled trade; every JSON lat/lng ≤ 3 decimals) — 46/46 Playwright specs green against `api-phase10.jar`, 0 skipped. Debt: the fake checkout polls up to ~45 s for the synthetic webhook; the generated `ProblemDetail` still lacks the Phase 8 extensions `latestOfferId` / `offerId` (read through `problemExtension()`; `currentStatus` is declared since Phase 10)
- [ ] Mobile payment/dispute UI — deferred by owner decision

## Phase 10 — Freemium + Credits + Ads + Donations

_Backend complete (workflow `web-mvp-local-continue` stage 10, independently re-verified: 704 API tests / 140 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (243 paths, previously 199; 276 operations, previously 227; 364 schemas, previously 295; every contract route present; no path, operation or schema lost; no duplicate operationIds; existing schemas changed only additively: `MyPlan.subscription`, `ProblemDetail` `currentStatus` / `subscriptionId` / `balance` / `cost` / `reason` and the error codes `ALREADY_SUBSCRIBED`, `INSUFFICIENT_CREDITS`, `REFERRAL_NOT_ALLOWED`, `NOT_IMPLEMENTED`); verifier fix: Jackson 3 `JsonNode` fields (webhook payloads, ledger and subscription event details) are documented as free-form objects by `OpenApiConfig` instead of a reflected, non-deterministic `JsonNode` bean schema, so two exports are byte-identical; clients regenerated (new `SubscriptionsService`, `CreditsService`, `AdsService`, `DonationsService`, `AdminBillingService`); live check on `.local-dev/api-snapshots/api-phase10.jar` (= `api-latest.jar`) on the local stack with emulator tokens: V090–V093 applied, 20 seed contributors, premium_user `GET /me/plan` PREMIUM with the ACTIVE fake subscription, collector1 credits 300 with `withdrawable`/`transferable` false and referral code `COLLECTOR1`, anonymous MAP_PANEL ads labelled "Sponsored", impression 204 and click 302 to the fictional `.example` landing, premium_user gets `[]`, supporters list without amounts, admin subscriptions 200 / collector 403, anonymous credits 401, mobile receipt 501 `NOT_IMPLEMENTED`, forged billing webhook 400 `WEBHOOK_SIGNATURE_INVALID`; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V090–V093 (range V090–V099). Flags: `premiumPlans` (checkout, on by default), `credits` (on by default), `advertising` and `donations` (off by default, switched on by the local seed); member routes answer 404 `FEATURE_DISABLED` while their flag is off, admin routes stay available, live subscriptions keep working whatever `premiumPlans` says. Web Premium checkout, credits, "Sponsored" placements, donations and the admin billing/credits/ads/donations sections complete (workflow `web-mvp-local-continue` stage 11, independently re-verified: 704 API tests / 140 classes still green on `./gradlew spotlessCheck build --rerun-tasks`, OpenAPI export unchanged (243 paths, 276 operations, 364 schemas; every contract route present), clients regenerated without changes, 578 web unit tests / 120 files, lint + format clean, production build 877.57 kB initial with no warnings, mobile typecheck/lint/29 tests and shared-types typecheck green, 51/51 Playwright specs against `.local-dev/api-snapshots/api-latest.jar` (rebuilt from this tree, same code as `api-phase10.jar`), 0 skipped; live curls: collector1 credits and referral code, anonymous MAP_PANEL ad labelled "Sponsored" with `Cache-Control: no-store`, premium_user `[]` and PREMIUM/ACTIVE plan, admin subscriptions 200 / collector 403, anonymous credits 401; log without ERROR lines, tokens, e-mail addresses or coordinates); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 10 contract"; the contract document itself is not edited): subscription state PENDING and additive columns plus `subscription_event` / `billing_webhook_event`; checkout answers `{subscription, url, clientSecret, resumed}`; fake checkout routes `GET /billing/fake/{ref}` + `POST /billing/fake/{ref}/confirm` (web path `/checkout/fake-billing/<ref>`); admin subscription detail and cancel; the plan follows `user_account.plan_code` + PREMIUM_USER instead of SUBSCRIPTION entitlements; `credit_ledger_entry` adds `balance_after` / `details` / `note` / `seq` and `credit_balance` is a plain view behind a Redis cache; `POST /me/credits/spend` takes a `credit_product` key; `GET /me/referrals` + `referral_redemption`; admin credit products and settings (`platform_settings` `credits.*`); prefixed ad tables (`ad_placement`, `ad_campaign`, `ad_creative`, `ad_targeting_rule`) with additive columns and `ad_campaign_daily`; impressions need the serve token body, clicks `?token=`; conversions through `POST /internal/ads/clicks/{clickId}/conversions`; donations add `GET /me/donations`, fake checkout and admin routes and `donations.*` settings, only the fake donation provider exists._

- [x] Plans, plan features, usage limits, usage counters, entitlements (DB-configurable) — built early in stage 2 (plan item 2). `billing` module, migration V011 (`plan`, `plan_feature`, `usage_limit`, `usage_counter`, `entitlement`; FREE and PREMIUM seeded with the contract limits; `user_account.plan_code` now a FK to `plan.code`). `Limits.check/consume/checkValue/overview` (atomic conditional upsert, Redis mirror written after commit), `LimitReachedException` → 429 LIMIT_REACHED (`limitKey`, `limit`, `used`, `resetsAt`, `planCode`, `upgradeUrl: "/premium"`), `Entitlements.has` + admin grant/revoke (audited, most generous active entitlement wins), `PlanService` Redis cache, `LimitUsageSource` SPI for TOTAL counts (e.g. `binders.max` in Phase 3). Endpoints `GET /plans` (public), `GET /me/plan`, `GET/PUT /admin/plans[/{code}]`, `GET/PUT /admin/usage-limits[/{id}]`, `GET/POST /admin/users/{id}/entitlements`, `DELETE /admin/users/{id}/entitlements/{entitlementId}` — tests LimitsIT (5), LimitRulesTest (4). Subscriptions, checkout, billing webhooks and `GET /admin/subscriptions` landed in stage 10 (next item)
- [x] Subscriptions + `BillingProvider` abstraction (fake by default, Stripe Billing skeleton) — `apps/api/.../billing` (stage 10): migration V090 (`subscription` with a one-live-per-account partial unique index, `subscription_event`, `billing_webhook_event`); `SubscriptionService` (checkout for paid active plans only, an open checkout of the same plan answered again, 409 `ALREADY_SUBSCRIBED` while entitled, cancel at the period end or at once, webhook events applied under a per-account advisory lock; an entitling subscription (TRIAL / ACTIVE / PAST_DUE) sets `user_account.plan_code` + PREMIUM_USER through the new `UserAccountService.applyPlan`, its end sets FREE and revokes the role; a payment for an abandoned checkout is cancelled at the provider); `BillingWebhookService` (signed `X-Fake-Signature` / `Stripe-Signature` in the Stripe format through the shared `common/webhooks/SignedWebhooks`, 400 `WEBHOOK_SIGNATURE_INVALID` stored IGNORED, deduplicated per provider event id, applied after commit via `BillingWebhookReceived` + `@ApplicationModuleListener`); `SubscriptionPeriodJob` `POST /internal/jobs/subscriptions-period` + hourly `SubscriptionPeriodScheduler` under `local` (period-end cancellations, fake renewals through a synthetic signed `subscription.renewed`, real-provider expiry after the 3-day grace); `FakeBillingProvider` (default, `fake_cs_…` checkouts at the web path `/checkout/fake-billing/<ref>`, `GET /billing/fake/{ref}` + `POST /billing/fake/{ref}/confirm`), `StripeBillingProvider` (only with `BILLING_PROVIDER=stripe`, Checkout Sessions in subscription mode, `RestClient`, no SDK); routes `POST /me/subscription/checkout|cancel`, `POST /me/subscription/mobile-receipt` (reserved, 501 `NOT_IMPLEMENTED`), `POST /webhooks/billing/{provider}` (600/min per IP, 413 above 256 KB), `GET /me/plan` with `subscription`, `GET /admin/subscriptions[/{id}]`, `POST /admin/subscriptions/{id}/cancel` (audited `subscription.cancel`); `Entitlements` gains `normaliseOverride`, `grantBySystem`, `latestActiveExpiry`; export section `subscriptions`, deletion stops renewals and the purge ends the live subscription; seed "subscriptions" (premium_user ACTIVE fake subscription `…a000…0001`) — tests SubscriptionFlowIT (5: fake checkout → PREMIUM with raised limits → cancel; failed checkout retried and immediate cancellation downgrades at once; webhooks verified, stored once, renewals extend the period; validation, authorization and the reserved mobile-receipt route; admins browse and cancel), Phase10FeatureFlagOffIT (2), FakeBillingProviderTest (1), StripeBillingProviderTest (4, test secret, no network). Debt: the Stripe Billing adapter is compile- and unit-tested only (no Stripe account; cloud/real-provider work deferred, docs/deployment/DEFERRED.md); App Store / Google Play receipt validation is reserved (501)
- [x] Limit-reached UX with upgrade prompt — API side done (429 LIMIT_REACHED with extensions, generated `ProblemDetail` carries them; Phase 3 consumes `binders.max` (BinderIT) and `binder.views.per_day` (PublicBinderIT)); web limit-reached dialog + interceptor + `/premium` built in stage 3 (`core/limits`, `features/premium`; Vitest units); stage 4 web E2E `inventory.spec.ts` hits the real `binders.max` limit from `/inventory` (dialog "5 of 5" + inline message); Phase 4 caps the map radius with `map.radius.max_km` (NearbyCollectorsIT, CardHoldersIT); the checkout API exists since stage 10 (SubscriptionFlowIT: the fake checkout raises the limits); stage 11 wires the web upgrade: the dialog's "See Premium" closes every open dialog (`core/limits/limit-reached-dialog.component.ts`) and lands on `/premium`, "Upgrade to Premium" → fake billing checkout → PREMIUM limits — web E2E `freemium.spec.ts` (a FREE collector at `binders.max` 5 of 5 → "See Premium" → upgrade, a simulated decline then payment → binders 5 / 50, the sixth binder created, no ads; "Cancel now" → FREE again)
- [x] Credit ledger (append-only) + derived balance — `apps/api/.../credits` (stage 10, backend): migration V091 (`credit_ledger_entry` with `balance_after` running sum, unique `idempotency_key`, trigger `credit_ledger_entry_append_only` refusing UPDATE / DELETE / TRUNCATE + REVOKE, view `credit_balance`, `credit_product` (3 products: `premium_search_day`, `binder_views_day`, `map_radius_day`), `referral_code`, `referral_redemption`, `platform_settings` `credits.*`); `CreditLedger` (appends under a per-account advisory lock, never negative, idempotent keys, Redis balance cache evicted after commit, spends always summed under the lock), `CreditProducts`, `CreditSettings`, `ReferralService` / `ReferralCodes`, `CreditReconciliationJob` `POST /internal/jobs/credits-reconcile` + hourly scheduler under `local` (repairs cached balances, reports ledger mismatches, never edits the ledger); routes `GET /me/credits` (`withdrawable: false`, `transferable: false`), `POST /me/credits/spend` (idempotent, stacked `CREDIT_PURCHASE` entitlement, 409 `INSUFFICIENT_CREDITS` / `CONFLICT`), `GET /me/referrals`, `POST /me/referrals/redeem` (409 `REFERRAL_NOT_ALLOWED` with `reason`), `POST /admin/credits/grant` (± amounts, never below 0, audited `credits.grant`), `GET /admin/credits/ledger|products|settings`, SUPER_ADMIN `PUT /admin/credits/products/{key}` / `PUT /admin/credits/settings` (audited); export section `credits`; seed "credits" (collector1 200 welcome credits + code `COLLECTOR1` redeemed by collector8, premium_user 500) — tests CreditLedgerIT (4: ledger append-only in the database, balance = sum with idempotent spends unlocking stacked entitlements, audited admin grants never below 0, spend validation and products edited by super admins), ReferralIT (2), ReferralCodesTest (2). Web `/credits` page and admin credits: stage 11 (see the web item below)
- [x] Ads framework (campaign, advertiser, placement, creative, impression, click, conversion, budget, targeting) with internal admin-managed campaigns; "Sponsored" labelling — `apps/api/.../ads` (stage 10, backend): migration V092 (`advertiser`, `ad_placement` (5 placements), `ad_campaign`, `ad_creative`, `ad_targeting_rule` GAME / REGION_LABEL / GEO_CELL / TAG / PLAN, `ad_impression` / `ad_click` / `ad_conversion` with a pseudonymous `user_hash` and `serve_id`, `ad_campaign_daily`); `AdProvider` + `InternalCampaignAdProvider` (targeting kinds AND / values OR, per-viewer daily frequency caps, `AdPacing` total / daily / intraday pacing, priority ranking, one creative per campaign; slot for a future external network adapter); `AdService` (flag `advertising` + `ads.enabled` entitlement → `[]`; `AdContext` from public values only: requested game / grid cell, `LocationService.publicLocationOf` grid cell and region label, `ProfileService.publicPartsOf` games and tags, plan; viewer hash through the analytics `ActorHasher`); `AdToken` HMAC serve tokens (`ADS_TOKEN_SECRET`, development default refused outside local/test/dev) with one impression and one click per serve; routes `GET /ads` (`Cache-Control: no-store`, every ad `sponsored: true`, `label: "Sponsored"`), `POST /ads/{id}/impression` (204), `GET /ads/{id}/click` (302), `/admin/ads/**` CRUD + `GET /admin/ads/campaigns/{id}/stats` (validated: https URLs or site paths, no coordinates; every write audited `ads.*`), `POST /internal/ads/clicks/{clickId}/conversions`; seed "ads" (fictional advertiser "Maple Sleeve Co." on a `.example` domain with two campaigns, house ad "OrenjiTrade Premium") — tests AdsTargetingIT (3: targeting uses the public point only, never the centre or `home_point`; the ads module never reads private location data (source scan); PREMIUM and `ads.enabled` hide ads and PLAN rules split audiences), AdsDeliveryIT (3: impressions and clicks once per serve spending the budget; frequency caps; admin validation keeps coordinates out and writes are audited), TargetingTest (4), AdPacingTest (5), AdTokenTest (2), AdsConfigTest (1), Phase10FeatureFlagOffIT `adsAnswerAnEmptyListAndRecordNothingWhileAdvertisingIsOff`. Debt: `ADS_TOKEN_SECRET` / `ADS_WEB_BASE_URL` not yet in Secret Manager/Terraform (deferred; `ADS_WEB_BASE_URL` defaults to `http://localhost:4200`); no external ad network adapter. Web "Sponsored" placements and admin ads UI: stage 11 (see the web item below)
- [x] Donations via provider abstraction — `apps/api/.../donations` (stage 10, backend): migration V093 (`donation`, `donation_webhook_event`, `platform_settings` `donations.*`); `DonationProvider` + `FakeDonationProvider` (default and only provider; `fake_dn_…` checkouts at `/checkout/fake-donation/<ref>`, synthetic signed `donation.succeeded` / `failed` / `refunded` webhooks, idempotent refunds), `DonationService`, `DonationWebhookService`, `DonationSettings`; routes `POST /donations/checkout` ("Voluntary support", amounts and currencies from settings), `GET /me/donations`, `GET /donations/fake/{ref}` + `POST .../confirm`, `POST /webhooks/donations/{provider}`, `GET /public/donations/supporters` (opt-in display names and month only, never amounts, notes or handles), `GET /admin/donations[/{id}]`, SUPER_ADMIN `POST /admin/donations/{id}/refund` (audited `donation.refund`) and `PUT /admin/donations/settings` (audited); nothing in ratings, ranking or trust reads donations; export section `donations`, the purge erases notes and public thanks; seed "donations" (collector2 25.00 CAD with public thanks, collector5 10.00 CAD without) — tests DonationIT (3: success path with the fake provider and opted-in thanks, failures + validation + signed idempotent webhooks, admin totals with refunds and settings for super admins only; donations never touch ratings or interactions). Debt: no Stripe Checkout donation adapter yet (any other `DONATION_PROVIDER` fails the start-up). Web `/support` page and admin donations: stage 11 (see the web item below)
- [x] Tests: limit enforcement, entitlement override, ledger integrity — LimitsIT (429 with extensions, admin edits apply at once, PREMIUM plan and entitlements override the FREE limits), LimitRulesTest, BinderViewLimitIT (FREE `binder.views.per_day`, PREMIUM and entitlements unlimited), SubscriptionFlowIT, CreditLedgerIT (append-only, balance = sum, idempotent spend), ReferralIT, AdsTargetingIT (never `home_point`), AdsDeliveryIT, DonationIT (fake success path), Phase10FeatureFlagOffIT + unit StripeBillingProviderTest, FakeBillingProviderTest, ReferralCodesTest, TargetingTest, AdPacingTest, AdTokenTest, AdsConfigTest; extended GeoPrivacyContractTest `subscriptionsCreditsAdsAndDonationsNeverCarryCoordinates` (plan, credits, referrals, donations, supporters, every placement anonymous and signed in, every admin subscription / credit / ad / donation response: ≤ 3 decimals, no private location keys, no provider subscription refs or user hashes, every ad labelled "Sponsored", logs free of coordinates), AdminAuthorizationIT (role matrix incl. Phase 10 routes), SeedDataRunnerIT, OpenApiExportTest. Debt: no analytics events for subscriptions, credits, ads or donations yet, and AnalyticsIT does not yet exercise the Phase 9 `payment_status_changed` / `dispute_status_changed` events
- [x] Web plans checkout, credits, ads ("Sponsored" placements), donations and admin billing/credits/ads/donations UI — `apps/web-angular/src/app` (stage 11, generated `@orenji/api-client` only: `PlansService`, `SubscriptionsService`, `CreditsService`, `AdsService`, `DonationsService`, `AdminBillingService`, `AdminPlansService`; member screens follow `premiumPlans` / `credits` / `advertising` / `donations` (hidden or guarded while off, 404 `FEATURE_DISABLED` explained), admin sections stay available; wording and refusals in `shared/billing/billing-labels.ts`): `features/premium` `/premium` (`PremiumStore`; plan comparison from `GET /plans`, "Upgrade to Premium" → `POST /me/subscription/checkout` (409 `ALREADY_SUBSCRIBED` explained; only local fake checkout paths or https provider pages followed), "Continue to checkout" for an open one, `SubscriptionCardComponent` (status, price, renews / ends on, PAST_DUE note, "Cancel at period end" / "Cancel now" / "Close the checkout", each confirmed), `UsageMetersComponent` from `GET /me/plan` incl. "Boosted" overrides, active boosts, credits teaser); `features/checkout` `/checkout/fake-billing/:ref` and `/checkout/fake-donation/:ref` (`ProviderCheckoutStore` + billing / donation stores, shared `FakeProviderCheckoutComponent`: "Local test payment" banner, Pay / "Simulate a failed payment", polls until the synthetic webhook lands, a declined subscription stays open with "Try again", success reloads the session → `/premium?checkout=success` or `/support?donation=thanks`); `features/credits` `/credits` (account menu; balance with the "never withdrawable or transferable" wording, products to unlock for a day, `SpendCreditsDialogComponent` with one idempotency key per dialog and 409 `INSUFFICIENT_CREDITS` with balance and cost, active boosts, referral card with copy / share and redeem (404 and each 409 `REFERRAL_NOT_ALLOWED` reason on the field), cursor-paged ledger); `shared/ads` (`SponsoredSlotComponent` on `GET /ads?placement=&game=`: nothing while `advertising` is off, for `[]` (Premium / entitlements) or on errors, waits for the session and reloads on sign-in or upgrade; `SponsoredAdComponent` always labelled "Sponsored" with "Remove ads" → `/premium`; `adClickHref` follows only the API click route or https, new tab, `rel="sponsored noopener"`; `AdImpressionDirective` + `AdTrackingService` record one impression per serve token once half visible) placed in `/search` results and card holders (SEARCH_SPONSORED), the map list panel (MAP_PANEL), the `/inventory` sidebar (INVENTORY_SIDEBAR) and other collectors' profiles (COLLECTOR_PROFILE); `features/support` `/support` (footer "Support OrenjiTrade" and account menu; "Voluntary support" that never changes ratings, ranking or trust; preset or custom amount, currency, private message, public-thanks opt-in, the API's range errors on the field; public supporters wall (names and month only) and own donations); admin `features/admin/billing` (sections Plans, Subscriptions, Credits, Ads, Donations enabled): Plans (SUPER_ADMIN edits name, description, price, currency, availability, order, feature switches), Subscriptions (list/filter, detail with history and webhooks, cancel at the period end or now with a reason), Credits (ledger of all or one account with its balance, grant/adjust dialog, credit products and referral rules for SUPER_ADMIN), Ads (advertisers, placements, campaigns with schedule, budgets, pricing, activate / pause / end, `TargetingEditorComponent` refusing coordinates, creatives with https-or-site-path URLs, delivery stats), Donations (totals per currency, detail, refund and accepted amounts for SUPER_ADMIN), user page Subscriptions / Credits links and an Entitlements panel (grant with optional end and note, revoke) — clears the stage 3 carry-over (admin entitlements and plan editing); every write confirmed and "The action is in the audit log."; audit labels for `subscription.cancel`, `credits.*`, `ads.*`, `donation.refund`, `donations.settings.update`. Tests: 41 new Vitest tests (537 → 578 / 120 files: billing labels and refusals, `PremiumStore` and usage rows, provider checkout stores (outcomes, retry after a decline, give-up), `CreditsStore` (paging, spend, insufficient balance, redeem), `SponsoredSlotComponent` (label, click route, one impression, `[]`, flag off, session wait, reload on upgrade), donation form, admin campaign form, targeting without coordinates, creative URLs, entitlement values, the limit dialog closing every dialog); Playwright `e2e/freemium.spec.ts` (1: `binders.max` → "See Premium" → fake billing checkout with a simulated decline then payment → PREMIUM limits, sixth binder, no ads → "Cancel now" → FREE) and `e2e/credits-ads.spec.ts` (4: a fresh collector redeems another's referral code (unknown code explained) and spends the credits on a 24 h unlock, the referrer earns 100; a signed-out visitor's MAP_PANEL "Sponsored" ad records an impression (204) and its click lands on the target, a FREE collector sees a sponsored search result and none once Premium; a donation through `/support` and the fake donation checkout shows the opted-in name among the supporters without amounts or messages; an admin grants credits, creates / edits / targets (coordinates refused) / ends a campaign with a creative, finds `credits.grant` and the campaign entries in the audit log and grants then revokes an entitlement that overrides `wishlist.items.max`); every JSON lat/lng ≤ 3 decimals; `admin-rules.spec.ts` now expects the upgrade button enabled — 51/51 Playwright specs green, 0 skipped. Debt: the admin plan editor, admin subscription cancel and donation refund / settings have no E2E coverage yet; there is no member route for the accepted donation amounts (presets are suggestions, the API's 400 carries the range); the fake checkouts poll up to ~45 s for the synthetic webhook; a Leaflet `_leaflet_pos` console error (zoom transition ending after the map is torn down) shows in the dev-server log during the E2E run without failing any spec
- [ ] Mobile premium/credits/donations UI — deferred by owner decision

## Local environment + web acceptance suite (stage 12, final verification)

_Workflow `web-mvp-local-continue` stage 12 (local tooling ∥ web acceptance suite) and the final
independent verification (2026-09-30): from a clean state (`npm run infra:reset -- --yes`),
`npm run test:all` passed (API 704 tests / 140 classes, 0 failures, 0 skipped · web lint + 579
Vitest tests / 120 files · mobile typecheck + lint + 29 jest tests · Playwright 67/67 against the
real local stack, 0 flaky, 0 skipped), `npm run infra:validate` passed (fmt + validate of dev,
staging, prod and Cloudflare; nothing planned or applied), `ng build` production bundle 877.57 kB
initial (900 kB warning budget), and `npm run dev` came up in 50.6 s (API ready 32.4 s, web 14.1 s)
for a manual walkthrough: 36/36 API steps with curl-style calls (sign-in, inventory, map, search,
messaging, wishlist match + notification, offer → counter → accept → trade, report → moderator
resolution → audit log, admin, Premium through the fake billing checkout and back to FREE; every
JSON response ≤ 3 decimals, no private location keys, no raw distances) and 28/28 UI checks in
Chromium (signed-in collector: map, inventory, search, cards, messages, wishlist, notifications,
offers, trades, community, premium, credits, support, collector profile, settings, legal; admin:
dashboard, users, reports, listings, audit log, subscriptions, disputes, system health; no API 5xx,
no coordinate with more than 3 decimals)._

- [x] One-command local stack — root `package.json` scripts backed by dependency-free Node scripts in `scripts/` (`scripts/lib/util.mjs` shared helpers, Windows/macOS/Linux): `npm run dev` (`docker compose up -d --build --wait` → `gradlew bootRun` with the `local` profile → readiness wait → `ng serve` → URL table; Ctrl+C stops the API and web, infrastructure keeps running; `--no-web`, `--skip-infra`; logs in `.local-dev/logs/`), `npm run api:dev`, `npm run web:dev`, `npm run infra:up` / `infra:down` (volumes kept), `npm run infra:reset` (confirmation or `-- --yes`; deletes only the `orenjitrade_*` volumes and `apps/api/.local-storage`, then brings the infrastructure back; the seed is re-applied at the next API start), `npm run infra:validate` (Terraform `fmt -check` + `init -backend=false` + `validate`, never plan/apply), `npm run test:api|web|mobile|e2e|all` (+ optional `test:ml` for the on-hold skeleton). `test:e2e` builds and runs a copy of the API jar on :8080 and `ng serve` on :4200, runs every Playwright spec with one retry and stops what it started (`--reuse-running` to use a running stack) — since 2026-10-04 on its own isolated stack (database `orenjitrade_e2e`, API :8180, web :4300; see "E2E isolation, test-data purge and 3 km zones")
- [x] Optional all-in-Docker stack — `docker compose --profile app up -d --build --wait` (API and web images on the same ports, `api-media` volume, fake/log providers, same database and emulator); Firebase emulator image pins `firebase-tools@14.27.0` and bakes the Emulator UI (offline resets); web `docker-entrypoint.sh` exports `AUTH_EMULATOR_ORIGIN` for the CSP; `.dockerignore` excludes `.local-dev`
- [x] Docs — `docs/development/local-setup.md` (prerequisites, first-time setup, everyday commands, URLs/ports, where data lives, reset and reseed, fake/log providers and where their output appears, troubleshooting, Windows notes), README quick start, `.env.example` (compose ports, fake provider secrets documented as local-only), `docs/deployment/DEFERRED.md` "Local replacement"
- [x] Web acceptance E2E suite — `apps/web-angular/e2e/acceptance/` (16 tests / 15 specs, README): registration, inventory, map, search, wishlist, messaging, offers, rating, reporting, freemium, privacy (the scanner catches planted leaks over HTTP and STOMP + a sweep of every geo surface), account deletion (grace period fast-forwarded, `/internal/jobs/account-deletion` with the service token, anonymised account, consents/audit kept), payment protection, community and (final verification) `stale-listings.spec.ts` (a listing's last confirmation backdated 44 days → `/internal/jobs/freshness` → STALE, never deleted → admin "Needs review" queue → Restore → ACTIVE → `listing.restore` in the audit log). Shared `support/` fixtures: the automatic ADR 0004 privacy scanner on every browser context and API shortcut (fails on lat/lng > 3 decimals, a stored trading-area centre or a raw numeric distance), `AcceptanceApi` seeding shortcuts with fresh fictional emulator accounts, staff demoted and binders unpublished afterwards, one latitude band per spec (`places.ts`). `E2E_REQUIRE_STACK=1` turns an unreachable stack into a failure; `.github/workflows/e2e.yml` runs the whole suite on pull requests touching apps/packages/compose, nightly and on demand, with random per-run CI secrets
- [x] Fixes during stage 12: `InventoryStore.deleteBinder` waits for queued binder-order saves (a save sent after the deletion named the deleted binder → 404 and a lost move; Vitest regression test); `e2e/map.spec.ts` picks trading-area centres on the public-grid latitude lines so the "never equals a stored centre" check cannot fail by chance; `e2e/payments.spec.ts` waits for the shipment dialog's focus before typing; production build optimisation block made explicit (`inlineCritical: false`)
- Debt: `docker compose --profile app` builds were verified during stage 12 only (not re-run in the final verification); rapid full-page reloads (≈ 15 page loads per minute, each re-fetching 5–27 API resources incl. placeholder card images) reach the default 120 requests/minute per-user limit (`RATE_LIMIT_DEFAULT_PER_MINUTE`) and the anonymous 60/minute per-IP limit that placeholder images count against — normal in-app navigation at a human pace stays well below (28/28 UI checks with a 4 s pause); revisit the limits in Phase 13

## Card images + real Yu-Gi-Oh! catalog (ADR 0015)

_Workflow `card-images`, task "backend" (2026-10-01, branch `feature/card-images`): game-agnostic
card image architecture with the YGOPRODeck adapter as the first real provider. Migrations V100–V102
(range V100–V109). Owner rules: the local image cache never exceeds 500 MB (raised to 5 GB on
2026-10-04, see "Card image cache raised to 5 GB" below); YGOPRODeck images are
never hotlinked (re-host only); metadata is always imported completely; real imports are explicit,
seeds/tests/CI stay offline. Verification: `./gradlew spotlessApply build` 756 API tests / 152 classes, 0 failures, 0 skipped (previously 704 / 140); `./gradlew exportOpenApi` (254 paths, previously 243; no path, operation or schema lost; 7 schemas added); `npm run generate:api`; `npm run build -w apps/web-angular` (877.57 kB initial, unchanged) and the web spec typecheck pass. Live smoke (API jar on :8090, profile `local`, database `orenjitrade_test`, Redis db 1, `CARD_IMAGE_LOCAL_CACHE_MAX_MB=5`, temporary cache directory, stopped and deleted afterwards): `npm run catalog:import -- --game yugioh --provider ygoprodeck --images limit:60 --api http://localhost:8090` → SUCCEEDED in 27 s, database 147.20, 14,592 cards created, 650 sets, 44,568 printings, 14,764 artworks referenced, 60 selected (the 8 demo printings first) → 52 downloaded + 8 deduplicated (identical artworks), 8.8 MB received, 2.31 MB of 5 MB used (= bytes on disk, 52 files), limit not reached; the second run: 0 created / 0 updated / 0 upserted, 60 already cached, 0 downloaded, 4.2 s; cached images served as 320 px JPEG (≈ 43 KB) with `immutable` caching; the demo binder's items carry `/api/v1/public/card-images/` URLs and no provider URL. Real provider traffic during the whole development: 1 snapshot (checkDBVer + cardinfo + cardsets), 2 more checkDBVer, 60 image downloads._

- [x] Data model — V100: `card_image` = one row per provider artwork (`game_id`, owner `card_id`
  + optional `printing_id`, `provider` + `provider_image_id` unique, `position`, server-side
  `source_url`, `cache_status` NOT_CACHED/CACHED/FAILED/MISSING_AT_SOURCE, storage key, type, size,
  dimensions, SHA-256, download/access times, attempts, last error), `card.image_id` (primary
  artwork; printings resolve their picture through their card), `card_image_cache_usage` (single
  row locked `FOR UPDATE`), `card_image_cache_reservation` (expiring), `catalog_sync_run` image
  mode / limit / provider version / phase / report. V101: printing variant key includes the rarity;
  yugioh GameSchema gains rank, link rating/arrows, pendulum scale, property, archetype, frame, all
  monster types, common rarities. Documented in `docs/database/schema.md`.
- [x] Provider abstraction — `CardProvider.imageHostingPolicy()` (`REHOST_REQUIRED` default /
  `HOTLINK_ALLOWED`), `supportsImageDownloads()`, `openImage()`; `ProviderCard.images` (card-level
  artworks), `ProviderImage.providerImageId`, `SyncResult.providerVersion`/`warnings`; reusable
  `ProviderHttpClient` (RestClient on the JDK client, timeouts, no redirects, User-Agent,
  `HostRateLimiter` per host default 5/s hard ceiling 15, `RetryPolicy` exponential backoff for
  timeouts/5xx/429 with `Retry-After`, never other 4xx).
- [x] `YgoProDeckCardProvider` (`cards/infra/ygoprodeck`) — checkDBVer first, raw snapshot per
  `database_version` under `PROVIDER_DATA_DIR/ygoprodeck/<version>/` (git-ignored) reused while
  unchanged, else one `cardinfo.php?misc=yes` + `cardsets.php` download; snapshot-only mode;
  `YgoProDeckMapper` (cards, metadata, sets per code with products, printings per code + rarity,
  USD indicative prices, one artwork per image id, provider data errors skipped as warnings); image
  URL allow-list (SSRF guard). Real catalog (database 147.20): 14,592 cards, 44,568 printings, 650
  sets, 14,764 artworks imported in ~14 s, unchanged re-import ~4.5 s with 0 changes.
- [x] `CardImageCache` (`cards/domain/images`) — `CARD_IMAGE_LOCAL_CACHE_MAX_MB` (default 5120 MiB
  = 5 GB, start-up refused above 5120, since 2026-10-04; 500 before), `CARD_IMAGE_CACHE_DIR`;
  reserve under lock → stream to
  `.tmp/<reservation>.part` (aborted above the reservation) → sniff/decode (HTML, empty, wrong type
  refused) → 320 px JPEG q0.82 without metadata → SHA-256 dedupe → commit usage + release
  reservation → atomic move; cleanup on every failure; expiring reservations; single-flight,
  4 parallel downloads; no request while less than a typical download fits; reconciliation at
  start-up and on demand (orphan temps, missing files, unreferenced files, usage from disk, LRU
  eviction when the limit was lowered); eviction and per-game clears release capacity; status.
- [x] Serving + URLs — `GET /api/v1/public/card-images/{imageId}` (cached JPEG `public,
  max-age=31536000, immutable` + SHA-256 ETag/304; otherwise a rate-limited single-flight on-demand
  fill (3 s) while capacity remains, else the placeholder SVG with 5 min caching; never a provider
  URL); `CardImageUrlResolver` is the only source of image URLs for `CardSummary.primaryImageUrl`,
  `CardDetail.primaryImageUrl`, `PrintingSummary.images[]` (card detail, printings, sets, printing
  detail, inventory items, public inventory items, offers/trades items, card holders),
  `CardSuggestion.imageUrl` (cards and unified search suggest, discovery results),
  `CardLink.imageUrl` (messages, community posts), binder `coverImageUrl` (own, public, collector
  binder lists), wishlist `card.imageUrl` (wishlist, matches, public wishlist summary),
  notification `data.cardImageUrl` (+ `cardName`, `game`) of `WISHLIST_MATCH`, `OFFER_*`,
  `TRADE_UPDATE`, `PAYMENT_UPDATE`, `SHIPMENT_STATUS`, `DISPUTE_UPDATE` (`NotificationCards`;
  stored API-relative, absolute in `GET /notifications`), `OfferLink.imageUrl` (OFFER_LINK and
  SYSTEM messages, resolved when read, never stored), `AdminListingItem.imageUrl` (admin listings
  and stale queue). Mock placeholders unchanged. Rate limit policy `card-images` 600/min per IP.
- [x] Importer — `CatalogImportService`: provider fetch (outage → FAILED with a clear message,
  catalog kept), metadata in chunks of 500 cards with prefetched state and JDBC batches (failing
  chunk retried card by card), `CatalogImportedEvent`, then image mode NONE / REFERENCED (default:
  inventory, binders, wishlists, offers/trades, message and community card links through the
  `CardImageReferenceSource` SPI) / ALL / LIMIT n (deterministic), never failing on a full cache;
  `CatalogImportReport` stored on the run (progress per phase); 409 while an import of the game
  runs; interrupted runs failed on the next run.
- [x] Triggers — admin `POST /admin/catalog/sync` (+ `imageMode`, `imageLimit`),
  `GET /admin/catalog/sync-runs/{id}/report`; internal `POST /internal/jobs/catalog-import`,
  `GET /internal/jobs/catalog-import/{id}`; root scripts `npm run catalog:import -- --game yugioh
  --provider ygoprodeck --images referenced|all|none|limit:<n>` (polls and prints the report),
  `npm run card-images:status`, `npm run card-images:clear -- --yes [--game <slug>]`,
  `npm run card-images:reconcile` (plain Node, `scripts/lib/internal-api.mjs`).
- [x] Admin cache console API (audited) — `GET /admin/card-images/status`,
  `POST /admin/card-images/clear`, `POST /admin/card-images/reconcile`,
  `DELETE /admin/card-images/{imageId}/cache`.
- [x] Local demo — `RealCatalogDemoSeedContributor` (`real-catalog-demo`, order 550, also after
  each YGOPRODeck metadata import): Blue-Eyes White Dragon LOB-EN001, Dark Magician LOB-EN005,
  Red-Eyes Black Dragon LOB-EN070 and the five Exodia pieces in collector1's public binder; silent
  without the real catalog.
- [x] Tests (offline: `YgoProDeckStub` = JDK HttpServer API + raw-socket image host, fictional
  fixtures, images generated in memory) — YgoProDeckMapperTest (6), YgoProDeckCardProviderTest (2),
  ProviderHttpClientTest (8), HostRateLimiterTest (3), CardImageConfigTest (5, rejects > 5120 since 2026-10-04, > 500 before),
  CardImageProcessorTest (4), CardImageFileStoreTest (3), YgoProDeckImportIT (5: complete metadata,
  idempotent re-imports downloading nothing, REFERENCED/LIMIT, image problems, outage, admin and
  internal triggers), CardImageCacheIT (7: rendition, dedupe, dropped connection, invalid content,
  reservation expiry, reconciliation, eviction/clear), CardImageCacheLimitIT (3, 1 MB cache: sampled
  disk + reservations and DB accounting never above the limit under parallel downloads, cache-full
  import, placeholder when full), CardImageServingIT (5), CardImageUrlContractIT (2: every DTO with
  card imagery, no provider URL; notifications WISHLIST_MATCH / OFFER_RECEIVED (listed absolute,
  stored relative), message offer links (never stored), admin listings + hide answer),
  NotificationCardsTest (2), OfferSnapshotsTest (1); WishlistRulesTest, WishlistMatchingIT,
  TradeLifecycleIT, ProtectedPaymentFlowIT and DelistingAdminIT assert the card picture of their
  notifications, offer links and listings; SeedDataRunnerIT and OpenApiExportTest extended.
- [x] Docs — ADR 0015 (+ README index, ADR 0005 link), `docs/providers/ygoprodeck.md`,
  `docs/database/schema.md`, `docs/development/local-setup.md` ("Card images and the real Yu-Gi-Oh!
  catalog"), `docs/development/seed-data.md`, `apps/api/README.md`, `ARCHITECTURE.md`,
  `.env.example`, `CLAUDE.md` rule, `.gitignore`.
- [x] Web card pictures (workflow `card-images`, task "web", 2026-10-01) — `apps/web-angular`:
  game-agnostic `shared/ui/card-image` (`<app-card-image>`, replaces `shared/catalog/card-image`):
  inputs `src` (API URL only; API-relative realtime paths resolved against the API origin), `alt`
  (card name; `''` only inside autocomplete options/pickers that already name the card), `size`
  (`xs`/`sm`/`md`/`lg`/`xl`/`fill`), `game` (placeholder tint), `eager` (hero); fixed 5:7 frame,
  explicit width/height, `loading="lazy"`, `decoding="async"`, shimmer skeleton until `load`
  (static under reduced motion), the game's placeholder card art on a missing URL or a load error
  (still announced as `role="img"` with the name), dark-mode tokens, `data-state`
  loading/loaded/placeholder/error, restyled through `--card-image-*` custom properties. Used on
  every card surface: top-bar and unified suggest lists, card/printing/link/wish pickers, add-card
  dialog search + printing picker, catalog grid tiles, card detail hero, printings tables (card
  detail, set checklist, admin card edit; new picture column), set page grid, inventory grid/table
  and edit sheet, public binder page + header, collector profile (public cards, binder previews,
  "Looking for"), map holders panel header + each listing + the preview card's matching listings
  (new `CardPictures` from `GET /cards/{id}` or `/printings/{id}`, `MatchingItem` carries ids
  only), search holders banner + collector results listings + printing chips, card-holders view,
  wishlist list, add/edit dialog, matches drawer and match cards, notifications bell + page (card
  picture with a type badge when the payload carries `data.cardImageUrl`), offers make-offer
  dialog, card picker, inbox rows, deal summary (offer and trade pages), trades list and the trade
  page's "Cards you received", message composer card/offer attachments, offer link picker, message
  and community card links, community post composer, admin cards list and edit page. Provider
  credits: `shared/catalog/card-data-attribution` (per game, wording of `docs/providers/ygoprodeck.md`)
  on Yu-Gi-Oh! card and set pages and in the footer. Tests: Vitest +12 (599 tests / 125 files:
  card image loading/skeleton/error fallback/alt/sizes/relative URLs, card pictures, attribution,
  notification card payloads and entry, printings table pictures, preview listings, store holders
  pictures, suggestion pictures); Playwright `e2e/card-images.spec.ts` (2, offline on the seed
  catalog, placeholders not stubbed: pictures render with a non-zero natural size from the API's
  own routes, none fail; provider hosts blocked and no request, `img` src or JSON answer points at
  `images.ygoprodeck.com`); `e2e/catalog.spec.ts` rarity option made exact (V101 added
  Platinum/Prismatic/... Secret Rare). Debt: initial bundle 887.59 kB (was 877.57 kB; budget
  warning 900 kB).
- [x] Image gaps (workflow `card-images`, task "image gaps", 2026-10-01) — backend: notifications
  about one card carry `data.cardName`, `data.game`, `data.cardImageUrl` (`WishlistMatcher` from the
  item's printing via `CatalogService.frontImageUrls`; offers, trades, payments and disputes through
  the offers module's new `OfferCard` = live item, else the offer's item snapshot printing,
  `OfferService.card` / `TradeService.card`); `OfferLink.imageUrl` and `AdminListingItem.imageUrl`
  (additive, nullable). Web: notification bell/page already rendered `data.cardImageUrl`
  (unchanged); `app-offer-link-card` shows the card picture with an offer badge (icon when no
  picture), admin listing rows show the card picture (`app-card-image`, placeholder art without
  one). Verification: `./gradlew spotlessApply build` 762 API tests / 154 classes, 0 failures,
  0 skipped; `./gradlew exportOpenApi` (254 paths and 371 schemas, unchanged counts; only
  `AdminListingItem`, `NotificationResponse` (description) and `OfferLink` changed);
  `npm run generate:api`; web lint and format clean, 603 Vitest tests / 126 files (+4), production
  build 887.59 kB initial (unchanged). Playwright left to the verifier. Mobile: no card image
  component exists in `apps/mobile` (deferred).
- [x] Independent verification (workflow `card-images`, 2026-10-01) — `npm run test:all` green on
  the final tree: API 764 tests / 155 classes (0 failures, 0 skipped), web lint + 603 Vitest tests /
  126 files, mobile typecheck + lint + 29 jest tests, Playwright 69/69 (0 flaky). Cache invariant
  reviewed and hardened: a temporary file is exempt from the capacity check only while its live
  reservation or the committed usage covers it (previously any download of the JVM was exempt, so
  the partial file of a download whose reservation expired was not counted; new
  `CardImageCacheIT.aDownloadWhoseReservationExpiredKeepsCountingItsTemporaryFile`, which fails on
  the old rule), and an attempt stops when its raw body cannot be deleted before the rendition is
  written; per-game `cachedBytes` count a deduplicated file once (status showed 15.13 MB for a
  14.88 MB / 15 MB cache). V102 `trg_card_image_fill_owner`: code that predates V100 (the `main`
  checkout sharing the local database, older revisions during a rolling deploy) failed its mock
  catalog seed with a not-null violation on `card_image.card_id`/`game_id`, so its API could not
  start; `CardImageLegacyWriterIT` runs that upsert verbatim. E2E: `catalog.spec.ts` and
  `card-images.spec.ts` no longer assume the seed catalog is the only Yu-Gi-Oh! catalog (they
  failed once the real catalog was imported locally), and `npm run test:e2e` starts its API with
  `CARD_IMAGE_ON_DEMAND_ENABLED=false` (a run had fetched 22 artworks from YGOPRODeck on demand).
  Live (dev database, profile `local`, default cache, 500 MB at the time): `npm run catalog:import -- --game
  yugioh --provider ygoprodeck --images referenced` → SUCCEEDED, YGOPRODeck database 147.22 (new
  snapshot, byte-identical to 147.21), 14,595 cards (0 created/updated), 650 sets, 44,568
  printings, 14,767 artworks referenced, 12,353 printings upserted (price date = provider
  `last_update`), 8 referenced artworks already cached, 0 downloaded; the re-run upserted and
  downloaded nothing (4.2 s). Cap proof (separate database and temporary cache directory,
  `CARD_IMAGE_LOCAL_CACHE_MAX_MB=15`, `--images all`): metadata complete (14,595 cards created,
  44,568 printings), 331 downloaded + 8 deduplicated, 14,428 skipped, `cacheLimitReached=true`,
  14.88 MB used = 15,600,834 bytes on disk (`du -sb`, sampled every 0.1 s during the run including
  `.tmp/`: maximum 15,600,834 ≤ 15,728,640); the re-run downloaded 0; database, folder and Redis db
  removed afterwards. Average cached rendition 47,132 bytes (320 px JPEG; raw downloads average
  ≈ 159 KB) → about 11,100 artworks fit in the former 500 MB cap (≈ 75 % of the 14,767; all of
  them, ≈ 696 MB, fit in the 5 GB cap since 2026-10-04). `CARD_IMAGE_LOCAL_CACHE_MAX_MB=501`
  stopped the start-up then (5121 since 2026-10-04). Browser (Playwright on the running stack): card detail of Blue-Eyes White
  Dragon and Dark Magician, `/cards?q=forbidden one` and `/search?q=forbidden one` render real
  pictures from `/api/v1/public/card-images/` (320×466, natural size > 0); no request to any
  `ygoprodeck.com` host and no provider URL in the DOM.
- [x] Mobile — `CardImage` (`apps/mobile/src/components/ui/CardImage.tsx`, stage M1): expo-image,
  API picture URLs only (`/api/v1/public/card-images/{id}`, placeholders, media; anything else →
  placeholder art), 5:7 frame, skeleton, provider credit line of the web; unit-tested. Card
  surfaces that use it arrive with the mobile Phase 2+ stages.
- Debt: the cache is local-disk only (cloud would need GCS + shared accounting, deferred with Phase
  14); on-demand fills are per instance; the real catalog has 13 invalid printing codes and 9 code
  + rarity pairs claimed by two cards (skipped, reported as warnings); production legal review of
  the YGOPRODeck terms, card image rights and attribution is required before any public launch.

## Map location privacy rendering (ADR 0004 "Client rendering", 2026-10-03)

_Workflow task "build" on branch `feature/map-privacy-zoom` (web + docs only; no backend, API,
database or grid change). Owner task: collector markers looked like exact home locations when
zooming in (Leaflet up to zoom 19, Google uncapped, 44 px avatars centred on the public point,
clustering off from zoom 16). Rule now: no map that shows other collectors suggests a position more
precise than an area about 2 km wide, at any zoom, with either adapter. Builder verification:
`npm run lint`, `npm run format:check`, `npm test` (129 files / 629 tests, previously 126 / 603)
and `npm run build` (initial 887.66 kB, no warnings) in `apps/web-angular`; `./gradlew test` of the
`location` and `search` packages: 56 tests / 10 classes incl. `GeoPrivacyContractTest`,
`LocationIT`, `ApproximateLocationServiceTest`, `NearbyCollectorsIT`, `SearchIT`, `CardHoldersIT`,
0 failures (no backend change). Playwright
not run by the builder (the owner's servers hold 4200/8080).
Independent verification (2026-10-03, verifier attempt 1): lint, format:check, `npm test`
(129 / 629) and `npm run build` (no warnings) re-run green; `./gradlew test` for
`*GeoPrivacyContractTest*`, `*location*`, `*search*`, `*Nearby*` patterns: 79 tests / 17 classes,
0 failures; no diff under `apps/api` or `packages/`. Isolated stack (API jar on :8081 against
database `orenjitrade_e2e` and Redis db 2, `ng serve` on :4201 with a temporary config): Playwright
`e2e/map.spec.ts`, `e2e/acceptance/map.spec.ts`, `e2e/acceptance/search.spec.ts`,
`e2e/acceptance/privacy.spec.ts`, `e2e/smoke.spec.ts` 11/11 green. Walkthrough as `collector1`:
zoom button, scroll wheel and keyboard "+" all stop at 14 (Leaflet `maxZoom` 14, "+" disabled);
search-box preview focus from zoom 8 lands on 14; every collector has a 1000 m disc measured at
150 px radius at zoom 14 / 45.5° N (expected 149.4 px); profile map: no pin, one 1000 m disc,
capped at 14; notes visible on the legend, preview and profile; no JSON lat/lng finer than 3
decimals (search centres 2), no DOM attribute, page state or console message with a finer
coordinate. Mutation check: removing the cap from both adapters fails 8 adapter tests._

- [x] Inspection: the only surfaces that draw another collector's public point are `/map`
  (`features/map/map-canvas` via `map-page`, markers from `data/map-markers.ts`) and the profile
  map `shared/map/approximate-area-map` (in `collector-profile-view`, used by `/collectors/:handle`
  for others and for the own public profile). The collector preview, list, search, card holders,
  binder headers, offers and wishlist matches show labels and distance buckets only, never a map.
  `shared/location/trading-area-picker` (onboarding, settings) only draws the user's own centre
  and radius to themselves; unchanged and not capped.
- [x] Zoom cap — `shared/map/approximate-area.ts` `COLLECTOR_MAP_MAX_ZOOM = 14`;
  `MapAdapterOptions.minZoom`/`maxZoom` + `clampZoom` (ADR 0010 amendment): Leaflet map
  `maxZoom` option (wheel, buttons with "+" disabled at 14, keyboard, touch, box zoom) plus clamped
  initial zoom / `setView` / `fitBounds` limit; Google `MapOptions.maxZoom`, clamped `setZoom` and a
  `zoom_changed` guard; `map-canvas` and `approximate-area-map` pass the cap; the store's preview
  focus and cluster zoom never ask for more. `FakeMapAdapter.created(options)` clamps like the real
  adapters.
- [x] Approximate areas — `APPROXIMATE_AREA_RADIUS_M = 1000` (2 km wide, metres) shared by `/map`
  and the profile map: `buildCollectorMarkers` returns `areas` (one `approximate` disc per collector
  drawn on their own, the selected one in the stronger `area` look; none for clustered collectors);
  `map-canvas` takes `circles` (search radius + discs); `circleStyle` shared by both adapters,
  circles restyled in place when their variant changes, unchanged discs not redrawn. Discs for every
  collector (≤ 200 per answer) rather than the selected-only fallback: cheap in both providers and
  hidden behind the avatar until zoom 12.
- [x] Clustering — `CLUSTER_MAX_ZOOM = COLLECTOR_MAP_MAX_ZOOM` (was 16); threshold and cell size
  unchanged.
- [x] Wording — legend "Locations are approximate (about 2 km) to protect privacy" + a legend key
  for the disc; preview note "Locations are approximate (about 2 km)" (`data-testid=
  preview-approximate`); map accessible name ends with the note; profile "Approximate area (about
  2 km) around …"; Privacy Policy "Public point" definition adds "Maps show it as an area about 2 km
  wide, never as an exact spot." (privacy `lastUpdated` 2026-10-03). The ~1 km grid wording
  (privacy settings, trading-area picker, legal grid sentence, admin grid-cell hint) is unchanged.
- [x] Tests — new `leaflet-map-adapter.spec.ts` (real Leaflet in jsdom: initial zoom, `setView`,
  `fitBounds`, zoom button, keyboard and wheel stop at 14; no cap keeps 18 / fitBounds 15; disc
  restyling), `google-maps-adapter.spec.ts` (fake `google.maps`), `approximate-area-map.component.spec.ts`;
  extended `map-adapter`, `map-markers`, `marker-clusters`, `map-discovery.store`, `map-page`
  (approximate-area cue, cap, emphasised disc, legend key) and `collector-preview-card` specs;
  Playwright `e2e/map.spec.ts` gains the preview note, discs and "zoom-in disabled at the cap"
  checks; legend text updated in `e2e/map.spec.ts`, `e2e/acceptance/map.spec.ts`,
  `e2e/smoke.spec.ts`. Mutation check: removing the cap from either adapter fails 9 adapter tests.
- Open question for the owner (ADR 0004): sparse rural grid cells may hold very few homes; grid
  left unchanged pending a decision.

## Card image cache raised to 5 GB (ADR 0015 amendment, 2026-10-04)

_Workflow task "build" on branch `feature/card-image-cache-5gb` (worktree, API + docs only; no
migration, no web/mobile/cloud change). Owner decision 2026-10-04 replaces the 500 MB rule of
2026-10-01: the local card image cache may hold up to 5 GB (5120 MiB) so the whole Yu-Gi-Oh!
catalog at 320 px (14,764 artworks ≈ 650 MB) fits locally with room for other games._

- [x] Limit — `CardImageCacheProperties.MAX_ALLOWED_MB` = 5120 and `@DefaultValue("5120")`,
  `application.yml` `max-mb: ${CARD_IMAGE_LOCAL_CACHE_MAX_MB:5120}`, `.env.example` 5120. Values
  above 5120 still stop the start-up ("must be between 1 and 5120 (configured: …); the local card
  image cache may never exceed 5120 MB (5 GB)"), smaller values are used as configured, never
  silently changed. Unchanged: 320 px JPEG q0.82, 2 MB per-download maximum, reservations and
  temporary files counting toward the cap, eviction, reconciliation, on-demand rate limits, only
  `/api/v1/public/card-images/{id}` reaches browsers, no full-size or cropped copies.
- [x] 64-bit audit (5120 MiB = 5,368,709,120 bytes > `Integer.MAX_VALUE`) — database:
  `card_image_cache_usage.used_bytes`, `card_image_cache_reservation.bytes`,
  `card_image.file_size_bytes` are `bigint` in V100 (no migration needed; the V100 SQL comment
  "<= 500 MB" stays because applied migrations are never edited). Java: `limitBytes()` multiplies
  by the `long` `BYTES_PER_MB` (now with an explicit `(long)` cast), every usage / reservation /
  remaining / temporary-file figure in `CardImageCache`, `CardImageCacheRepository` (`getLong`,
  `query(Long.class)`), `CardImageFileStore`, `CardImageCacheStatus`, `ReconcileResult`,
  `ClearResult`, `ImageFillResult` and `CatalogImportReport` is `long`/`double`; no `int` cast,
  `Math.toIntExact` or int multiplication on byte counts in production code; `limitMb`,
  `cacheLimitMb` and file counts stay `int` (5120 and ~120,000 files fit). OpenAPI: all byte
  fields `int64`. TypeScript: no web screen shows cache figures; `scripts/card-images.mjs` /
  `catalog-import.mjs` format with `Number(bytes) / (1024 * 1024)` (exact below 2^53, no bitwise
  ops). Test-side fix: `CardImageCacheLimitIT` allocated `new byte[(int) (limitBytes - 8 KiB)]`
  (would wrap with a large cap) → `Math.toIntExact` behind an assertion that its cap stays tiny.
- [x] Tests — `CardImageConfigTest` (5: default 5120 and `limitBytes() == 5120L * 1024 * 1024`
  > `Integer.MAX_VALUE`, 5120 / 5119 / 2048 / 500 / 5 / 1 accepted, 5121 and 6000 fail with
  "between 1 and 5120", 100000 / 5000000000 / 0 / -5 fail); `CardImageCacheIT` new
  `theDefaultFiveGigabyteLimitIsAccountedIn64Bits` (default config: 2.5 GiB pretended usage + a
  ~2.5 GiB phantom reservation, no gigabytes written; exact status and admin JSON figures, 8 KiB left
  → CACHE_FULL without a provider request, then a real download commits on top of 2.5 GiB);
  `CardImageCacheLimitIT` (still a 1 MiB cap) new `aSmallerLimitIsHonouredBelowTheFiveGigabyteCeiling`
  (admin status reports 1 MiB, not the default).
- [x] Docs — ADR 0015 amended in place ("Amendment 2026-10-04", Rejected bullet), CLAUDE.md
  card-images rule, ADR index, ARCHITECTURE.md, schema.md, local-setup.md (limit, disk space, old
  `.env` note), apps/api/README.md, `scripts/catalog-import.mjs` comment; OpenAPI description of
  `getCardImageCacheStatus` regenerated (`docs/api/openapi.json`, `packages/api-client`,
  `packages/shared-types`).
- Verification (builder): `./gradlew spotlessApply test` 766 tests / 155 classes, 0 failures,
  0 errors, 0 skipped (incl. CardImageConfigTest 5, CardImageCacheIT 10, CardImageCacheLimitIT 5);
  `./gradlew exportOpenApi` (only the `getCardImageCacheStatus` description changed, no path,
  schema or type change); `npm run generate:api` (description only in 3 generated files); in
  `apps/web-angular` `npm run lint` pass, `npm test` 129 files / 629 tests, `npm run build`
  (initial 887.66 kB, unchanged, no warnings); `npm run typecheck -w apps/mobile` pass. Live (API
  jar on :8081, profile `local`, database `orenjitrade_e2e`, Redis db 2, temporary
  `CARD_IMAGE_CACHE_DIR`, `CARD_IMAGE_ON_DEMAND_ENABLED=false`, `YGOPRODECK_ENABLED=false`): the
  default configuration logs "limit 5120 MB"; `GET /internal/jobs/card-images/status` and
  `node scripts/card-images.mjs status --api http://localhost:8081` report a limit of 5120 MiB =
  5,368,709,120 bytes (remaining 5,368,709,120); `CARD_IMAGE_LOCAL_CACHE_MAX_MB=6000` stops the
  start-up ("APPLICATION FAILED TO START … must be between 1 and 5120 (configured: 6000); the local
  card image cache may never exceed 5120 MB (5 GB)"). The admin endpoint's JSON (same
  `CardImageCacheStatus`) is asserted by `CardImageCacheIT`; a live admin call was not possible
  because the local infrastructure was reset externally during the session (emulator accounts and
  `orenjitrade_e2e` gone; the empty `orenjitrade_e2e` was re-created for the 6000 check, now at V102
  without seed data). No YGOPRODeck request was made.
- Verification (independent verifier, 2026-10-04): repo-wide search finds no current 500 MB card
  image cap (only dated history, the applied V100 SQL comment and the old-`.env` notes); 64-bit
  audit re-done (V100 `bigint` columns, `long` accounting in `CardImageCache` /
  `CardImageCacheRepository`, OpenAPI byte fields `int64`, no web screen shows cache figures, the
  scripts use `Number()` without bitwise ops) with no finding; `./gradlew test --rerun` 766 tests /
  155 classes, 0 failures, 0 skipped (CardImageConfigTest 5, CardImageCacheIT 10 in 9 s,
  CardImageCacheLimitIT 5 in 9 s); `exportOpenApi` + `npm run generate:api` reproduce the committed
  generated files exactly; web lint, `npm test` 129 files / 629 tests, build 887.66 kB; mobile
  typecheck pass. Live (jar on :8081, profile `local`, `orenjitrade_e2e` re-seeded, Redis db 2,
  temporary cache directory, on-demand fills and YGOPRODeck disabled, `CARD_IMAGE_LOCAL_CACHE_MAX_MB`
  unset): `GET /api/v1/admin/card-images/status` with the emulator admin token and
  `GET /internal/jobs/card-images/status` with the local service token both report `limitMb` 5120,
  `limitBytes` 5,368,709,120; `CARD_IMAGE_LOCAL_CACHE_MAX_MB=6000` stops the start-up with
  "must be between 1 and 5120 (configured: 6000)". No YGOPRODeck request was made.
- Note for the owner: a local `.env` copied from the old `.env.example` still sets
  `CARD_IMAGE_LOCAL_CACHE_MAX_MB=500` and keeps the old cap until that line is removed or set to
  5120.

## Mobile app (stage M1: foundation + Phase 1 accounts, 2026-10-04)

_Owner decision 2026-10-04: mobile development resumes (web MVP done); everything stays local and
free (Expo Go on a local Android emulator, Maestro CLI; no EAS, no Expo account, no Maestro Cloud,
no cloud resources). Branch `feature/mobile-m1` (worktree), builder done; the first independent
verification failed on one item (manual trading area without the web's map mechanism) and listed
cheap non-blocking fixes; all fixed below (2026-10-05) and `origin/main` (#39, #40) merged in;
re-verification pending; not pushed._

- [x] Parked work resumed — `wip/mobile-auth-partial` (`1fb776a`) cherry-picked (`969cac7`) and
  reconciled with today's API (`docs/api/openapi.json`, `@orenji/shared-types`) and the web flows
  (`features/{auth,onboarding,settings,legal}`, `core`): stale pieces (`SessionProvider`,
  `accountState`, `queries/*`, `signUp.ts`, `links.ts`) replaced, sound ones kept (`0b790fe`).
- [x] Configuration — `src/config/env.ts` (API base URL, public Firebase config of
  `orenjitrade-local`, Auth emulator host; Android `10.0.2.2`, iOS simulator / web `localhost`),
  `apps/mobile/.env.example` (public values only). Firebase Auth: React Native persistence on
  AsyncStorage (session restore verified on Android after the app is killed), browser persistence on
  web, emulator when configured.
- [x] Auth, onboarding, Profile tab, Settings, building blocks — see the Phase 1 mobile row.
- [x] Device location — read once at reduced accuracy (`expo-location`, `Accuracy.Low`), last-known
  fix up to 10 min, 10 s timeout (the web's `maximumAge` / `timeout`), rounded to 3 decimals like
  the web and sent only to `PUT /me/location/trading-area`; never rendered, stored, persisted or
  logged. Discoverability defaults to off.
- [x] Mobile web E2E — `npm run test:mobile:e2e` (`scripts/lib/mobile-e2e.mjs`): Playwright
  (`apps/mobile/e2e`, 12 specs: `auth` 5, `profile` 1, `location` 1, `account` 2, `leaflet-page` 3) against the Expo web
  build on :19006 and an isolated API on :8090; CI job `mobile-web` in `.github/workflows/e2e.yml`
  (plus the guard tests). Isolation (owner rule 2026-10-04): database `orenjitrade_mobile_e2e`
  recreated per run; media and card-image cache under `.local-dev/mobile-e2e/` with a guard
  (`scripts/lib/mobile-e2e-guard.mjs`, 27 `node --test` tests since 2026-10-05) that refuses directories resolving to
  any checkout's developer directories, the developer database or port, or any card provider call;
  `--reuse-running` only reuses the API the harness started (identity block in `/actuator/info` +
  state file) and refuses the developer API on :8080; accounts `m-<run id>-...@mobile-e2e.test`
  deleted from the Auth emulator after the run; mock catalog only (YGOPRODeck disabled).
- [x] Native (Android, Expo Go) — `npm run test:mobile:maestro` (`scripts/lib/mobile-maestro.mjs`):
  isolated API on :8090, Metro on :8082 with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8090`, bundle
  checked for that URL, Expo Go installed by Expo CLI when missing; 5 flows in `apps/mobile/.maestro`
  (`sign-in`, `sign-up-onboarding`, `profile-edit`, `discoverability`, `sign-out` with session
  restore). Defects found and fixed on the device: native bundles failed to transform
  (react-native-worklets Babel plugin resolved the web toolchain's hoisted Babel 8: root
  devDependencies pin `@babel/generator` / `@babel/traverse` 7.29.8, guarded by a jest test and an
  `expo export --platform android` CI step); every authenticated call failed after sign-in
  (openapi-fetch rejects React Native's Response class as a middleware result); forms hidden behind
  the keyboard (edge-to-edge, `KeyboardAvoidingView` in `Screen`); "Use my current location" spun
  forever without a fix (10 s timeout). Flow robustness: subflows dismiss the Expo Go developer menu
  and an "isn't responding" dialog, and scroll with edge swipes (a slow swipe starting on a filled
  TextInput becomes a text-selection long press on a slow emulator).
- [x] Verifier fixes (2026-10-05, after the first independent verification) — blocking: the manual
  trading area now uses the web picker's mechanism (`src/features/location/TradingAreaPicker.tsx` +
  `TradingAreaMap`): a tap on the map or a dragged pin moves the centre, "Use map centre" after
  panning, "Jump to a city" quick picks with their suggested radius (the web's `choosePreset`), the
  1–50 km radius drawn as a circle, loading skeleton and "Reload map" error state (quick picks keep
  working); hand-picked centres are rounded to 3 decimals and saved with source MANUAL; a
  device-derived centre is never drawn (no pin or circle, the camera looks at its 2-decimal
  neighbourhood); the centre is described in words only (`area-centre-summary`).
  **Map engine (ADR 0010 amendment 2026-10-05):** on the emulator the react-native-maps Google map
  stayed an empty grey surface: the Maps SDK refuses the key bundled with Expo Go ("Authorization
  failure"; the Map tab was just as grey, which the first verification mistook for a loaded map),
  so the camera never moved and "Use map centre" failed. `src/components/map/mapEngine.ts` now
  picks react-native-maps only for Apple Maps (iOS) or Google Maps in an Android build carrying
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` outside Expo Go, else Leaflet 1.9.4 + OpenStreetMap in a
  `react-native-webview` page (`src/components/map/leaflet/`: Leaflet from a pinned unpkg URL with
  Subresource Integrity equal to the npm bytes, no geolocation or storage, validated JSON messages,
  fit deferred until the WebView has a size, links open in the browser). The Map tab uses the same
  engine (browse only, zoom capped at 14). Tests: jest (`tradingAreaPicker.test.tsx` on the native
  map, `tradingAreaMapLeaflet.test.tsx` on the WebView: tap, drag, city focus, map centre, device
  area, disabled, malformed messages, error + retry, timeout; `maps.test.ts`: engine choice, SRI vs
  `node_modules`, escaping, messages; `collectorMap.test.tsx`), Playwright (`location.spec.ts`:
  city, map tap, pin drag, `PUT` body MANUAL with 3 decimals; `auth.spec.ts`: a map tap during
  onboarding; `leaflet-page.spec.ts`: the WebView page in Chromium, taps, pin drag, apply, focus,
  0 x 0 layout, Leaflet load failure) and Maestro (`discoverability.yaml`: city, tap on the map,
  save, `scripts/check-area.js` checks the API holds a MANUAL 3-decimal centre, pan + "Use map
  centre"; `sign-up-onboarding.yaml`: city on the onboarding map). Non-blocking: the Maestro
  harness waits (up to 6 min) for Expo CLI to install Expo Go instead of failing and stopping Metro
  mid-install (it was installed from scratch in this run); the blank band above stack headers on
  Android is gone (`src/navigation/headerInsets.ts`: in Expo Go the window starts below the status
  bar, so react-native-screens' native header must not add the status-bar height again; moving
  settings and legal into the root stack alone did not fix it); "Approximate area" (the API's
  generic label) never appears in "near …" sentences; friendly `auth/timeout` and
  `auth/internal-error` messages; a native build without React Native auth persistence keeps the
  session in memory instead of falling back to browser storage (unit tested); the Privacy Policy
  copy re-synced with the web's "about 3 km" wording after the merge. Merge of `origin/main`
  (#39 web E2E isolation, #40 Gradle on JDK 21): `scripts/test.mjs`, `e2e.yml`, docs merged with
  both sides kept; the mobile harness now reuses #39's helpers (`web-e2e-guard.mjs` path/storage/URL
  rules, `local-db.mjs`, `auth-emulator.mjs`) and gained their rules: its own realtime channels
  (`REALTIME_CHANNEL_PREFIX=e2e-mobile:rt:user:`, Redis pub/sub ignores the logical database),
  Redis db 1 enforced (not 0, not the web's 2), local database host, provider snapshots under
  `.local-dev/mobile-e2e/`, closed-port provider URLs, `STORAGE_PUBLIC_BASE_URL` empty, only
  `orenjitrade_mobile_e2e` droppable (27 guard tests).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator, after the fixes and the merge):
  `npm run test:mobile` green (typecheck, lint, 231 jest tests / 33 suites, 27 harness guard
  tests); `npx expo-doctor` 21/21; `npx expo export --platform android` (4.2 MB Hermes bundle) and
  `--platform web` (42 static routes) OK; `npm run test:mobile:e2e` 12/12 passed, 0 skipped, 0 flaky
  (developer database `orenjitrade`, its 14,731 cached card images and the 12 seed emulator accounts
  unchanged before/after; the run's 6 accounts deleted); `npm run test:scripts` 53/53;
  `npm run test:e2e` (web, isolated stack after the merge) 69/69 passed; `npm run test:web` lint +
  632 unit tests; `npm run audit:gate` OK (react-native-webview added with `npx expo install`).
  Native: Expo Go 57.0.9 installed by the harness's Metro on a fresh emulator, then
  `npm run test:mobile:maestro` 5/5 flows passed (11 min 36 s) twice in a row, the second time with a
  freshly started Metro; a walk by hand (seed sign-in, Map tab on OpenStreetMap, Profile, Settings,
  Location with a dragged pin, Privacy, Notifications, Account, Legal, a deep link opening Location
  a second time) showed no red box, crash or coordinate in logcat or the Metro log. No API change.
- Checks of the first builder pass (2026-10-04, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green (192 jest
  tests / 27 suites + 19 guard tests); `npx expo-doctor` 21/21; `npx expo export --platform android`
  and `--platform web` OK; `npm run test:mobile:e2e` 9/9 passed, 0 skipped; `npm run test:mobile:maestro`
  5/5 flows passed; `npm run test:web` green after the lockfile change (lint + 629 unit tests) and
  `ng build` OK; `npm run audit:gate` OK. A by-hand walk of every Phase 1 screen on the emulator
  (sign-in, reset password, legal index and a document, the six tabs, profile and public preview,
  settings: privacy, notifications, appearance, legal, account, export share sheet, deletion request
  with export first, deletion-pending screen, cancel) showed no red box or crash. No API change.
- Gaps / debt: collectors on the Map tab (3 km zones, preview bottom sheet, zoom-14 cap on the
  native engine too) arrive with mobile stage M3; the Leaflet WebView loads Leaflet from unpkg and
  tiles from OpenStreetMap, so the map needs internet (the picker's quick picks and device location
  work without it); the Google Maps path on Android is unit-tested but not run on a device (it needs
  a development build with the project's own key; none exists, no cloud resources); the
  device-location success path is unit-tested but the emulator never produced a low-accuracy fix
  (the timeout path was verified on the device); standalone Android builds would declare
  `ACCESS_FINE_LOCATION` through expo-location (consider `android.blockedPermissions` when a
  development build is introduced); iOS not run (no macOS); device push delivery, fonts and the EAS
  project id unchanged; Maestro runs take about 12 minutes and are local only (not in CI).

## Mobile app (stage M2: Phases 2 and 3 — catalog, inventory, binders, 2026-10-05)

_Owner decision 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m2`
(worktree, created from `feature/mobile-m1`), builder done; independent verification pending; not
pushed. Mirrors `apps/web-angular/src/app/features/{catalog,search,inventory,binders}` on the
same endpoints. No API, web or package change (scripts: the mobile E2E harness fix below)._

- [x] API layer — `src/api/hooks/{catalog,inventory,binders}.ts` on `@orenji/shared-types` +
  openapi-fetch (no hand-written DTOs; aliases in `src/api/types.ts`): `GET /cards` (infinite
  pages), `/cards/suggest`, `/cards/{id}`, `/sets`; inventory items (filters, infinite), one item
  (shown at once from a cached list), summary, `POST` / `PATCH` (changed fields only) / `DELETE`,
  `confirm`, bulk `MOVE_TO_BINDER` and `CONFIRM` ("Confirm all": stale + hidden ids, ≤ 500);
  `GET /me/listings/status` + `resume`; binders list / one / items, create, `PATCH`, publish,
  unpublish, confirm, delete (`deleteItems=false`); `GET /public/binders/{id}` and its items.
  Query keys under `['me', uid, 'inventory' | 'binders' | 'listing-status']`, `catalogKeys`,
  `publicKeys.publicBinder(id, uid)`; every inventory / binder write refreshes inventory + binders
  and never refetches what was just deleted. Public binder reads carry the ID token when signed in
  (`sendsIdToken`, the web's `ATTACH_ID_TOKEN`: `binder.views.per_day`, distance bucket).
- [x] Search tab + card detail — see the Phase 2 mobile row. Recent searches: per account (uid)
  on the device (zustand + AsyncStorage), card search texts only, never a location.
- [x] Inventory tab, add / edit / delete, binders, public binder view — see the Phase 3 mobile
  row. Intents exactly as the API models them: `availability` (trade or sale, trade, sale,
  collection only, not available) + `acceptsOffers`; "want" is a wishlist entry (later stage).
  Freemium limits explained in place (`src/lib/limits.ts`, `LimitReachedNotice`): `binders.max`
  on "New binder" ("You have used 5 of 5 binders on the Free plan…"), `binder.views.per_day` on a
  public binder, any other `LIMIT_REACHED` on the item forms.
- [x] Building blocks — `ChoiceChips` (radio chips), `SelectSheet` (field + bottom sheet of
  options), `Segmented` (tabs inside a tab), `ListFooter` (infinite-list spinner / retry);
  `npm run typecheck` regenerates the expo-router typed routes first (`scripts/typed-routes.mjs`:
  Expo CLI only rewrites `.expo/types/router.d.ts` while a dev server runs).
- [x] Fix found on the way (M1 code): onboarding picked its first step before `/me` answered when
  the other loads were faster (flaky `onboarding.test.tsx` once more suites ran in parallel); the
  screen now waits for `/me` too.
- [x] Harness fix (`scripts/lib/mobile-e2e.mjs`): a run started within a minute of another one
  recreated `orenjitrade_mobile_e2e` but kept Redis db 1, where the API caches games (60 s) with
  their ids, so the new API's catalog seed failed (FK violation on `catalog_sync_run`) and did not
  start. The harness now flushes db 1 whenever it recreates its database, like the web harness
  does for db 2; `assertFlushableRedis` (unit tested) refuses any other database or a non-local
  Redis.
- [x] Found on the device and fixed: the Search filter sheet listed every game's rarities before
  the short filters (now last); the inventory filter bar's first pill stretched and hid Intent and
  Sort (compact pills now size to their text).
- [x] Tests — jest/RNTL: 98 new tests (329 in 44 suites, was 231 in 33): `catalog.test.ts`,
  `inventory.test.ts` (labels, filters, limits), `itemForm.test.ts` (defaults, validation, POST
  body, PATCH of changed fields, temporary publication end, visibility status), `cardSearch.test.ts`
  (schema filters, recent searches), `catalogInventoryHooks.test.tsx` (paging, params, refresh,
  no refetch after delete, public binder token), `choice.test.tsx`, screens `search`,
  `card-detail`, `inventory`, `items`, `binders` (loading, empty, error-with-retry, offline,
  validation, limits, confirmations). Playwright (`apps/mobile/e2e`): `catalog.spec.ts` (2),
  `inventory.spec.ts` (2), `binders.spec.ts` (3); `openInApp` opens dynamic routes inside the
  running app (the static export served by `expo serve` has no rewrites for `/cards/<id>`,
  `/binders/<id>`: a full page load answers 404). Maestro: `search-card-detail.yaml`,
  `inventory-add-edit-delete.yaml`, `binder-create-add-item.yaml` with host scripts
  `scripts/add-card.js` and `scripts/check-inventory.js` (API checks after each step; refuse :8080,
  only `@mobile-e2e.test` accounts), `subflows/scroll-down-to-text.yaml`.
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green (typecheck with
  regenerated typed routes, lint, 329 jest tests / 44 suites, 28 harness guard tests), with the
  emulator running next to it (jest alone also green 3 times in a row after the onboarding fix); `npm run test:scripts` 54/54; `npx expo-doctor`
  21/21; `npx expo export --platform android` (4.4 MB Hermes bundle) and `--platform web` (46
  static routes) OK; `npm run test:mobile:e2e` 19/19 passed (12 earlier + 7 new), 0 skipped, 0
  flaky, twice (before and after the harness fix); `npm run audit:gate` OK (no dependency change). Native (Expo Go 57 on `Pixel_6_API_34`,
  harness-started API :8090 and Metro :8082): `npm run test:mobile:maestro` 8/8 flows passed
  (18 min) twice in a row, the second time started within a minute of an E2E run (the Redis flush
  at work); an earlier full run lost 2 Phase 1 flows to "Packager is not running at
  10.0.2.2:8082" / a stuck sign-in while files of the repository were being edited during the run
  (Metro re-crawls), and passed 8/8 once nothing was edited. A walk by hand (seed sign-in, Search
  with a filter sheet, card detail with the French printing, "Who has this near me" to the Map
  tab, Inventory with the binder and intent selects, the item editor, Binders, an own binder, its
  public page, the add flow, a binder deep link `exp://10.0.2.2:8082/--/binders/<id>`) showed no
  red box or crash: logcat without FATAL or ReactNativeJS errors (only Expo Go's own
  `ReactNoCrashSoftException` of its KeyboardControllerModule at start-up), no coordinates;
  Metro log clean; screenshots in the session scratchpad. No API, web or package
  change, so no Gradle, web or client regeneration run was needed; every process started for
  the checks (API, web server, Metro, emulator, the Gradle daemon) was stopped afterwards.
- Gaps / debt: "Add to wishlist" left out (added in stage M4); "Who has this near me" opens the Map
  tab with `?card=` (the Map tab filters by that card since stage M3); not on mobile
  yet: item owner photos, the multi-select bulk bar (visibility / availability / delete; moving
  cards into a binder is there), binder reordering, set pages (a set opens the Search tab filtered
  by it); the web build of the app mixes the static HTML's light colours with dark components when the
  browser prefers dark (pre-existing since M1: hydration keeps the server-rendered light styles;
  the E2E suite runs light; native follows the system); a Metro kept by `--keep-running` did not serve a later source change on Windows, and
  editing repository files while flows ran made Expo Go lose the packager (restart Metro after
  edits, `npm run test:mobile:maestro -- --stop`, and edit nothing during a run); iOS not run (no macOS).

## Mobile app (stage M3: Phase 4 — map discovery, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only; collectors only as zones 3 km
wide, radius 1500 m, never points or pins, every collector map capped at zoom 14). Branch
`feature/mobile-m3` (worktree, created from `feature/mobile-m2`), builder done; independent
verification pending; not pushed. Mirrors `apps/web-angular/src/app/features/{map,collectors}` on
the same endpoints. No API, web or package change; ADR 0004 is not edited here (the web PR owns
it), the mobile map details are an ADR 0010 amendment (2026-10-05, stage M3)._

- [x] Privacy rules and geometry — `src/lib/approximateArea.ts` (`APPROXIMATE_AREA_RADIUS_M =
  1500`, `COLLECTOR_MAP_MAX_ZOOM = 14`, "Locations are approximate (about 3 km)", `clampZoom`,
  3-decimal rounding), `src/lib/mapGeometry.ts` (zoom <-> react-native-maps region, bounds
  fitting capped at 14, the "past the cap" guard, `zoneAt` hit testing with a minimum touch
  target), `src/features/map/collectorLayer.ts` (a 1500 m zone per collector, clusters above 60
  that stop at 14 with 3-decimal centres, cluster expansion never past 14).
- [x] `CollectorMap` on three engines behind `mapEngine` (ADR 0010): `CollectorMapNative`
  (react-native-maps, Apple Maps / Google Maps with a key: `Circle`s, no `Marker` at any
  collector's point, `maxZoomLevel` 14, every camera request clamped, a guard animates back to 14),
  `CollectorMapLeaflet` (the Android WebView page `leaflet/collectorMapPage.ts`: Leaflet 1.9.4 with
  SRI, OSM tiles and credit, `maxZoom` 14 on map and tiles, `zoomend` guard, `L.circle` zones, count
  bubbles, validated messages `ready` / `error` / `tap` / `cluster` / `viewport`; the start view is
  applied again once the WebView has a size), `CollectorMap.web.tsx` (Leaflet directly). Loading
  skeleton and "The map could not load" + "Reload map"; zoom buttons bottom right (the toolbar
  covers the top). The Map tab's viewport is no longer persisted (app store version 3 drops it).
- [x] Map tab (`app/(tabs)/index.tsx`, `src/features/map/`): `GET /collectors/nearby` through
  `useNearbyCollectors` (react-query, previous answer kept while a pan loads); collectors with a
  trading area start on the server's answer (no centre leaves the device), others on a city
  (Montréal, city picker, "Set my area"), 400 falls back to the city; debounced viewport queries
  (centre 2 decimals, visible radius, only when leaving the covered circle); filters game /
  intent (the API's availability filter) / distance bounded by the plan's `map.radius.max_km`
  (`GET /me/plan`, else the FREE plan of `GET /plans`), 429 `LIMIT_REACHED` continues at the cap
  with a notice; "Who has this near me" (`?card=` from the card detail → `hasCardId`, banner with
  the card name, "Show every collector"); List view (rows with place, bucketed distance, rating,
  listings, the card's listings and lowest price); states: skeleton, "N collectors within 10 km",
  empty ("No collectors within 10 km yet", "Clear filters"), "You are hidden from the map" (not
  discoverable, "Location settings" / "Not now"), error with retry, offline (the last answer stays
  with "Collectors could not refresh"). No device location is read on the map (like the web map:
  the own area is the server's).
- [x] Preview bottom sheet (`CollectorPreviewSheet`, `GET /collectors/{handle}/preview`, a city
  centre only when the map shows a city): name, avatar, online dot, place, "Locations are
  approximate (about 3 km)", distance bucket ("Your public position" for oneself), rating, last
  active, listings with freshness, games, tags, the card's listings with API pictures; View profile,
  View public binder (first of `GET /collectors/{handle}/binders`), Message (only when
  `canMessage`; otherwise disabled with the web's reason: a block, or the collector's messaging
  permission), Show on map (the zone at zoom 13, never past 14); loading, "Collector unavailable"
  (404) and error with retry.
- [x] Message → `POST /conversations` (200 existing / 201 new; 403 `MESSAGING_BLOCKED` explained in
  a snackbar) → a minimal thread `app/messages/[id].tsx` (newest messages at the bottom, older
  pages on scroll, text composer with 403 / 422 / 429 explained, read marker, links to cards and
  binders, the other collector's profile); the mobile Messages stage adds the inbox, realtime,
  photos and links. Gate: `messages` is an app root.
- [x] Collector profile (`app/collectors/[id].tsx`, `src/features/collectors/`): header (place
  label, distance bucket, member since, last active, online), own profile ("Public preview",
  Edit profile, Privacy) or View public binder + Message (same rule as the preview), about / games /
  tags, the approximate area (`ApproximateAreaMap`: the same 1500 m zone at zoom 13, no gestures, no
  taps, "Approximate area (about 3 km) around …"), ratings and references (summary with breakdown,
  "Show more ratings" / "Show more references", read only until the mobile Phase 7 stage), public
  binders and cards. Visibility exactly like the web: signed out or 401 → "Collector profiles are
  for members" (sign in / create account); 404 (unknown, PRIVATE, suspended, deleted) → "This
  collector is not available"; other errors → retry. Deep links unchanged
  (`orenjitrade://collectors/<handle>`, `https://www.orenjitrade.com/collectors/<handle>`; signed
  out they lead to sign-in through the gate).
- [x] Card detail "Who has this near me" (M2) now opens the Map tab filtered by that card.
- [x] Found on the device and fixed: Expo Go's floating tools button covered the List toggle and
  the card banner's close button (top right): the switch now leads the filter row and the banner
  sits under it; the profile's WebView map drew its zone in a corner (start view set at 0 x 0);
  the conversation composer jumped to the top of the screen with the keyboard (Expo Go resizes
  the window, so padding by the keyboard height counted it twice: it now pads by the measured
  overlap); Leaflet's zoom buttons were under the toolbar (found by Playwright).
- [x] Tests — jest/RNTL: 87 new tests (416 in 51 suites, was 329 in 44): `mapGeometry`,
  `collectorLayer`, `mapDiscovery`, `collectorMap.test.tsx` (both native engines: 1500 m circles,
  no pin markers, maxZoomLevel 14, clamping of centre / bounds / cluster requests, the guard, taps,
  clusters, loading, error + retry, page config and injected layer), `screens/map.test.tsx`
  (own area without centre, city fallback, 400 fallback, hidden notice, empty, error + retry,
  offline refresh, filters, plan cap / 429, who has this near me, list, preview states, Message,
  refusals, messaging permission and blocks, own preview, Show on map), `screens/collector.test.tsx`
  (loading, ready with the area map, binders empty / error + retry, ratings and references, more
  pages, Message, permission and blocks, own profile, not on the map, PRIVATE / 404, MEMBERS signed
  out, 401, error + retry, offline), `screens/conversation.test.tsx`, `privacy/mapPrivacy.test.tsx`
  (every map / collector fixture, every prop handed to react-native-maps, the Leaflet page config and
  injected scripts, the profile map: no coordinate with more than 3 decimals, no private location
  field; nearby query centres with 2 decimals at most), store v3 migration, gate. Playwright:
  `map.spec.ts` (3) and `collector-map-page.spec.ts` (6). Maestro: `map-preview-profile.yaml`,
  `card-who-near-me.yaml` (+ `scripts/public-card.js`).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green (typecheck
  with regenerated typed routes, lint, 416 jest tests / 51 suites, 28 harness guard tests);
  `npx expo-doctor` 21/21; `npx expo export --platform android` (4.5 MB Hermes bundle) and
  `--platform web` (47 static routes, `messages/[id]` new) OK; `npm run test:mobile:e2e` 28/28
  passed (19 earlier + 9 new), 0 skipped, 0 flaky in the final full run (an earlier full run found
  the zoom buttons under the toolbar and two spec mistakes, all fixed); `npm run audit:gate` OK
  (no dependency change; the two allow-listed advisories only). Native (Expo Go 57 on
  `Pixel_6_API_34`, installed by the harness's Metro on the cold-booted emulator, harness-started
  API :8090 and Metro :8082): `npm run test:mobile:maestro` 10/10 flows passed (20 min 35 s) on the
  final code, after a 10/10 run before the conversation keyboard fix. On the way: the new flows
  first failed because Expo Go's tools button covered the List toggle and the card banner's close
  button (fixed, see above); one full run lost the M2 inventory flow to Expo Go staying on
  "Loading from 10.0.2.2:8082… New update available, downloading..." for four minutes although
  Metro had served the bundle (`subflows/launch-fresh.yaml` now opens the project once more when
  no screen appears); another lost its last two flows when the session's 2-hour limit stopped the
  emulator mid-run (restarted, then the 10/10 run above). The map renders OpenStreetMap tiles and
  the orange 3 km zones without any Google key (screenshots `map-zones`, `map-zone-focus`,
  `map-who-has-card` in the session scratchpad). A walk by hand (seed sign-in as collector2 and
  collector1, the Map tab, a tap on a zone opening Ethan's preview, Message starting a new
  conversation and sending, the List view, Devon's preview and the seed thread with the keyboard
  open, his profile with the centred approximate area, ratings and binders, deep links
  `exp://10.0.2.2:8082/--/collectors/collector5`, `/collectors/nobody_here` ("not available") and
  `/collectors/collector7` ("Not on the map")) showed no red box or crash: logcat without FATAL or
  ReactNativeJS errors and without any coordinate, Metro log clean. No API, web or package change,
  so no Gradle, web or client regeneration run was needed; every process started for the checks
  (API, web server, Metro, emulator) was stopped afterwards.
- Gaps / debt: the native react-native-maps engine (Apple Maps, Google Maps with a key) is covered
  by jest only: iOS cannot run here (no macOS) and no Android development build with a project
  key exists (no cloud resources), so `maxZoomLevel` / the guard on a real Google or Apple map are
  unproven on a device; iOS also deprecates `maxZoomLevel` in favour of `cameraZoomRange`, which
  is not set (the JS guard pulls the camera back). The Map tab leaves out the web map's tag and
  freshness filters, the map search box and its Messages side panel; "Report" (Phase 7) and rating
  a collector are not on mobile yet; the conversation screen was minimal until stage M4 (no inbox, realtime,
  photos, card or binder links to send, mute / archive / block); the map reads no device location
  (the own trading area is the server's, like the web). The Leaflet WebView needs internet (unpkg
  and OpenStreetMap). At zoom 13 the profile's 3 km zone (about 225 dp) is slightly taller than its
  200 dp map (stage M4: the map fits the whole zone). Signed-out deep links to a profile lead to sign-in (the app has no signed-out
  screens) and the link was not resumed after signing in (resumed since stage M4).

## Mobile app (stage M4: Phases 5 and 6 — messages, community, wishlist, notifications, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m4`
(worktree, created from `feature/mobile-m3`, `origin/main` with #41 and #45 merged in), builder
done; independent verification pending; not pushed. Mirrors `apps/web-angular/src/app/features/
{messages,community,wishlist,notifications}` and `core/{realtime,notifications}` on the same
endpoints. No API, web, package or dependency change (no `npx expo install` was needed:
`expo-image-picker`, `expo-image` and NetInfo were already in the app). Device push stays deferred
(it needs an EAS project and a real FCM sender): notifications arrive in the app, live over the
realtime channel._

- [x] Realtime channel (`src/realtime/`, port of the web's `core/realtime`): `stompFrames.ts`
  (STOMP 1.2 codec, UTF-8 `content-length`, heartbeat negotiation), `stompConnection.ts`
  (`v12.stomp` sub-protocol, CONNECT → CONNECTED within 10 s, heartbeats (10 s offered, the
  server's 20 s wins), ERROR frames, close codes for connect / heartbeat timeouts), `realtimeClient.ts`
  (`RealtimeClient`: follows the signed-in collector with a ready account, subscribes only to the
  caller's `/user/queue/messages|receipts|typing|presence|notifications`, sends only `/app/typing`,
  backoff 1 s → 30 s with ±20 % jitter, a fresh ID token after a refused handshake, `resync` after
  every (re)connection), `RealtimeProvider.tsx` (pauses in the background and reconnects in the
  foreground through `AppState`, skips the backoff when NetInfo reports the network back),
  `RealtimeCacheSync.tsx` (pushes applied to the react-query caches: threads, inbox order /
  previews / unread counts, receipts, presence, notification count and feeds once per id, wishlist
  match counts; REST re-reads after `resync`). The token goes in the handshake's `Authorization`
  header on native and in `?access_token=` on the web build (a browser cannot set headers); it is
  never logged or put in a frame. Found on the emulator and fixed: React Native's WebSocket drops
  the NUL that ends every STOMP frame, in both directions, so the CONNECT never completed; native
  builds now send frames as UTF-8 binary messages (NUL included) and restore the NUL of received
  text frames (`nulSafeFrames`).
- [x] Messages tab (`app/(tabs)/messages.tsx`: Inbox | Community, `?view=community`, live
  status "Live" / "Connecting…" / "Reconnecting…" / "Paused") — inbox (`InboxView`: cursor pages of
  30, previews per message kind, unread badges, muted / online marks, pull to refresh,
  skeleton / empty / error-with-retry states; offline, the cached inbox stays under the app's
  offline banner) and the tab's unread badge (unread messages of conversations that are not
  muted). Thread
  (`app/messages/[id].tsx` at web parity): newest page first, older pages on scroll, day dividers,
  text, shared cards / public binders / offers rendered as tappable cards (offers explain that
  they open in a later version), photos (`expo-image-picker` from the library, JPEG / PNG / WebP ≤
  8 MB checked before `POST /uploads/images?kind=MESSAGE`, then an IMAGE message; shown with
  `expo-image`), card links through the catalog autocomplete and own public binders through an
  inline picker, read marker only while the thread is on screen, "Sent" → "Seen", typing notices
  (throttled), mute / unmute, archive, block / unblock with a confirmation (blocked banner,
  composer disabled, the conversation leaves the inbox), 403 `MESSAGING_BLOCKED`, 422
  `MESSAGE_BLOCKED`, 429 (with `retryAfterSeconds`), oversized or unsupported photos and a denied
  photo permission explained under the composer. "Report collector" waits for the mobile Phase 7
  stage.
- [x] Community (`src/features/community/`, `app/community/[slug].tsx`): a game filter, then the
  channels grouped by region, game and topic with their posts of the last 24 h (`publicChat` off
  → "The community is closed right now", private messages still work); a channel's feed (cursor
  pages), the composer (card and own public binder links), edit / delete own posts (confirmation), replies
  (open per post, reply, delete own), block the author from a post's menu; 429 per-channel limit,
  409 `DUPLICATE_POST`, 422 `POST_BLOCKED` explained in place.
- [x] Wishlist tab (`app/(tabs)/wishlist.tsx`, `app/wishlist/{new,edit,[id]}.tsx`,
  `src/features/wishlist/`): summary (wishes, with matches, matches) and plan usage of
  `wishlist.items.max`, a notice when matches need a trading area or discoverability, filters
  All / Matches / Paused, wish cards (API picture, printing or "Any printing", criteria chips, private
  note, alerts switch, edit, remove with confirmation). The editor mirrors the web dialog with the
  API's criteria: card (catalog autocomplete) → printing, condition at least, max price + currency,
  trade preference, radius bounded by the plan's `map.radius.max_km`, note, alerts; 409 duplicate,
  429 limits explained. Matches (`wishlist/[id]`): cursor pages, the listing's card picture, price,
  condition, the collector's place and distance **bucket** only, Message (opens or starts the
  conversation), View profile, Show on map (the Map tab filtered by the card), dismiss. "Add to
  wishlist" on the card detail opens the editor with the card (and the printing of the link, else
  any printing) chosen.
- [x] Notifications (`app/notifications.tsx`, `src/features/notifications/`): a bell with a live
  unread badge ("99+") in every tab header, the centre (cursor pages, day sections, All / Unread,
  mark one / all read, preferences link, pull to refresh, live prepends counted once), and every
  notification kind opening its screen: `data.deepLink` when it is a safe same-app path, else a
  path rebuilt from its ids (the web's rules), mapped to the app (wishlist matches, conversations,
  community channels, binders, cards, collectors, settings, legal); offers, trades, disputes,
  Premium and credits explain in a snackbar that they open in a later version. Notification
  preferences were already complete in stage M1.
- [x] Leftovers of M1–M3: an ended session (a 401 on a token-carrying request while signed in)
  signs out and shows the sign-in screen with "Your session has ended" instead of looping back to
  the Map (the profile's "Sign in" included); a link opened while signed out (scheme, universal
  link or in-app) is kept and reopened after signing in (`src/account/pendingLink.ts`); the
  profile's approximate-area map fits the whole 3 km zone (`zoneFitZoom`, map 260 dp high); the
  Phase 0 default region and every coordinate literal in the app have at most 3 decimals
  (`privacy/coordinateLiterals.test.ts` scans the sources); the stale M2 / M3 lines of this file
  are corrected.
- [x] Found on the device and fixed: the STOMP NUL handling above; empty states collapsed inside
  auto-height scroll containers (the empty wishlist's "Browse cards" sat on its text): the
  wishlist, matches, community and notification lists now grow to the screen; Expo Go's floating
  tools button covered the conversation options button and the "Live" pill (top right under the
  header): the options button moved into the navigation header and the Inbox | Community toggle
  stays narrow so the pill follows it.
- [x] Tests — jest/RNTL: 119 new tests (535 in 64 suites, was 416
  in 51): `realtime/stompFrames`, `stompConnection` (handshake headers, heartbeats, timeouts, ERROR,
  NUL-safe framing), `realtimeClient` (follow, backoff with jitter, refreshed token after a refused
  handshake, pause / resume, resync, no token in frames), `realtimeProvider` (AppState, NetInfo),
  `features/{messaging,community,wishlist,notifications}`, `screens/{messages-tab,conversation,
  community-channel,wishlist,notifications}`, `app/auth-gate` (session ended, pending link), the
  client's 401 handling, `privacy/coordinateLiterals`. Negative `waitFor` assertions use
  `not.toBeOnTheScreen()` (a failed `toBeNull()` pretty-prints the whole tree on every poll: the
  jest run went from about 40 s to 16 s). Playwright: `messages.spec.ts` (2: inbox → thread with a
  second collector over the API, live delivery, reply, "Seen", a photo; a card link, mute, a block
  both ways), `community.spec.ts` (1), `wishlist.spec.ts` (1: wish → a listing nearby → live bell
  and match count → notification → matches → Message), `session.spec.ts` (2: a signed-out profile
  link reopens after sign-in; an ended session → sign-in with the notice → back). Maestro:
  `messages-inbox-thread.yaml`, `community-post.yaml`, `wishlist-match-notification.yaml` (+
  `scripts/messaging.js`, `community.js`, `wishlist.js`).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green
  (typecheck with regenerated typed routes, lint, 535 jest tests / 64 suites, the harness guard
  tests); `npx expo-doctor` 21/21; `npx expo export --platform android` (4.7 MB Hermes bundle) and
  `--platform web` (52 static routes, was 47: `/notifications`, `/community/[slug]`,
  `/wishlist/new`, `/wishlist/edit`, `/wishlist/[id]`) OK; `npm run test:mobile:e2e` from scratch
  (jar build, fresh database, web export) 34/34 passed (28 earlier + 6 new), 0 skipped, 0 flaky.
  Native (Expo Go 57 on `Pixel_6_API_34`, harness-started API :8090 and Metro :8082):
  `npm run test:mobile:maestro` 13/13 flows passed (25 min 58 s) on the final code, after an
  earlier 13/13 run (26 min 27 s) before the header fix (above). On the way: the new flows first
  failed on real defects (the realtime channel never connected natively: the NUL handling above;
  the empty wishlist's overlapping button) and on flow mistakes (a pattern that matched the
  notification row's "Mark as read" button, a distance id on nested text, which Android does not
  expose, and the community channel's posts of earlier runs: the flow now writes texts with the
  run's handle and `community.js` only takes the caller's own post); one full run lost its last
  six flows when the session's 2-hour limit stopped the emulator (`device 'emulator-5554' not
  found`; the restarted emulator came back without Expo Go, so the harness's Metro reinstalled
  it), then the 13/13 run above. A walk by hand (adb screenshots in the session scratchpad,
  `walk-*.png`): seed sign-in as collector2, the Messages tab with "Live", the seed thread with the
  options sheet, a card shared through the attach sheet and sent ("Sent"), the community channels,
  a channel with its replies and post options, the Wishlist tab, a wish's matches (place and
  "5–10 km away" only), the wish editor, the notification centre and its deep links to the
  matches and to the conversation, the own profile's approximate area showing the whole zone.
  This walk found Expo Go's tools button over the conversation options button and the "Live"
  pill (fixed, above). Logcat without FATAL, ReactNativeJS errors, tokens or coordinates (only
  Expo Go's own `ReactNoCrashSoftException` at start-up); Metro log clean. No API, web, package or
  dependency change, so no Gradle (beyond the harness's jar), web, client regeneration or
  `audit:gate` run was needed; every process started for the checks (API, web server, Metro,
  emulator) was stopped afterwards.
- Gaps / debt: device push (Expo / FCM tokens need an EAS project and a real FCM sender; in-app +
  realtime only); "Report collector" / "Report post" and rating a collector (mobile Phase 7
  stage); the offers and trades screens (Phase 8 stage: offer links and offer notifications explain
  where to answer); moderators cannot remove posts from the app (web admin); no camera capture for
  message photos (library only, Phase 11 stays on hold); iOS not run (no macOS); the Expo Go
  tools button still covers the right end of some page headers' text (no control sits there).

## Mobile app (stage M5: Phases 7 and 8 — reports, ratings, offers, trades, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m5`
(worktree, created from `feature/mobile-m4`), builder done; independent verification pending;
not pushed. Mirrors the web's `shared/reports`, `shared/ratings`, `features/settings/reports`,
`features/settings/offers`, `shared/offers` and `features/{offers,trades}` on the same endpoints.
No API, web, package or dependency change (the generated `@orenji/shared-types` already had every
Phase 7 and 8 operation). Admin and moderator consoles stay web-only; the payment-protection steps
of Phase 9 (pay, ship, confirm receipt, disputes) are explained on the trade screen and done on
orenjitrade.com until the Phase 9 stage._

- [x] Collector reports (`app/report.tsx`, `src/features/reports/reportLabels.ts`,
  `src/api/hooks/reports.ts`): "Report collector" with the reasons of `GET /public/report-reasons`
  in the server's order (label + description, a radio group), optional details (≤ 1000, counted),
  the confidentiality note, Cancel / Confirm (disabled until a reason is chosen), sent with an
  `Idempotency-Key` fixed for the screen and the context of the entry point: the collector profile
  and the map preview (PROFILE), the conversation options (CONVERSATION + id), a community post's
  options (POST + id) and a public binder's owner card (BINDER + id). 409 `REPORT_ALREADY_OPEN`
  (reasons disabled, link to My reports), 422 `CANNOT_REPORT_SELF`, 404, 429 (five a day), 400
  are explained with the web's wording; success turns into "Report sent" with a link to My reports.
  Settings → My reports (`app/settings/reports.tsx`, `GET /me/reports`): reported collector,
  reason, sent / reviewed times, the reporter's status text ("Waiting for a moderator", "Reviewed
  — the team took action", …) and the status chip, the open / reviewed summary; empty, loading and
  error-with-retry states. REPORT_DECISION notifications open it.
- [x] Ratings and references (`app/ratings/rate.tsx`, `app/ratings/reference.tsx`,
  `src/features/ratings/`, `src/features/collectors/ratingLabels.ts`, `src/api/hooks/ratings.ts`):
  rate a collector after an eligible interaction (`GET /ratings/eligibility`): the interaction to
  rate when there are several, overall (required) and the criteria the API models (communication,
  card condition, shipping, meetup reliability; a 1–5 star radio group, clearable), a comment
  (≤ 600), the 14-day note; edit the own rating within its window (`PUT /ratings/{id}`); write one
  reference (≤ 400) per collector; 403 `RATING_NOT_ELIGIBLE`, 409 `ALREADY_RATED` /
  `RATING_EDIT_WINDOW_CLOSED` / a second reference, banned terms (400) explained. The profile's
  "Ratings & references" now offers "Rate this collector", "Write a reference", "Edit" on the own
  rating, shows each rating's interaction kind and criteria, and explains why rating is not
  possible yet; "Rate …" is in the conversation options and on a completed trade. RATING_RECEIVED
  notifications open the own profile scrolled to the ratings (`?tab=ratings`).
- [x] Offers (`app/offers/{index,[id],new,counter}.tsx`, `app/settings/offers.tsx`,
  `src/features/offers/`, `src/api/hooks/offers.ts`): "Make an offer" on public cards that accept
  one (not one's own) from public binders, a profile's public cards, the map preview's listings
  ("Who has this near me") and wishlist matches; the form offers only the kinds the card's
  availability allows (cash / trade / cash + cards), the amount and currency, the buyer's own
  cards with copy steppers (private cards included, up to 10), a note (≤ 500), the expiry, a
  summary, and is sent once with an `Idempotency-Key`; 422 `OFFERS_NOT_ACCEPTED`, 409
  `OFFER_ALREADY_OPEN` (with "View your open offer"), 404, 400 fields and 429 `LIMIT_REACHED`
  (`offers.per_day`: used / allowed and the reset) are explained in place. My offers: Received /
  Sent, All / Active / Accepted / Closed (expired, declined and withdrawn included), "N offers wait
  for your answer", cursor pages, links to the trades and the offer settings. One offer: status,
  kind, round, expiry, whose turn it is with only the API's `allowedActions` (accept after a
  confirmation, counter, decline and withdraw with an optional reason), the deal, both collectors
  (region label and distance bucket only), the whole negotiation's history; a replaced proposal
  links to the live one and the screen follows a counter-offer that arrives while it is open;
  409 `STALE_OFFER` moves to the latest proposal, `NOT_YOUR_TURN` / `INVALID_STATE_TRANSITION` /
  `ITEM_UNAVAILABLE` re-read it. Counter-offer: the current proposal, a seller can keep or drop
  the buyer's cards only, the same deal is refused before sending. Settings → Offers (mixed offers
  switch). Offer links in chat open the offer; the composer shares a negotiation with the other
  collector ("Share an offer", OFFER_LINK). Offer notifications open the offer (or its trade).
- [x] Trades (`app/trades/{index,[id]}.tsx`, `src/features/trades/`, `src/api/hooks/trades.ts`):
  the list (both sides, All / In progress / Completed / Cancelled, whose move it is) and one trade
  for the buyer and the seller: status and kind, the next move (`nextAction`), only the API's
  `allowedOperations` (mark the in-person meetup, confirm the exchange after a confirmation,
  cancel with a required reason), the progress with both parties' marks, the cards received with
  "Add" (to the inventory), the deal with a link to the offer's negotiation, the other collector
  (place label and bucket only), the timeline, "Message …" and, once completed, "Rate …" (TRADE
  interactions). Protected trades show their steps and say that paying, shipping, receipts and
  disputes are done on the website for now. Trade, payment, shipment and dispute notifications
  open the trade (disputes still explain the website).
- [x] Shared: the auth gate admits `report`, `ratings`, `offers` and `trades`; realtime pushes
  refresh offers (OFFER_*), trades (TRADE_UPDATE, OFFER_ACCEPTED, PAYMENT_UPDATE, SHIPMENT_STATUS,
  DISPUTE_UPDATE), the own ratings (RATING_RECEIVED) and My reports (REPORT_DECISION), and every
  reconnection re-reads them; the Profile tab gains Offers and Trades, Settings gains Offers and My
  reports; `ItemRow` gained a full-width footer (Make an offer), `Button` an accessible label,
  `RadioGroup` per-option test ids, `Screen` its scroll view ref.
- [x] Found on the way and fixed: the signed-in auth gate only allowed the route roots of earlier
  stages, so `/report`, `/ratings/*`, `/offers/*` and `/trades/*` bounced back to the Map tab
  (found by the first Playwright run); on the emulator, "You confirmed the exchange. Waiting for …"
  stayed above "Trade completed" after the other collector's live confirmation (success notices
  now belong to the trade status they were given for; refusals stay), and the rate screen did not
  show "Which interaction are you rating?" above its choices; `openInApp` of the Playwright
  support waited for the first screen of the DOM (a hidden tab screen) and matched query strings
  as a regex (now: a visible screen, the path taken literally); Maestro's `http.post` needs a body
  (`scripts/offers.js` posts `{}` to `POST /trades/{id}/complete`).
- [x] Tests — jest/RNTL: 69 new tests (604 in 71 suites, was 535 in 64):
  `features/offers` (labels, the form rules and bodies, counter-offer start and "same deal",
  problems, targets and the target store, the inbox query), `features/trades` (labels, next
  action, steps incl. payment protection, the list filter), `features/reportsRatings` (report
  labels, problems and route params; rating rules, hints, problems and route params),
  `screens/reports` (report: reasons, Confirm disabled without a reason, body and
  `Idempotency-Key`, 409 / 429 / details limit / reasons error with retry, invalid link; My
  reports: statuses, empty, error with retry), `screens/ratings` (rate: overall required, criteria
  and clear, several interactions, `TRADE` only, not eligible, edit with `PUT`; reference: required,
  ≤ 400, banned term; the profile's Rate / Write a reference / hint / Edit), `screens/offers`
  (inbox: rows, your turn, tabs and filters, empty and error states; make an offer: missing card,
  validation, cash and trade bodies, `Idempotency-Key`, 409 with the open offer, 429, 422; one
  offer: withdraw, accept with the trade link, decline, counter, `STALE_OFFER`, superseded, 404;
  counter-offer: same deal refused, `NOT_YOUR_TURN`, not allowed; offer settings), `screens/trades`
  (list, filters, empty and error; trade: meetup, confirm with a dialog, cancel needs a reason,
  refusal, completed → rate / add / offer link, protected trade, 404), and the entry points in
  `screens/{collector,conversation,map,binders,community-channel,wishlist,profile,settings,
  notifications}`, `features/notifications` (deep links) and `account/gate`. Playwright:
  `reports.spec.ts` (2) and `offers.spec.ts` (2), 38 specs in all (was 34). Maestro:
  `offer-trade-rating.yaml`, `report-collector.yaml` (+ `scripts/offers.js`), 15 flows in all.
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green
  (typecheck with regenerated typed routes, lint, 604 jest tests / 71 suites, the 28 harness guard
  tests; Prettier clean); `npx expo-doctor` 21/21; `npx expo export --platform android` (4.9 MB
  Hermes bundle) and `--platform web` (63 static routes, was 52: `/report`, `/ratings/rate`,
  `/ratings/reference`, `/offers`, `/offers/[id]`, `/offers/new`, `/offers/counter`, `/trades`,
  `/trades/[id]`, `/settings/reports`, `/settings/offers`) OK; `npm run test:mobile:e2e` from
  scratch (jar build, recreated database, web export) 38/38 passed (34 earlier + 4 new), 0
  skipped, 0 flaky. Native (Expo Go 57 on `Pixel_6_API_34`, harness-started API :8090 and Metro
  :8082): `npm run test:mobile:maestro` 15/15 flows passed in 30 min 22 s on the final code,
  after an earlier 15/15 run (33 min 44 s) before the two last fixes above. On the way the new
  flows failed on flow mistakes (`tab-map` instead of `tab-index`; a pill's text matched through
  its id, which Android does not expose for a View's nested text; the body-less `POST` above),
  never on an app crash. A walk by hand (adb screenshots in the session scratchpad, `walk-*.png`,
  plus the flows' `offer-*`, `trade-*`, `rate-form`, `report-*`, `my-reports` screenshots): seed
  sign-in as collector1, Profile → Offers (Received with collector5's open offer, "1 offer waits
  for your answer"), the offer (your turn, the deal, both collectors with a place and a bucket
  only, the history), the decline dialog above the keyboard, the trades list and a protected,
  shipped trade (its five steps, the payout wording), collector5's profile ("Rate this
  collector", "Write a reference", "Make an offer" on her public cards, Report), the rate screen,
  the report screen with the seven reasons of the API, My reports (empty), Offer settings, the
  conversation options (Rate, Block, Report collector) and "Share an offer" in the composer with
  the accepted negotiation; this walk found the missing interaction question (fixed). Logcat
  without FATAL, ReactNativeJS errors, tokens or coordinates (only Expo Go's "Cannot connect to
  Expo CLI" warning after the harness stopped Metro); Metro log clean. No API, web, package or
  dependency change, so no Gradle (beyond the harness's jar), web, client regeneration or
  `audit:gate` run was needed; every process started for the checks (API, web server, Metro,
  emulator, the harness's Gradle daemon) was stopped afterwards.
- Gaps / debt: the payment-protection steps of Phase 9 (pay, ship, confirm receipt, disputes,
  payouts) are explained on the trade and stay on the website until the Phase 9 stage; admin and
  moderator consoles stay web-only; "Make an offer" is on the map preview's listings but not on
  the map list rows (the web has it on its holders list); `offers/new` takes the card in memory
  from its entry point (no endpoint reads one public item), so a reloaded web page or a cold start
  of that screen asks to choose the card again; offer and trade notifications deep-link correctly
  but the seed has none for collector1 to try by hand (covered by jest and live in the Playwright
  and Maestro offer flows); the generated `ProblemDetail` still does not declare `offerId` /
  `latestOfferId` / `currentStatus` (read defensively, as on the web); device push stays
  deferred; iOS not run (no macOS); Expo Go's tools button covers the right end of some top rows
  (no control sits there).

## E2E isolation, test-data purge and 3 km zones (2026-10-04)

_Workflow task on branch `fix/e2e-isolation-3km-zones` (worktree, not pushed). Owner request: the
E2E/acceptance suite had filled the developer database with 583 `@example.test` collectors
(`accmapa_*`, `privacy_*`, `paused_*`, `picowner_*`, `wisha_*`, "E2E <prefix> collector"), about 170
of them discoverable at the default Place des Arts trading area, all stacked on one map cell.
Root cause confirmed: `scripts/test.mjs` started the E2E API jar with the `local` profile against
the developer database `orenjitrade`, the same Auth emulator and the same `apps/api/.local-storage`
(`--reuse-running` reused the developer API itself); `AcceptanceApi.cleanUp()` only demoted staff
and unpublished binders, and never ran on interrupted runs. The 583 accounts were already gone
(owner's `infra:reset` the same morning): the developer database held 0 `@example.test` accounts,
12 seed accounts and 12 `user_location` rows; the emulator held 28 `m-e2e-…@example.test`
accounts left by earlier mobile E2E runs._

- [x] **Part 1 — isolated web E2E stack** (`scripts/lib/web-e2e.mjs`, guards in
  `scripts/lib/web-e2e-guard.mjs`): database `orenjitrade_e2e` dropped and recreated per run
  (Flyway + local seed, mock catalog only; created by the postgres init script on fresh volumes and
  by the harness otherwise; `--keep-db`), Redis db 2 (flushed with the database), realtime channels
  `e2e-web:rt:user:*` (new `orenji.realtime.channel-prefix`, Redis pub/sub ignores the logical
  database; `RealtimeChannelPrefixTest` (4)), API jar on :8180 with media, card image cache and provider snapshots under
  `.local-dev/e2e/` (its working directory), on-demand downloads off, YGOPRODeck disabled and pointed
  at a closed port, the `orenjiWebE2e` identity block under `/actuator/info`;
  `ng serve --configuration e2e` on :4300 serving `e2e/.runtime/config.json` (API :8180, written per
  run, Angular persistent cache off). Healthy infrastructure containers are never touched
  (`docker compose up` from a worktree would recreate the developer's PostgreSQL: its bind-mounted
  init directory is part of the compose config hash). Emails `e2e-<run id>-…@example.test`; the
  run's emulator accounts are deleted at the end (harness + Playwright global teardown, best effort
  on Ctrl+C). `--keep-running` / `--stack-only` / `--stop`; `--reuse-running` only reuses that kept
  stack (same instance id, web config pointing at it) and refuses the developer API with a clear
  message; Playwright's global setup refuses any API without the identity block. Guards (unit
  tests in `scripts/lib/web-e2e-guard.test.mjs`, `npm run test:scripts`, run before every
  `test:e2e` and in CI): wrong database, Redis db 0, developer realtime prefix, developer/mobile
  ports (8080, 4200, 8081, 8082, 8090, 19006), media or card image cache directory resolving
  (links, case, `..`) to a developer directory of any checkout/worktree or of `.env` — one test
  fails when the E2E cache dir equals the developer one. CI (`e2e.yml`) uses the same layout.
- [x] **Part 2 — teardown**: `AcceptanceApi` tracks every collector it creates; `cleanUp()`
  (bounded to 20 s, never failing a test, never touching `@orenjitrade.test`) requests their
  deletion through `POST /me/deletion-requests` (off the map at once), sets `discoverable: false`
  when an open trade blocks it, and deletes their emulator accounts.
- [x] **Part 3 — `npm run e2e:purge`** (`scripts/e2e-purge.mjs`): the database part runs in the API
  jar's one-shot maintenance mode (`TestAccountPurgeCommand`, `orenji.maintenance.purge-test-accounts`;
  no web server, Flyway off, seed off, scheduled jobs off via the new `orenji.scheduling.enabled`,
  no republication of other instances' events, no card image reconciliation; refuses otherwise, and
  unless the profile is local/dev, PostgreSQL is local and identities live in the local emulator).
  `TestAccountPurgeService` (admin module) cancels open trades between two test accounts, creates a
  deletion request (`AccountDeletionService.request`) and processes exactly that request at once
  (new `AccountDeletionService.processNow`: the job's steps); blocked accounts stay, off the map.
  The CLI shows the plan, asks (`--yes`), deletes the remaining `@example.test` emulator accounts
  (waiting up to `--wait-minutes` while a mobile or web E2E run is active) and prints the removed
  accounts, locations, binders, items and emulator accounts. No endpoint added; a running API is
  not needed. The mode is refused before the context starts when a switch is missing
  (`TestAccountPurgeModeGuard`, an `EnvironmentPostProcessor`). Tests: `TestAccountPurgeIT` (3),
  `TestAccountPurgeCommandTest` (5), `TestAccountPurgeModeGuardTest` (3),
  `scripts/lib/e2e-purge.test.mjs` (6).
- [x] **Part 4 — 3 km zones on the web** (ADR 0004 amendment 2026-10-04):
  `APPROXIMATE_AREA_RADIUS_M = 1500`, zoom cap 14 and clustering tied to it unchanged, "about
  3 km" on the legend, preview, map accessible name, profile and the Privacy Policy definition
  (text lives in `legal-content.ts`, not in a migration; consent version unchanged, no re-consent:
  a clarification of how the existing public point is displayed, no new data, purpose or sharing).
  New unit specs (radius, wording, zoom clamping, Leaflet pixel size at 14) and E2E checks
  (`e2e/map.spec.ts`, `e2e/acceptance/map.spec.ts`: wheel, "+" button, keyboard and double click
  never pass 14, no tile beyond 14, the zone measures 1500 m with the avatar on its centre, no DOM
  attribute with a coordinate finer than 3 decimals via the new `PrivacyScanner.scanDom`).
- [ ] **Part 4 — mobile** (Map tab collector zones, preview bottom sheet, collector profile):
  owned by the parallel mobile workflow (stage M3); `apps/mobile` is not touched here. ADR 0004's
  2026-10-04 note already states the mobile rule.
- Verification (builder, 2026-10-04): `npm run test:scripts` 26/26 (20 isolation-guard tests incl.
  "FAILS when the E2E card image cache directory equals the developer one", 6 purge-rule tests);
  `npm run test:web` lint + 129 files / 632 Vitest tests (was 629); `npm run test:mobile` typecheck +
  lint + 6 suites / 29 jest tests (no `apps/mobile` change); `npm run test:api` (`gradlew test
  --rerun check`, Spotless included) 781 tests / 159 classes, 0 failures, 0 skipped; OpenAPI
  re-exported (`./gradlew exportOpenApi`) without any change (no endpoint added). **Two consecutive
  full `npm run test:e2e` runs from the worktree: 69/69 passed, 0 flaky, 0 skipped (311 s and
  342 s), each deleting its 66 emulator accounts (0 left).** Developer state before the first and
  after each run identical: `user_account` 12 (all `@orenjitrade.test`,
  0 `@example.test`), `user_location` 12 (8 discoverable), `binder` 10, `card` 14,675, `card_image`
  14,927, developer card image cache 14,731 files / 695,442,661 bytes with the same sorted
  name+size+mtime list hash, 0 other media files, emulator `@example.test` 28 (the mobile leftovers)
  and 12 seeds unchanged. `--reuse-running` refused `E2E_API_PORT=8080` ("belongs to the developer
  API") and a stand-in API without the identity block, and reused a kept stack (8/8 map + smoke
  specs); Playwright's global setup refused the stand-in too. The new map checks (no zoom past 14,
  1500 m zone at zoom 14, avatar centred, no DOM coordinate finer than 3 decimals) passed in every
  run; the map/admin specs were hardened after a loaded `--repeat-each` run (28/28 and 24/24 after).
- Purge proof on test data (E2E database, `npm run e2e:purge -- --e2e --yes`): three
  `@example.test` collectors at Place des Arts (two discoverable, each with a public binder and an
  item, a conversation with 2 messages, an accepted offer = open trade AGREED between them, one with
  a pending deletion request) → maintenance mode started without Flyway or seed, cancelled 1 trade,
  3 found / 3 deleted / 0 blocked / 0 failed / 0 remaining, locations 3 → 0, binders 3 → 0, items
  3 → 0, rows anonymised (`deleted+<id>@anonymized.invalid`, "Deleted collector"), text messages
  erased, 3 `account.deletion.complete` audit entries, consents kept, 12 seeds with their 12
  locations and 10 binders and the 80 cards / 160 printings / 160 card images untouched, 0 pending
  event publications. A jar started with only `--orenji.maintenance.purge-test-accounts=true`
  stopped before start-up (no Flyway, no seed) listing the six missing switches.
- Developer database purge: after `pg_dump -Fc orenjitrade` (scratch, outside the repo) and
  the before-counts above, `npm run e2e:purge -- --yes` found 0 `@example.test` accounts in
  `orenjitrade` (the 583 had gone with the owner's reset), so no jar was started and the database
  was left as it was (removed 0 accounts / 0 locations / 0 binders / 0 items); it waited 4 minutes
  while the mobile E2E stack (:8090, :8082) was up, then deleted the 28 `m-e2e-…@example.test`
  emulator accounts of earlier mobile runs (0 left). Afterwards the discoverable collectors are the 8
  seed ones only (collector1–6, collector8 "exoking", premium_user), every count and the card image
  cache list hash are unchanged, the cache accounting row reads 695,442,661 bytes / 14,731 files
  (its `reconciled_at` moved to 22:52:03Z because the owner restarted the developer API at 22:51Z,
  not because of this work), and Redis db 0's nearby generation stayed at 13 (nothing was deleted,
  so no cached page could hold a removed collector).
- Incident during verification: at 22:59:01Z someone else ran `docker compose down` on the shared
  infrastructure (containers and network destroyed, volumes kept) while an E2E run was in progress;
  the next `npm run test:e2e` found the containers missing and, as designed, brought them back with
  `docker compose up -d --build --wait` (from this worktree; same images, volumes and data: the
  developer database and card image cache were verified unchanged). The owner's developer API
  (`gradlew bootRun` from `C:\dev\OrenjiTrade`) was stopped at 22:04:36Z and again at about
  22:57Z (Gradle: "client disconnection detected"); it was not restarted by this work, so
  `npm run card-images:status` and the discovery check as a seed user could not be run against it
  (the cache was checked file by file and through its accounting row instead). If the owner meant
  the infrastructure to stay down, `npm run infra:down` stops it again.

## Phase 11 — ML

**[!] ON HOLD — owner instruction (2026-09-29): do not start the Python ML card recognition work until a new order is given. The Phase 0 FastAPI skeleton stays as-is.**

_Final verification (2026-09-30): `apps/ml` untouched since Phase 0, `mlScanning` feature flag off in every seed, the API never calls the ML service locally; `npm run test:ml` (optional) runs the skeleton's pytest suite when `apps/ml/.venv` exists._

- [!] Card scanning pipeline: upload → storage → event → ML worker → candidates → user confirmation → inventory
- [!] ML service `/v1/identify` with confidence, graceful degradation
- [!] Mobile camera scan flow
- [!] Tests: pytest for service; API tolerance when ML unavailable

## Phase 12 — Data Platform

_Final verification (2026-09-30): the local half works (log transport by default, every event checked for PII/coordinates); the cloud half (Pub/Sub topic, BigQuery) is deferred with the rest of the cloud deployment (docs/deployment/DEFERRED.md)._

- [-] Analytics event schema + publisher (Pub/Sub adapter, local logging adapter) — minimal set built with Phase 4 (stage 4): `apps/api/.../analytics` — `AnalyticsEvent` (BigQuery column names `event_id`, `event_type`, `event_version` 1, `occurred_at`, `actor_hash`, `region_label`, `geo_cell`, `payload`), `AnalyticsText`, `ActorHasher` (HMAC with `ANALYTICS_ACTOR_SALT`; start-up guard, default salt only in local/test), `AnalyticsPublisher` (async, never throws), `LogAnalyticsTransport` (default), `PubSubAnalyticsTransport` (Pub/Sub REST with ADC or the emulator, only with `EVENTS_TRANSPORT=pubsub`, no new dependency), `AnalyticsEventListener` mapping in-process notifications (`SearchPerformed`, `CollectorPreviewed`, `CollectorProfileViewed`, `PublicBinderViewed`, `CardViewed`) to `search_performed`, `search_no_results`, `collector_viewed`, `binder_viewed`, `card_viewed` (no module depends on analytics); Phase 5 adds `message_sent` and `community_post_created` (after commit, no text and no raw ids; `message_sent` carries a hashed recipient); Phase 6 adds `wishlist_item_created` (game, target kind, radius, price flag, trade preference) and `wishlist_matched` (game, distance bucket, notified, owner hash; AnalyticsIT `phase6WishlistEventsCarryNoNotesIdsOrCoordinates`); Phase 7 adds `rating_submitted` and `collector_reported`; Phase 8 adds `offer_created` (kind, game, message and protection flags, seller hash), `offer_status_changed` and `trade_status_changed` (never amounts, ids or text; AnalyticsIT `phase8OfferAndTradeEventsCarryNoAmountsIdsOrText`) — tests AnalyticsIT (2), AnalyticsConfigTest (3), ActorHasherTest (2). Pending (local, backend debt): Phase 10 events (subscription, credit spend, ad served/clicked, donation; no amounts, ids or text) and AnalyticsIT coverage of the Phase 9 `payment_status_changed` / `dispute_status_changed` events. Deferred (cloud): the Pub/Sub transport is unproven against the emulator or cloud; `ANALYTICS_ACTOR_SALT` not yet in Secret Manager/Terraform
- [ ] BigQuery dataset/tables (Terraform) + sample queries — deferred with the cloud deployment
- [x] No PII/precise location in events (test) — AnalyticsEventTest (12: lat/lng/latitude/email/handle/user_id/centre keys and floating-point values refused, e-mails, decimal numbers and long digit runs masked, text truncated to 64 characters, `*_hash` keys must be hex digests, geography = grid cell + region label), AnalyticsIT `phase4FlowsEmitPrivacySafeEvents` (log output of real Phase 4 flows scanned)

## Phase 13 — Hardening

- [-] E2E coverage for all acceptance flows (Playwright + Maestro) — web done: 67 Playwright tests in 33 spec files (51 feature tests + the 16-test acceptance suite, every spec § 60 web flow incl. restoring a stale listing) green against the real local stack in the final verification; Maestro flows wait for the mobile app (deferred by owner decision)
- [-] Security review, secure headers, CORS, rate limits, upload validation — built along the phases (Problem Details without internals, request ids, RBAC + admin MFA outside local, `/internal/**` service auth, Redis token-bucket rate limits with per-route policies, CORS allow-list, HSTS outside local, web CSP from the entrypoint, image re-encoding with decompression-bomb guards and EXIF stripping, `GeoPrivacyContractTest` + the acceptance privacy scanner); a dedicated security review, header audit and rate-limit tuning (see the stage 12 debt) are still to do
- [ ] Accessibility pass, load test script, DB index review, backup/restore docs, failure testing

## Phase 14 — Production Deployment

**Apply still deferred by owner decision (2026-09-29): no cloud deployment; see docs/deployment/DEFERRED.md.** Since 2026-10-05 the production configuration itself is prepared (ADR 0016, section below): `npm run infra:validate` keeps the Terraform (16 modules, dev/staging/prod, Cloudflare) formatted and valid without credentials; nothing is planned or applied.

- [-] Terraform for prod (low-cost first-year profile), Cloudflare rules and records, secrets, scheduler jobs, budget — code and docs done on `feature/prod-low-cost` (see "Low-cost first-year production profile"); `terraform apply`, the Cloudflare apply and the console steps are the owner's (docs/deployment/README.md sections 1–11)
- [x] Deployment documentation (`docs/deployment/`) — first-deploy order with the Cloudflare DNS + certificate steps, environments matrix, runbooks (scale-up path, secret rotation, Redis sidecar, budget alert, restore), backup/restore incl. restore to a different instance, console safeguards (Maps key restrictions + quota, Firebase key, budget), temporary staging, per-line cost table (`docs/deployment/README.md` section 13)

## Low-cost first-year production profile (ADR 0016, 2026-10-05)

_Branch `feature/prod-low-cost` (worktree, from `origin/main` at `ded5470`), builders done (infra, API, docs), not pushed, nothing applied. Owner request: prepare the Google Cloud production configuration for a low-cost first year (target ≈ US$115–130/month at list prices) and fix the known go-live blockers without deploying anything._

- [x] ADR 0016 `docs/architecture/adr/0016-low-cost-first-year-production-profile.md`: the 13 choices, the Redis-sidecar trade-off with the per-key table of what an empty restart loses, the single-instance limit, the scale-up signals (sustained api CPU / memory alerts, Cloud SQL connections > 40 or CPU > 80 %, a few thousand actives or > ~200 concurrent WebSocket sessions, any need for two instances) and path (Memorystore Basic 1 GB + `api_max_instances > 1`, then `db-custom-1-3840` and REGIONAL, then 2 vCPU / 2 GiB), the cost table with the official pricing-page sources (Montreal, 2026-10-05): api ≈ 67, web ≈ 1, Cloud SQL ≈ 31, LB ≈ 19, Cloud Armor ≈ 8–10, egress ≈ 4–12, GCS ≈ 1, AR ≈ 0.3, Secret Manager ≈ 0.2, Scheduler 0.70, Pub/Sub + BigQuery ≈ 0–0.5, the rest 0 → **≈ US$128–140/month** (≈ 125 at minimal traffic; the 115–130 target holds only at low egress because Montreal is Cloud Run Tier 2 without a GCS Always Free allowance; US$300 trial credit for 90 days). Previous topology ≈ US$575–775.
- [x] Terraform (commits `25050ca`, `32202ad`, `fc644d0`, `77e3c0a`, `cbee16b`): Cloud SQL `db-g1-small` ZONAL with `edition = ENTERPRISE` explicit (PG16+ defaults to Enterprise Plus), 10 GB SSD auto-resize, 7 backups, PITR 7 d, deletion protection; Valkey 8.1.10-alpine sidecar pinned by digest through an Artifact Registry Docker Hub remote (`127.0.0.1 -::1`, `save ''`, `appendonly no`, `maxmemory 200mb allkeys-lru`, 0.1 vCPU / 512Mi, TCP startup probe, api `depends_on`, `REDIS_URL=redis://localhost:6379` plain env, no `redis-url` secret); api 1 vCPU / 1Gi with the heap capped at 50 % (measured 2026-10-05 on the production image: 513 MiB idle, 595 MiB under ~36 req/s, ~390 MiB non-heap, JVM up in 33 s), **min 1 / max 1** (validated while `redis_mode = sidecar`), CPU always allocated, startup boost, session affinity; Direct VPC egress `/24` `PRIVATE_RANGES_ONLY` (connector + Cloud NAT only behind `ml_enabled`, which stays false); web min 0 / max 2 / 512Mi with every `docker-entrypoint.sh` variable wired (`WS_BASE_URL`, Firebase web config, Maps key + Map ID, `ENVIRONMENT`; public values only); Certificate Manager with DNS authorization (+ Origin CA and classic modes); 10 Cloud Scheduler jobs = every scheduled `/internal/jobs/*` route, called over the api's `run.app` URL with audience = public API URL (`INTERNAL_AUDIENCE` / `INTERNAL_INVOKERS` set; ping, catalog-import, card-images status/clear excluded and refused by validation); Spring profile mapping `dev | staging | prod` (was `development`/`production`); generated secrets `location-jitter-secret`, `analytics-actor-salt`, `ads-token-secret`, `consent-ip-salt` (+ `db-password`, `service-token`), `stripe-billing-webhook-secret` container; unread env removed; `STORAGE_PUBLIC_BASE_URL` → the API media route (bucket enforces public access prevention); `domain-events` push off until the receiver exists; `google_billing_budget` module (US$150, 50/90/100 % + forecast, credits excluded, owner-applied); AR cleanup keeps ~10 versions per image; monitoring: api CPU/memory + Cloud SQL disk alerts, connection threshold 40, no Memorystore/connector references. The three roots share one `main.tf`. `deploy.yml` updates the `api` container only (`--container api`), ML opt-in via `DEPLOY_ML`.
- [x] Cloudflare (`fc644d0`): one Free-plan rate-limit rule (merged path prefixes, 60/10 s/IP; per-group thresholds, POST-only and host scoping dropped at the edge, all still enforced in the API's Redis windows), cache rules making `/api/v1/public/card-images|placeholder-images|media` cache-eligible with origin `Cache-Control` (`public, immutable` as the code sends; authenticated responses carry Spring Security's `no-store` and are never cached), DNS-only `_acme-challenge` CNAMEs from the GCP output, SSL Full (strict), optional `/internal/**` edge block; READMEs corrected.
- [x] API (`409b93d`, `740c832`, `ff76df5`): card image renditions behind a dedicated `cardImageStorage` `ObjectStorage` (local files at `CARD_IMAGE_CACHE_DIR` as before; `card-images/` prefix of the media bucket with `STORAGE_PROVIDER=gcs`; `CARD_IMAGE_STORAGE_PROVIDER` / `CARD_IMAGE_GCS_BUCKET` / `CARD_IMAGE_OBJECT_PREFIX`), the 5 GB cap counting objects + temps + reservations, reconciliation listing the bucket and never deleting an unreferenced object younger than the reservation TTL, serving with one read (304 without), imports with one listing snapshot; prod `DATABASE_POOL_SIZE` default 20 → 10 (`max_connections` 50); `application.yml` notes. ADR 0015 amendment 2026-10-05. Tests: `LocalFileObjectStorageTest` (6), `GcsObjectStorageTest` (6, google-cloud-nio in-memory bucket), `CardImageObjectStorageIT` (6: wiped-disk restart keeps and serves every object, vanished object repaired, cap with objects + temps + reservations, fresh unreferenced objects kept), `CardImageCacheIT` age-guard test, `CardImageFileStoreTest` policy test; full `npm run test:api` green after the isolation fix; `npm run test:scripts` 54/54; web image built and `config.json` rendered with every new variable; local dev unchanged (API jar on :8380 against `orenjitrade_prodcost_check`, Redis db 4).
- [x] Docs (this section's commit): ADR 0016 + index, `docs/deployment/README.md` (prod-only year one, first-deploy order 1–11 incl. Firebase web app before the apply, Cloudflare DNS + certificate verification, `--container api` deploy, console safeguards, temporary staging, cost table), `environments.md`, `runbooks.md` (scale-up path, rotation incl. the jitter-secret warning, Pub/Sub note, sidecar, budget alert, restore pointers as separate sections), `backup-restore.md` (inventory, Enterprise/ZONAL settings, restore to a different instance with `--backup-instance`, drills), `DEFERRED.md` status, `infrastructure/terraform/README.md` cross-links, ARCHITECTURE.md §10 note, ADR 0003 cross-reference, CLAUDE.md Cache row parenthetical (Redis stays cache-only).
- Decisions needing the owner's eye: `db-g1-small` has **no Cloud SQL SLA** (test/dev tier per Google; data is protected, availability is not guaranteed; `db-custom-1-3840` ≈ US$54 is the first SLA tier); the Cloudflare edge rate limit is coarser; the `Idempotency-Key` stores for offers/reports live only in Redis (a retry right after a restart can duplicate); `card-images/reconcile` scheduled daily at 04:45 UTC by judgement (no cadence in the code); the budget resource must be applied by the owner (billing-account permission); year one runs prod only (dev optional, staging temporary), images built into the prod registry when there is no dev project.
- To confirm at the first `terraform apply` (cannot be verified without a project): the loopback-bound Valkey against Cloud Run's TCP startup probe (fallback `redis_sidecar_bind_address = "0.0.0.0"`), a 0.1 vCPU sidecar next to a 1 vCPU main container, Certificate Manager DNS authorization on the Cloudflare zone, the exact free-tier arithmetic on a Tier 2 region. `terraform plan` was not run (needs a real project); `fmt -check` + `validate` pass for all four roots.

---

## Acceptance criteria tracker (spec §60)

Final independent verification, 2026-09-30, from a clean local state (`npm run infra:reset -- --yes`
→ `npm run test:all` → `npm run infra:validate` → `npm run dev` + manual walkthrough). Status:
**PASS** (proven by the named tests/evidence) · **PARTIAL** · **DEFERRED-CLOUD** (owner decision:
no cloud deployment) · **DEFERRED-MOBILE** (owner decision: web first) · **ON-HOLD-ML** · **FAIL**.
"Acceptance" = `apps/web-angular/e2e/acceptance/*.spec.ts`; "walkthrough" = the manual `npm run dev`
walkthrough above. No criterion is FAIL; none is ON-HOLD-ML (card scanning is not one of the 44).
The mobile half of every user-facing criterion is DEFERRED-MOBILE (web proven). Since 2026-10-05 the Expo app implements the mobile halves of criteria 1–5 (stage M1), 6–11, 17 and 18 (stage M2: inventory, binders, visibility, publication, public binder, card search), 12–16, 19 and 20 (stage M3: the map with 3 km zones, preview, profile, "Who has this near me", no exact coordinates) 21–25 (stage M4: private messages, community, wishlist, matches, in-app notifications; device push stays deferred) and 26–29 (stage M5: offers, rating after an eligible interaction, the report popup with a required reason and a confirmation), proven by the mobile jest, Playwright and Maestro suites listed in those sections (rows 21–25 name them); the statuses below remain those of the final web verification.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Register and log in | PASS | acceptance `registration.spec.ts` (consents → emulator e-mail verification → sign out → sign in), `auth.spec.ts`; AuthenticationIT; walkthrough sign-in (emulator ID token → `GET /me`, anonymous 401) |
| 2 | Create/edit profile | PASS | acceptance `registration.spec.ts` (profile step), `settings.spec.ts` (edits shown on the public profile); ProfileIT, TagIT |
| 3 | Configure privacy settings | PASS | `settings.spec.ts` (discoverability saved, public label only); acceptance `map.spec.ts` / `privacy.spec.ts` (discoverable collectors); SettingsIT, PrivacyPolicyServiceTest |
| 4 | Choose approximate trading location | PASS | acceptance `registration.spec.ts` (approximate area on the Leaflet map), `auth.spec.ts`, `settings.spec.ts`; LocationIT, ApproximateLocationServiceTest, GeoPrivacyContractTest |
| 5 | Select TCG interests | PASS | acceptance `registration.spec.ts` (interests step), `auth.spec.ts`; ProfileIT, TagIT |
| 6 | Open dedicated inventory page | PASS | acceptance `inventory.spec.ts`, `inventory.spec.ts`, `smoke.spec.ts`; walkthrough `/inventory` |
| 7 | Create private inventory | PASS | acceptance `inventory.spec.ts` (card added Private by default); InventoryIT (owner-only reads, others 404) |
| 8 | Create multiple binders | PASS | acceptance `inventory.spec.ts`, `inventory.spec.ts` (five binders, keyboard reorder, delete, `binders.max` dialog); BinderIT |
| 9 | Move cards between binders | PASS | acceptance `inventory.spec.ts` (card moved into a binder), `inventory.spec.ts` (bulk move); BulkOperationsIT `MOVE_TO_BINDER`, InventoryIT |
| 10 | Toggle private/public visibility | PASS | acceptance `inventory.spec.ts` (made public), `inventory.spec.ts` (bulk public 24 h / private); VisibilityIT, BulkOperationsIT |
| 11 | Publish a binder | PASS | acceptance `inventory.spec.ts` (publish → another collector sees it); BinderIT, PublicBinderIT; walkthrough (publish → second collector opens the public binder) |
| 12 | Another user opens the map | PASS | acceptance `map.spec.ts`, `map.spec.ts`, `smoke.spec.ts`; NearbyCollectorsIT; walkthrough `/map` (13 collectors within 10 km) |
| 13 | Public collectors at approximate positions | PASS | acceptance `map.spec.ts` + `privacy.spec.ts` (derived public points, never a stored centre), `map.spec.ts`; NearbyCollectorsIT, GeoPrivacyContractTest `mapAndSearchResponsesOnlyEverCarryPublicPoints`; walkthrough (`publicPoint` 3 decimals, bucketed distance) |
| 14 | Click collector marker | PASS | acceptance `map.spec.ts` (marker click), `map.spec.ts` (marker + keyboard list) |
| 15 | Collector preview appears | PASS | acceptance `map.spec.ts`, `map.spec.ts`; NearbyCollectorsIT `previewCarriesMessagingStateAndNoPreciseLocation`; walkthrough `GET /collectors/{handle}/preview` |
| 16 | Open full profile | PASS | acceptance `map.spec.ts` (preview → profile → binder); CollectorProfileIT; walkthrough `/collectors/collector5` |
| 17 | View public binder | PASS | acceptance `map.spec.ts` / `inventory.spec.ts`, `inventory.spec.ts` (region label + distance bucket only, no private notes); PublicBinderIT |
| 18 | Search for a card | PASS | acceptance `search.spec.ts` (top-bar search), `catalog.spec.ts` (autocomplete, filters, printing codes); CatalogSearchIT; walkthrough `/search`, `/cards` |
| 19 | Nearby collectors with that card | PASS | acceptance `search.spec.ts` ("Who has this near me" → holders list + marker → card-holders view), `map.spec.ts`; SearchIT, CardHoldersIT; walkthrough `GET /search/card-holders` |
| 20 | Exact coordinates never exposed | PASS | GeoPrivacyContractTest over every Phase 1–10 response family + logs; acceptance privacy fixture on every acceptance test (HTTP + STOMP; > 3 decimals, stored centres, raw distances) and `privacy.spec.ts` (planted-leak detection + sweep of every geo surface); AnalyticsEventTest/AnalyticsIT, AdsTargetingIT; walkthrough scans (36 API steps, 28 UI pages) found none |
| 21 | Private messaging | PASS | acceptance `messaging.spec.ts` (realtime delivery, unread badge, "Seen", live answer), `messaging.spec.ts` (blocks, photos); ConversationIT, MessagingAuthorizationIT, RealtimeIT; walkthrough (third collector gets 404); mobile (stage M4): `apps/mobile/e2e/messages.spec.ts`, Maestro `messages-inbox-thread.yaml` |
| 22 | Public community chat | PASS | acceptance `community.spec.ts`, `community.spec.ts` (moderation); CommunityIT, ModerationIT; mobile (stage M4): `apps/mobile/e2e/community.spec.ts`, Maestro `community-post.yaml` |
| 23 | Create wishlist | PASS | acceptance `wishlist.spec.ts`, `wishlist.spec.ts` (duplicate 409, FREE limit dialog); WishlistIT; walkthrough (wish with a 25 km radius); mobile (stage M4): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-match-notification.yaml` |
| 24 | New public inventory triggers match | PASS | acceptance `wishlist.spec.ts`, `wishlist.spec.ts`; WishlistMatchingIT; walkthrough (match with `KM_1_5` bucket); mobile (stage M4): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-match-notification.yaml` (live match count) |
| 25 | In-app/push notification received | PASS (in-app + log push) · DEFERRED-CLOUD (real FCM) · DEFERRED-MOBILE (device push) | acceptance `wishlist.spec.ts` (live STOMP notification), `wishlist.spec.ts` (bell, `/notifications`); NotificationCentreIT, NotificationRealtimeIT, PushDeliveryIT (log push provider); walkthrough (`WISHLIST_MATCH`, unread 0 → 1); mobile in-app (stage M4): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-match-notification.yaml` (live bell badge, notification → matches) |
| 26 | Send offers | PASS | acceptance `offers.spec.ts` (create → counter → accept → decline), `offers.spec.ts`, `payments.spec.ts`; OfferStateMachineIT, OfferAuthorizationIT, TradeLifecycleIT; walkthrough (offer → counter → accept → trade); mobile (stage M5): `apps/mobile/e2e/offers.spec.ts`, Maestro `offer-trade-rating.yaml` |
| 27 | Eligible users can rate | PASS | acceptance `rating.spec.ts` (no rating without interaction, unrelated 403), `rating.spec.ts`; RatingEligibilityIT, RatingRulesTest; mobile (stage M5): `apps/mobile/e2e/offers.spec.ts` (rate from the completed trade, a reference), Maestro `offer-trade-rating.yaml`, jest `screens/ratings` (no interaction: no rating, the reason explained) |
| 28 | Report collector via popup | PASS | acceptance `reporting.spec.ts`, `reporting.spec.ts` (all entry points); ReportFlowIT, ReportThresholdIT; mobile (stage M5): `apps/mobile/e2e/reports.spec.ts` (profile, conversation), Maestro `report-collector.yaml`, jest entry points (map preview, community post, public binder) |
| 29 | Reason required + confirm | PASS | acceptance `reporting.spec.ts` (reason → confirm), `reporting.spec.ts` (Confirm disabled without a reason); ReportFlowIT; walkthrough (no reason → 400); mobile (stage M5): `apps/mobile/e2e/reports.spec.ts` (Confirm disabled without a reason, "Report sent"), jest `screens/reports` |
| 30 | Admin reviews reports | PASS | acceptance `reporting.spec.ts` (admin sees → acts → audit log → reporter informed); ReportFlowIT, AdminAuthorizationIT; walkthrough (moderator resolves, collector 403) |
| 31 | Auto-delisting detects stale inventory | PASS | acceptance `stale-listings.spec.ts` (`/internal/jobs/freshness` → STALE, nothing deleted); FreshnessJobIT, FreshnessPolicyTest, StrikesIT, DelistingAdminIT; `admin-moderation.spec.ts` (policy editor) |
| 32 | Admin reviews stale listings | PASS | acceptance `stale-listings.spec.ts` (admin "Needs review" queue → Restore → ACTIVE → `listing.restore` audited; closes the stage 11 gap), `admin-moderation.spec.ts` (hide, pause/resume); DelistingAdminIT; walkthrough `/admin/listings` |
| 33 | Admin suspends accounts | PASS | `admin.spec.ts` (suspend + unsuspend, role restrictions); AdminUsersIT |
| 34 | Admin actions in audit log | PASS | acceptance `reporting.spec.ts`, `stale-listings.spec.ts`, `account-deletion.spec.ts`; `admin.spec.ts`, `admin-moderation.spec.ts`, `payments.spec.ts`, `credits-ads.spec.ts`; AuditIT and the per-phase audited-write ITs; walkthrough (`REPORT_RESOLVED`) |
| 35 | Freemium limits work | PASS | acceptance `freemium.spec.ts`, `freemium.spec.ts`, `inventory.spec.ts`, `admin-rules.spec.ts`; LimitsIT, BinderIT, BinderViewLimitIT |
| 36 | Premium entitlements override | PASS | acceptance `freemium.spec.ts` (fake billing checkout → Premium lifts `binders.max`), `freemium.spec.ts`, `credits-ads.spec.ts`; LimitsIT, SubscriptionFlowIT, CreditLedgerIT; walkthrough (FREE → PREMIUM → no ads → FREE) |
| 37 | Account deletion works | PASS | acceptance `account-deletion.spec.ts` (hidden at once; deletion job anonymises, identity deleted, consents/audit kept), `settings.spec.ts`; DeletionIT, ExportIT |
| 38 | Legal pages exist | PARTIAL | 8 pages served under `/legal/*` with versioned consent (TermsIT, ConsentIT, `smoke.spec.ts` draft banner, walkthrough `/legal/terms`); texts are drafts until counsel review (owner action) |
| 39 | CI runs automatically | PASS | GitHub Actions CI green on `main` for the stage 11 merge (`7bb5c27`) and on stage PRs (API incl. Testcontainers, web, mobile, ML, Terraform); `e2e.yml` now runs the whole Playwright suite on PRs, nightly and on demand (first GitHub run with the next PR); `npm run test:all` mirrors it locally |
| 40 | E2E covers critical workflows | PASS (web) · DEFERRED-MOBILE (Maestro) | 67/67 Playwright tests (51 feature + 16 acceptance) against the real local stack, 0 flaky, 0 skipped |
| 41 | Runs locally | PASS | `npm run infra:reset -- --yes` → `npm run test:all` green → `npm run dev` ready in 50.6 s → 36/36 API + 28/28 UI walkthrough checks; fake payments/billing/donations, log push/e-mail/analytics, no external credentials |
| 42 | Deploys to Google Cloud | DEFERRED-CLOUD | owner decision (docs/deployment/DEFERRED.md); Terraform validates (`npm run infra:validate`), never planned or applied |
| 43 | Cloudflare configuration documented | PASS | `infrastructure/cloudflare/README.md` + Cloudflare Terraform (validated by `npm run infra:validate`); applying it is DEFERRED-CLOUD |
| 44 | Production architecture supports www.orenjitrade.com | DEFERRED-CLOUD | designed (ARCHITECTURE.md, ADRs, Terraform for Cloud Run + Cloudflare, validated); not deployed |

### Remaining gaps (after the final verification)

- **Cloud (apply deferred by owner; configuration prepared 2026-10-05, ADR 0016):** the owner runs `terraform apply` (GCP project, state bucket, WIF, the low-cost prod profile incl. the generated `LOCATION_JITTER_SECRET` / `ANALYTICS_ACTOR_SALT` / `ADS_TOKEN_SECRET` / `SERVICE_TOKEN` secrets), the Cloudflare apply and the console steps (`docs/deployment/README.md`); still missing in code: the `/internal/events/pubsub` receiver (domain-events push stays off), sendgrid/ses e-mail adapters (`log` only), the Stripe live keys, device push (FCM) and the first real Pub/Sub → BigQuery run; the sidecar probe / fractional CPU / Certificate Manager questions listed in that section can only be settled at the first apply.
- **Mobile (resumed 2026-10-04, local and free only):** Phases 1–8 done in stages M1–M5 (see "Mobile app (stage M1)" to "(stage M5)"; admin consoles stay web-only); the mobile UIs of Phases 9–10 (payment protection, payouts and disputes; Premium, credits, ads, donations), device push delivery (needs an EAS project and real FCM), fonts; EAS stays unused (project id placeholder).
- **ML (on hold):** Phase 11 card recognition and scanning.
- **Legal:** counsel review of the 8 draft legal pages (criterion 38).
- **Backend debt (local):** Phase 10 analytics events (subscription, credit spend, ad served/clicked, donation) and AnalyticsIT coverage of the Phase 9 payment/dispute events; declare the Phase 8 `ProblemDetail` extensions (`latestOfferId`, `offerId`, `currentVersion`) in OpenAPI, regenerate the clients and drop the web's `problemExtension()` reads; join blocks into the Phase 4 discovery SQL; binder names/descriptions and public notes through `TextModerationService`; `Idempotency-Key` replay fail-open without Redis; avatars re-encoded as JPEG (no WebP encoder); OpenAPI `info.license` lacks `identifier`/`url`; generated client sends `application/problem+json` on 204 operations (web `accept-header.interceptor.ts` workaround).
- **Web debt:** `/sets` index page; admin set/printing creation UI; E2E for the admin plan editor, admin subscription cancel and donation refund/settings; `metadata.<key>` catalog filters not exposed; Leaflet `_leaflet_pos` console error on map teardown during zoom; fake checkouts poll up to ~45 s for the synthetic webhook; initial bundle 887.66 kB close to the 900 kB warning budget (887.59 kB before the map privacy rendering, 877.57 kB before the card pictures); the admin seed account lands on `/onboarding` after sign-in (staff profile not onboarded).
- **Hardening (Phase 13):** dedicated security review and header audit, rate-limit tuning (rapid full reloads reach the 120/min per-user and 60/min anonymous per-IP limits, see stage 12 debt), accessibility pass, load test script, DB index review, backup/restore docs, failure testing; first GitHub run of the E2E workflow.

---

## NEXT TASK

> **Web MVP complete locally (2026-09-30).** Workflow `web-mvp-local` / `web-mvp-local-continue`
> (run `wf_7e879796-9e0`) delivered stages 1–12: Phases 1–10 backend + web, local environment
> tooling and the web acceptance suite, each independently verified and committed; the final
> verification above found every web acceptance criterion PASS except 38 (legal texts, PARTIAL)
> and the cloud-only rows 42/44 (DEFERRED-CLOUD). The pre-resume partial work stays on branch
> `wip/stage6-partial`. Root `app.json`, `eas.json` and the `react-native-worklets` bump in
> `apps/mobile/package.json` / `package-lock.json` belong to the owner and are kept out of every
> commit.

> **Card images (2026-10-01, branch `feature/card-images`):** backend and web of ADR 0015 done
> (see "Card images + real Yu-Gi-Oh! catalog"): `npm run catalog:import -- --game yugioh --provider
> ygoprodeck --images referenced` imports the real Yu-Gi-Oh! catalog and caches the referenced
> artworks (cache ≤ 500 MB then, ≤ 5 GB since 2026-10-04; YGOPRODeck never hotlinked); every web card surface renders the API's
> picture URLs through `app-card-image`, with YGOPRODeck / Konami / 4K Media credits; card pictures
> in notification payloads, `OfferLink` and admin listing rows. Independently verified and committed
> on `feature/card-images` (not pushed); next: PR and merge to `main`. The shared local database is
> at V102 (V102 keeps the `main` checkout's API able to start against it).

> **Map location privacy rendering (2026-10-03, branch `feature/map-privacy-zoom`):** web + docs
> done by the builder (see "Map location privacy rendering"): collector maps capped at zoom 14 in
> both adapters, 2 km approximate-area discs under every collector, clustering stops at the cap,
> "about 2 km" wording. Independently verified and committed on the branch (not pushed).
> **Next:** push `feature/map-privacy-zoom`, open the PR and merge to `main` when CI is green; then
> ask the owner about the open rural-cell question in ADR 0004 ("Open questions for the owner").

> **Card image cache 5 GB (2026-10-04, branch `feature/card-image-cache-5gb`):** builder done and
> independently verified (see "Card image cache raised to 5 GB"): `CARD_IMAGE_LOCAL_CACHE_MAX_MB`
> default and ceiling 5120 MiB, 64-bit accounting audited and tested, ADR 0015 amended, docs and
> generated clients updated; committed on `feature/card-image-cache-5gb` (not pushed). **Next:**
> push the branch, open the PR and merge to `main` when CI is green. Afterwards, only if the owner asks: `npm run catalog:import -- --game yugioh
> --provider ygoprodeck --images all` caches the whole Yu-Gi-Oh! catalog (an explicit real provider
> import: ≈ 14,800 image downloads paced at 5/s ≈ 50 minutes, ≈ 650 MB). A local `.env` that still
> sets `CARD_IMAGE_LOCAL_CACHE_MAX_MB=500` must be updated first.

**Owner priorities (2026-09-29, updated 2026-10-04):** cloud deployment deferred (see
docs/deployment/DEFERRED.md), everything runs locally, web application first (**done**), mobile
resumed on 2026-10-04 (local and free only: Expo Go, local Android emulator, Maestro CLI; never
EAS, Expo publish or Maestro Cloud). Phase 11 (ML card recognition) is on hold.

> **Mobile stage M1 (2026-10-04, fixes 2026-10-05, branch `feature/mobile-m1`):** foundation +
> Phase 1 accounts on the Expo app (see "Mobile app (stage M1)"): auth, onboarding, Profile tab,
> Settings, shared building blocks, the trading-area picker on a map like the web's (Leaflet +
> OpenStreetMap in a WebView where Google Maps cannot draw, ADR 0010 amendment), the isolated
> mobile web E2E harness (`npm run test:mobile:e2e`, 12 specs, CI job) and the native Maestro flows
> on the Android emulator (`npm run test:mobile:maestro`, 5 flows); `origin/main` (#39, #40) merged
> in. Merged into `main` as #41.

> **Mobile stage M2 (2026-10-05, branch `feature/mobile-m2` on top of `feature/mobile-m1`):**
> Phases 2 and 3 on the Expo app (see "Mobile app (stage M2)"): the Search tab and card detail,
> the Inventory tab with adding, editing and deleting cards, binders (create, rename, publish,
> make private, confirm, delete, add / remove cards) and the public binder view, freemium limits
> explained in place; 98 new jest tests, 7 new Playwright specs (19 in all), 3 new Maestro flows
> (8 in all); the mobile harness now flushes its Redis db with its database. No API change.
> Merged into `main` as #45.

> **Mobile stage M3 (2026-10-05, branch `feature/mobile-m3` on top of `feature/mobile-m2`):**
> Phase 4 on the Expo app (see "Mobile app (stage M3)"): the Map tab with collectors only as zones
> 3 km wide (radius 1500 m) and every collector map capped at zoom 14 on all three map engines,
> filters, "Who has this near me" from a card, the list view, the preview bottom sheet, the
> collector profile (approximate area, ratings, references, binders, PRIVATE / MEMBERS like the
> web) and a minimal conversation opened by "Message"; 87 new jest tests (416 in all), 9 new
> Playwright specs (28 in all), 2 new Maestro flows (10 in all); ADR 0010 amendment (stage M3).
> No API change. Pushed, PR #46 open; **next:** merge it when CI is green (stage M4 builds on
> it).

> **Mobile stage M4 (2026-10-05, branch `feature/mobile-m4` on top of `feature/mobile-m3`):**
> Phases 5 and 6 on the Expo app (see "Mobile app (stage M4)"): the realtime STOMP channel
> (native handshake header, web `?access_token=`, backoff, background pause, NUL-safe frames on
> React Native), the Messages tab (inbox, the full conversation with links, photos, receipts,
> mute / archive / block; the community channels), the Wishlist tab with matches nearby and "Add
> to wishlist", the notification centre with a live bell and a deep link per kind; an ended
> session leads to sign-in and signed-out links reopen after sign-in; 119 new jest tests
> (535 in all), 6 new Playwright specs (34 in all), 3 new Maestro flows (13
> in all). No API, web, package or dependency change. Committed, not pushed. **Next:** independent
> verification of stage M4 (after PR #46 of M3 is merged), then push, PR and merge.

> **Mobile stage M5 (2026-10-05, branch `feature/mobile-m5` on top of `feature/mobile-m4`):**
> Phases 7 and 8 on the Expo app (see "Mobile app (stage M5)"): "Report collector" from every
> entry point the web has and My reports; rating collectors after an eligible interaction and
> references; "Make an offer" (cash / trade / cash + cards), the offers inbox, one offer with
> accept / counter / decline / withdraw and its history, offer settings, offer links in chat;
> trades with the meetup, confirmations, cancelling and rating; deep links of every offer, trade,
> rating and report notification; 69 new jest tests (604 in all), 4 new Playwright specs (38 in
> all), 2 new Maestro flows (15 in all). No API, web, package or dependency change. Committed, not
> pushed. **Next:** independent verification of stage M5 (after M3 and M4), then push, PR and
> merge.

> **E2E isolation, test-data purge and 3 km zones (2026-10-04, branch `fix/e2e-isolation-3km-zones`):**
> merged into `main` as #39 (see the section of the same name): `npm run test:e2e` runs on its
> own stack (database `orenjitrade_e2e`, API :8180, web :4300, Redis db 2, files under
> `.local-dev/e2e/`) next to `npm run dev` and deletes its emulator accounts; `npm run e2e:purge`
> removes `@example.test` accounts through the deletion path; web collector maps show 3 km zones
> (radius 1500 m), zoom capped at 14. The mobile half of the 3 km rule (Map
> tab zones, preview bottom sheet, collector profile) is done in mobile stage M3 (above).

> **Low-cost first-year production profile (2026-10-05, branch `feature/prod-low-cost`):**
> infra, API and docs builders done (see the section of the same name): Terraform for a
> ≈ US$128–140/month prod (Cloud SQL `db-g1-small` ZONAL Enterprise, Valkey sidecar, one api
> instance, Direct VPC egress, web at zero, Certificate Manager behind Cloudflare, 10 scheduler
> jobs, budget), the go-live blockers fixed (profile mapping, missing secrets, web config,
> certificate, Cloudflare Free plan, scheduler OIDC), the card image cache on `ObjectStorage`
> (ADR 0015 amendment), ADR 0016 and the deployment docs. Committed, not pushed, nothing
> applied. **Next:** independent verification, then push, PR and merge to `main` when CI is
> green (expect a merge with the launch-readiness branch on `runbooks.md`,
> `IMPLEMENTATION_STATUS.md` and `docs/security`; keep both sets of sections).

History (one vertical slice per phase, backend N+1 overlapping web N; migration ranges P1
V004–V009, P2 V010–V019, …, P10 V090–V099): stage 1 Phase 1 API · stage 2 Phase 2 API + web
Phase 1 · stage 3 Phase 3 API + web Phase 2 · stage 4 Phase 4 API + web Phase 3 · stage 5 Phase 5
API + web Phase 4 · stage 6 Phase 6 API + web Phase 5 · stage 7 Phase 7 API + web Phase 6 · stage 8
Phase 8 API + web Phase 7 · stage 9 Phase 9 API + web Phase 8 · stage 10 Phase 10 API + web Phase 9
· stage 11 web Phase 10 · stage 12 local environment tooling + web acceptance suite + final
verification.

**Exact next task — independent verification of mobile stage M5 (after M3 / M4), then the mobile Phase 9 stage:**
1. Merge PR #46 (stage M3) when CI is green, verify and merge stage M4, then verify stage M5
   independently: `npm run test:mobile` (604 jest tests), `npx expo-doctor`, `expo export` for
   android and web (63 static routes), `npm run test:mobile:e2e` (38 specs, 0 flaky, 0 skipped),
   the native check with `npm run test:mobile:maestro` (15 flows) on `Pixel_6_API_34`, plus a look
   at the offers inbox, an offer, a trade, the report screen and My reports on the emulator (sign
   in as `collector1@orenjitrade.test`: collector5's open offer waits for an answer); then push
   `feature/mobile-m5`, open the PR (base `main` after M4) and merge it when CI is green.
2. Mobile Phase 9 (next stage): payment protection on the trade screen (pay through the
   provider's checkout, ship with tracking, confirm receipt, disputes with evidence, payouts in
   Settings), replacing the "on the website for now" notes; then Phase 10 (Premium, credits, ads,
   donations) in order.
3. In parallel when useful (no owner decision needed): the backend and web debt listed above and
   Phase 13 hardening. Cloud deployment (Phase 14), device push (EAS + FCM) and ML (Phase 11) stay
   deferred / on hold until the owner lifts them.

**Exact next task on `feature/prod-low-cost` (2026-10-05) — PR open, merge, then owner steps:**
1. Done (2026-10-05): independent verification of the branch — `npm run infra:validate` (fmt +
   validate for dev/staging/prod + Cloudflare and every module standalone), `npm run test:scripts`
   (54/54), `npm run test:api` (801 tests, 0 failures, incl. `CardImageObjectStorageIT`,
   `GcsObjectStorageTest`, `LocalFileObjectStorageTest` and the card image suites), the web
   Docker image rendering every `docker-entrypoint.sh` variable into `config.json`, the
   local-dev check on port 8380 against a throw-away database and Redis db 4, and a drift read
   of ADR 0016 / `docs/deployment/README.md` against `environments/prod/{main,variables}.tf`.
   `origin/main` (mobile stages M4 and M5, #47 / #48) is merged in; the PR is open.
2. Merge the PR to `main` when CI is green; merge the launch-readiness branch's `runbooks.md` /
   `IMPLEMENTATION_STATUS.md` / `docs/security` sections alongside this one (its
   `docs/security/README.md` still lists `redis-url` among the api-run secret accessors: the
   sidecar profile creates no `redis-url` secret, drop that row in the merge).
3. Owner steps, in the documented order, when the deployment is un-deferred: GCP project + state
   bucket, bootstrap apply, Firebase web app config in tfvars, full apply, Cloudflare apply with
   the `_acme-challenge` CNAMEs DNS-only, image build + deploy, Maps key restrictions + daily
   quota, budget apply with the billing account, post-deploy checks. Confirm at that first apply
   the sidecar TCP probe against the loopback bind, the 0.1 vCPU sidecar, and the Certificate
   Manager authorization on the Cloudflare zone.
4. Backend follow-ups surfaced by this work (no owner decision needed): a database-backed
   `Idempotency-Key` for offers and reports (today Redis-only, lost on a sidecar restart); the
   `/internal/events/pubsub` receiver before enabling the domain-events push subscription
   (ADR 0009); a `storage` field on `InternalCardImageCacheStatus` once the generated clients
   can be regenerated without colliding with the mobile branches.
