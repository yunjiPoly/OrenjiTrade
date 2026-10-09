# IMPLEMENTATION_STATUS.md

Living checklist for the OrenjiTrade MVP. Legend: `[ ]` NOT STARTED · `[-]` IN PROGRESS ·
`[x]` COMPLETE (workflow verified to work, tests pass) · `[!]` BLOCKED.

A feature is marked complete only when: implementation exists, API works, UI works where
applicable, authorization works, validation works, error handling works, tests pass,
documentation is updated. Each completed item lists location, tests, migrations, and debt.

**Last updated:** 2026-10-08 (stage S1 of the 2026-10-08 product change, geography: platform regions instead of geolocation, ADR 0017 — no coordinates, distances, radii, GPS, geocoding or map provider anywhere; regions / countries / ISO 3166-2 subdivisions as admin-editable data (V106/V107); the self-declared location (country, state or province, optional city shown only on the owner's profile; V108); region-scoped search, card holders, wishlist matching, ads and analytics (V109); one community channel per platform region (V110); the web region switcher and a Leaflet vector map of bundled Natural Earth boundaries; mobile pickers and a Map tab placeholder — branch `feature/regions-geography`, builder done, not pushed; see "Platform regions and the self-declared location (stage S1)")
**Last updated:** 2026-10-06 (mobile stage M8: launch readiness on the Expo app — the 18+ confirmation (the bilingual checkbox at sign-up and on the consent screen, a first onboarding "Age" step for existing accounts, `needsOnboarding` while `ageConfirmed === false`, the `403 AGE_CONFIRMATION_REQUIRED` answer routed to the step), every consent recorded with the language shown, the French legal pages with an EN / FR switch (French by default on a French device), the dismissible "Trade safely" notice in conversations and on offers / trades, Block / Unblock on the collector profile, the money-off follow-ups (neutral limit wording, the plan-limit notification without a Premium link unless the API carries it); the mobile E2E harness and the Maestro host scripts record the age consent so the suites pass against the gated API — branch `feature/launch-readiness` with mobile stage M7 merged in (then `origin/main` with #53), builder done: 60 Playwright specs and 24 Maestro flows green; see "Mobile app (stage M8)")
**Last updated:** 2026-10-06 (mobile stage M7: the web-vs-mobile parity gaps closed on the Expo app — Google sign-in and sign-up (proven against the Auth emulator only), the Search tab's Collectors and Binders segments, the card holders list with the web's sort and filters, "Looking for" on profiles, Settings → Blocked users, inventory owner photos and multi-select bulk actions, the visibility filter, binder reordering, the map's freshness / tags filters and search box, set pages; every acceptance row's mobile half completed; the M1–M6 verification caveats replaced with their merged PRs — branch `feature/mobile-m7` on top of `feature/mobile-m6` with `origin/main` (#49, #51) merged in, builder done; see "Mobile app (stage M7)"); 2026-10-05 (mobile stage M6: Phases 9 and 10 on the Expo app — payment protection on the trade (pay on the app's fake checkout, ship, confirm receipt, disputes with statements and photos, payouts), Premium through the fake billing checkout, credits, voluntary donations through the fake donation checkout, "Sponsored" placements, "See Premium" on every reached limit, the mobile half of the acceptance tracker, app-store purchase rules recorded as an open owner question in ADR 0011 — branch `feature/mobile-m6` on top of `feature/mobile-m5`, builder done; see "Mobile app (stage M6)"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Last updated:** 2026-10-05 (launch readiness parts 4 and 5: the launch configuration — every money feature flag off by migration (V105), the last Premium entry points of the web hidden while `premiumPlans` is off, `LaunchConfigurationIT`, the `launch-config` Playwright project — the "Launch configuration" runbook section, the Quebec Law 25 operating docs (confidentiality incident register and procedure, requests from police and courts, owner account security checklist with the actual admin-MFA value per profile), and the full-UI-translation plan recorded as the next task — branch `feature/launch-readiness`, builder done; see "Launch readiness, parts 4 and 5"); 2026-10-05 (launch readiness parts 2 and 3: the "Trading safely" page, the dismissible safety notice in conversations and on offer / trade pages, Block on the collector profile, French versions of every legal page with an EN/FR switch (French by default for a French browser), the Law 25 additions to the Privacy Policy and the venue / responsibility clauses of the Terms, consents recorded with the language shown (`user_consent.language`, V104), the UI-translation assessment — branch `feature/launch-readiness`, builder done; see "Launch readiness, parts 2 and 3"); 2026-10-05 (launch readiness part 1: the 18+ rule — server-side age confirmation recorded as an `AGE_CONFIRMATION` consent, `403 AGE_CONFIRMATION_REQUIRED` gate on discoverability, messaging, community posts and offers, sign-up checkbox and onboarding age step on the web, Terms and Privacy wording — branch `feature/launch-readiness`, builder done; see "Launch readiness, part 1"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Last updated:** 2026-10-05 (mobile stage M6: Phases 9 and 10 on the Expo app — payment protection on the trade (pay on the app's fake checkout, ship, confirm receipt, disputes with statements and photos, payouts), Premium through the fake billing checkout, credits, voluntary donations through the fake donation checkout, "Sponsored" placements, "See Premium" on every reached limit, the mobile half of the acceptance tracker, app-store purchase rules recorded as an open owner question in ADR 0011 — branch `feature/mobile-m6` on top of `feature/mobile-m5`, builder done; see "Mobile app (stage M6)"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Last updated:** 2026-10-05 (low-cost first-year production profile, ADR 0016, branch `feature/prod-low-cost`: Terraform, API and docs prepared for a ≈ US$131–142/month Google Cloud prod, go-live blockers fixed, nothing applied; see "Low-cost first-year production profile"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
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

> **Reworked by stage S1 (ADR 0017, 2026-10-08):** no positions or distances any more; the items
> below describe the original Phase 4. See "Platform regions and the self-declared location (stage S1)".

_Backend complete (workflow `web-mvp-local` stage 4, independently re-verified: 463 API tests / 77 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (86 paths, previously 81; every contract route present; no path or schema lost, only `PublicBinderSummary` gains an optional `owner`); clients regenerated; live check on `.local-dev/api-snapshots/api-phase4.jar` with an emulator token). Migration V030 only (range V030–V039). Web `/map` and `/search` complete (workflow `web-mvp-local` stage 5, independently re-verified: 247 web unit tests / 51 files, lint + format clean, production build 841.71 kB initial with no warnings, 32/32 Playwright specs against `.local-dev/api-snapshots/api-phase5.jar`, 0 skipped); mobile: stage M3 (2026-10-05, see "Mobile app (stage M3)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 4 contract"; the contract document itself is not edited): the caller's own marker stays in `nearby`; collectors without public listings appear (`binderFreshness: null`, ranked after AGING), all-STALE collectors never do; ranking freshness → distance bucket → rating → distance; `center` snapped to 2 decimals; additive `MatchingItem`/`suggest` fields; `card-holders` needs a centre (400 for signed-out callers without `lat`/`lng`); the plan cap key is `map.radius.max_km` (V011) where the contract says `map.radius.max`; `nearby` is a reserved handle. Since Phase 5 blocks are real (`BlockRelationProvider.blockedAmong`, one lookup per page) but still applied after the cached page is read, so `total` may count blocked collectors beyond the limit (debt: join blocks into the discovery SQL)._

- [x] `/api/v1/collectors/nearby` (PostGIS `ST_DWithin` on `public_point`), bucketed distances — new module `apps/api/.../search`: `DiscoveryController` (`GET /collectors/nearby`, `GET /collectors/{handle}/preview`), `CollectorDiscoveryService`, `GeoScopeResolver` (centre = `lat`/`lng` or the caller's own trading area via `LocationService.searchCentreOf`, snapped to 0.01° inside the `location` module; radius capped by `Limits` `map.radius.max_km` → 429 LIMIT_REACHED, FREE rule for signed-out callers via the new `Limits.checkValueForAnonymous`; default 10 km), `MarkerAssembler` (per-viewer `PrivacyPolicyService` rules incl. new `canAppearOnMap`/`canAppearInNameSearch`: distance buckets for signed-in callers only, last active, online status, blocks, rating), `MarkerRanking`, `infra/CollectorSearchRepository` (SQL on `user_location.public_point` only, reusing `PublicVisibilityRules` and `InventoryItemRepository.LISTED`; STALE/HIDDEN items never match), `NearbyCache` (Redis 60 s, key `orenji:cache:nearby:<generation>:<sha256 of the snapped request>`) + `NearbyCacheInvalidator` (generation bumped after commit on item/binder publish/unpublish, `BinderFreshnessChanged`, `TradingAreaChanged`, `LocationRemoved`, `PrivacySettingsChanged`, `UserSuspended`/`UserUnsuspended`); routes added to `SecurityConfig.PUBLIC_GET_PATTERNS` (anonymous reads with reduced detail); `DistanceBucket.upperKm()`, `location/domain/SearchCentre`; migration V030 (`ix_inventory_item_owner_discovery`, `ix_inventory_item_printing_discovery`, `ix_privacy_settings_map`, `ix_binder_name_trgm`) — tests NearbyCollectorsIT (8: radius/freshness ranking/details by sign-in state, filters, hidden collectors, plan radius 429, preview messaging state, centre required for signed-out callers and defaulting to the own trading area, limit truncation, cache invalidation), SearchCentreTest (2). Debt: blocked collectors are filtered after the page is read (so `total` may count them) until Phase 5 blocks are joined in SQL; ratings arrive with Phase 7
- [x] `/api/v1/search` unified (cards, printings, sets, collectors, public binders) — `SearchController` (`GET /search`, `/search/suggest`), `SearchService` (resolution via new `CatalogService.resolve`/`CatalogResolution`: an exact printing code resolves the printing, a shared code / exact name / single card hit resolves the card; `collectors` then lists nearby holders with the `nearby` engine; public binders with an optional owner block via `PublicBinderService.publicBinders`; collector text matching substring-only; `suggest` mixes CARD/PRINTING/SET/COLLECTOR/BINDER/TAG), `infra/BinderSearchRepository` — tests SearchIT (4), SearchDomainTest (5)
- [x] Card-holder search: collectors near me with printing X (filters: sale/trade/offers, price, freshness, condition) — `GET /search/card-holders` (`printingId`|`cardId`, availability, condition, min/max price, freshness, edition, language, acceptsOffers, `sort=distance|price|freshness`, paged `PageResponse<CardHolderResult>`; the caller's own items excluded), `infra/CardHolderRepository`, `PublicInventoryService.publicItems(ids)` — tests CardHoldersIT (4)
- [x] Web `/map` page: MapAdapter (Google Maps / Leaflet fallback), markers, preview card, messages panel (collapsible), filters bar — `apps/web-angular/src/app/features/map` (stage 5): `MapPageComponent` container + `data/map-discovery.store.ts`; filters in the URL (game, availability, freshness, tags, radius, card/printing, `view=list`), never the map position; signed-in collectors with a trading area are centred by the server (first `GET /collectors/nearby` without `lat`/`lng`; the page never calls `GET /me/location`), signed-out visitors / collectors without an area get Montréal + city picker + "Sign in / Set my area" prompt (`area-prompt`, `shared/discovery/discovery-centre.ts`); viewport moves debounced 400 ms, re-query only when the view leaves the circle last answered, visible radius capped by the plan's `map.radius.max_km` (`GET /me/plan`, FREE when signed out), centre rounded to 2 decimals, 429 LIMIT_REACHED → limit-reached dialog + retry at the cap, 400 (no trading area) → Montréal; avatar markers with a freshness ring (`markerIconHtml`, HTML-escaped, both adapters), in-house screen-space clustering above 60 (selected collector never clustered, cluster click zooms), keyboard-focusable markers (Enter/Space → preview); `collector-preview` card on `GET /collectors/{handle}/preview` + first public binder (View profile / View public binder / Message disabled until web Phase 5; Escape restores focus; bottom sheet on phones); `collector-list` accessible "List" toggle; `map-canvas`, `map-filters-bar` (game, radius slider, availability, freshness, lazily loaded tags), `map-legend` ("Positions are approximate to protect privacy"; since 2026-10-03 "Locations are approximate (about 2 km) to protect privacy", see "Map location privacy rendering"), `discovery-panel` (map search box on `GET /search/suggest` grouped by type: card/printing → "Holders of X" side list with chips and prices, collector → preview, tag → filter, set/binder → their pages; Messages placeholder panel); `shared/map` gains `zoomControlPosition`, `shared/search`. `/search` (`features/search`: `?q=` tabs Cards / Collectors / Binders on `GET /search` with a nearby-holders banner when resolved; `?card=`/`?printing=` card-holders view on `GET /search/card-holders` with every filter, inline-validated price range, sort and pagination); card detail "Who has this near me" → `/map?card=<id>&view=list`. Generated `@orenji/api-client` only. Tests: Vitest (map page, store, adapter, list, preview, filters, search pages) — 247 web unit tests / 51 files; Playwright `e2e/map.spec.ts` (2, see below); `e2e/support/stack.ts` gains `stubMapTiles` (OSM tiles served from memory) and `createOnboardedCollector({area, displayName})`. Debt: the Messages panel is a placeholder until web Phase 5; admin entitlements / plan editing UI and a `/sets` index page still pending (carry-over)
- [x] Collector preview → full profile → public binder → message — API: `GET /collectors/{handle}/preview` (marker + `canMessage`/`isBlocked`, 404 for collectors not on the map; NearbyCollectorsIT; `canMessage`/`isBlocked` real since Phase 5); web: marker → preview → full profile → public binder proven by Playwright `map.spec.ts`; "Message" from the preview opens (or creates, `POST /conversations`) the conversation in the map's Messages panel and the collector page's Message opens `/messages/:id` (stage 6, Playwright `messaging.spec.ts`)
- [x] Mobile map tab with bottom-sheet preview — stage M3 (2026-10-05, branch `feature/mobile-m3`, merged into `main` as #46): collectors as zones 3 km wide (radius 1500 m, never pins) on react-native-maps / Leaflet in a WebView (Expo Go, no key) / Leaflet on web, zoom capped at 14 for gestures and every camera request, game / intent / distance filters, "Who has this near me" (`hasCardId`), list view, preview bottom sheet (View profile, public binder, Message when allowed, Show on map), the collector profile with its approximate area, ratings, references and binders; jest, Playwright (`map.spec.ts`, `collector-map-page.spec.ts`) and Maestro (`map-preview-profile.yaml`, `card-who-near-me.yaml`). See "Mobile app (stage M3)"
- [x] Tests: geo search, no exact coordinates in any response (contract test), ranking fresh > stale — NearbyCollectorsIT, SearchIT, CardHoldersIT, SearchDomainTest (`rankingIsFreshnessThenDistanceBucketThenRatingThenDistance`, canonical cache keys never holding the raw centre), GeoPrivacyContractTest `mapAndSearchResponsesOnlyEverCarryPublicPoints` (nearby, preview, unified search, binder search, card holders, suggest; anonymous and signed in: every point is the stored public point or the snapped centre, ≤ 3 decimals, no private location keys or notes, non-discoverable collectors 404/absent, no distance buckets for signed-out callers, logs free of coordinates), PrivacyPolicyServiceTest (extended); web Playwright `map.spec.ts` (collector A publishes a card, collector B opens `/map`, finds A's avatar marker, opens the preview, uses the List toggle by keyboard, opens A's profile and public binder; card search in the map box → "Holders of" list with price and chips → card-holders view with an inverted price-range message and URL-kept max price/availability → `/search?q=AZR-EN011` banner + Collectors tab; both scenarios assert every JSON lat/lng has ≤ 3 decimals and never equals A's or B's stored trading-area centre; random rural areas per run so earlier data never crowds the map)

## Phase 5 — Chat

_Backend complete (workflow `web-mvp-local` stage 5, independently re-verified: 517 API tests / 86 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (105 paths, previously 86; every contract route present; no path, operation or schema lost; `ProblemDetail.errorCode` gains `MESSAGE_BLOCKED`, `POST_BLOCKED`, `DUPLICATE_POST`); clients regenerated; live check on `.local-dev/api-snapshots/api-phase5.jar` (= `api-latest.jar`) with emulator tokens: seeded conversation, messages, send 201, channels, posts, `/me/blocks`, moderator flags 200, collector on admin flags 403, no token 401, no coordinates in any body, `message_sent` analytics event without text). Migrations V040–V042 (range V040–V049). Web messages panel, `/messages`, `/community` and Admin → Community complete (workflow `web-mvp-local-continue` stage 6, independently re-verified: 333 web unit tests / 68 files, lint + format clean, production build 847.13 kB initial with no warnings, 36/36 Playwright specs against `.local-dev/api-snapshots/api-phase6.jar`, 0 skipped); mobile: stage M4 (2026-10-05, see "Mobile app (stage M4)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 5 contract"; the contract document itself is not edited): `POST /conversations` 201 new / 200 existing; the recipient's messaging permission applies to new conversations only; additive fields/routes (`MessageResponse.conversationId`, `CardLink.cardId`, `ConversationSummary.createdAt`, `LastMessage.id`, `?archived=`, upload `width`/`height`/`expiresAt`, `PostResponse.channelSlug`/`moderationState`, `PATCH /community/posts/{id}`, `POST /admin/community/replies/{id}/remove`, `GET /admin/community/channels`, `POST /admin/moderation/flags/{id}/resolve`); `POST /uploads/images` `kind=INVENTORY` is 400; `moderation_flag` adds `author_id`/`resolution_note`; realtime pushes are sent from the request thread after commit._

- [x] Private conversations, messages (text, card/binder/offer links, images), read/unread — `apps/api/.../messaging`: `ConversationService` (one DIRECT conversation per pair via `conversation_pair`, cursor pages through `common/TimeCursor`, TEXT / CARD_LINK / BINDER_LINK (public binders only) / IMAGE messages, forward-only read markers, per-participant mute/archive, a new message un-archives), `ImageUploadService` (`POST /uploads/images` kind=MESSAGE: sniffed JPEG/PNG/WebP ≤ 8 MB, re-encoded without metadata, `ImageUploadInspector` hook, attach within 1 h, 30/hour) + `UploadCleanupJob` (`POST /internal/jobs/upload-cleanup`, every 15 min under `local`), `MessagingAccountData` (export + deletion participant), `MessagingSeedContributor` (collector1 ↔ collector2, six messages incl. card and binder links); shared `cards/CardLink` + `CatalogService.cardLink`, `binders/BinderLink` + `PublicBinderService.binderLink`, `profiles/MemberDirectory`/`MemberCard`; migration V040 (`conversation`, `conversation_participant`, `conversation_pair`, `message`, `message_attachment`, `image_upload`, `user_block`) — tests ConversationIT (9), MessagePreviewsTest (3), TimeCursorTest (7). OFFER_LINK messages are real since Phase 8 (an offer between the two participants; OFFER_LINK and SYSTEM messages show the live proposal through the offers module's `OfferLinkResolver`). Debt: message photos are served from unguessable media keys, signed URLs wait for the cloud storage work; `MessageSent`/`MessageRead` are in the event registry for Phase 6 notifications
- [x] WebSocket (STOMP) realtime + Redis fan-out across instances — `messaging/infra`: `RealtimeConfig` (native WebSocket `/ws`, no SockJS, origins = `CORS_ALLOWED_ORIGINS`), `TokenHandshakeInterceptor` (`Authorization` header or `?access_token=`, never logged; 401/403 at the handshake), `StompSecurityInterceptor` (CONNECT auth, SUBSCRIBE only to the caller's own `/user/queue/messages|receipts|typing|presence|notifications|errors`, SEND only to `/app/typing`), `RedisRealtimePublisher` / `RealtimeRedisListener` (`rt:user:{userId}` fan-out), `PresenceTracker` / `PresenceStore` (`presence:{userId}` TTL 60 s, shown only with `showOnlineStatus`; `PresenceProvider` makes profile/marker/conversation `onlineStatus` real), `RealtimeTypingController` — tests RealtimeIT (3: messages, receipts, typing and presence reach the partner over two real STOMP clients; foreign `/user/<id>/queue` subscriptions refused; bad or missing tokens never get a session). Debt: open sessions of an account suspended later are not closed (REST sends are refused)
- [x] Block user, report entry points, moderation hooks, rate limits — blocks: `BlockService`, `POST/DELETE /users/{id}/block`, `GET /me/blocks` (idempotent, private reason), messaging implements the profiles `BlockRelationProvider` (new batch `blockedAmong`, used by `MarkerAssembler`) so profiles, map markers, previews, public binders, binder links and community feeds honour blocks both ways; moderation: `ModerationService.check(scope, text, authorId)` (Redis per-author `RATE_LIMIT` rules, accent-insensitive `BANNED_TERM` regexes via `TextModerationService.matches`, `THRESHOLD` repeated-content detection on SHA-256 of normalised text; BLOCK → 422 `MESSAGE_BLOCKED`/`POST_BLOCKED` or 429, FLAG → `moderation_flag`), `AdminModerationController` (`GET /admin/moderation/flags`, `POST /admin/moderation/flags/{id}/resolve`, MODERATOR+ via the `AdminAuthorizationManager(requireMfa, allowModerators)` overload, audited); migration V042 (`moderation_flag`, rate-pattern check, seed rules: placeholder banned terms, 30 messages/min, 60 posts+replies/hour, repeated-content thresholds) — tests MessagingAuthorizationIT (4: non-participants 404, anonymous 401, blocks hide conversations both ways and forbid new ones, recipient messaging permission, suspended recipients), ModerationIT (4), ModerationRulesTest (11), ConversationIT `theRateRuleAllowsThirtyMessagesPerMinute`. Web (stage 6): block/unblock with confirmation from the thread menu and the community post menu (`shared/messaging/block-actions.service.ts`), Settings → Blocked users (`GET /me/blocks`, Unblock), 403 `MESSAGING_BLOCKED` / 422 `MESSAGE_BLOCKED` / `POST_BLOCKED` / 429 shown inline — Playwright `messaging.spec.ts`, `community.spec.ts`. "Report collector" entry points enabled in stage 8 (profile, map preview, thread menu, community post menu, public binder owner card → Phase 7 report dialog; Playwright `reporting.spec.ts`). Debt: blocks are not yet joined into the discovery SQL (Phase 4 debt)
- [x] Public community channels (game / region / looking-for / new listings / trades / general) — `apps/api/.../community`: `CommunityService` (channels with `postCount24h`, posts/replies with author cards, edit/delete, per-channel `post_rate_limit_per_hour`, 409 `DUPLICATE_POST` within 24 h, moderation), `AdminCommunityController` (channels list/create/update, post/reply removal resolving open flags; audited), `RegionChannelListener` (a REGION channel per public-label city as collectors appear), `CommunitySeedContributor` (five posts, three replies), export + deletion participant, gated by the `publicChat` flag; migration V041 (`community_channel` with the eight launch channels, `community_post` with `body_hash`, `community_reply`) — tests CommunityIT (8), RegionChannelsTest (2)
- [x] Web messaging panel + `/messages` + `/community` + Admin → Community — `apps/web-angular/src/app` (stage 6): `core/realtime` (`RealtimeService` started by `provideRealtime()` while a ready account is signed in; hand-written STOMP 1.2 client over a native WebSocket in a lazy chunk (`stomp-frames.ts`, `stomp-connection.ts`, no new dependency), `ws://<api>/ws?access_token=<ID token>`, subscribes only to `/user/queue/messages|receipts|typing|presence`, sends only `/app/typing`, heartbeats, exponential backoff 1 s → 30 s with jitter, fresh token after a refused handshake, `resync$` → REST re-read after every (re)connection); `features/messages` (`MessengerComponent` + `ConversationsStore` (cursor inbox, live previews/order/unread counts, presence, mute/archive `PATCH`, pages older conversations until a linked one is found) → `ConversationListComponent` (keyboard navigation) and `ThreadViewComponent` + `ThreadStore` (newest page first, older pages on scroll, read marker only while visible, typing notices throttled, "Sent" → "Seen" receipts, inline 403 `MESSAGING_BLOCKED` / 422 `MESSAGE_BLOCKED` / 429) with header (profile, mute, archive, block/unblock, "Report collector" disabled until Phase 7), message list/bubbles (text, card, binder, photo, offer, removed) and composer (Enter sends, card link via `/cards/suggest`, own public binder, JPEG/PNG/WebP ≤ 8 MB photo via `POST /uploads/images` kind MESSAGE), realtime status "Live"/"Reconnecting…"); map right-hand Messages panel with unread badge on its toggle and the preview's Message button; full-page `/messages`, `/messages/:id`; `shared/links` (card/binder link pickers, link card), `shared/messaging` (`ConversationStarterService`, `BlockActionsService`), `shared/pipes/media-url.pipe.ts` (API-relative media paths of pushed payloads); Settings → Blocked users; `features/community` (`/community`, `/community/:slug` behind `featureGuard('publicChat')`: `CommunityStore`, channel sidebar with game filter folding behind a button on narrow screens, post composer with card/binder links and inline 409 `DUPLICATE_POST` / 422 `POST_BLOCKED` / 429, post edit/delete, inline replies, author block, moderator removal with a required reason); `features/admin/community` (moderators and admins: channels create/edit/archive/restore, moderation flags by state with resolve + optional note, `?tab=flags`; community audit labels). Generated `@orenji/api-client` only. Tests: Vitest units (STOMP frames/connection, realtime service, message text, drafts, thread items, conversations/thread stores, composer, conversation list, community helpers/store, link choices, blocked-users settings, conversation starter, admin community labels, media URL pipe) — 333 web unit tests / 68 files; Playwright `e2e/messaging.spec.ts` (2: A finds B on the map → Message → text + card via autocomplete; B on `/messages` gets it live with unread badge 2, A sees "Seen", B's typing, reply and photo reach A live; A blocks B from the thread menu, B's next message is refused inline and `POST /conversations` answers 403 `MESSAGING_BLOCKED`; A unblocks in Settings; a conversation started from a collector profile full page: text file rejected, photo sent, 422 banned-term refusal inline, reopened from the list by keyboard; every JSON lat/lng ≤ 3 decimals) and `e2e/community.spec.ts` (2: post with a card link in Montréal / Pokémon, duplicate 409 and banned-term 422 inline, edit, reply from a second collector, delete; moderator removal with a reason and resolving the raised flag in Admin → Community). Existing specs adjusted (`map.spec.ts`/`settings.spec.ts` Message enabled, `smoke.spec.ts` exact "Sign in", `support/inventory.ts` bounded coordinate settle). Debt: no single-conversation REST endpoint (deep links page back through the inbox); STOMP payloads other than `MessageResponse` are typed by hand in `core/realtime/realtime-events.ts` (not in the OpenAPI document); "Report collector" enabled in stage 8; the composer cannot send OFFER_LINK messages yet (API ready since Phase 8; web offer UI is stage 9)
- [x] Mobile Messages tab — stage M4 (2026-10-05, branch `feature/mobile-m4`, merged into `main` as #47): the realtime STOMP client over the app's WebSocket (handshake `Authorization` header natively, `?access_token=` on the web build; backoff, background pause, NUL-safe frames on React Native), the Messages tab (Inbox | Community) with unread counts and the tab badge, the conversation at web parity (card / binder / offer links, photos, read markers, typing, "Seen", mute / archive / block with a confirmation, refusals explained) and the community channels (posts, replies, own edits and deletes, per-channel limits explained); since stage M5 the conversation options also rate and report the other collector, offer links open the offer and the composer shares one. See "Mobile app (stage M4)" and "(stage M5)"
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
- [x] Mobile report dialog, My reports, ratings and references — stage M5 (2026-10-05, branch `feature/mobile-m5`, merged into `main` as #48): "Report collector" (`app/report.tsx`: the API's reasons in order, details ≤ 1000, `Idempotency-Key`, 409 / 422 / 404 / 429 / 400 explained, the confirmation) from profiles, the map preview (PROFILE), conversations (CONVERSATION), community posts (POST) and public binders (BINDER); Settings → My reports (statuses only; REPORT_DECISION opens it); rating a collector after an eligible interaction (`app/ratings/rate.tsx`: the interaction, overall + communication / card condition / shipping / meetup reliability, comment ≤ 600, the own rating edited within 14 days) from profiles, conversations and completed trades; one reference per collector (`app/ratings/reference.tsx`, ≤ 400, banned terms explained); the profile's ratings and references with the API's cursor pages, the interaction kind and criteria of each rating, and why rating is not possible yet; RATING_RECEIVED opens the own profile at the ratings. Admin and moderator consoles stay web-only. See "Mobile app (stage M5)"
- [x] Tests: rating eligibility, report flow, admin RBAC, audit generation, delist state machine — RatingEligibilityIT, ReportFlowIT, ReportThresholdIT, AdminAuthorizationIT, DelistingAdminIT, StrikesIT, DashboardIT + unit RatingRulesTest, ReportRulesTest, ModerationRuleValidationTest, StrikeRulesTest; extended GeoPrivacyContractTest `ratingsReportsAndAdminConsoleResponsesNeverCarryCoordinates` (ratings, references, eligibility, `/me/reports`, `/me/listings/status`, report reasons and every new admin console response incl. report detail with history; logs clean), AnalyticsIT, SeedDataRunnerIT, OpenApiExportTest; web flow tests (stage 8): Playwright `reporting.spec.ts` (2), `rating.spec.ts` (1), `admin-moderation.spec.ts` (1), `messaging.spec.ts`/`community.spec.ts` now expect "Report collector" enabled, all asserting every JSON lat/lng ≤ 3 decimals; mobile (stage M5): jest (`features/reportsRatings`, `screens/reports`, `screens/ratings`, the report and rate entry points in `screens/{collector,conversation,map,binders,community-channel}`), Playwright `reports.spec.ts` (2) and the rating part of `offers.spec.ts`, Maestro `report-collector.yaml` and `offer-trade-rating.yaml`. Debt: blocks still not joined into the Phase 4 discovery SQL; binder names/descriptions and public notes still not checked by `TextModerationService` (Phase 3 debt); open STOMP sessions of accounts suspended through a report decision stay open (REST refused)

## Phase 8 — Offers + Trade Workflow

_Backend complete (workflow `web-mvp-local-continue` stage 8, independently re-verified: 631 API tests / 116 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (168 paths, previously 155; every contract route present; no path, operation or schema lost; 24 schemas added; existing schemas changed only additively: `NotificationResponse.type` gains `OFFER_CANCELLED`/`OFFER_EXPIRED`, `ProblemDetail.errorCode` gains `OFFERS_NOT_ACCEPTED`, `OFFER_ALREADY_OPEN`, `STALE_OFFER`, `NOT_YOUR_TURN`, `INVALID_STATE_TRANSITION`, `ITEM_UNAVAILABLE`, `TRADING_BLOCKED`, `SendMessageRequest` descriptions); clients regenerated (new `OffersService`, `TradesService`); live check on `.local-dev/api-snapshots/api-phase8.jar` (= `api-latest.jar`) with emulator tokens: V070/V071 applied, 15 seed contributors, collector1's seller inbox (seeded OPEN offer on its turn + two ACCEPTED), offer detail with `allowedActions` ACCEPT/COUNTER/DECLINE, a stranger 404, trades COMPLETED with `nextAction` NONE, `/me/settings/offers`, accepting the superseded seeded offer 409 `STALE_OFFER` with `latestOfferId`, anonymous 401; parties carry only a region label and a distance bucket; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V070–V071 (range V070–V079). Web Phase 8 complete (workflow `web-mvp-local-continue` stage 9, independently re-verified: 485 web unit tests / 102 files + 44/44 Playwright specs against the real local stack on `api-phase9.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 8 contract"; the contract document itself is not edited): `parent_offer_id` is the answered proposal with an additive `root_offer_id` and `superseded_by` (the live proposal is the row without it); `accepts_mixed` lives in the offers module (`offer_preferences`, `GET/PUT /me/settings/offers`); kinds must also fit the card's availability; responses list `tradeItems [{inventoryItemId, quantity, item}]` and add `rootOfferId`, `latestOfferId`, `viewerRole`, `superseded`, `version`, `protectionRequested`, `allowedActions`, `tradeId`; `version` optional in action bodies; a counter-offer must change the deal (400); additive error codes; offers from blocked collectors 404; `meetup` needs both parties' marks and drops protection, `complete` is AGREED-only with both confirmations, `cancel` requires a reason; notifications add OFFER_CANCELLED/OFFER_EXPIRED and SYSTEM messages are posted for every offer transition and trade completion/cancellation._

- [x] Offers (cash/trade/mixed) lifecycle OPEN → COUNTERED → ACCEPTED → DECLINED/CANCELLED/EXPIRED with history — `apps/api/.../offers`: migration V070 (`offer` one row per proposal of a counter chain with `root_offer_id`, `parent_offer_id`, deferrable `superseded_by`, `current_turn`, optimistic `version`, `closed_at`, public `item_snapshot`, `protection_requested`; `offer_trade_item`; `offer_event` (snapshot, reason, seq); `offer_preferences`; partial unique `uq_offer_live_buyer_item` backing 409 `OFFER_ALREADY_OPEN`; unique `message.payload->>'systemKey'` making SYSTEM messages idempotent); `OfferService` (create: card effectively public and visible to the buyer, blocks → 404, 422 `OFFERS_NOT_ACCEPTED` for `acceptsOffers` false / NOT_AVAILABLE / COLLECTION_ONLY / kind not fitting the availability / MIXED without `acceptsMixed`, trade cards the buyer's own non-deleted items with enough copies, `offers.per_day` through `Limits` (429), `Idempotency-Key` (Redis, fail-open), `protectionRequested` needs a cash part and the `protectedPayments` flag; inbox `GET /offers?role=&status=&cursor=`; detail with the whole chain's history (VIEWED recorded once); counter / accept / decline / cancel; export + deletion (open trades block deletion, live negotiations withdrawn)); pure `OfferStateMachine` (409 `NOT_YOUR_TURN`, `INVALID_STATE_TRANSITION` with `currentStatus`, `STALE_OFFER` with `latestOfferId`/`currentVersion`, 403 seller cancel, 403 `TRADING_BLOCKED` under a block or with an inactive party); every transition appends an `offer_event` and publishes `OfferCreated`/`OfferUpdated` → `OfferActivityListener` (`@ApplicationModuleListener`) → `OfferActivity` (OFFER_RECEIVED / OFFER_COUNTERED / OFFER_DECLINED / new OFFER_CANCELLED to the other party, OFFER_ACCEPTED / new OFFER_EXPIRED to both; SYSTEM message with the offer link in the pair conversation through new `ConversationService.postSystemMessage`, deduplicated per key); acceptance opens the trade through the `AcceptedOfferHandler` extension point and records `InteractionService` OFFER_ACCEPTED; `POST /internal/jobs/offers-expire` (service auth, `job_run`) + hourly `OfferExpiryScheduler` under `local`; OFFER_LINK messages real (`OfferLinkResolver`); analytics `offer_created`, `offer_status_changed` (no amounts, ids or text); seed `OfferSeedContributor` (reserved `…9c00…0001`/`…0002` accepted, `…0003` OPEN on collector1's turn, `…0004`/`…0005` MIXED countered chain) — tests OfferStateMachineIT (4), OfferAuthorizationIT (6), OfferExpiryJobIT (2), OfferLimitIT (1), OfferStateMachineTest (4), OfferRulesTest (6), SeedDataRunnerIT `seedsOffersAndTradesOnTheReservedIds`. Debt: `Idempotency-Key` replay is fail-open when Redis is down
- [x] Trades: created from accepted offer, statuses, buyer/seller views — `apps/api/.../trades` (implements `AcceptedOfferHandler`): migration V071 (`trade` unique per offer with meetup/confirmation/cancel columns and `version`, `trade_event` with seq); `TradeService` (`GET /trades?role=&status=&cursor=`, `GET /trades/{id}` with `nextAction`, `allowedOperations`, timeline, `payment`/`dispute` null until Phase 9; `POST /trades/{id}/meetup` (both marks → `meetup`, protection dropped AWAITING_PAYMENT → AGREED), `complete` (AGREED only, both confirmations → COMPLETED, `InventoryService.reserveAndTransfer` lowers the seller's card by 1 and the buyer's trade cards by their quantities, last copy soft-deleted and unpublished, `interaction(TRADE)` → rating eligibility), `cancel` (reason required, AGREED / AWAITING_PAYMENT only)); accepting needs an unpromised copy (409 `ITEM_UNAVAILABLE`); `TradeUpdated` → `TradeActivity` (TRADE_UPDATE notifications, SYSTEM messages on completion/cancellation); analytics `trade_status_changed`; seed `TradeSeedContributor` (reserved `…9d00…0001` meetup COMPLETED, `…9d00…0002` COMPLETED) — tests TradeLifecycleIT (4), TradeRulesTest (3). Debt: receivers add received cards to their inventory themselves (`POST /inventory/items`; the web trade page links "Add to my inventory"); Phase 9 payment states (`/pay`, `/ship`, `/confirm-receipt`) built in stage 9 (see Phase 9)
- [x] Web offer UI — `apps/web-angular/src/app` (stage 9, generated `@orenji/api-client` only: `OffersService`, `TradesService`, `MessagingService`, `RatingsService`): `shared/offers` (offer/trade labels, `OfferTarget` view model + builders, `offer-form.ts` validation and create/counter bodies, `offer-problems.ts` error mapping, `MakeOfferButton` + `MakeOfferDialog` (only the kinds the card's availability and `acceptsOffers` allow: cash / trade / cash + cards; trade cards picked from the caller's own inventory incl. private cards with copy counts; note ≤ 500; expiry; `Idempotency-Key` fixed per dialog; inline 422 `OFFERS_NOT_ACCEPTED`, 409 `OFFER_ALREADY_OPEN` with a link to the open offer, 404/403/400; 429 through the limit dialog), trade card picker, reason dialog, `DealSummary`, `OfferPartyCard` (region label + distance bucket only), `StatusChip`, `OfferLinkCard`, `OfferLinkPicker`, `CursorList`, `OfferActionsService`); entry points on public binder cards, the collector page's public cards, card-holder results, the map's holders list and wishlist matches; `features/offers` (`/offers` inbox: Received / Sent tabs, status filter, cursor pages, "Your turn" badges, live reload on offer notifications; `/offers/:id`: card, deal side by side, both parties, full history timeline, Accept / Counter / Decline / Withdraw only from `allowedActions`, `version` always sent, 409 `STALE_OFFER` moves to `latestOfferId`, `NOT_YOUR_TURN` / `INVALID_STATE_TRANSITION` / `ITEM_UNAVAILABLE` re-read the offer, `TRADING_BLOCKED` explained, follows a counter live); `features/trades` (`/trades` list; `/trades/:id` with the next-action banner, both parties' meetup marks and confirmations, deal, timeline, Cancel with a required reason, "Rate <name>" and "Add to my inventory" (`/inventory?add=`) after completion); messaging renders OFFER_LINK and the API's SYSTEM offer messages as offer cards, composer "Share an offer", messages page links to Offers and Trades; Settings → Offers "Accept mixed offers" (`GET/PUT /me/settings/offers`); notification kinds OFFER_CANCELLED / OFFER_EXPIRED with offer/trade link fallbacks; account menu Offers and Trades; quantity stepper moved to `shared/ui/quantity-stepper` — Vitest (offer form, labels, problems, link card/picker, make-offer dialog, action bar, offer detail/inbox stores, trade detail store, notification kinds, message draft), Playwright `offers.spec.ts` (2: cash offer → 409 duplicate → shared in the composer → notification + SYSTEM/OFFER_LINK cards → refused unchanged counter → counter → accept from the inbox → meetup + both confirmations → COMPLETED, seller copies 2 → 1 → rating from the trade page; mixed offers off → inline 422, trade offer with two copies of a private card, stale answer 409 → live proposal, decline with a reason, withdraw, inbox status filter, stranger 404 page; every JSON lat/lng ≤ 3 decimals). Debt: the generated `ProblemDetail` does not declare the per-endpoint extensions `latestOfferId`, `offerId`, `currentStatus` (read defensively through `problemExtension()`)
- [x] Mobile offer and trade UI — stage M5 (2026-10-05, branch `feature/mobile-m5`, merged into `main` as #48): "Make an offer" on public cards from public binders, profiles, the map preview's holders and wishlist matches (`app/offers/new.tsx`: only the kinds the availability allows, amount and currency, the buyer's own cards with copies, note, expiry, `Idempotency-Key`; 422 / 409 with the open offer / 404 / 400 / 429 `offers.per_day` explained), the offers inbox (`app/offers/index.tsx`: Received / Sent, All / Active / Accepted / Closed incl. EXPIRED, "N offers wait for your answer", cursor pages), one offer (`app/offers/[id].tsx`: whose turn, only `allowedActions`, accept after a confirmation, counter (`app/offers/counter.tsx`), decline / withdraw with an optional reason, the deal, both parties with a region label and a distance bucket only, the chain's history, follows a counter-offer live, 409 `STALE_OFFER` → latest proposal), offer settings, offer links in chat open the offer and "Share an offer" in the composer; trades (`app/trades/{index,[id]}.tsx`: both sides, the next move, meetup, confirm the exchange, cancel with a reason, timeline, received cards, rating once completed; protected trades explain that paying, shipping and disputes stay on the website until the Phase 9 stage). Offer and trade notifications open their screens. See "Mobile app (stage M5)"
- [x] Tests: state machine, authorization, audit history — OfferStateMachineIT, OfferAuthorizationIT, TradeLifecycleIT, OfferExpiryJobIT, OfferLimitIT + unit OfferStateMachineTest, OfferRulesTest, TradeRulesTest; extended GeoPrivacyContractTest `offersAndTradesNeverCarryCoordinatesOrPrivateNotes` (offer detail for both parties, inboxes, countered chain, trades, offer settings: public listings only, parties with a region label and no point, strangers 404, logs clean), AnalyticsIT `phase8OfferAndTradeEventsCarryNoAmountsIdsOrText`, SeedDataRunnerIT, OpenApiExportTest; web flow tests (stage 9): Playwright `offers.spec.ts` (2), `messaging.spec.ts` updated for the "Attach a card, binder, offer or photo" button; mobile (stage M5): jest (`features/offers`, `features/trades`, `screens/offers`, `screens/trades`, the offer entry points and "Share an offer" in `screens/{collector,map,binders,wishlist,conversation}`), Playwright `offers.spec.ts` (2), Maestro `offer-trade-rating.yaml`

## Phase 9 — Payments + Disputes (feature-flagged)

_Backend complete (workflow `web-mvp-local-continue` stage 9, independently re-verified: 661 API tests / 126 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (199 paths, previously 168; 227 operations, previously 195; 295 schemas, previously 257; every contract route present; no path, operation or schema lost; no duplicate operationIds; existing schemas changed only additively: `PaymentSummary`, `DisputeSummary`, `TradeResponse.shipment`, `TradeEvent` event values, `NotificationResponse.type` `DISPUTE_UPDATE`, `ProblemDetail.errorCode`); clients regenerated (new `PaymentsService`, `DisputesService`, `AdminPaymentsService`, `WebhooksService`); live check on `.local-dev/api-snapshots/api-phase9.jar` (= `api-latest.jar`) on the local stack with emulator tokens: V080/V081 applied, 16 seed contributors (new "payments"), anonymous `GET /me/seller-account` 401, collector1's fake payout account ACTIVE/ready, seeded protected trade `…9d00…0003` for collector8 SHIPPED/SECURED with `nextAction` CONFIRM_RECEIPT and CONFIRM_RECEIPT/OPEN_DISPUTE, seeded dispute `…9f00…0101` for collector5 OPEN (1 evidence, 2 messages), a stranger 404, a collector on `/admin/disputes` 403, a bad-signature webhook 400 `WEBHOOK_SIGNATURE_INVALID` stored IGNORED, admin dispute queue and dashboard `openDisputes` 1 / `webhookFailures24h` 1; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V080–V081 (range V080–V089). Flag `protectedPayments` (seeded on locally): member routes 404 `FEATURE_DISABLED` when off; admin routes stay available. Web payment/dispute flows and admin sections complete (workflow `web-mvp-local-continue` stage 10, independently re-verified: 537 web unit tests / 113 files, lint + format clean, production build 875.02 kB initial with no warnings, 46/46 Playwright specs against `.local-dev/api-snapshots/api-phase10.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 9 contract"; the contract document itself is not edited): adapter-friendly `PaymentProvider` signatures (+ `cancelPayment`, `PayoutRequest`, idempotency keys); the fake checkout adds `GET /payments/fake/{ref}` and the buyer's `POST /payments/fake/{ref}/confirm` (checkout URL = web path `/checkout/fake/<ref>`); webhook idempotency per `(provider, provider_event_id)`; additive columns and tables (`payment_refund`, `dispute_message`, `dispute_note`, `platform_settings` `payments.release_reminder_hours` / `payments.admin_refunds_enabled`); VIDEO evidence reserved (400); SPLIT or partial refunds followed by the payout end PARTIALLY_REFUNDED; FROZEN is an admin hold; additive error codes `SELLER_NOT_ONBOARDED`, `DISPUTE_WINDOW_CLOSED`, `EVIDENCE_LIMIT_REACHED`, `WEBHOOK_SIGNATURE_INVALID`; admin payment routes are not flag-gated._

- [x] `PaymentProvider` abstraction, `FakePaymentProvider`, Stripe Connect adapter skeleton — `apps/api/.../payments` (`domain/PaymentProvider`, `infra/PaymentProviderConfig` selects exactly one from `PAYMENT_PROVIDER`): `FakePaymentProvider` (default everywhere: no network, no money, instant ACTIVE onboarding, `fake_pi` refs, checkout URL `/checkout/fake/<ref>` (`FAKE_CHECKOUT_BASE_URL` prefix), idempotent payouts/refunds, synthetic webhooks signed `X-Fake-Signature` in the Stripe `t=…,v1=…` format with the local `FAKE_PAYMENTS_WEBHOOK_SECRET`); `StripeConnectProvider` (only with `PAYMENT_PROVIDER=stripe`; Connect Express accounts + account links, PaymentIntent with `transfer_group`, Transfer on release, Refunds, `Stripe-Signature` verification with a 5-minute tolerance; Spring `RestClient`, no SDK dependency; start-up fails without `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`; never required locally); seller payout accounts `GET /me/seller-account`, `POST /me/seller-account/onboarding` (`SellerAccountService`, return URL a web path) — migration V080 (`seller_account`, `platform_settings` with the `payments.*` rows) — tests FakePaymentProviderTest (3), StripeConnectProviderTest (5: signature verification with a test secret, event/account/form mapping, no network). Debt: the Stripe adapter is compile- and unit-tested only (no Stripe account; cloud/real-provider work deferred, docs/deployment/DEFERRED.md)
- [x] Protected transaction flow: secure payment → ship → confirm shipment → confirm receipt → payout — `ProtectedPaymentService` on the Phase 8 `trade` through the trades module's new `TradeProtection` extension point (fills `TradeResponse.payment` / `shipment` / `dispute`) and `TradeService.advance` / `recordProtectedEvent` / `completeProtected` / `cancelProtected` / `lockForPayment` (completion logic extracted into `finish()`, no rewrite): `POST /trades/{id}/pay` (buyer, AWAITING_PAYMENT, 409 `SELLER_NOT_ONBOARDED` until the seller is ACTIVE; fee `payments.platform_fee_percent`; open checkouts answered again, failed ones restarted) → webhook `payment.secured` → payment SECURED, trade PAID; `POST /trades/{id}/ship` (seller, optional carrier / tracking / notes; the dispute window starts); `POST /trades/{id}/confirm-receipt` (buyer) → RECEIVED → `releasePayout` → COMPLETED / PAID_OUT with inventory transfer and the TRADE interaction; `payment.failed` → FAILED (pay again restarts); a cancelled trade or agreed meetup cancels an unpaid checkout, a late `payment.secured` is refunded at once; `POST /internal/jobs/payments-auto-release` (service auth, `job_run`) + hourly `AutoReleaseScheduler` under `local` (buyer reminder `payments.release_reminder_hours` before the window end, releases only after the window without an open dispute, no-op while `payments.auto_release_enabled` is false); fake checkout `GET /payments/fake/{ref}` + buyer `POST /payments/fake/{ref}/confirm` and `POST /internal/fake-payments/{ref}/succeed|fail` through the regular webhook pipeline; money `numeric(12,2)` + currency, locks trade row then payment row, provider calls with idempotency keys, never card data, wording "payment protection"; PAYMENT_UPDATE / SHIPMENT_STATUS notifications (`PaymentActivity`), analytics `payment_status_changed` (event, status, provider; no amounts, ids or references); export section `payments`; seed `PaymentSeedContributor` (fake ACTIVE accounts for collector1/collector2, payments `…9f00…0001` SECURED + shipped and `…0002` SECURED with the payout frozen, protected trades `…9d00…0003` SHIPPED / `…0004` DISPUTED) — migration V080 (`payment` with `version`, `payment_event`, `payment_refund`) — tests ProtectedPaymentFlowIT (3: pay → ship → confirm → PAID_OUT with the full timeline; failed payment retried; secured after cancellation refunded), AutoReleaseJobIT (1), PaymentRulesTest (5), TradeRulesTest (4, PAY / SHIP / CONFIRM_RECEIPT / OPEN_DISPUTE), SeedDataRunnerIT
- [x] Dispute window, dispute entity, evidence model (extensible), admin dispute interface — `DisputeService`: `POST /trades/{id}/disputes` (buyer, PAID or SHIPPED within the window, 409 `DISPUTE_WINDOW_CLOSED`; payout frozen, trade DISPUTED), `GET /disputes/{id}` (parties + admins, 404 for anybody else; parties by handle and display name only), `POST /disputes/{id}/evidence` (JSON TEXT / TRACKING (https URL) or multipart IMAGE (re-encoded JPEG without metadata, ≤ 8 MB) / DOCUMENT (PDF ≤ 10 MB) through `ObjectStorage`; VIDEO reserved → 400; ≤ 10 per party → 409 `EVIDENCE_LIMIT_REACHED`), `GET /disputes/{id}/evidence/{evidenceId}/file` (`private, no-store`, CSP sandbox; never under `/public/media`), `POST /disputes/{id}/messages`; admin `PaymentAdminService` + `AdminDisputeController` / `AdminTransactionController` / `AdminPaymentController`: `GET /admin/transactions` (+ `/pending-shipment`, `/pending-confirmation`), `GET /admin/disputes[/{id}]` (both parties' Phase 7 moderation histories and rating summaries, internal notes, trade timeline, payment events, refunds, webhooks), `POST /admin/disputes/{id}/freeze|unfreeze|notes|resolve` (BUYER full refund → CANCELLED, SELLER payout → COMPLETED, SPLIT partial refund + payout minus the fee → COMPLETED), `GET /admin/payments[/{id}]`, `POST /admin/payments/{id}/refund` (SUPER_ADMIN, or ADMIN while `payments.admin_refunds_enabled`), `GET/PUT /admin/payments/settings` (SUPER_ADMIN writes); every admin write audited with the request id (`dispute.freeze` / `unfreeze` / `note` / `resolve`, `payment.refund`, `payments.settings.update`); DISPUTE_UPDATE notifications (new type), analytics `dispute_status_changed`; dashboard `openDisputes` / `webhookFailures24h` real (proven live, see above) — migration V081 (`shipment`, `dispute`, `dispute_evidence`, `dispute_event`, `dispute_message`, `dispute_note`) — tests DisputeFlowIT (3: open within the window, freeze, notes, resolve for the buyer with a refund and the audit trail; window closed, SPLIT payout; ten pieces of evidence per party), PaymentsAuthorizationIT (2), AdminAuthorizationIT (role matrix incl. Phase 9 routes), DashboardIT. Web dispute pages and admin sections: see the web item below (stage 10)
- [x] Webhooks: signature verification, idempotency, event history — `WebhookService` + `PaymentWebhookController` (`POST /api/v1/webhooks/payments/{provider}`, permitAll in `SecurityConfig`, only the active provider, 413 above 256 KB, rate limit 600/min per IP): signature verified (`WebhookSignatures`), bad signature → 400 `WEBHOOK_SIGNATURE_INVALID` and stored IGNORED, every verified event stored in `payment_webhook_event` and deduplicated by `(provider, provider_event_id)` (a retry answers 200 `duplicate: true`), applied after commit through `PaymentWebhookReceived` + `@ApplicationModuleListener`, failures marked FAILED and logged with the `payment.webhook.failed` marker; admin `GET /admin/payments/webhooks[/{id}]` — migration V080 (`payment_webhook_event` + `signature_valid`, `payment_id`) — tests WebhookIdempotencyIT (2), WebhookSignatureIT (2)
- [x] Tests: webhook idempotency, state transitions, refund path — WebhookIdempotencyIT, WebhookSignatureIT, ProtectedPaymentFlowIT, DisputeFlowIT, AutoReleaseJobIT, PaymentsAuthorizationIT, FeatureFlagOffIT (every payment route 404 `FEATURE_DISABLED` while the flag is off) + unit PaymentRulesTest, FakePaymentProviderTest, StripeConnectProviderTest, TradeRulesTest; extended GeoPrivacyContractTest `paymentsAndDisputesNeverCarryCoordinatesOrProviderAccounts` (protected trades for both parties, dispute for both parties, seller account, stranger 404, every admin transaction / dispute / payment / webhook / settings response; no coordinates, provider account ids or storage keys; logs clean), AdminAuthorizationIT, DashboardIT, SeedDataRunnerIT. Debt: AnalyticsIT does not yet exercise `payment_status_changed` / `dispute_status_changed` (payloads carry enum values only)
- [x] Web payment protection, shipping, dispute and admin payment UI — `apps/web-angular/src/app` (stage 10, generated `@orenji/api-client` only: `PaymentsService`, `DisputesService`, `AdminPaymentsService`, `TradesService`; wording always "payment protection", never "escrow" (unit + E2E checks); everything hidden while `protectedPayments` is off): `shared/payments` (payment labels and problem mapping, protection explainer, `SellerAccountService`, dispute overview / thread / timeline, evidence list and `EvidenceFilesService` loading photos/PDFs through the authenticated file route); offer dialog "Use payment protection" for cash and cash + cards offers (`protectionRequested`, "How it works" explainer, summary wording, counters keep the choice), protection chips on the offer page, trade page and trade list; Settings → Payouts `/settings/payouts` (`GET /me/seller-account`, "Set up payouts" → `POST /me/seller-account/onboarding`, return with `?onboarding=complete`, "Back to your trade" link); trade page (`features/trades`): five protected steps (accepted → payment secured → shipped → received or dispute → payout released), payment / shipment / dispute cards, timeline labels for every Phase 9 event, actions only from `allowedOperations` — Pay (409 `SELLER_NOT_ONBOARDED` explained), Mark as shipped dialog (carrier, tracking, notes), Confirm receipt, Open a dispute dialog (409 `DISPUTE_WINDOW_CLOSED` explained with the date), "Meet in person instead"; "Set up payouts" reminder for a seller awaiting payment; `features/checkout` `/checkout/fake/:ref` (local stand-in for the provider checkout with a "Local test payment" banner, Pay / "Simulate a failed payment", polls until the synthetic webhook lands, back to `/trades/:id?payment=secured|failed`); `features/disputes` `/disputes/:id` (parties only, not-found for anybody else; decision and refund summary, both sides' evidence, TEXT / TRACKING forms and IMAGE / PDF uploads validated and previewed locally counting down `evidenceLeft`, message thread, timeline, read-only while on hold or resolved); PAYMENT_UPDATE / SHIPMENT_STATUS / DISPUTE_UPDATE notification kinds refresh the trade and deep-link to it or the dispute; admin (`features/admin/payments`, `features/admin/disputes`, nav sections enabled): Transactions (all / pending shipment / pending confirmation), Disputes (queue, detail with both parties' rating summaries and moderation histories, internal notes, trade timeline, payment events, refunds, webhooks; hold / lift hold, notes, support messages, Resolve BUYER / SELLER / SPLIT with refund amount, note and a review step), Payments (list, detail, Refund only when `refundAllowed` with amount, reason and confirmation), Webhook events (payload on demand), Payment settings (SUPER_ADMIN edits after confirmation); every admin write ends with "The action is in the audit log."; audit labels for `dispute.*`, `payment.refund`, `payments.settings.update`; dashboard dispute/webhook tiles link to the queues. Tests: 52 new Vitest tests (485 → 537 / 113 files: labels, error wording, forms, stores, uploader, payout settings, payment card, dispute resolution and refund amounts, transaction rows, notification links); Playwright `e2e/payments.spec.ts` (2: a fresh seller sets up payouts, the buyer's protected offer is paid on the fake checkout, shipped with tracking, received and completed with the payout (amount minus fee) shown to both; a second protected trade is disputed with a photo and a message, a stranger gets not-found and a 404, an admin holds, notes and resolves it for the buyer with a refund, the payment shows the refund, the audit log shows `dispute.freeze` / `dispute.note` / `dispute.resolve`, the buyer sees the decision and the cancelled trade; every JSON lat/lng ≤ 3 decimals) — 46/46 Playwright specs green against `api-phase10.jar`, 0 skipped. Debt: the fake checkout polls up to ~45 s for the synthetic webhook; the generated `ProblemDetail` still lacks the Phase 8 extensions `latestOfferId` / `offerId` (read through `problemExtension()`; `currentStatus` is declared since Phase 10)
- [x] Mobile payment/dispute UI — stage M6 (2026-10-05, branch `feature/mobile-m6`, merged into `main` as #51): payment protection on the trade screen (pay on the app's fake checkout, ship, confirm receipt, payout status), disputes (statements, photos from the library, thread, timeline), Settings → Payouts, "Use payment protection" on offers; see "Mobile app (stage M6)"

## Phase 10 — Freemium + Credits + Ads + Donations

_Backend complete (workflow `web-mvp-local-continue` stage 10, independently re-verified: 704 API tests / 140 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (243 paths, previously 199; 276 operations, previously 227; 364 schemas, previously 295; every contract route present; no path, operation or schema lost; no duplicate operationIds; existing schemas changed only additively: `MyPlan.subscription`, `ProblemDetail` `currentStatus` / `subscriptionId` / `balance` / `cost` / `reason` and the error codes `ALREADY_SUBSCRIBED`, `INSUFFICIENT_CREDITS`, `REFERRAL_NOT_ALLOWED`, `NOT_IMPLEMENTED`); verifier fix: Jackson 3 `JsonNode` fields (webhook payloads, ledger and subscription event details) are documented as free-form objects by `OpenApiConfig` instead of a reflected, non-deterministic `JsonNode` bean schema, so two exports are byte-identical; clients regenerated (new `SubscriptionsService`, `CreditsService`, `AdsService`, `DonationsService`, `AdminBillingService`); live check on `.local-dev/api-snapshots/api-phase10.jar` (= `api-latest.jar`) on the local stack with emulator tokens: V090–V093 applied, 20 seed contributors, premium_user `GET /me/plan` PREMIUM with the ACTIVE fake subscription, collector1 credits 300 with `withdrawable`/`transferable` false and referral code `COLLECTOR1`, anonymous MAP_PANEL ads labelled "Sponsored", impression 204 and click 302 to the fictional `.example` landing, premium_user gets `[]`, supporters list without amounts, admin subscriptions 200 / collector 403, anonymous credits 401, mobile receipt 501 `NOT_IMPLEMENTED`, forged billing webhook 400 `WEBHOOK_SIGNATURE_INVALID`; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V090–V093 (range V090–V099). Flags: `premiumPlans` (checkout; on by default in V010, **off since V105** — launch configuration, 2026-10-05), `credits` (on in V010, **off since V105**), `advertising` and `donations` (off by default); the local seed switches all four on with `protectedPayments`; member routes answer 404 `FEATURE_DISABLED` while their flag is off, admin routes stay available, live subscriptions keep working whatever `premiumPlans` says. Web Premium checkout, credits, "Sponsored" placements, donations and the admin billing/credits/ads/donations sections complete (workflow `web-mvp-local-continue` stage 11, independently re-verified: 704 API tests / 140 classes still green on `./gradlew spotlessCheck build --rerun-tasks`, OpenAPI export unchanged (243 paths, 276 operations, 364 schemas; every contract route present), clients regenerated without changes, 578 web unit tests / 120 files, lint + format clean, production build 877.57 kB initial with no warnings, mobile typecheck/lint/29 tests and shared-types typecheck green, 51/51 Playwright specs against `.local-dev/api-snapshots/api-latest.jar` (rebuilt from this tree, same code as `api-phase10.jar`), 0 skipped; live curls: collector1 credits and referral code, anonymous MAP_PANEL ad labelled "Sponsored" with `Cache-Control: no-store`, premium_user `[]` and PREMIUM/ACTIVE plan, admin subscriptions 200 / collector 403, anonymous credits 401; log without ERROR lines, tokens, e-mail addresses or coordinates); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 10 contract"; the contract document itself is not edited): subscription state PENDING and additive columns plus `subscription_event` / `billing_webhook_event`; checkout answers `{subscription, url, clientSecret, resumed}`; fake checkout routes `GET /billing/fake/{ref}` + `POST /billing/fake/{ref}/confirm` (web path `/checkout/fake-billing/<ref>`); admin subscription detail and cancel; the plan follows `user_account.plan_code` + PREMIUM_USER instead of SUBSCRIPTION entitlements; `credit_ledger_entry` adds `balance_after` / `details` / `note` / `seq` and `credit_balance` is a plain view behind a Redis cache; `POST /me/credits/spend` takes a `credit_product` key; `GET /me/referrals` + `referral_redemption`; admin credit products and settings (`platform_settings` `credits.*`); prefixed ad tables (`ad_placement`, `ad_campaign`, `ad_creative`, `ad_targeting_rule`) with additive columns and `ad_campaign_daily`; impressions need the serve token body, clicks `?token=`; conversions through `POST /internal/ads/clicks/{clickId}/conversions`; donations add `GET /me/donations`, fake checkout and admin routes and `donations.*` settings, only the fake donation provider exists._

- [x] Plans, plan features, usage limits, usage counters, entitlements (DB-configurable) — built early in stage 2 (plan item 2). `billing` module, migration V011 (`plan`, `plan_feature`, `usage_limit`, `usage_counter`, `entitlement`; FREE and PREMIUM seeded with the contract limits; `user_account.plan_code` now a FK to `plan.code`). `Limits.check/consume/checkValue/overview` (atomic conditional upsert, Redis mirror written after commit), `LimitReachedException` → 429 LIMIT_REACHED (`limitKey`, `limit`, `used`, `resetsAt`, `planCode`, `upgradeUrl: "/premium"`), `Entitlements.has` + admin grant/revoke (audited, most generous active entitlement wins), `PlanService` Redis cache, `LimitUsageSource` SPI for TOTAL counts (e.g. `binders.max` in Phase 3). Endpoints `GET /plans` (public), `GET /me/plan`, `GET/PUT /admin/plans[/{code}]`, `GET/PUT /admin/usage-limits[/{id}]`, `GET/POST /admin/users/{id}/entitlements`, `DELETE /admin/users/{id}/entitlements/{entitlementId}` — tests LimitsIT (5), LimitRulesTest (4). Subscriptions, checkout, billing webhooks and `GET /admin/subscriptions` landed in stage 10 (next item)
- [x] Subscriptions + `BillingProvider` abstraction (fake by default, Stripe Billing skeleton) — `apps/api/.../billing` (stage 10): migration V090 (`subscription` with a one-live-per-account partial unique index, `subscription_event`, `billing_webhook_event`); `SubscriptionService` (checkout for paid active plans only, an open checkout of the same plan answered again, 409 `ALREADY_SUBSCRIBED` while entitled, cancel at the period end or at once, webhook events applied under a per-account advisory lock; an entitling subscription (TRIAL / ACTIVE / PAST_DUE) sets `user_account.plan_code` + PREMIUM_USER through the new `UserAccountService.applyPlan`, its end sets FREE and revokes the role; a payment for an abandoned checkout is cancelled at the provider); `BillingWebhookService` (signed `X-Fake-Signature` / `Stripe-Signature` in the Stripe format through the shared `common/webhooks/SignedWebhooks`, 400 `WEBHOOK_SIGNATURE_INVALID` stored IGNORED, deduplicated per provider event id, applied after commit via `BillingWebhookReceived` + `@ApplicationModuleListener`); `SubscriptionPeriodJob` `POST /internal/jobs/subscriptions-period` + hourly `SubscriptionPeriodScheduler` under `local` (period-end cancellations, fake renewals through a synthetic signed `subscription.renewed`, real-provider expiry after the 3-day grace); `FakeBillingProvider` (default, `fake_cs_…` checkouts at the web path `/checkout/fake-billing/<ref>`, `GET /billing/fake/{ref}` + `POST /billing/fake/{ref}/confirm`), `StripeBillingProvider` (only with `BILLING_PROVIDER=stripe`, Checkout Sessions in subscription mode, `RestClient`, no SDK); routes `POST /me/subscription/checkout|cancel`, `POST /me/subscription/mobile-receipt` (reserved, 501 `NOT_IMPLEMENTED`), `POST /webhooks/billing/{provider}` (600/min per IP, 413 above 256 KB), `GET /me/plan` with `subscription`, `GET /admin/subscriptions[/{id}]`, `POST /admin/subscriptions/{id}/cancel` (audited `subscription.cancel`); `Entitlements` gains `normaliseOverride`, `grantBySystem`, `latestActiveExpiry`; export section `subscriptions`, deletion stops renewals and the purge ends the live subscription; seed "subscriptions" (premium_user ACTIVE fake subscription `…a000…0001`) — tests SubscriptionFlowIT (5: fake checkout → PREMIUM with raised limits → cancel; failed checkout retried and immediate cancellation downgrades at once; webhooks verified, stored once, renewals extend the period; validation, authorization and the reserved mobile-receipt route; admins browse and cancel), Phase10FeatureFlagOffIT (2), FakeBillingProviderTest (1), StripeBillingProviderTest (4, test secret, no network). Debt: the Stripe Billing adapter is compile- and unit-tested only (no Stripe account; cloud/real-provider work deferred, docs/deployment/DEFERRED.md); App Store / Google Play receipt validation is reserved (501)
- [x] Limit-reached UX with upgrade prompt — API side done (429 LIMIT_REACHED with extensions, generated `ProblemDetail` carries them; Phase 3 consumes `binders.max` (BinderIT) and `binder.views.per_day` (PublicBinderIT)); web limit-reached dialog + interceptor + `/premium` built in stage 3 (`core/limits`, `features/premium`; Vitest units); stage 4 web E2E `inventory.spec.ts` hits the real `binders.max` limit from `/inventory` (dialog "5 of 5" + inline message); Phase 4 caps the map radius with `map.radius.max_km` (NearbyCollectorsIT, CardHoldersIT); the checkout API exists since stage 10 (SubscriptionFlowIT: the fake checkout raises the limits); stage 11 wires the web upgrade: the dialog's "See Premium" closes every open dialog (`core/limits/limit-reached-dialog.component.ts`) and lands on `/premium`, "Upgrade to Premium" → fake billing checkout → PREMIUM limits — web E2E `freemium.spec.ts` (a FREE collector at `binders.max` 5 of 5 → "See Premium" → upgrade, a simulated decline then payment → binders 5 / 50, the sixth binder created, no ads; "Cancel now" → FREE again)
- [x] Credit ledger (append-only) + derived balance — `apps/api/.../credits` (stage 10, backend): migration V091 (`credit_ledger_entry` with `balance_after` running sum, unique `idempotency_key`, trigger `credit_ledger_entry_append_only` refusing UPDATE / DELETE / TRUNCATE + REVOKE, view `credit_balance`, `credit_product` (3 products: `premium_search_day`, `binder_views_day`, `map_radius_day`), `referral_code`, `referral_redemption`, `platform_settings` `credits.*`); `CreditLedger` (appends under a per-account advisory lock, never negative, idempotent keys, Redis balance cache evicted after commit, spends always summed under the lock), `CreditProducts`, `CreditSettings`, `ReferralService` / `ReferralCodes`, `CreditReconciliationJob` `POST /internal/jobs/credits-reconcile` + hourly scheduler under `local` (repairs cached balances, reports ledger mismatches, never edits the ledger); routes `GET /me/credits` (`withdrawable: false`, `transferable: false`), `POST /me/credits/spend` (idempotent, stacked `CREDIT_PURCHASE` entitlement, 409 `INSUFFICIENT_CREDITS` / `CONFLICT`), `GET /me/referrals`, `POST /me/referrals/redeem` (409 `REFERRAL_NOT_ALLOWED` with `reason`), `POST /admin/credits/grant` (± amounts, never below 0, audited `credits.grant`), `GET /admin/credits/ledger|products|settings`, SUPER_ADMIN `PUT /admin/credits/products/{key}` / `PUT /admin/credits/settings` (audited); export section `credits`; seed "credits" (collector1 200 welcome credits + code `COLLECTOR1` redeemed by collector8, premium_user 500) — tests CreditLedgerIT (4: ledger append-only in the database, balance = sum with idempotent spends unlocking stacked entitlements, audited admin grants never below 0, spend validation and products edited by super admins), ReferralIT (2), ReferralCodesTest (2). Web `/credits` page and admin credits: stage 11 (see the web item below)
- [x] Ads framework (campaign, advertiser, placement, creative, impression, click, conversion, budget, targeting) with internal admin-managed campaigns; "Sponsored" labelling — `apps/api/.../ads` (stage 10, backend): migration V092 (`advertiser`, `ad_placement` (5 placements), `ad_campaign`, `ad_creative`, `ad_targeting_rule` GAME / REGION_LABEL / GEO_CELL / TAG / PLAN, `ad_impression` / `ad_click` / `ad_conversion` with a pseudonymous `user_hash` and `serve_id`, `ad_campaign_daily`); `AdProvider` + `InternalCampaignAdProvider` (targeting kinds AND / values OR, per-viewer daily frequency caps, `AdPacing` total / daily / intraday pacing, priority ranking, one creative per campaign; slot for a future external network adapter); `AdService` (flag `advertising` + `ads.enabled` entitlement → `[]`; `AdContext` from public values only: requested game / grid cell, `LocationService.publicLocationOf` grid cell and region label, `ProfileService.publicPartsOf` games and tags, plan; viewer hash through the analytics `ActorHasher`); `AdToken` HMAC serve tokens (`ADS_TOKEN_SECRET`, development default refused outside local/test/dev) with one impression and one click per serve; routes `GET /ads` (`Cache-Control: no-store`, every ad `sponsored: true`, `label: "Sponsored"`), `POST /ads/{id}/impression` (204), `GET /ads/{id}/click` (302), `/admin/ads/**` CRUD + `GET /admin/ads/campaigns/{id}/stats` (validated: https URLs or site paths, no coordinates; every write audited `ads.*`), `POST /internal/ads/clicks/{clickId}/conversions`; seed "ads" (fictional advertiser "Maple Sleeve Co." on a `.example` domain with two campaigns, house ad "OrenjiTrade Premium") — tests AdsTargetingIT (3: targeting uses the public point only, never the centre or `home_point`; the ads module never reads private location data (source scan); PREMIUM and `ads.enabled` hide ads and PLAN rules split audiences), AdsDeliveryIT (3: impressions and clicks once per serve spending the budget; frequency caps; admin validation keeps coordinates out and writes are audited), TargetingTest (4), AdPacingTest (5), AdTokenTest (2), AdsConfigTest (1), Phase10FeatureFlagOffIT `adsAnswerAnEmptyListAndRecordNothingWhileAdvertisingIsOff`. Debt: `ADS_TOKEN_SECRET` / `ADS_WEB_BASE_URL` not yet in Secret Manager/Terraform (deferred; `ADS_WEB_BASE_URL` defaults to `http://localhost:4200`); no external ad network adapter. Web "Sponsored" placements and admin ads UI: stage 11 (see the web item below)
- [x] Donations via provider abstraction — `apps/api/.../donations` (stage 10, backend): migration V093 (`donation`, `donation_webhook_event`, `platform_settings` `donations.*`); `DonationProvider` + `FakeDonationProvider` (default and only provider; `fake_dn_…` checkouts at `/checkout/fake-donation/<ref>`, synthetic signed `donation.succeeded` / `failed` / `refunded` webhooks, idempotent refunds), `DonationService`, `DonationWebhookService`, `DonationSettings`; routes `POST /donations/checkout` ("Voluntary support", amounts and currencies from settings), `GET /me/donations`, `GET /donations/fake/{ref}` + `POST .../confirm`, `POST /webhooks/donations/{provider}`, `GET /public/donations/supporters` (opt-in display names and month only, never amounts, notes or handles), `GET /admin/donations[/{id}]`, SUPER_ADMIN `POST /admin/donations/{id}/refund` (audited `donation.refund`) and `PUT /admin/donations/settings` (audited); nothing in ratings, ranking or trust reads donations; export section `donations`, the purge erases notes and public thanks; seed "donations" (collector2 25.00 CAD with public thanks, collector5 10.00 CAD without) — tests DonationIT (3: success path with the fake provider and opted-in thanks, failures + validation + signed idempotent webhooks, admin totals with refunds and settings for super admins only; donations never touch ratings or interactions). Debt: no Stripe Checkout donation adapter yet (any other `DONATION_PROVIDER` fails the start-up). Web `/support` page and admin donations: stage 11 (see the web item below)
- [x] Tests: limit enforcement, entitlement override, ledger integrity — LimitsIT (429 with extensions, admin edits apply at once, PREMIUM plan and entitlements override the FREE limits), LimitRulesTest, BinderViewLimitIT (FREE `binder.views.per_day`, PREMIUM and entitlements unlimited), SubscriptionFlowIT, CreditLedgerIT (append-only, balance = sum, idempotent spend), ReferralIT, AdsTargetingIT (never `home_point`), AdsDeliveryIT, DonationIT (fake success path), Phase10FeatureFlagOffIT + unit StripeBillingProviderTest, FakeBillingProviderTest, ReferralCodesTest, TargetingTest, AdPacingTest, AdTokenTest, AdsConfigTest; extended GeoPrivacyContractTest `subscriptionsCreditsAdsAndDonationsNeverCarryCoordinates` (plan, credits, referrals, donations, supporters, every placement anonymous and signed in, every admin subscription / credit / ad / donation response: ≤ 3 decimals, no private location keys, no provider subscription refs or user hashes, every ad labelled "Sponsored", logs free of coordinates), AdminAuthorizationIT (role matrix incl. Phase 10 routes), SeedDataRunnerIT, OpenApiExportTest. Debt: no analytics events for subscriptions, credits, ads or donations yet, and AnalyticsIT does not yet exercise the Phase 9 `payment_status_changed` / `dispute_status_changed` events
- [x] Web plans checkout, credits, ads ("Sponsored" placements), donations and admin billing/credits/ads/donations UI — `apps/web-angular/src/app` (stage 11, generated `@orenji/api-client` only: `PlansService`, `SubscriptionsService`, `CreditsService`, `AdsService`, `DonationsService`, `AdminBillingService`, `AdminPlansService`; member screens follow `premiumPlans` / `credits` / `advertising` / `donations` (hidden or guarded while off, 404 `FEATURE_DISABLED` explained), admin sections stay available; wording and refusals in `shared/billing/billing-labels.ts`): `features/premium` `/premium` (`PremiumStore`; plan comparison from `GET /plans`, "Upgrade to Premium" → `POST /me/subscription/checkout` (409 `ALREADY_SUBSCRIBED` explained; only local fake checkout paths or https provider pages followed), "Continue to checkout" for an open one, `SubscriptionCardComponent` (status, price, renews / ends on, PAST_DUE note, "Cancel at period end" / "Cancel now" / "Close the checkout", each confirmed), `UsageMetersComponent` from `GET /me/plan` incl. "Boosted" overrides, active boosts, credits teaser); `features/checkout` `/checkout/fake-billing/:ref` and `/checkout/fake-donation/:ref` (`ProviderCheckoutStore` + billing / donation stores, shared `FakeProviderCheckoutComponent`: "Local test payment" banner, Pay / "Simulate a failed payment", polls until the synthetic webhook lands, a declined subscription stays open with "Try again", success reloads the session → `/premium?checkout=success` or `/support?donation=thanks`); `features/credits` `/credits` (account menu; balance with the "never withdrawable or transferable" wording, products to unlock for a day, `SpendCreditsDialogComponent` with one idempotency key per dialog and 409 `INSUFFICIENT_CREDITS` with balance and cost, active boosts, referral card with copy / share and redeem (404 and each 409 `REFERRAL_NOT_ALLOWED` reason on the field), cursor-paged ledger); `shared/ads` (`SponsoredSlotComponent` on `GET /ads?placement=&game=`: nothing while `advertising` is off, for `[]` (Premium / entitlements) or on errors, waits for the session and reloads on sign-in or upgrade; `SponsoredAdComponent` always labelled "Sponsored" with "Remove ads" → `/premium`; `adClickHref` follows only the API click route or https, new tab, `rel="sponsored noopener"`; `AdImpressionDirective` + `AdTrackingService` record one impression per serve token once half visible) placed in `/search` results and card holders (SEARCH_SPONSORED), the map list panel (MAP_PANEL), the `/inventory` sidebar (INVENTORY_SIDEBAR) and other collectors' profiles (COLLECTOR_PROFILE); `features/support` `/support` (footer "Support OrenjiTrade" and account menu; "Voluntary support" that never changes ratings, ranking or trust; preset or custom amount, currency, private message, public-thanks opt-in, the API's range errors on the field; public supporters wall (names and month only) and own donations); admin `features/admin/billing` (sections Plans, Subscriptions, Credits, Ads, Donations enabled): Plans (SUPER_ADMIN edits name, description, price, currency, availability, order, feature switches), Subscriptions (list/filter, detail with history and webhooks, cancel at the period end or now with a reason), Credits (ledger of all or one account with its balance, grant/adjust dialog, credit products and referral rules for SUPER_ADMIN), Ads (advertisers, placements, campaigns with schedule, budgets, pricing, activate / pause / end, `TargetingEditorComponent` refusing coordinates, creatives with https-or-site-path URLs, delivery stats), Donations (totals per currency, detail, refund and accepted amounts for SUPER_ADMIN), user page Subscriptions / Credits links and an Entitlements panel (grant with optional end and note, revoke) — clears the stage 3 carry-over (admin entitlements and plan editing); every write confirmed and "The action is in the audit log."; audit labels for `subscription.cancel`, `credits.*`, `ads.*`, `donation.refund`, `donations.settings.update`. Tests: 41 new Vitest tests (537 → 578 / 120 files: billing labels and refusals, `PremiumStore` and usage rows, provider checkout stores (outcomes, retry after a decline, give-up), `CreditsStore` (paging, spend, insufficient balance, redeem), `SponsoredSlotComponent` (label, click route, one impression, `[]`, flag off, session wait, reload on upgrade), donation form, admin campaign form, targeting without coordinates, creative URLs, entitlement values, the limit dialog closing every dialog); Playwright `e2e/freemium.spec.ts` (1: `binders.max` → "See Premium" → fake billing checkout with a simulated decline then payment → PREMIUM limits, sixth binder, no ads → "Cancel now" → FREE) and `e2e/credits-ads.spec.ts` (4: a fresh collector redeems another's referral code (unknown code explained) and spends the credits on a 24 h unlock, the referrer earns 100; a signed-out visitor's MAP_PANEL "Sponsored" ad records an impression (204) and its click lands on the target, a FREE collector sees a sponsored search result and none once Premium; a donation through `/support` and the fake donation checkout shows the opted-in name among the supporters without amounts or messages; an admin grants credits, creates / edits / targets (coordinates refused) / ends a campaign with a creative, finds `credits.grant` and the campaign entries in the audit log and grants then revokes an entitlement that overrides `wishlist.items.max`); every JSON lat/lng ≤ 3 decimals; `admin-rules.spec.ts` now expects the upgrade button enabled — 51/51 Playwright specs green, 0 skipped. Debt: the admin plan editor, admin subscription cancel and donation refund / settings have no E2E coverage yet; there is no member route for the accepted donation amounts (presets are suggestions, the API's 400 carries the range); the fake checkouts poll up to ~45 s for the synthetic webhook; a Leaflet `_leaflet_pos` console error (zoom transition ending after the map is torn down) shows in the dev-server log during the E2E run without failing any spec
- [x] Mobile premium/credits/donations UI — stage M6 (2026-10-05, branch `feature/mobile-m6`, merged into `main` as #51): Premium through the fake billing checkout, "See Premium" on reached limits, credits (ledger, unlocks, referrals), donations through the fake donation checkout, "Sponsored" placements; app-store purchase rules are an open owner question (ADR 0011); see "Mobile app (stage M6)"

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
re-verified and merged into `main` as #41._

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
(worktree, created from `feature/mobile-m1`), builder done; merged into `main` as #45. Mirrors `apps/web-angular/src/app/features/{catalog,search,inventory,binders}` on the
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
`feature/mobile-m3` (worktree, created from `feature/mobile-m2`), builder done; merged into
`main` as #46. Mirrors `apps/web-angular/src/app/features/{map,collectors}` on
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
done; merged into `main` as #47. Mirrors `apps/web-angular/src/app/features/
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
(worktree, created from `feature/mobile-m4`), builder done; merged into `main` as #48. Mirrors the web's `shared/reports`, `shared/ratings`, `features/settings/reports`,
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

## Mobile app (stage M6: Phases 9 and 10 — payment protection, disputes, Premium, credits, donations, ads, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m6`
(worktree, created from `feature/mobile-m5`), builder done; merged into `main` as #51. Mirrors the web's `features/{trades,checkout,disputes,premium,credits,support}`,
`features/settings/payouts`, `shared/{payments,billing,ads}`, `core/limits` and the offer dialog's
protection option on the same endpoints and the same local fake providers (`FakePaymentProvider`,
`FakeBillingProvider`, `FakeDonationProvider`: no card, no money). No API, web, package or
dependency change (the generated `@orenji/shared-types` already had every Phase 9 and 10
operation). The wording is always "payment protection", never "escrow". Store builds: no in-app
purchase and no real provider are added; the app-store purchase rules are recorded as an open
owner question in ADR 0011 (options: in-app purchase, link out to the web, web-only purchases)._

- [x] Payment protection (`app/trades/[id].tsx`, `app/checkout/fake/[ref].tsx`,
  `src/features/payments/`, `src/features/trades/{TradeProtectionCards,ProtectedDialogs}.tsx`,
  `src/features/checkout/`, `src/api/hooks/payments.ts`): "Use payment protection" on a new cash
  or cash + cards offer while `protectedPayments` is on (the "How it works" explainer, the summary
  says "with payment protection", a counter-offer keeps it); on the trade only the API's
  `allowedOperations`: Pay (`POST /trades/{id}/pay` → the app's fake checkout screen, an https
  provider page in the browser, anything else refused), Mark as shipped (carrier ≤ 80, tracking
  ≤ 100, note ≤ 500, the "without tracking" tip), Confirm receipt (the payout amount in the
  confirmation; releases the payout and completes the trade), Open a dispute (reason + description
  ≥ 10 characters, the window's end; then the dispute screen), View the dispute; the payment card
  (what the buyer pays, the platform fee, refunds, the payout released or what the seller
  receives, the dispute window or the hold, the provider, the explainer), the shipment card, the
  dispute card, a seller's "Set up payouts to get paid" while the buyer cannot pay yet; refusals
  worded like the web (`SELLER_NOT_ONBOARDED`, `DISPUTE_WINDOW_CLOSED` with the date,
  `FEATURE_DISABLED`, Phase 8 conflicts re-read the trade). The checkout (`useProviderCheckout`:
  read, Pay / "Simulate a failed payment", poll until the synthetic webhook lands, about 45 s at
  most; a 409 reads how it ended) has the "Local test payment" banner and goes back to the trade
  with `?payment=secured|failed` (`router.dismissTo`), which shows the outcome once at the top. All
  protected steps are hidden (with an explanation) while the flag is known to be off.
- [x] Disputes (`app/disputes/[id].tsx`, `src/features/disputes/`): the parties only (not-found for
  anybody else): reason, dispute and payment statuses, the buyer's description, the decision
  (outcome, refund, note) or the hold, the facts (both parties by name and handle only, paid,
  refunded, payout, carrier, tracking); evidence as the API's model allows from the app: a
  statement (TEXT ≤ 2000) or a photo from the library (JPEG / PNG / WebP ≤ 8 MB checked before the
  multipart upload, an optional caption; no camera, card scanning stays on hold), "You can add N
  more"; photos of either party fetched with the ID token from `/disputes/{id}/evidence/{eid}/file`
  and shown from memory as `data:` URIs (never a public URL or a disk cache), PDFs listed by name
  and size, https tracking links only; the thread with the other collector and OrenjiTrade; the
  timeline; closed while on hold or decided (explained); `EVIDENCE_LIMIT_REACHED`, 413, 415 and a
  frozen dispute explained. DISPUTE_UPDATE notifications deep-link to the dispute and refresh it
  live (realtime), every reconnection re-reads it.
- [x] Payouts (`app/settings/payouts.tsx`, Settings link only while `protectedPayments` is on):
  status, what it means, provider, payouts enabled, last update, the "Local test provider" note;
  "Set up payouts" / "Continue the setup" / "Update your details" through `POST
  /me/seller-account/onboarding` (the fake provider answers this screen with
  `onboarding=complete`; https pages open in the browser), "Back to your trade" when a trade sent
  the seller here (`?returnTo=/trades/<id>` validated); `FEATURE_DISABLED` explained.
- [x] Premium (`app/premium.tsx`, `app/checkout/fake-billing/[ref].tsx`, `src/features/billing/`,
  `src/api/hooks/billing.ts`): the plans from `GET /plans` (price, limits, features, "Your plan",
  "Most popular"), "Upgrade to Premium" → `POST /me/subscription/checkout` → the app's fake billing
  checkout (a declined attempt stays open with "Try again"; success re-reads the account, the plan,
  the ads and discovery and welcomes the member at the top), "Continue to checkout", the
  subscription card (status, price, member since, renews / ends on, PAST_DUE note, "Cancel at
  period end" / "Cancel now" / "Close the checkout", each confirmed with the web's wording), the
  usage of every limit (bars, resets, "Boosted"), active boosts, the credits teaser;
  `ALREADY_SUBSCRIBED` explained; "Premium is not available yet" while `premiumPlans` is off and no
  subscription is live. Limit-reached prompts lead here: "See Premium" (while premium plans are
  sold) on `LimitReachedNotice` (binders, cards), the public binder views limit, the offers per day,
  a full wishlist and the map radius cap; SYSTEM `LIMIT_REACHED` notifications open Premium.
- [x] Credits (`app/credits.tsx`, `src/features/billing/CreditParts.tsx`): the balance with the
  "never withdrawable or transferable" wording, the products to unlock for a day (cost, duration,
  "You need N more"), the spend dialog with one idempotency key per dialog (409
  `INSUFFICIENT_CREDITS` with the balance and the cost), active boosts, the referral code (selectable,
  "Share" through the system share sheet, redemptions) and the redemption of another member's code
  (pattern checked; 404 and each `REFERRAL_NOT_ALLOWED` reason on the field), the append-only
  ledger in cursor pages (reason, type, date, signed amount, balance after; "Load more" / "Try
  again"); unavailable while `credits` is off.
- [x] Donations (`app/support.tsx`, `app/checkout/fake-donation/[ref].tsx`,
  `src/features/billing/{DonationParts.tsx,donationForm.ts}`): "Voluntary support" that never
  changes ratings, ranking or trust; preset ($5 / $10 / $25 / $50) or custom amount (two decimals),
  currency, a private message (≤ 280), the public-thanks opt-in, the API's range errors on the
  fields; the fake donation checkout, then "Thank you!" at the top; the supporters wall (names and
  month only) and the member's donations; unavailable while `donations` is off.
- [x] Sponsored placements (`src/features/ads/`): wherever the web shows ads on an equivalent
  screen — the Search tab's results (SEARCH_SPONSORED), the Map tab's list (MAP_PANEL), the
  Inventory tab (INVENTORY_SIDEBAR) and other collectors' profiles (COLLECTOR_PROFILE) — `GET
  /ads?placement=&game=` for this viewer and plan; nothing while `advertising` is off, for Premium
  (`[]`), on errors or for an unsafe click URL; always labelled "Sponsored" (with why it is shown
  as the accessibility hint) and "Remove ads" while premium plans are sold; one impression per
  serve token once the ad is laid out (`POST /ads/{id}/impression`); a tap opens the API's click
  route (`/api/v1/ads/{id}/click?token=`, recorded once, 302 to the landing page) or an https page
  in the browser.
- [x] Shared: feature flags are read per signed-in collector (`useFeatureFlags` / `useFeature`, the
  ID token now goes with `GET /public/feature-flags` like the web's `ATTACH_ID_TOKEN`; an
  unreadable answer leaves the decision to the API); the Profile tab gains Premium, Credits and
  "Support OrenjiTrade" (each while its flag is on), Settings gains Payouts; the auth gate admits
  `checkout`, `disputes`, `premium`, `credits` and `support`; notifications deep-link to disputes,
  Premium (`?checkout=success` kept), credits, support and payouts (only blocked users stay a
  website note); `FormDialog` (a scrollable modal form above the keyboard) joins the UI kit.
- [x] Found on the way and fixed: back from a fake checkout, Premium, Support and the trade could
  still be scrolled down to the button that opened it, hiding the welcome / thanks / payment notice
  (found by the first Premium flow on the emulator); the Premium credits teaser squeezed its text
  next to its button (walk by hand); a payment-protection step re-read the trade on screen after
  its answer, which hid its success notice (jest).
- [x] Tests — jest/RNTL: 57 new tests (661 in 75 suites, was 604 in 71):
  `features/paymentsBilling` (payment, dispute, payout and provider labels, payment rows, the dispute
  timeline, evidence photo checks, payment refusals, the ship and dispute forms, checkout targets
  and outcomes, dispute facts and closed texts, evidence views, plan / credit / entitlement labels,
  usage rows, subscription texts, billing / credit / referral / donation refusals, the donation
  form, ad links), `features/providerCheckout` (the checkout gives up with "pending", a 409 reads
  the outcome, another refusal keeps the pay buttons), `screens/payments` (trade: pay with
  SELLER_NOT_ONBOARDED then the checkout, the flag off, `?payment=secured|failed`, the payout
  reminder, ship with validation, confirm receipt, open a dispute with validation and
  DISPUTE_WINDOW_CLOSED, a disputed trade; checkout: pay, decline, done / not-found / error with
  retry; dispute: overview, statement, message, photo with the evidence limit, refused photos and
  permission, hold / decision / not-found; payouts: setup and return, flag off, error with retry,
  the Settings link), `screens/billing` (Premium: plans, upgrade with ALREADY_SUBSCRIBED, welcome
  and cancel at period end, continue / close an open checkout, flag off and plans error with
  retry; billing checkout: decline, "Try again", pay, not-found; credits: balance, unlock with one
  idempotency key and INSUFFICIENT_CREDITS, the ledger's next page, referral refusal and
  redemption, flag off, error with retry; support: preset donation, custom amount validation and
  the API's field error, thanks, flag off; donation checkout; sponsored: label, one impression,
  click route, "Remove ads", nothing while off / for unsafe links / on the own profile; entry
  points: Profile links per flag, "See Premium" on a reached limit), `screens/offers` (payment
  protection option on and off), `screens/trades`, `screens/notifications`,
  `features/notifications` and `account/gate` updated. Playwright: `payments.spec.ts` (3) and
  `billing.spec.ts` (4), 45 specs in all (was 38). Maestro: `payment-protection.yaml`,
  `premium.yaml` (+ `scripts/payments.js`), 17 flows in all (was 15).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green
  (typecheck with regenerated typed routes, lint, 661 jest tests / 75 suites, the 28 harness guard
  tests; Prettier clean); `npx expo-doctor` 21/21; `npx expo export --platform android` (5.1 MB
  Hermes bundle) and `--platform web` (71 static routes, was 63: `/checkout/fake/[ref]`,
  `/checkout/fake-billing/[ref]`, `/checkout/fake-donation/[ref]`, `/disputes/[id]`, `/premium`,
  `/credits`, `/support`, `/settings/payouts`) OK; `npm run test:mobile:e2e` from scratch (jar
  build, recreated database, web export) 45/45 passed (38 earlier + 7 new), 0 skipped, 0 flaky
  (no retry used). Native (Expo Go 57 on `Pixel_6_API_34`, harness-started API :8090 and Metro
  :8082): `npm run test:mobile:maestro` 17/17 flows passed in one full run (51 min 59 s) on the final code, after the two new flows had passed on their own (`payment-protection.yaml` first time; `premium.yaml` once the welcome was scrolled into view, see the fix above). A walk by hand (adb screenshots in the session scratchpad, `m6-walk-*.png`,
  plus the flows' `payment-*` and `premium-*` screenshots): seed sign-in as collector1, the Profile
  tab's Premium / Credits / Support rows, Premium (plans, usage, the credits teaser), Credits
  (balance 300, products, referral code COLLECTOR1, the ledger), Support (the form, the supporters),
  Settings → Payouts (ready, local test provider, the explainer), the seeded protected trade
  waiting for collector8's receipt (steps, payment card with the fee, shipment, timeline),
  "Sponsored" results on the Search tab, the map list and the Inventory tab; then as collector5 the
  disputed trade and its dispute (overview, facts by name and handle, evidence, messages, timeline);
  this walk found the teaser layout (fixed). Logcat without FATAL, ReactNativeJS errors, tokens or
  coordinates; Metro log clean. No API, web, package or dependency change, so no Gradle (beyond the
  harness's jar), web, client regeneration or `audit:gate` run was needed; every process started for
  the checks (API, web server, Metro, emulator) was stopped afterwards.
- Gaps / debt: store builds would need the owner's decision on app-store purchases (ADR 0011
  open question) before real money; PDF evidence is listed and opened on the website (the app adds
  statements and photos; the API's TRACKING evidence is shown, not added); impressions are counted
  once an ad is laid out on screen (the web waits until half of it is in the viewport); the house ad
  of the MOBILE_FEED placement is not shown (the web has no equivalent screen); the referral code
  is shared through the system share sheet (no clipboard dependency was added; the code is
  selectable); admin and moderator consoles (dispute resolution, refunds, plans, campaigns, donation
  refunds) stay web-only; device push stays deferred; iOS not run (no macOS); Expo Go's tools
  button covers the right end of some top rows (no control sits there).

## Mobile app (stage M7: web parity — Google sign-in, search segments, card holders, blocked users, photos and bulk actions, 2026-10-06)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m7`
(worktree, created from `feature/mobile-m6`; `origin/main` with #49 and #51 merged in), builder
done; not pushed. Closes the gaps a read-only completeness critic found between the web app and
the mobile app after stage M6; every item mirrors the web feature on the same endpoints. No API,
web or package change; dependency added with `npx expo install`: `expo-auth-session` (pinned,
`npm run audit:gate` green). ML Phase 11 stays on hold (photos from the library only)._

- [x] Google sign-in and sign-up — "Continue with Google" / "Sign up with Google" on the sign-in and
  sign-up screens (web: `google-button`, `signInWithGoogle`): the auth port gets
  `signInWithGoogle` / `reauthenticateWithGoogle` on one credential vocabulary
  (`src/auth/googleCredential.ts`): Firebase's pop-up on the web build, an OAuth ID token through
  expo-auth-session on a device (platform client ids `EXPO_PUBLIC_GOOGLE_{WEB,ANDROID,IOS}_CLIENT_ID`,
  public values documented in `apps/mobile/.env.example`, empty locally), and, against the local
  Auth emulator, a simulated Google account chosen in the app
  (`SimulatedGoogleAccountDialog`) and sent as the emulator's fake OAuth ID token (a JSON object
  with `sub`, `email`, `email_verified`, `name`) through `signInWithCredential` — the credential
  path a device takes with a real token. A Google sign-up continues on the consent screen like the
  web and skips the e-mail verification; an existing e-mail/password account of the same verified
  e-mail is linked (an unverified one is taken over: Firebase's trusted-provider rule, the same on
  the web). Settings → Account names the sign-in methods; deleting an account without a password
  re-authenticates with Google. Friendly messages for the Google error codes; a dismissed chooser
  says nothing. **Proven only against the emulator**: the real OAuth client ids belong to the
  deferred Firebase project (DEFERRED.md item 4).
- [x] Search tab with Cards | Collectors | Binders segments (web `/search`): collectors by name or
  handle on `GET /search?types=collectors` with the API's distance bucket (never a position in the
  request: the server uses the trading area, or a public city centre before one is set), the 3 km
  rule's approximate note, opted-out collectors absent; public binders by name with their owner
  (`types=binders`); recent searches per segment; empty / error / offline states; rows open the
  existing profile and public binder screens.
- [x] Card holders list — `app/holders.tsx` on `GET /search/card-holders` (the web's holders view):
  "Who has this near me" on the card detail opens the list (sort: closest / lowest price / freshest;
  availability, condition, price range (validated), freshness, edition, language, accepts-offers
  filters in a sheet; paged; "Make an offer" and "View binder" per row; the holder's place and
  bucket only); "Show on the map" opens the Map tab filtered by the card (`?card=` as before).
  Acceptance row 19's mobile half now matches the web.
- [x] "Looking for" on a collector's profile (`GET /collectors/{handle}/wishlist`; card, printing or
  any printing, minimum condition; never prices, radii or notes; hidden on 404).
- [x] Settings → Blocked users (`GET /me/blocks`, `DELETE /users/{id}/block`): list and unblock,
  linked from Settings, from a blocked profile's Message reason, from the block dialog's wording
  and from the settings deep links of notifications.
- [x] Inventory: owner photos on a card (`ItemPhotos`: view, add from the library through
  `POST /inventory/items/{id}/images` with the web's rules — JPEG / PNG / WebP, 8 MB, four at most —
  remove; the web picker's refusal of a non-image is worded like the type check), multi-select
  bulk actions (`BulkBar` on `POST /inventory/items/bulk`: visibility incl. temporary, move to
  binder, availability, confirm, delete after a confirmation, with the skipped items explained),
  the visibility filter, binder reordering (`PUT /binders/reorder`, move up / down sheet).
- [x] Cheap low gaps: Map tab freshness and tags filters and the search box (query of
  `/collectors/nearby`); set pages (`app/sets/[id].tsx` on `GET /sets/{id}`, from a card's set
  link). Signed-out browsing stays out: the web's anonymous routes would need a signed-out shell
  around every public screen (documented as a remaining gap, not trivially mirrored).
- [x] Tracker and docs — this section; the acceptance rows' mobile halves (1, 3, 6, 10, 12, 16, 18,
  19, 20, 21, 40); the M1–M6 caveats replaced with their merged PRs; `apps/mobile/README.md`,
  `docs/development/local-setup.md`, `docs/deployment/DEFERRED.md` (the OAuth client ids).
- [x] Tests — jest: `auth/google` (the emulator credential, the native request, the strategy),
  `screens/auth` and `screens/settings` (the Google buttons, dialog, errors, sign-in methods),
  `features/searchSegments`, `screens/search-segments`, `screens/holders` (filters, pages, errors),
  `screens/collector` ("Looking for"), `screens/blocked`, `screens/inventory` (bulk actions,
  reordering, visibility filter), `screens/items` (photos incl. the picker's refusal),
  `screens/sets`, `screens/map` and `features/mapDiscovery` (freshness, tags, search).
  Playwright (`apps/mobile/e2e`, 7 new spec files, 9 specs): `google.spec.ts` (3), `search-segments.spec.ts`,
  `holders.spec.ts`, `collector-wishlist.spec.ts`, `blocked.spec.ts`, `item-photos.spec.ts`,
  `bulk-actions.spec.ts`; `map.spec.ts` follows the card's new buttons; 54 specs in all (was 45).
  Maestro: `google-sign-in.yaml`, `collector-search-looking-for.yaml`, `holders-filters.yaml`,
  `blocked-users.yaml` (+ `scripts/parity.js`), 21 flows in all (was 17).
- Checks (2026-10-06, Windows 11, Pixel_6_API_34 emulator, on the merged branch): `npm run test:mobile`
  green (typecheck with regenerated typed routes, lint, 713 jest tests / 81 suites, the 28 harness guard tests; Prettier clean); `npx expo-doctor` 21/21; `npx expo export --platform android`
  (5.3 MB Hermes bundle) and `--platform web` (74 static routes, was 71: `/holders`, `/sets/[id]`, `/settings/blocked`) OK; `npm run test:mobile:e2e` from
  scratch (jar build, recreated database, web export) 54/54 passed (45 earlier + 9 new), 0 skipped, 0 flaky (no retry used), 1.5 min of specs, 3 min 42 s in all. Native (Expo Go 57 on `Pixel_6_API_34`,
  harness-started API :8090 and Metro :8082): `npm run test:mobile:maestro` 21/21 flows passed in one full run (43 min 6 s of flows, 44 min 47 s in all) on the final code; on their first full run the four new flows had failed for flow reasons fixed in `94057c0` (the Google flow's password account needs a verified e-mail, Firebase's rule; back to the inbox before the Profile tab; the "Looking for" text sits below the section's top edge; the availability filter "Sale" also matches "trade or sale" copies, so the flow narrows by condition) and then passed on their own (4/4 in 8 min 1 s); the emulator was restarted before the full run (quick-boot drops Expo Go, a fresh Metro reinstalled it).. A walk by hand of the new screens (a scratch Maestro flow outside the repository, 15 screenshots `m7-walk-01…15` in the session scratchpad): the sign-in screen's Google button and the simulated-account dialog, the Map tab's search box and freshness sheet, the Collectors segment (collector5 with "Locations are approximate (about 3 km)" and a 1–5 km bucket) and the Binders segment, a card's holders list and its filter sheet, a set page, the inventory's Select mode with the bulk bar and the visibility sheet, a card's photos section, the binder reorder sheet, Settings → Blocked users (empty) and Settings → Account (sign-in methods). The walk's logcat (43 547 lines) has no FATAL, no ReactNativeJS error, no red box, no token and no coordinate with more than 3 decimals (the 5 regex hits are Android system lines: a launcher bitmap data URL, WebView version numbers, a service timing); the Metro log is clean (110 bundles, 0 errors).
  `npm run audit:gate` green (expo-auth-session added). No API, web or package change, so no Gradle,
  web or client regeneration run was needed; every process started for the checks (API, web server,
  Metro, emulator) was stopped afterwards.
- Gaps / debt: Google sign-in proven only against the Auth emulator (no OAuth client ids, no
  Firebase project; the web build's pop-up and the device flow have not run against a real
  project); the card holders list proves pagination in jest only (the E2E lists two copies);
  signed-out browsing not mirrored; the message, dispute and avatar pickers (M4/M6) do not word
  the web picker's refusal of a non-image file (nothing happens; the item photos do); the 18+
  confirmation (sign-up and onboarding for existing accounts) waits for the launch-readiness API
  change; the Expo SDK 58 upgrade is its own PR; device push and iOS stay deferred.

## Mobile app (stage M8: launch readiness on the Expo app — 18+ confirmation, French legal pages, safety notice, money-off, 2026-10-06)

_Branch `feature/launch-readiness` (worktree), on top of launch readiness parts 1–5 with
`origin/feature/mobile-m7` merged in (455456c) and then `origin/main` once #53 had merged there
(1d233e7, no file change), builder done; not pushed. The mobile
half of the launch-readiness work, so PR #52's "Mobile web build against the local stack" check
turns green: every mobile flow that messages, posts, toggles discoverability or makes offers hit the
new `403 AGE_CONFIRMATION_REQUIRED` gate until the app and its harnesses learned the 18+
confirmation. Everything local and free; no API, web or package change (the generated clients
already carried `OnboardingStatus.ageConfirmed`, `ConsentRequest.language` and the
`AGE_CONFIRMATION` document type); one dependency added with `npx expo install`:
`expo-localization` (pinned `~57.0.2`, `npm run audit:gate` green). Nothing here claims legal
compliance: the legal texts stay drafts (banner kept on both languages)._

- [x] **18+ confirmation** (mirror of the web's `age-confirmation-checkbox`, sign-up, consent and
  onboarding pages): `src/features/legal/ageConfirmation.ts` + `AgeConfirmationCheckbox.tsx`
  (English and French label and validation message, never ticked by default, never part of
  "Accept all"); `app/(auth)/sign-up.tsx` posts `{ documentType: 'AGE_CONFIRMATION', version }`
  after the required documents through the existing `acceptConsents` (`registration.ts`: the
  version comes from `GET /public/legal/documents`, which lists `AGE_CONFIRMATION` with
  `requiredAtRegistration: false`, so `requiredAtRegistration()` keeps it out of the "I have read
  and accept" list; `validateSignUp` gets an `age` error while the attestation is published and
  unticked); `app/(account)/consent.tsx` shows the same checkbox while `me.onboarding.ageConfirmed
  === false` (Google sign-ups land there) and records it with the pending documents;
  `app/onboarding.tsx` + `OnboardingSteps.tsx` `AgeStep`: a first, non-editable "Age" step
  ("Are you 18 or older?", the terms link, the checkbox, Continue, Sign out so nobody is stuck;
  skeleton / retry while the document list loads), the steps of a visit decided once so indexes
  never shift, an existing collector who only misses the confirmation gets "Thanks for
  confirming. Welcome back!" and returns to where they came from (`useAuthGate` remembers the
  resumable link when it sends an app screen to onboarding, like the web's `returnUrl`);
  `accountStatus.needsOnboarding` is true while `ageConfirmed === false` (`undefined` → an older
  API never asks); `ApiError.isAgeConfirmationRequired`, a friendly message for
  `AGE_CONFIRMATION_REQUIRED` in `errorMessages.ts` and a new account signal
  (`age-confirmation-required`) that reloads `/me`, so the gate shows the step from any screen.
- [x] **Test harness:** `apps/mobile/e2e/support/stack.ts` `apiConfirmAge` /
  `apiAgeConfirmed`, `createOnboardedCollector` records the consent unless `confirmAge: false`
  (an account from before the rule); the Playwright global setup records it for the seed
  collectors the specs sign in to (`collector1`, `collector2`: the seed predates the rule, the
  consent row lands in the isolated database, the emulator account is only signed in to); every
  Maestro host script that creates a collector (`create-collector.js` with `CONFIRM_AGE`,
  `messaging.js`, `offers.js`, `payments.js`, `wishlist.js`, `parity.js`) records it, the seed
  flows (`sign-in.yaml`, `map-preview-profile.yaml`) run `scripts/confirm-age.js` first and
  `scripts/check-age.js` checks `onboarding.ageConfirmed` on the API.
- [x] **Consent language:** `src/features/legal/legalLanguage.ts` (the web rule: French when the
  device's primary language is French through `expo-localization`, an explicit EN / FR choice
  remembered on the device in AsyncStorage wins); `AccountProvider.acceptConsents` sends
  `language` with every consent (`consent.language` when the caller sets one), so the API records
  which translation was read; the sign-up and consent checkboxes name the documents in that
  language.
- [x] **French legal pages:** `npm run sync:legal` now generates `src/legal/legalContent.fr.ts`
  from the web's `legal-content.fr.ts` next to the English file (the type import rewritten; a jest
  test keeps both copies identical to the web files, never hand-copied); `legalTexts.ts` serves the
  texts, draft banner, translation marking, effective-date placeholder and chrome labels of the
  active language; `LegalLanguageSwitch` (EN / FR, a radio group) on `app/legal/index.tsx` and
  `app/legal/[key].tsx`; `LegalDraftBanner` shows the French draft banner and the translation
  marking exactly as the web (« Traduction de l'ébauche anglaise, à faire valider par un
  conseiller juridique. »); the `trading-safely` key is listed (both languages). The UI around the
  texts stays English (the full French UI translation is the recorded next task).
- [x] **Safety notice and Block on the profile:** `src/features/safety/TradingSafetyNotice.tsx`
  (the web's wording per context, link to the "Trading safely" page, Report, Block, Dismiss;
  a labelled note whose title is a header, never one grouped accessibility element, so the guide
  link and the Report / Block / Dismiss buttons stay reachable one by one with a screen reader)
  under the conversation header (hidden once the
  thread is blocked, never over the composer) and at the top of `offers/[id]` and `trades/[id]`;
  `safetyNoticeStore.ts` keeps the dismissal per collector and per context on the device
  (AsyncStorage `orenjitrade.safety-notice.v1`: no server-side preferences mechanism exists;
  nothing is shown before the stored dismissals are read; the hydration flag lives in a separate
  non-persisted store because a persisted store writes on every `setState`, which broke the web
  build's static rendering). `BlockCollectorDialog.tsx` (one confirmation dialog, used by the
  notices and the profile) and `useUnblockCollector`; `CollectorProfileView` offers Block /
  Unblock next to Report (`profile.isBlocked`; the profile reloads through the existing cache
  invalidation). Stage M7 had Settings → Blocked users and the conversation menu only.
- [x] **Money-off consistency:** `errorMessages.ts` `LIMIT_REACHED` is neutral ("It resets
  soon."); `lib/limits.ts` `limitReachedMessage` names Premium only with `premiumOffered`
  (`LimitReachedNotice` passes the `premiumPlans` flag, "See Premium" was already flag-gated);
  `notificationKinds.ts` opens Premium for the plan-limit notice only when the payload carries
  `upgradeUrl` / `deepLink` (else the wishlist for a held-back match, or the list, as the web);
  `__tests__/features/moneyOff.test.tsx` proves no pay / subscribe / credits / donate entry point
  (Profile tab, Settings, limit notice, another collector's profile) with every money flag off.
- [x] **Tests.** jest: `account/ageConfirmation` (4), `account/registration` (+3),
  `features/legalLanguage` (5), `features/safetyNotice` (6), `features/moneyOff` (4),
  `screens/auth` (+2), `screens/account-states` (+1), `screens/onboarding` (+5), `screens/legal`
  (rewritten: FR default, switch remembered, both copies synced), `screens/collector` (+2),
  `app/auth-gate` (+2), `features/notifications` and `lib/inventory` updated — `npm run
  test:mobile` 748 tests in 85 suites green (typecheck, lint, Prettier, the harness guard tests).
  Playwright (`npm run test:mobile:e2e`): 60 specs (54 + `age-confirmation.spec.ts` 2,
  `legal-french.spec.ts` 2, `safety-notice.spec.ts` 2; `auth.spec.ts` ticks the checkbox at
  sign-up and on the consent screen) — 60 passed, 0 flaky, 0 skipped, no retries (2026-10-06,
  2 m 43 s with the stack). Maestro (`npm run test:mobile:maestro` on
  `Pixel_6_API_34`): 24 flows (21 + `age-step-existing-account.yaml`, `legal-french.yaml`,
  `safety-notice.yaml`; `sign-up-onboarding.yaml` ticks the checkbox) — 24/24 passed in one run
  (49 m 17 s, 2026-10-06). Walked by hand on the emulator once (adb screenshots): the sign-up
  checkbox ("Accept all" leaves it unticked, the bilingual refusal), the legal index and "Trading
  safely" in French with the banner and the marking, the "Age" step of the unconfirmed seed
  `collector5` (refused unticked, then "Welcome back" on the Map; the consent row recorded with
  `language = fr`, the language chosen on the legal pages), Block / Unblock on a profile, the
  notice in a first conversation (a message sent under it, dismissed, still gone after a relaunch),
  and the consent-screen checkbox of a simulated Google sign-up (refused unticked, then onboarding
  from the profile step; the emulator account deleted afterwards); logcat without crash, red box,
  token or coordinate, Metro without error.
  `npx expo-doctor` 20/21 (the known newer-patch-versions notice only), `npx expo export` for
  android and web green, `npm run audit:gate` OK.
- **Docs:** `apps/mobile/README.md` (status, architecture, scripts, specs and flows),
  `docs/development/local-setup.md`, `docs/development/test-accounts.md` (seed accounts see the
  age step once; the mobile suites record the consent in their isolated database).
- **Debt / follow-ups:** the UI around the legal texts stays English (next task: the full French
  UI translation); the safety notice dismissal is per device (signing in elsewhere shows it
  again, acceptable for a safety reminder, same as the web); the seed accounts of a developer
  stack confirm their age once on the next sign-in (web or mobile); an existing collector's
  age-only visit shows the full step indicator ("Step 1 of 4 · Age") before going straight back,
  like the web's stepper; the Expo SDK 58 upgrade stays its own PR.

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

## Launch readiness, part 1 — users must be 18 or older (2026-10-05)

_Branch `feature/launch-readiness` (from `main` at `ded5470`), builder done. Owner request
"Prepare OrenjiTrade for its first real users", section 1. Self-declaration only (no identity or
document verification). The French legal pages, the Trading safely page, the launch
configuration and the Law 25 operating docs are the following parts of the same workflow._

- [x] **Server-side record.** The attestation "I confirm I am 18 years of age or older" is a
  consent like any other: migration `V103__age_confirmation.sql` adds the document type
  `AGE_CONFIRMATION` (named check `ck_legal_document_type` replaces the unnamed V003 check) and
  its current row `2026-10-05` with `required_at_registration = false` and
  `url = '/legal#age-confirmation'` (not a page: the clients map only `/legal/<slug>` urls to
  in-app texts, and `AGE_CONFIRMATION` sorts before `TERMS` in the public list). `POST
  /me/consents {AGE_CONFIRMATION, 2026-10-05}` stores version, timestamp, salted IP hash, user
  agent and an audit row, idempotently (`ConsentService.accept`, unchanged). `GET /me` reports
  `onboarding.ageConfirmed` (`OnboardingFlag.AGE_CONFIRMED`, bean `AgeConfirmedCheck`; schema
  `NOT_REQUIRED`, so the generated clients get `ageConfirmed?: boolean` and the mobile fixtures
  keep compiling). The confirmation shows up in the admin user detail and the data export (Law
  25 evidence). Any recorded version counts (`ConsentService.hasConfirmedAge`), so republishing
  the wording never un-confirms anyone.
- [x] **Service-layer gate** `ConsentService.requireAgeConfirmed(userId)` → `403
  AGE_CONFIRMATION_REQUIRED` (new `ErrorCode`; Problem Details with `errorCode`, safe `message`,
  `requestId`, `timestamp` and the existing `requiredConsents` extension naming the document to
  record). Called by `PrivacySettingsService.update` when `discoverable` is requested (the map;
  `searchDiscoverable` stays ungated), `ConversationService.start` / `send`,
  `CommunityService.createPost` / `createReply` (after the `publicChat` flag) and
  `OfferService.create` / `counter`. Reading, accepting / declining / withdrawing offers, the
  terms filter and every `/api/v1/admin/**` route are untouched: an unconfirmed ADMIN or
  MODERATOR keeps working (`AgeConfirmationIT.adminAndStaffPathsAreNotGated`). Additive API:
  no existing request gained a required field; the mobile client's sign-up, `/me`, consent and
  profile calls are unchanged.
- [x] **Existing accounts** (seed and local test accounts included) are never pre-confirmed: the
  seed only inserts `required_at_registration` consents, so collector1… confirm through the
  onboarding "Age" step on their next sign-in (the web routes them there: `needsOnboarding`
  is true while `ageConfirmed === false`, the session interceptor sends a 403
  `AGE_CONFIRMATION_REQUIRED` to `/onboarding`). Tests provision compliant accounts with the
  confirmation (`TestUsers.confirmAge`, `AbstractIntegrationTest.provisionCompliant`) and
  unconfirmed ones with `provisionWithoutAgeConfirmation`.
- [x] **Web.** `AgeConfirmationCheckboxComponent` (shared, bilingual label "I confirm I am 18
  years of age or older" / "Je confirme avoir 18 ans ou plus", unticked, `role="alert"` message,
  keyboard and screen-reader accessible): on the sign-up page (a separate `requiredTrue` control;
  "Accept all" never ticks it; the confirmation is posted with the required documents), on the
  consent page for Google sign-ups and new document versions while `ageConfirmed === false`, and
  as the first, non-editable step of the onboarding stepper. An existing collector that only
  misses the confirmation is sent straight back ("Thanks for confirming. Welcome back!"); a new
  one continues to the profile step. `friendlyError` explains `AGE_CONFIRMATION_REQUIRED`.
  E2E helpers (`apiAcceptConsents`, `apiConfirmAge`, acceptance `collector()`) record the
  confirmation for fresh collectors; `auth.spec.ts` covers the sign-up checkbox, the consent
  page and the seed collector's age step; `admin.spec.ts` accepts `/onboarding` after the
  staff-only snack bar (seed collectors are unconfirmed in the fresh E2E database).
- [x] **Legal wording (English drafts; the French translation follows in part 2).** Terms
  "Acceptance" clause 2: 18 or older, confirmation recorded with its date, accounts of people
  under 18 closed. Privacy "International transfers and age requirement": for people 18 and
  older, no knowing collection from minors, accounts of minors closed and their data deleted
  subject to retention periods and the law. `LAST_UPDATED` 2026-10-05; the `legal_document`
  versions stay `2026-09-01` (pre-launch drafts, zero users): publish a new version row when
  the lawyer-reviewed texts land. `apps/mobile/src/legal/legalContent.ts` regenerated with `npm
  run sync:legal` (mechanical; the mobile test "ships exactly the texts of the web app" needs it).
- [x] **Tests.** API: `ConsentServiceTest` (4), `OnboardingServiceTest` (3), `AgeConfirmationIT`
  (4: recording with timestamp / IP hash / UA / audit and the 409 for a stale version; never
  required at registration; the gate on discoverability, messaging, community posts, offers and
  counters with the `errorCode` and `requiredConsents`; admin and staff paths), `ConsentIT`,
  `FlywayMigrationIT`, `AdminUsersIT`, `ExportIT` updated (9 documents, 5 consents). Web:
  `age-confirmation-checkbox.component.spec.ts` (3), `sign-up-page.component.spec.ts` (3),
  `onboarding-page.component.spec.ts` (4), `session.service.spec.ts` (+3),
  `api-error-messages.spec.ts` (+1). Full runs: `npm run test:api` 790 tests green after the two
  count updates, `npm run test:web` 646 green + lint + Prettier, `npm run test:mobile` 416 green
  (typecheck, lint, jest) against the regenerated `packages/api-client` / `packages/shared-types`
  (`./gradlew exportOpenApi`, `npm run generate:api`).
- **Docs:** `docs/api/contracts/phase1-auth-users.md` (18+ rule), `docs/database/schema.md`
  (V103, `legal_document`), `docs/product/product-overview.md` (trust and safety).
- **Debt / follow-ups:** the mobile app's sign-up checkbox, consent-screen checkbox and
  onboarding confirmation, and the mobile harnesses' `AGE_CONFIRMATION` consent, are done in
  mobile stage M8 (2026-10-06, same branch; see "Mobile app (stage M8)"); `searchDiscoverable`
  (name search, on by default) is deliberately not gated — revisit if the owner wants search
  hidden too.

## Launch readiness, parts 2 and 3 — trading safety and French legal pages (2026-10-05)

_Branch `feature/launch-readiness`, builder done. Owner request "Prepare OrenjiTrade for its first
real users", sections 2 ("Trading safety") and 3 ("French versions of the legal pages"). The legal
texts stay drafts (banner kept on both languages); nothing here claims legal compliance._

- [x] **"Trading safely" page** (`/legal/trading-safely`, key `trading-safely` in
  `apps/web-angular/src/app/features/legal/legal-content.ts` and `legal-content.fr.ts`; route,
  index card, "See also" links and footer link follow automatically): meet in busy public places
  in daylight (some police stations offer safe exchange zones), bring someone along for valuable
  cards, never share your home address, check the cards before handing over money, warning signs
  (pressure, too-good deals, payment outside the agreed method), what OrenjiTrade shows (3 km
  zones, discoverability off by default), how to report and block, no payments at launch.
- [x] **Safety notice** `shared/safety/trading-safety-notice.component.ts` (`role="note"`, design
  tokens, keyboard / screen-reader accessible, link to the page, Report and Block buttons, Dismiss)
  in every conversation (`thread-view`, hidden once the thread is blocked; the composer is never
  blocked) and at the top of `/offers/:id` and `/trades/:id`. `SafetyNoticeService` stores the
  dismissal **per collector and per context (conversation / trade) in local storage**
  (`orenji.safety-notice.v1`): there is no generic server-side preferences mechanism (only typed
  privacy, notification and offer settings), and a new table for one hint was not worth a
  migration; signing in on another device shows the reminder again. Report from the notice opens
  the existing Report collector modal (`PROFILE` context on offer / trade pages), Block the
  existing confirmation dialog.
- [x] **Report and Block verified end to end.** Report already worked from the profile, the map
  preview, the conversation menu, community posts and public binders (`reporting.spec.ts`,
  ReportFlowIT). Block worked from the conversation menu and Settings → Blocked users
  (`messaging.spec.ts`, MessagingAuthorizationIT) but was **missing from the collector profile**:
  the profile now offers Block / Unblock next to Report (`collector-profile-view` outputs,
  `collector-page` + `BlockActionsService`, profile reloaded afterwards). No other redesign.
- [x] **French legal pages (Bill 96).** `legal-content.fr.ts` holds a careful Quebec-French
  translation of every English draft (vous form; « renseignements personnels », « Commission
  d'accès à l'information du Québec », « responsable de la protection des renseignements
  personnels », « cartable », « zone d'échange »), with the same keys, versions, section ids and
  clause counts (`legal-content.fr.spec.ts` enforces the parity and the `[à confirmer]`
  placeholders), its own draft banner and a "translation to be validated by a lawyer" notice.
  `LegalLanguageService`: French when the browser prefers it (`navigator.languages[0]` starts with
  `fr`), an explicit choice remembered per browser (`orenji.legal.language`), `?lang=en|fr` deep
  links; `LegalLanguageSwitchComponent` (EN / FR toggle) on every legal page and the index; pages
  carry `lang="fr"` / `"en"`. `LegalTextsService` holds the texts of the active language and is
  only imported by the lazy legal and auth chunks (the session service reads the light
  `LegalLanguageService`), so the initial bundle stays at 897 kB (900 kB warning budget) instead of
  the 933 kB a single service produced. The app UI around the pages stays English (see the
  assessment below).
  **French review fixes (2026-10-05):** the translation notice is a marking only (« Traduction de
  l'ébauche anglaise, à faire valider par un conseiller juridique. ») — the French-only sentence
  that made the English draft prevail in case of divergence was removed, because a
  language-precedence rule is legal content (asymmetric, and of doubtful effect against Quebec
  consumers under the Charter of the French language s. 55 and CPA s. 26); if the lawyer wants
  one, it goes inside the documents in both languages. Quebec typography applied to every French
  string (` ` before a colon and inside guillemets, no space before `; ! ?`), four wordings
  aligned with the English source (« pays de résidence » / « tribunal compétent » in the
  governing-law placeholder, « personne identifiée ou identifiable », « ou la nuit », « service de
  police local », « Vous n'avez jamais l'obligation de conclure un échange »); the parity spec now
  guards the notice, the typography and case-insensitive placeholders. Owner / lawyer calls left
  as they are: « gradation » (community term for grading), « entiercement (escrow) », « Politique
  du marché », « Mint » kept as the app's condition label.
  **Second French review (2026-10-05), fixed:** Marketplace Policy 2.3 said « la carte réellement
  mise en vente », which narrowed "the actual card being listed" to cards for sale; it now reads
  « la carte réellement annoncée » (the sentence about stock images « lorsqu'une carte est à
  vendre » is unchanged). Wording alignments: « Votre position précise (coordonnées
  géographiques) » instead of « Vos coordonnées précises » (coordonnées = contact details),
  « un collectionneur de bonne foi » instead of « un échangeur » (a highway interchange),
  « selon les lois qui vous sont applicables » for "in your jurisdiction", epicene rewrites of the
  two participles addressed to the reader (« Ne cédez jamais à la pression de… », « pour maintenir
  votre session ouverte »), the French `lastUpdated` label is « Dernière mise à jour : » (the
  ISO date follows, as in English), and the Trading-safely short title is « Échanger en
  sécurité » (« Sécurité » alone could be read as account security). The 18+ validation message
  is now shown in both languages like the checkbox label. Left to the lawyer / owner, as before:
  « gradation », « proxys », « premium » and « conseiller juridique » (correct; « avocat » is the
  everyday word). Note for the UI translation: the French legal texts name UI controls in French
  (« Signaler le collectionneur », « Paramètres → Compte (« Exporter mes données ») »,
  « Utilisateurs bloqués ») that the English UI does not show verbatim until step 2 of the plan
  translates those screens; keep the legal glossary and the UI catalog aligned then.
- [x] **Consent references the version and the language shown.** V104 adds
  `user_consent.language` (`en` / `fr`, default `en`); `POST /me/consents` accepts an optional
  `language` (older clients unchanged), the admin detail, the export and the audit row expose it.
  One `legal_document (document_type, version)` row covers both languages on purpose: the French
  text is a translation of the same draft, not separate legal content, so the version identifies
  the content and the consent records which rendering was read (per-language rows would collide
  with `uq_legal_document_current` and double `requiredConsents`). The web sends the active legal
  language with every consent, and the sign-up / consent checkboxes show the document titles in
  that language (the linked pages open in it). The mobile app keeps sending English consents until
  it ships the French texts (see NEXT TASK).
- [x] **Privacy Policy additions (EN + FR, placeholders where the repository does not say):** the
  Privacy Officer / Responsable de la protection des renseignements personnels (`[name to
  confirm]`, `[title to confirm]`, `privacy@orenjitrade.com`, `[postal address to confirm]`); how
  to exercise access, correction and deletion (Settings, Export my data, Delete my account with
  the 7-day grace and 30-day deletion, `privacy@` answered within 30 days, complaint to the CAI);
  confidentiality incidents (register kept; CAI and affected people notified when there is a risk
  of serious injury); where data is stored and which providers may store it outside Quebec:
  Google Cloud Montréal region `northamerica-northeast1` (Terraform default, `[to confirm at
  launch]`), Firebase Authentication, Firebase Cloud Messaging, Cloudflare (`[to confirm]` each)
  and Stripe only when payment / premium features are enabled (`United States [to confirm]`).
  **Terms additions:** OrenjiTrade is a discovery and messaging venue, not a party to trades, sales
  or meetings; collectors are responsible for their own trades and meetings (pointer to "Trading
  safely"); the limitation of liability stays qualified by "to the extent permitted by law" and
  never limits what consumer protection law forbids; no arbitration clause, class-action waiver or
  bodily-injury exclusion. Community Guidelines "Meet and trade safely" aligned. `LAST_UPDATED`
  2026-10-05; `legal_document` versions stay `2026-09-01` (pre-launch drafts, zero users).
- [x] **Tests.** API: `ConsentIT` (+2: language recorded / English by default / idempotent across
  languages / admin detail, 400 for an unsupported code), `ConsentServiceTest` (+1), re-export of
  the OpenAPI and regeneration of the clients (`language?:` optional), `npm run test:mobile` green
  against them (416 tests). Web: `legal-language.service.spec.ts` (5), `legal-content.fr.spec.ts`
  (5: parity, placeholders, Law 25 vocabulary, notice without legal content, typography),
  `legal-page.component.spec.ts` (9 keys, French rendering, EN/FR toggle persisted, `?lang`),
  `trading-safety-notice.component.spec.ts` (4), `session.service.spec.ts` (language on consents);
  `npm run test:web` 662 green + lint + Prettier. E2E `launch-safety.spec.ts`: sign up with the
  checkbox → discoverable from onboarding (API confirms, consents exported with `language: en`)
  → first conversation from a profile shows the notice (link, Report and Block dialogs, keyboard
  dismiss, hidden after reload, messaging never blocked) → Block / Unblock from the profile;
  legal pages French by default for a `fr-CA` browser, EN/FR switch remembered, `?lang=fr`, index
  and the new page in both languages, footer link. Full `npm run test:e2e`: 71 passed after fixing
  the acceptance registration spec, which part 1 had left without the 18+ checkbox step.
- **Docs:** `docs/database/schema.md` (V104, `user_consent.language`),
  `docs/api/contracts/phase1-auth-users.md`, `docs/product/product-overview.md`,
  `docs/security/README.md` (privacy officer named in the policy, consents evidence).
- **Follow-ups:** the mobile app (French legal texts, the "Trading safely" page, the safety
  notice, `language` on its consents, Block on its profile) is done in mobile stage M8
  (2026-10-06, same branch; see "Mobile app (stage M8)"); the `[to confirm]` placeholders
  for the owner / lawyer (privacy officer name, title and postal address; data locations of
  Firebase Authentication, FCM, Cloudflare and Stripe; Google Cloud region at launch; log
  retention; governing law and venue; cookie consent requirement; effective dates); the French
  translation itself awaits the lawyer's validation.

### Full UI translation (French) — assessment, not implemented

- **Today:** no i18n scaffolding in either client. Web: no `@angular/localize`, `$localize`,
  `i18n` attributes, Transloco or ngx-translate; `angular.json` has no i18n block; `index.html` is
  `lang="en"`; `LOCALE_ID` is only read by `relative-time.pipe.ts`; ~20 `Intl` / `toLocale*` calls
  hard-code `en-CA`. Mobile: no i18next / expo-localization; 8 `Intl` calls with `en-CA`. The legal
  texts are the only translated surface (runtime switch, this stage). The launch-stage strings
  around them are English-only and belong to the first batch of the follow-up: the safety notice
  copy and its Report / Block / Dismiss labels (`trading-safety-notice.component.ts`; two strings
  keyed by context, cheap to switch on `LegalLanguageService` once a UI language exists), the
  onboarding age step (`onboarding-page.component.html`), the consent list wording ("I have read
  and accept the", `legal-consent-list.component.ts`) and the `legal_document.title` row "Age
  confirmation (18 years or older)" (V103, shown in admin and `requiredConsents`). The 18+
  checkbox label and its validation message (`age-confirmation-checkbox.component.ts`) are already
  shown in both languages.
- **User-facing strings (heuristic count of template text nodes, static attributes and TS string
  literals, ± 20 %):** web `features/` ≈ 4,000 across 300 files — admin 1,650 (100 files), inventory
  330, settings 290, legal 190 (the texts), trades 185, auth 140, map 120, messages 120, search 110,
  wishlist 105, collectors 105, catalog 95, community 95, premium 90, offers 85, checkout 65, credits
  60, support 45, binders 40, disputes 40, onboarding 30, notifications 30; `shared/` ≈ 810 (116
  files); `core/` ≈ 210 (mostly `api-error-messages.ts`). Total ≈ 5,000, of which ≈ 3,200 are
  consumer-facing (excluding the admin console and the legal texts). Mobile ≈ 1,400 (≈ 1,100 without
  the legal texts): `app/` routes 400, `src/features` 475, `src/api` error / status messages 130.
- **Recommendation: a runtime translation library (Transloco on the web, i18next +
  expo-localization on mobile) with shared JSON catalogs in `packages/i18n`**, rather than the
  built-in `@angular/localize`. Built-in i18n gives compile-time extraction and zero runtime cost
  but produces one build per locale (two deployables or a locale-prefixed nginx layout), switches
  language only by reload, needs `$localize` for every TS string (error messages, snack bars,
  dialogs — ≈ 1,000 literals here), and shares nothing with the React Native app. A runtime library
  keeps one bundle, switches instantly (the legal pages already do), lazy-loads a JSON scope per
  feature, and lets the mobile app load the same `common`, `errors`, `inventory`, … namespaces,
  which halves the translation and review work. Costs: a small runtime (~15 kB), keys instead of
  inline English (a typed key helper mitigates typos), and `Intl` locale plumbing (`fr-CA` dates,
  numbers, currency). Either way Angular Material's own strings (`MatPaginatorIntl`, datepicker)
  need a French provider, and the server-sent `message` / `errorCode` wording stays English on the
  API (clients already map `errorCode` → local text, so translating `api-error-messages.ts` covers
  it).
- **Effort (one developer, rough):** web scaffolding + extraction tooling 1 week; consumer-facing
  web strings ≈ 3,200 → 3–4 weeks of keying and French copy (legal pages excluded, already done);
  admin console ≈ 1,650 → 2 weeks (can lag: staff-only); mobile ≈ 1,100 → 2 weeks after the web
  catalogs exist; professional French review of the whole catalog ≈ 1 week; QA (both languages,
  pseudo-locale pass, screenshots) 1 week. About 9–11 weeks web + mobile, 6–7 weeks for the
  consumer-facing web only. Recorded as a follow-up in NEXT TASK; not started.

## Launch readiness, parts 4 and 5 — launch configuration and Law 25 operating docs (2026-10-05)

_Branch `feature/launch-readiness`, on top of parts 1–3 (builder, workflow `launch-readiness`).
Owner decision: launch as **discovery + messaging only** with every money feature switched off;
operating documents for Quebec Law 25 and incidents; the full French UI translation assessed and
recorded as the next task, not built. Nothing deployed; cloud, Terraform, payments logic, Stripe,
credits logic and prices untouched._

- [x] **Flag inventory and launch values** (`docs/deployment/runbooks.md` section 12, "Launch
  configuration": one row per flag with what it switches on in the API and the web, why it is off,
  how a `SUPER_ADMIN` changes it in `/admin > Feature flags`, the prerequisites before switching a
  money feature on): `protectedPayments` off, `premiumPlans` off, `credits` off, `donations` off,
  `advertising` off, `mlScanning` off (owner hold), `publicChat` on. Section 6 ("Emergency
  feature-flag off") corrected on the way: real flag keys (`publicChat`, not
  `publicCommunityChannels`), `updated_by` is a uuid foreign key (the SQL set a string), the Redis
  key is `orenji:cache:feature-flags:v1` (not `rules:*`).
- [x] **Migration default risk and handling.** `V010__feature_flags.sql` created `premiumPlans`
  and `credits` **enabled**: a production database migrated from scratch would have shown "Upgrade
  to Premium" with a live checkout through the *fake* billing provider (`BILLING_PROVIDER` is
  `fake` unless configured; nobody would have paid) and the credits / referral ledger, until a
  super admin with MFA switched them off. Handling: **`V105__launch_money_flags_off.sql`** switches
  both rows off as data, respecting rows an admin already edited (`updated_by IS NOT NULL`);
  `FeatureFlagSeedContributor` (local/dev only) now re-enables `protectedPayments`, `premiumPlans`,
  `credits`, `advertising` and `donations` so development and both E2E suites keep exercising the
  fake-provider flows; V010 untouched. Staging/prod never run the seed and start with every money
  feature off. Not chosen: editing V010, a manual post-deploy step alone, constants in code.
- [x] **Gaps fixed.** API: the daily-limit SYSTEM notification (`NotificationService.limitNotice`)
  only carries the "upgrade to Premium" sentence, `upgradeUrl` and the `/premium` deep link while
  `premiumPlans` is on for the recipient (otherwise "The limit resets tomorrow.", no link). Web:
  `wishlist-summary` ("Need more room? See Premium"), `map-filters-bar` ("Up to N km on your plan",
  now a plain `<span>` with `data-testid="radius-cap"` while the flag is off), the public binder
  page's daily-views limit state ("See plans" → "Back to the map"), the generic `LIMIT_REACHED`
  message and the offer-limit problem (no "Premium raises it"), and `notificationLink` (a plan-limit
  notice opens `/wishlist` or `/notifications` unless the API offered `/premium`). Verified already
  gated before this stage: route guards (`/credits`, `/support`, `/community`, `/settings/payouts`),
  the account menu, the footer, `/premium` ("Premium is not available yet", no Upgrade button), the
  limit dialog's "See Premium", the sponsored slots, the make-offer dialog's "Use payment
  protection", the trade page's Pay / Ship / Confirm / Dispute (by trade state; an accepted offer
  opens `AGREED` when the flag is off for the buyer), and every money service in the API
  (`PaymentFeature`, `SubscriptionService.checkout`, `FakeBillingController`, `CreditLedger`,
  `ReferralService`, `DonationService`, `DonationWebhookService`, `AdService`,
  `CommunityService.requireFeature`).
- [x] **Ungated by design (documented in the runbook):** `GET /plans` (public plan list with
  prices) and `GET /me/plan` (the mobile app reads the map radius cap from both; `upgradeUrl` is
  data), the `429 LIMIT_REACHED` Problem Details' `upgradeUrl`, `POST /me/subscription/cancel`
  and the billing webhook (a live subscription stays manageable), every `/admin/**` console.
  `mlScanning` has no consumer anywhere (nothing to gate; the hold stands).
- [x] **Tests.** API: `LaunchConfigurationIT` (3: the public map shows the six money flags off and
  `publicChat` on; with all six off a seller and a buyer are found on the map, list a card and a
  public binder, wish, message, make a cash offer — a protection request is refused
  `404 FEATURE_DISABLED protectedPayments` — accept it into an `AGREED` trade with no payment and
  `/pay` refused, complete it in person, rate and report, while `/plans` and `/me/plan` stay
  readable; every subscription, credits, referral, donation and seller-account route refuses with
  the Problem Details (`errorCode`, `feature`, `requestId`) and `GET /ads` answers `[]`);
  `FeatureFlagsIT` (migration state now `premiumPlans=false`, `credits=false`; the seed enables
  all five fake-provider flags); `NotificationLimitIT` (+1: no Premium pitch and no deep link while
  the flag is off, the pitch and `/premium` while on); `AbstractPhase10IT` switches `premiumPlans`
  and `credits` on before each Phase 10 test and every money flag off afterwards;
  `GeoPrivacyContractTest` enables the four flags it reads through. Already covering the refusals:
  `billing/Phase10FeatureFlagOffIT`, `payments/FeatureFlagOffIT`,
  `offers/OfferAuthorizationIT.paymentProtectionNeedsItsFlagAndACashPart`, `community/CommunityIT`.
  Web (Vitest): `wishlist-summary.component.spec.ts` (3), `map-filters-bar.component.spec.ts` (3),
  `public-binder-page.component.spec.ts` (2, the 429 limit state with and without Premium),
  `footer.component.spec.ts` (2), `notification-kinds.spec.ts` (links updated). E2E:
  `e2e/launch-config.spec.ts` in its own Playwright project `launch-config` (`dependencies:
  ['chromium']`, so it runs alone after every other spec because it switches the real flags of
  the E2E stack through the admin API and restores them): map radius cap as text, no sponsored
  slot, account menu and footer without Premium / Credits / Support, `/premium` without Upgrade,
  `/credits`, `/support`, `/settings/payouts` redirect with "… is not available right now.", an
  offer without the protection checkbox, the agreed trade with the safety notice and no Pay
  button, the money routes' `404 FEATURE_DISABLED`, `GET /ads` empty. Run it alone with
  `npm run test:e2e -- e2e/launch-config.spec.ts --no-deps`. Fixed on the way: the E2E helpers
  (`e2e/support/stack.ts` `apiConfirmAge`, `e2e/acceptance/support/api.ts` `collector()`) read
  the public document list with the collector's token — anonymously, every worker shared the
  per-IP budget (`RATE_LIMIT_ANONYMOUS_PER_MINUTE`, 60/min) and a fast full run failed seven
  collector-heavy specs with `429`. Results (2026-10-05): `npm run test:api` 162 classes /
  797 tests, 0 failures (6 min); `npm run test:web` lint clean, 139 files / 672 tests;
  `npm run test:mobile` typecheck + lint + 416 jest tests; `npm run test:e2e` 72 specs: 71 passed,
  1 flaky (`acceptance/search.spec.ts`, unrelated, passed on its retry), `launch-config` passed
  after `chromium`; `./gradlew exportOpenApi` + `npm run generate:api` left `docs/api/openapi.json`
  and the generated clients unchanged (no contract change in this stage).
- [x] **Operating docs (Law 25, incidents, authorities, owner accounts)**, linked from
  `docs/security/README.md` section 11: `docs/security/confidentiality-incident-register.md`
  (register template with date, description, data and people affected, risk-of-serious-injury
  assessment, notifications, measures; the procedure contain → assess → notify the Commission
  d'accès à l'information and the people concerned when there is a risk of serious injury →
  record every incident even when not notified → follow up; a fictional example entry),
  `docs/security/law-enforcement-requests.md` (valid legal process only, documented emergency
  involving a risk to life, verification, minimum disclosure, precise locations never exported
  unless specifically compelled, request log template, preservation requests),
  `docs/security/owner-account-security-checklist.md` (two-factor sign-in on the Google /
  Firebase, GitHub, Cloudflare + registrar, Stripe, mailbox and future store accounts; the
  **actual** `orenji.security.admin.require-mfa` per Spring profile read from `application.yml`:
  `true` in the base document hence in `dev`, `staging`, `prod`, `false` under `local` and `test`,
  `false` for a JVM with no profile because `spring.profiles.default: local`; the code checks the
  presence of `firebase.sign_in_second_factor` only, no freshness window). README section 7
  corrected accordingly (it claimed a 12-hour `auth_time` check that does not exist).
  `docs/product/product-overview.md` gained "Launch without payments"; `docs/database/schema.md`
  and `docs/development/seed-data.md` describe V105 and the seed.
- **Findings reported, not fixed (out of scope):** Terraform sets `SPRING_PROFILES_ACTIVE` to
  `development` / `production` while `application.yml` declares `dev` / `prod`, so in cloud dev
  and prod only the base document applies (`require-mfa` stays `true`, but the `prod` overrides
  and the staging/prod `ServiceTokenStartupValidator` would not run) — align before any deploy;
  no second-factor freshness check; the account-deletion job has no legal hold for preservation
  requests; the mobile app's `src/api/errorMessages.ts` `LIMIT_REACHED` wording still says
  "Premium raises it" and its notification deep-link handling is untouched (mobile follow-up).
- **`[to confirm]` placeholders for the owner / lawyer (this stage):** Privacy Officer name,
  title and postal address (also in the policies); the lawyer who reviews the three operating docs
  and the notices; the CAI notification form / address; the register retention period (at least
  five years assumed); the internal notification timelines (3 working days assumed); the policy
  on telling a user about a disclosure; the handling of foreign authorities; the preservation
  period; whether the Google account is a Workspace organisation; the domain registrar if not
  Cloudflare; the Stripe account (none until payments are switched on); the mailbox provider for
  `privacy@` / `security@` / `no-reply@`; Apple / Google Play / Expo accounts (none yet); the
  password-manager emergency access; the date of the first quarterly review.

### Full UI translation (French) — plan (next task)

The assessment is in "Launch readiness, parts 2 and 3" ("Full UI translation (French) —
assessment, not implemented"): no i18n scaffolding in either client; ≈ 5,000 user-facing web
strings (≈ 3,200 consumer-facing, admin ≈ 1,650, legal texts 190 already bilingual) and ≈ 1,400
mobile strings; recommendation **runtime translation library** (Transloco on the web, i18next +
`expo-localization` on mobile) with shared JSON catalogs in `packages/i18n`, rather than
`@angular/localize` (one build per locale, reload to switch, `$localize` for ≈ 1,000 TS literals,
nothing shared with React Native); effort ≈ 9–11 weeks web + mobile, 6–7 weeks consumer web
only. The plan as the exact next task is in NEXT TASK.

## Platform regions and the self-declared location (stage S1, ADR 0017, 2026-10-08)

_Branch `feature/regions-geography` (from `main` at `7420905`, V105). Stage S1 of the owner's
2026-10-08 product change (six stages, one PR each): spec sections 1 and 3 plus everything the
removal of coordinates forces elsewhere. Builder done; not pushed (the ship step pushes)._

**Decision.** OrenjiTrade stops handling positions: no coordinates, distances, radii, GPS, IP
geolocation, geocoding or map provider anywhere ([ADR 0017](docs/architecture/adr/0017-platform-regions-instead-of-geolocation.md),
supersedes ADR 0004, amends ADR 0010). Collectors declare a country, an ISO 3166-2 state or
province and an optional city; discovery is scoped to a platform region (`americas-north`
default, `americas-south`, `europe`).

- [x] **Regions model** — V106 (`platform_region`, `country`, `subdivision`), V107 (3 regions, 104
  countries, 1,259 subdivisions, generated by `scripts/regions/build.mjs` from Natural Earth
  5.1.1 with mapshaper 0.7.59; provenance in `docs/development/regions-boundaries.md`).
  `RegionCatalog` (Redis `regions:v1` 60 s + 10 s memo), `GET /api/v1/regions` (public),
  `PUT /api/v1/admin/regions/countries/{code}` (ADMIN, audited `region.country.update`), web
  `/admin/regions`. Tests: RegionsIT, LocationIT, `scripts/lib/regions.test.mjs`.
- [x] **Self-declared location** — V108 drops the old `user_location` (centre, radius, public
  point, label, grid cell, GiST index) and `privacy_settings.show_distance`, recreates
  `user_location(country_code, subdivision_code, city ≤ 80, show_city)`; every collector becomes
  not discoverable until they declare a location (seed accounts get theirs back from
  `db/seed/locations.json`). `GET/PUT/DELETE /api/v1/me/location` (unknown codes 400; city
  moderated, never geocoded); discoverable needs a location (409 `LOCATION_REQUIRED`); `GET /me`
  gains `homeRegion` (users SPI `HomeRegionProvider`) and `onboarding.locationSet`.
  Removed: `ApproximateLocationService`, `StaticRegionGeocoder`, `LOCATION_JITTER_SECRET` (code,
  `.env.example`, CI, Terraform), `DistanceBucket`, the radius logic, `/collectors/nearby` and
  the collector preview.
- [x] **Region-scoped discovery** — `region` on `/search`, `/search/suggest`,
  `/search/card-holders`, `/ads`; the map's `GET /regions/{region}/binder-counts` and
  `GET /regions/{region}/subdivisions/{code}/binders` (cursor pages); `DiscoveryCache`
  (`orenji:cache:discovery:*`). Holders sort `freshness` / `price`. Every collector block
  carries `place` (state or province + country); the city appears only on its owner's profile
  while shown.
- [x] **Forced elsewhere** — wishlist matcher compares platform regions (V109 drops
  `wishlist_item.radius_km`, `wishlist_match.distance_bucket`, the matches and match alerts);
  analytics carry `region_code` / `subdivision_code` (BigQuery schema too; `city`, `distance*`,
  `radius*`, `grid_cell`, `geo_cell` refused); ads target `REGION` / `COUNTRY` / `SUBDIVISION`
  (V109); community: one REGION channel per platform region, the city channels archived (V110),
  the admin channel endpoints refuse a non-region label; the `map.radius.max_km` limit, its
  entitlements, the `map_radius_day` credit product and the "wider map" copy are gone.
- [x] **Privacy contract** — `GeoPrivacyContractTest` signs in as every seed account (and signed
  out) over every public and member surface: no coordinate / distance / radius key, no number with
  more than 3 decimals, no "km away", each city only on its owner's profile, nothing
  coordinate-like in the logs. Web acceptance PrivacyScanner and the mobile Playwright privacy
  fixture fail on the same keys and on any map provider request.
- [x] **Web** — region switcher top left (signed in: home region; signed out: `localStorage`,
  else `americas-north`; every scoped call sends `region`); onboarding "Where are you?" and
  Settings → Location (`LocationFieldsComponent`), a gentle prompt; `/map` is one Leaflet vector
  map of the bundled boundaries (lazy per region, no tiles), states shaded by binder counts, an
  accessible state list, a state panel with cursor pages, skeleton, empty state, error with
  retry and `/map?region=&subdivision=`. Removed: Google Maps and its adapter, the `MapAdapter`
  abstraction, markers, the preview, the trading-area picker, city presets, distance and
  approximate-area wording. Initial bundle 899.83 kB (900 kB warning budget); Leaflet in the
  lazy `leaflet-src` chunk.
- [x] **Mobile (Expo SDK 57)** — location step and Settings → Location with pickers fed by
  `GET /regions`; region-scoped calls send the home region (default `americas-north`); no
  distance text anywhere; the Map tab is a placeholder (names the home region, leads to search);
  `expo-location` removed (package, plugin, permission strings); `react-native-maps` stays
  installed (plugin without a key); persisted store v4 drops the distance unit.
- [x] **Seeds** — the 12 seed accounts are spread over the three regions
  (`docs/development/test-accounts.md`); the deck-box ad targets Quebec. The fictional bios,
  binder descriptions and community posts name no city (the city is a location field, shown only
  on its owner's profile).
- [x] **Infra** — nginx CSP without map or tile hosts, `Permissions-Policy: geolocation=()`;
  Cloudflare's edge rate limit covers `/api/v1/regions` instead of the removed nearby route.
- [x] **Docs** — ADR 0017 (new), ADR 0004 superseded, ADR 0010 and 0016 amended, ADR index,
  CLAUDE.md (privacy rule, Maps row), README, local setup, test accounts, seed data, schema,
  API README + `docs/api/contracts/s1-regions-location.md` (phase contracts point to it),
  architecture, product overview, deployment, security, incident register, law-enforcement
  guide; legal drafts (EN and FR, still drafts) no longer mention map tiles; `npm run sync:legal`.

**Verification fixes (2026-10-08, after the independent functional check and privacy audit):**
- The web `index.html` meta description (search engines, link previews) said "geographic
  discovery network ... find who near you owns"; it now says "regional discovery network ... find
  who in your region owns" (privacy audit's blocking item). The OpenAPI description follows.
- Each binder row of a state panel shows its owner's state/province + country (`owner.place`),
  not only the panel heading.
- Tests added: `RegionCatalogTest` (7) and `LocationServiceTest` (11), pure unit tests of the
  region, country, subdivision and city validation; `RegionMapIT` covers paused listings and
  suspended accounts in the counts and the state list, signed in and signed out;
  `region-switcher.component.spec.ts` (3). Notification fixtures of web and mobile specs no
  longer carry "km away" texts; the mobile onboarding age specs wait for the checkbox (a
  skeleton shows while the legal documents load).
- Docs: `.env.example` drops `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`; the web README drops the Maps key
  of `config.json`; `schema.md` (`discoverable`), the billing-budget README (no Maps quota), ADR
  0002 (amended, links ADR 0017) and the API README (reserved `nearby` handle) are current; the
  region-map caching is described as it is (server side only, `Cache-Control: no-cache,
  no-store`); unknown request fields such as an old client's `lat`/`lng` are documented as ignored
  and never stored (the repo's Jackson convention; `user_location` has no column for them).
- Mobile: the hint under "Show my city on my profile" follows the switch (it always said others
  only see the state or province, also while the city is shown on the profile).
- Seeds: no fictional bio, binder description or community post names a city any more.
- Test stability: cloned test printings carry the whole random token in their collector number
  (three letters collided once across a full run).
- The discoverability hints: both now name Settings → Privacy (verification fix 2; the mobile app
  also shows the switch in Settings → Location).

**Owner decisions to confirm (S1 defaults):** Europe excludes Russia, Turkey and the Caucasus
(Armenia, Azerbaijan, Georgia); Greenland is not in Americas (North); the country outlines are
dissolved from Natural Earth admin-1 (not admin-0), so a country and its states always line up;
the V110 region channel descriptions read "trades, meetups, locals" (wording only; no events feature). All are
data (admin-editable country mapping, channel texts) and can change without code.

**Migrations:** V106 `platform_regions`, V107 `platform_regions_seed`, V108
`self_declared_location`, V109 `remove_distance_features`, V110 `platform_region_channels`,
V111 `region_model_comments` (database comment only, added by the second verification fix).
The owner's local database migrates on the next `npm run dev` and **loses its trading areas by
design** (every collector declares a location again).

**Checks (2026-10-08, re-run after verification fix 2 on the final code):**
- `./gradlew exportOpenApi --rerun` then `npm run generate:api`: the working tree stays clean.
- `npm run test:api` (Spotless + `check`): 800 tests in 161 classes plus 12 in the separate
  `catalogTest` task (the catalog fixture suites run in their own JVM), 0 failures, 0 skipped.
- `npm run test:web`: lint clean, 138 files / 637 tests. `npm run build -w apps/web-angular`:
  initial 899.96 kB (214.54 kB transfer) against the 900 kB warning budget (1.5 MB error), no
  warning; Leaflet in the lazy `leaflet-src` chunk (149.42 kB); the boundary files
  (`public/boundaries/*.json`, 241 / 145 / 316 kB) are fetched per region, never bundled.
- `npm run test:e2e`: 73 passed, 0 skipped, 0 flaky (every spec, isolated stack :8180 / :4300).
  A first full run had one flaky spec (`acceptance/search.spec.ts`: its passive response
  listener lost a body after the page navigated); fixed in `3bf3e61` (search and privacy specs
  read the answers with `waitForResponse` before navigating), then the whole suite re-run. That
  read still failed under load (verification fix 3): since then `npm run test:e2e -- --retries=0`
  twice in a row, 73 passed each, 0 failed, 0 flaky, 0 skipped.
- `npm run test:mobile`: typecheck, lint, 76 suites / 648 jest tests, 28 harness guard tests.
  `npx expo export --platform android` (Hermes bundle 5.2 MB) and `--platform web` (74 static
  routes) succeed (output in the session scratchpad); neither carries a map provider URL, a
  location API or the old "near them" wording.
- `npm run test:mobile:e2e`: 51 passed, 0 skipped. Maestro on the Pixel_6_API_34 emulator
  (Android 14, Expo Go, SDK 57, cold boot): 24/24 flows in one full run (48 min 46 s of flows,
  50 min 17 s in all) after the last mobile source change; a manual walk (sign-in of a fictional
  emulator account, onboarding → "Where are you?" with Canada → Quebec and a city, the
  discoverability hint naming Settings → Privacy → Map tab placeholder → the Terms in English and
  French with the "in their region" / "dans leur région" clause) with adb screenshots, the saved
  place confirmed on the API, logcat, Metro and the API log without errors, tokens, coordinates
  or the city; the walk account deleted, Metro, the API and the emulator shut down afterwards.
- `npm run infra:validate` (fmt + validate of dev / staging / prod and Cloudflare),
  `npm run audit:gate` (OK; the two allow-listed advisories unchanged), `npm run test:scripts`
  (64/64), `node scripts/sync-legal.mjs --check` in `apps/mobile` (up to date); there is no
  `i18n:check` script and no root `scripts/sync-legal.mjs`.
- Fresh database (`orenjitrade_e2e`, recreated and migrated to V111 by the last E2E run): no
  geometry or geography column, no column named like point / lat / lng / latitude / longitude /
  radius / grid_cell / geo_cell / distance and no GiST index outside PostGIS's own tables (now
  also asserted by `FlywayMigrationIT`); `user_location` = user_id, country_code,
  subdivision_code, city, show_city, created_at, updated_at; PostGIS 3.5.2 still installed; 3
  regions, 104 countries (39 / 14 / 51), 1,259 subdivisions; the `rating_summary` comment is the
  V111 one. The owner's database `orenjitrade` is still at V105 (not migrated by this work).
- Earlier live checks (first verification round, API :8480, Redis db 5): region map answers
  carry `Cache-Control: no-cache, no-store, max-age=0, must-revalidate`; binder counts
  americas-north CA-ON 1 / CA-QC 2 / US-CA 1, americas-south AR-C 1 / BR-SP 1, europe ES-MD 1 /
  FR-IDF 1; state-list rows carry `owner.place` without a city; `sort=distance` 400; unknown
  region 404.

**Removed settings and perks:** the `showDistance` privacy switch; the trading area (centre,
radius, device location); the wishlist radius; the `map.radius.max_km` plan limit (FREE 25 /
PREMIUM 100), its entitlements and the `map_radius_day` credit product ("Wider map for a day");
the Premium "wider map radius" copy; `LOCATION_JITTER_SECRET`, `GOOGLE_MAPS_API_KEY` /
`GOOGLE_MAPS_MAP_ID` (web) and `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (mobile); the city community
channels (archived).

**Mobile follow-ups (not in S1, owner spec section 7; record of what the app still lacks):**
1. A region switcher on mobile (today the app browses the collector's home region, else
   `americas-north`).
2. The state/province binder list (the web's `/map` panel: `GET /regions/{region}/binder-counts`
   and `GET /regions/{region}/subdivisions/{code}/binders`) and the boundary map in the Map tab
   (the same bundled GeoJSON; `react-native-maps` polygons or a WebView); the tab shows placeholder
   copy until then.
3. The printing picker of the card page (S3: "Any printing", per-printing rows with rarity and
   holder counts, rarity/set/edition/language filters).
4. The have/want lists of the card page ("Who has it" / "Who wants it", S3 section 2b) and
   "Wanted by N" on inventory items.
5. Remove `react-native-maps` once the Map tab no longer needs it (kept installed in S1 by the
   owner's instruction), and `react-native-webview` if nothing else needs it (the Leaflet page was
   its only user).
6. The wishlist matches screens are interim until S2 removes matches.

**Known gaps:**
- Mobile: the Map tab does not draw the boundary map yet and there is no region switcher (the
  home region is browsed); see the follow-ups above.
- The web initial bundle is 0.04 kB under its 900 kB warning budget (899.96 kB; the legal texts
  are part of the initial bundle): the next feature on the initial path needs a deferral (for
  example lazy legal texts) or a budget decision.
- `card-images.spec.ts` (picture loading) timed out once under the parallel load of a full run
  and passed on retry and in the final run; not related to S1, watch for it.
- Region-scoped answers list the whole platform region: specs isolate by region, handle or item,
  and wishlist matching can pair collectors far apart in a large state or across a region.
- Region-map answers are cached server side only (Redis discovery cache, 60 s); like `/meta`,
  `/cards` and `/search` they carry `Cache-Control: no-cache, no-store`, so no browser or CDN
  stores them. Edge caching of the anonymous answers would be a separate change (a `public`
  header on anonymous answers plus a Cloudflare cache rule).
- The admin channel list still shows the raw region code of REGION channels (admin-only).
- `PUT /me/location` ignores unknown body properties (such as `lat` / `lng`) and
  `GET /search/card-holders` ignores unknown query parameters, like every other endpoint of the
  repo (Jackson's unknown-property default); nothing can be stored because no such column exists,
  and `sort=distance` is a 400.
- `search_performed` / `search_no_results` analytics events still carry the raw query text (as
  on `main`; not a declared place). S3's search-history rule ("never in analytics beyond counts")
  reduces it.
- The seed's Americas (South) shades two states (AR-C, BR-SP): collector6's only public binder
  (CL-RM) is 50 days unconfirmed on purpose (the seed's example of a listing HIDDEN until
  confirmed, `docs/development/seed-data.md`) and stays off the map.
- The passive network scanners of the web E2E suite (the acceptance privacy fixture,
  `watchCoordinates`, the card-images provider guard) read every JSON answer from Chromium's
  DevTools buffer and skip a body Chromium no longer holds (the cause of verification fix 3):
  they are a safety net beside the specs' recorded answers, the scanned API shortcut answers and
  the API's `GeoPrivacyContractTest`. Routing every answer through `route.fetch()` would make
  them complete; not done in S1.
- The discoverable switch keeps its "Show me on the map" label (the owner's existing wording):
  the map lists the public binders of discoverable collectors per state, and the help text says
  what is shown (state or province, public binders, searches).
- The Cloudflare README documents an optional edge WAF rule on `/admin` by
  `ip.geoip.country` (predates S1, edge-only, never reaches collector data): an accepted exception
  for the owner to confirm against the "no IP geolocation" rule.

**Verification fix 2 (2026-10-08, after the second independent verification):**
- The Terms "What OrenjiTrade is and is not" clause no longer promises "who near them" (FR "qui,
  près d'eux"): "who in their region" / "qui, dans leur région", web drafts and the mobile copy
  (`sync:legal`), still drafts. The Terms location clause, the Trading safely "what we show" and
  "report and block" clauses and the Community Guidelines summary no longer put people on the
  map (binders appear on it); the block dialogs (web, mobile ×3) say the same. Guard tests in
  both languages: `legal-content.spec.ts` (web) and `legalLanguage.test.ts` (mobile).
- The mobile onboarding discoverability hint names Settings → Privacy like the web.
- V111 refreshes the last stale database comment (`rating_summary`, "nearby ranking");
  `FlywayMigrationIT` now proves on the migrated schema that no spatial-typed or coordinate-,
  radius-, grid- or distance-named column, no GiST index and no old-model comment remains.
- Stale docs: the root README (no maps key), `apps/mobile/README.md` (the privacy fixture),
  `docs/security/README.md` (no Maps browser key), the acceptance tracker rows 3, 18, 20, 28, 35
  and the older deployment / owner-step lines.

**Verification fix 3 (2026-10-08, the two blocking findings of the second verification):**
- Web E2E: `acceptance/privacy.spec.ts` ("every place-bearing surface ...") failed on its first
  attempt in every full run and passed on retry or alone. Its card-holders answer, read back with
  `waitForResponse` + `response.json()` (the `3bf3e61` approach), threw "Network.getResponseBody:
  No data found for resource with given identifier" although the page had rendered it and had
  not navigated: the body comes from Chromium's DevTools network buffer, which does not keep
  every fetch body under load. New `e2e/acceptance/support/answers.ts` `recordAnswers(page, url)`
  records the answers in a page route (`route.fetch()` of the page's own request, parsed, then
  `route.fulfill()` with that very answer), before the page can render them. The privacy spec
  (state binder list and card holders) and the search spec (card holders) use it with the same
  assertions; no other spec asserts on the body of a page answer (the others read
  APIRequestContext answers or only statuses).
- Messages empty state (web conversation list, mobile inbox): "Find a card or a binder in search,
  open the collector's profile and press Message to start trading." instead of "Open a
  collector's preview on the map ..."; the mobile action is "Open search" (Search tab) instead of
  "Open the map" (the placeholder Map tab). Unit tests assert the text, no map / preview / near
  wording and the navigation.
- Wording sweep (web, mobile, API, Maestro, docs): the Blocked users descriptions (web, mobile)
  now say what the block dialogs say (each other's binders, profiles and posts); a web
  notification fixture no longer reads "Listed nearby"; the product overview, the launch runbook
  (section 12) and the design system no longer put collectors, markers or previews on the map.
  Remaining hits are the discoverable switch's own wording ("Show me on the map", "Visible on /
  Hidden from the map", "Not on the map", "to be shown on the map"), binders and cards that
  appear on the map, privacy assurances and test guards ("never a position or a distance",
  `assertNotVisible '.*km away.*'`), unrelated identifiers (`CollectorMarker` API schema,
  `markerTone`, read markers, map-marker icon names, the reserved handle "nearby", scroll and
  relative-time "distance", the subdivision code `HU-KM`), applied migrations (never edited)
  and history sections (ADR 0004, ADR 0010, the Phase 1/3/4/6 contracts, `schema.md` V005 and
  Phase 4). Two internal code comments still mention the removed collector preview
  (`MessagesPanelComponent.incoming`, mobile `BottomSheet`); not user-facing.
- Checks on the final code: `npm run test:e2e -- --retries=0` twice in a row (73 passed each,
  0 failed / flaky / skipped; privacy and search specs green on the first attempt both times),
  `npm run test:web` (lint clean, 138 files / 637 tests), `npm run test:mobile` (typecheck, lint,
  76 suites / 648 tests, 28 harness guard tests), `npm run test:mobile:e2e` (51 passed),
  `npm run format:check -w apps/mobile`. No Maestro flow asserts the changed texts; Maestro was
  not re-run.

## A simpler wishlist, wishlist alerts, no matches (stage S2, 2026-10-09)

_Branch `feature/regions-s2-wishlist` (from `feature/regions-geography`, S1, at `d02308a`;
`origin/main` had no commit the branch lacked). Stage S2 of the owner's 2026-10-08 product
change: spec section 4 in full. Contract: [`docs/api/contracts/s2-wishlist.md`](docs/api/contracts/s2-wishlist.md).
Builder done; not pushed (the ship step pushes)._

**What replaced matches (the spec's own default, for the owner to confirm):** no match is stored.
Wishes drive "Who wants it" and "Wanted by N" (stage S3, computed live from visible wishlists) and
a simple **wishlist alert**: when a collector of the wish owner's platform region lists a public
item that fits (card / printing / rarity, plus Near Mint or better when asked), the owner gets one
`WISHLIST_ALERT` — "<card> <code> <rarity> was just listed by @handle in <state>, <country>." —
that opens the card page with the wish's selection (`?printing=` / `?rarity=`). One on/off switch
in the notification settings; one alert per collector and item (a sent-alert key); owners without
a location get none and the wishlist page asks them to set country and state.

- [x] **The wish** — only which copy (any printing; any printing of one rarity of the card's
  printings; one printing), a public note (first field, ≤ 280 code points, plain text,
  `TextModerationService` PROFILE scope), "Near Mint only" and at most one price term from the
  admin list (platform setting `wishlist.price_terms`, seeded `80% TCG, 85% TCG, 90% TCG,
  100% TCG, 100% TCG+`; `GET /wishlist/price-terms`; `GET|PUT /admin/wishlist/settings`, ADMIN,
  audited `wishlist.settings.update`; web `/admin/wishlist`). A term the list no longer offers
  stays on the wish that chose it. Removed from form, API, DTOs and database (V112, data dropped,
  private notes **not** copied into the public note): maximum price + currency, trade/buy
  preference, radius, private notes, language, minimum condition, edition, the per-wish alert
  switch, match counts. Old request members are **ignored** like every unknown member of the API
  (`spring.jackson` `fail-on-unknown-properties: false`, `PartialUpdate`) and never stored.
  One wish per selection (409; unique index `uq_wishlist_item_selection`); the plan limit
  `wishlist.items.max` (FREE 20 / PREMIUM 500) is kept.
- [x] **Market price** — `MarketPrice.source` (`YGOPRODECK` = `YgoProDeckMapper`'s `set_price`,
  TCGplayer-based USD, dated by the provider database's last update; `SAMPLE` = the fictional
  mock catalog, CAD; `CATALOG` = staff-entered). Web: "TCG market price" / "Sample market price" /
  "Market price" with the source and date in a tooltip; mobile: the same text as a hint. "85% TCG ≈
  21.25 USD" next to a term when the wish names one printing with a price, the term alone for any
  printing.
- [x] **Matches removed** — `wishlist_match` (V112), `WishlistMatchRepository`, `WishlistMatcher`,
  `WishlistMatchView`, `WishlistRules`, `TradePreference`, the matches and dismiss endpoints, match
  counts, `lastMatchedAt`, the nightly `wishlist-rematch` job (controller, local scheduler, Cloud
  Scheduler entry: 9 jobs now, ADR 0016 amended), `WishlistMatched` and the `wishlist_matched`
  analytics event, the WISHLIST_MATCH notifications and their limit notices (deleted by V112), the
  WISHLIST_MATCH preference category; web matches drawer, match cards, `WishlistMatchesStore`,
  match readiness, "With matches" / "Paused" filters, the summary's match stats, the per-wish
  "Match alerts" switch and `/wishlist/:id` (redirects to `/wishlist`); mobile matches screen
  (`app/wishlist/[id]`), `WishMatchCard`, filters, counts and the alert switch; their tests and
  docs.
- [x] **Wishlist alerts** — `WishlistAlerts` + `WishlistAlertRepository` on
  `InventoryItemPublished` (same rules as S1's matcher for visibility, freshness, region,
  discoverability, blocks and the wisher's account; plus the selection and Near Mint rules), the
  most specific fitting wish per collector, `wishlist_alert_sent (user_id, inventory_item_id)` and
  the notification dedup key `wishlist-alert:<user>:<item>`; `NotificationSettings.wishlistAlerts`
  (column `notification_preferences.wishlist_alerts`, default on: in-app + push following the
  master switches and quiet hours, never email); the daily limit `wishlist.alerts.per_day`
  (FREE 5) still applies ("More wishlist alerts are waiting").
- [x] **Printing picker** — `shared/catalog/printing-picker` (web), reusable by the card page in
  S3: "Any printing" first and default, every printing with its picture (API card-image URLs), set,
  code, rarity, edition, language, finish and market price (source tooltip); filters rarity / set /
  edition / language (shown only where printings differ), the rarity alone meaning any printing
  of that rarity; an optional `holderCounts` input (region collectors per printing, holders
  first) for S3; a native radio group (keyboard). It powers the wish dialog now.
- [x] **Web** — wish dialog (card autocomplete → public note → Near Mint only → terms → picker),
  wishlist page (picture, which copy, note, NM / % TCG chips, edit, remove; plan usage; "Let
  others see what you want" bound to `wishlistVisible`; the location prompt), Settings →
  Notifications "Wishlist alerts" switch, `/admin/wishlist`, the public "Looking for" (note and
  chips), alert deep links to the card page, the card page passes `?rarity=` to "Add to wishlist",
  wording without matches (bell, notifications, privacy option "Let others see what you want",
  admin, the privacy policy draft EN/FR "send wishlist alerts"). Initial bundle 899.92 kB
  (899.96 before; the now unused optional-param route matcher was removed).
- [x] **Mobile (Expo SDK 57)** — wish editor (note, Near Mint only, terms with amounts and the
  price source, a simple "Which copy" chooser: any printing / any printing of one rarity / each
  printing, each with its finish), Wishlist tab (same list as the web, the visibility switch, the
  location prompt), no
  matches screen, Settings → Notifications "Wishlist alerts", alerts open the card screen with
  `?printing=` / `?rarity=` (old `/wishlist/<id>` links open the list), "Looking for" with note
  and chips, legal texts synced.
- [x] **Seeds** — collector2's wishes carry a public note, Near Mint only and price terms;
  collector1's Near Mint Azure-Eyes listing alerts collector2 through the real pipeline.
- [x] **Docs** — new `docs/api/contracts/s2-wishlist.md`; Phase 6 / S1 contracts point to it;
  `schema.md`, API / web / mobile READMEs, ADR 0017 (amended), ADR 0016 (scheduler), ADR 0009,
  architecture, seed data, test accounts, local setup, product overview, CLAUDE.md wording,
  tracker rows 23–25.

**Migration:** V112 `simplified_wishlist` (drops `wishlist_match` and the removed columns, collapses
same-selection duplicates to the oldest, clears a rarity stored with a printing, adds
`public_note`, `near_mint_only`, `price_term`, `wishlist_alert_sent`, `wishlist.price_terms`,
`notification_preferences.wishlist_alerts`; deletes WISHLIST_MATCH notifications and their limit
notices and the category key). Proven on a populated pre-V112 database (V001–V111 applied with
`psql` to a scratch database `orenjitrade_regions_check`, fictional S1-model wishes, a match,
notifications and preferences inserted, then V112): the duplicate collapsed to the oldest, the
printing wish lost its stray rarity, the rarity wish kept its rarity, no private note leaked, the
match table and the match notifications went, the MESSAGE notification and the MESSAGE category
stayed; the scratch database was dropped. The owner's database `orenjitrade` is not touched.

**Decisions:**
- "Near Mint only" accepts Near Mint **or better** (Mint), by the game's ordered conditions.
- One alert per collector and item, whatever the number of fitting wishes (the link uses the most
  specific wish); the sent-alert key is written even when the alert is switched off or over the
  daily limit, so a later republication never alerts about an item already decided.
- The one switch is a dedicated `wishlistAlerts` setting (in-app + push, never email) instead of
  a category row of the channel matrix, so the matrix and the switch never disagree.
- The nightly rematch job is removed rather than turned into an alert catch-up: alerts say "just
  listed", and the Spring Modulith registry already republishes an undelivered publication event.
- Price terms are stored as their label (`"85% TCG"`); the admin list holds labels whose format
  carries the percent and the "or more" flag, so a removed term still reads correctly.
- A rarity on a one-printing wish equal to the printing's is accepted and dropped, another one is
  400; "any printing of a rarity" must name a rarity of the card's printings.
- The public wishlist summary now lists every wish (there is no paused wish any more).
- `CollectorDiscoveryService.markersFor` (only used by the old matches) is kept for S3's "Who
  wants it" rows.
- Mobile "Which copy" is a select sheet (any printing, one entry per rarity when the card has
  several, then every printing) rather than the web's full picker; the card page picker is S3.
- A wish's "which copy" label names the printing's finish when it is not Normal ("PFT-002 ·
  Common · Prismatic Frontier · Reverse holo"): two printings of a set often differ only by it.

**Known gaps:**
- "Who wants it" and "Wanted by N" are stage S3 (the spec puts them there); until then wishes are
  visible only on the owner's public profile when shown.
- The card page (web and mobile) shows "Any printing in <rarity>" for `?rarity=` (review fix 1)
  but no holders for it yet: "Find this card" with the shared picker and per-printing holder
  counts is S3.
- A staff-edited price on an imported printing still reports its provider as the source (the
  printing's `external_ref`); the next import overwrites it anyway.
- The web printings table ("Market price" column) and the mobile printing list ("Market
  $42.00") still show prices without their source (the "Selected printing" price of the web and
  mobile card pages names it since review fix 1): S3 replaces them with the shared picker, which
  already labels the source.
- The web initial bundle stays at 899.92 kB against the 900 kB warning budget (an 80-byte
  margin): S3 has to make room (or the budget has to move, with a reason) before it adds to the
  initial chunks.
- `wishlist_alert_sent` rows are kept until the account or the item goes (no time-based purge;
  the table is small: one row per collector and listing alerted).
- Mobile follow-ups: the full printing picker on the card screen with holder counts (S3), "Who
  wants it" and "Wanted by N" (S3); the S1 follow-ups (map, region switcher) remain.

**Native check (Android emulator; the adb walk found one label bug):** while
walking the changed screens, the mobile "Which copy" chooser showed Emberfang Fox's two PFT-002
printings (normal and reverse holo) as two identical lines. Fixed in `f9405e1`: the chooser ends
each printing with its finish and the which-copy label of a wish (web and mobile) names a finish
other than Normal (unit tests on both). The stale "match" wording of `test-accounts.md`,
`local-setup.md`, `seed-data.md` and the Phase 3 contract went too (`c1dfb74`), and the exported
OpenAPI document caught up with the NotificationResponse title example (`7ca7786`).

**Checks on the final code (2026-10-09, branch `feature/regions-s2-wishlist`):**
- `./gradlew exportOpenApi` + `npm run generate:api`: the first re-run after `f37fdda` changed
  only the NotificationResponse title example ("Wishlist alert: Azure-Eyes", committed `7ca7786`);
  the second re-run reproduces every committed file byte for byte (the Windows generator rewrites
  `packages/api-client/src/.openapi-generator/FILES` with CRLF, which git shows as stat-dirty
  with an empty diff; `git checkout` of it leaves the tree clean).
- `npm run test:api` (Spotless + `gradlew check`): BUILD SUCCESSFUL in 6 m 14 s; `test` 805 tests /
  161 classes, `catalogTest` 12 tests / 2 classes, 0 failures, 0 errors, 0 skipped.
- `npm run test:web`: lint clean, 140 files / 648 tests. `npm run build -w apps/web-angular`:
  initial total 899.92 kB (214.46 kB transfer), under the 900 kB budget, no warning.
- `npm run test:e2e -- --retries=0`: 73 passed (2.6 m) on the first attempt, 0 failed / flaky /
  skipped.
- `npm run test:mobile`: typecheck, lint, 76 suites / 648 jest tests, 28 harness guard tests.
- `npx expo export` (Expo SDK 57) into the scratchpad: Android (Hermes bundle 5.16 MB, 1759
  modules) and web (73 static routes), both exit 0; neither bundle contains a matches / rematch
  endpoint, `WISHLIST_MATCH` or a map provider URL.
- `npm run test:mobile:e2e`: 51 passed (1.3 m).
- `npm run audit:gate`: OK (the 2 allowlisted advisories, `braces` and `node-forge`, until
  2026-11-30). `npm run test:scripts`: 64 / 64. `npm run infra:validate` (scheduler module, 9
  jobs): passed.
- Native Maestro check (Pixel 6 emulator, Android 14, Expo Go SDK 57):
  `npm run test:mobile:maestro` ran every flow once: **24 / 24 flows passed in 48 m 49 s**
  (including "Wishlist alert, notification and card page" and "Collector search, profile and
  Looking for"). After the label fix, Metro was restarted and both wishlist flows re-ran: 2 / 2
  passed. adb screenshots of the changed screens (wishlist tab with the visibility switch, the
  note and the NM / % TCG chips; the wish editor with terms, amounts and the price source; the
  "Which copy" chooser before and after the fix; Settings → Notifications "Wishlist alerts"; the
  notification centre with the alert "... was just listed by @collector1 in Quebec, Canada."; the
  card page it opens). Logcat: no ReactNativeJS error, no crash, only Expo Go internals; Metro
  log: bundling lines only; no token or coordinate in logcat, Metro or API logs. Metro, the
  harness API and the emulator were shut down; no process of this stage still listens.
- V112 on a populated pre-V112 database (scratch database `orenjitrade_regions_check`, dropped
  afterwards): see "Migration" above.

**Review fix 1 (2026-10-09, after the independent functional and product/UX reviews):** the
functional review passed; the product/UX review found two blocking issues, both fixed at the root
together with the cheap non-blocking ones:
- **Wish dialog errors out of view (blocking).** The error block (409 same selection, plan limit,
  summary) sat at the end of the scrolling content, below the picker, so a refused save looked
  like nothing happened. It now sits between the content and the buttons (outside the scroll, in
  view at 1280 px and 375 px); an invalid field gets the focus; when every problem sits next to
  its field the summary says "Check the highlighted fields." instead of "Validation failed"; the
  note's API errors read as sentences ("The note contains a word that is not allowed here.
  Please rephrase it.").
- **Alert link showed another printing (blocking).** The card page (web and mobile) ignored the
  `?rarity=` of a wishlist alert for "any printing in a rarity" and showed the first printing
  (another rarity) as "Selected printing". It now shows "Any printing in <rarity>" with that
  rarity's printings (highlighted in the web printings table) and picks none; "Add to wishlist"
  starts on the same choice; "Add to inventory" preselects a printing only when the rarity has
  one; choosing a printing replaces `?rarity=` in the URL; an unknown printing or rarity is
  ignored. The selected printing's price names its source ("TCG market price", "Sample market
  price", tooltip / hint with the source and date).
- Non-blocking: the price term boxes render from the form value on every change (two clicks in
  one change detection left two boxes checked); the chosen card's name takes the focus after the
  autocomplete pick, and closing the dialog returns the focus to the button that opened it (it
  lost the focus while disabled during the chunk load); which copy names an edition other than
  Unlimited (web and mobile; two printings of one code can differ only by it); Edit / Remove,
  the remove confirmation and its snack bar name which copy (web and mobile); the % TCG chip
  names its price source and date (wishlist page, public "Looking for"); the terms hint says
  amounts appear once one printing is chosen; the picker says that set, edition and language
  filters only narrow the list; a stale "matches" comment went.
- Not changed (documented decisions): price terms stay mutually exclusive checkboxes (the spec's
  wording) inside a labelled fieldset; the sent-alert key is still written while alerts are off;
  notes stay plain text rendered escaped, as everywhere in the repo; the seed has no printing
  code in several rarities (S3 adds one for its picker walk).

**Checks after review fix 1 (2026-10-09, branch `feature/regions-s2-wishlist`):**
- `./gradlew exportOpenApi` + `npm run generate:api`: no content change (the fix touches no API);
  only the known CRLF stat-dirty `packages/api-client/src/.openapi-generator/FILES`, restored
  with `git checkout`; the tree is clean.
- `npm run test:api`: BUILD SUCCESSFUL in 6 m 31 s; `test` 805 tests / 161 classes, `catalogTest`
  12 tests / 2 classes, 0 failures, 0 errors, 0 skipped.
- `npm run test:web`: lint clean, 141 files / 656 tests (new: the wish dialog spec, the
  quick-double-click term test, the trigger focus test, note wording, labels, picker hint).
  `npm run build -w apps/web-angular`: initial total 899.92 kB (214.49 kB transfer), under the
  900 kB budget, no warning (the fixes live in lazy chunks).
- `npm run test:e2e -- --retries=0`: 73 passed on the first attempt, 0 failed / flaky / skipped
  (final run 2.6 m). The first run of this fix failed once in `map.spec.ts` on a false positive of
  the DOM coordinate scanner (the signed ad click token read "NN.NNNN" across its dots, a few
  percent of tokens); the scanner now counts standalone numbers only (`e8f7a45`) and the suite
  was re-run in full twice (73 / 73 each time). New checks: the 409 error in view at 1280 px and
  375 px, the focus on the chosen card and back on "Add to wishlist" after Escape, the card page
  `?rarity=` view ("Any printing in Ultra Rare", no selected printing, the wish dialog on the
  same choice, a printing replacing the rarity) and the "Sample market price" label.
- `npm run test:mobile`: typecheck, lint, 76 suites / 650 jest tests (new: the rarity view, a
  rarity the card lacks, the price source), 28 harness guard tests.
- `npx expo export` (Expo SDK 57) into the scratchpad: Android (Hermes bundle 5.16 MB, 1759
  modules) and web (73 static routes), both exit 0; neither bundle contains a matches / rematch
  endpoint, `WISHLIST_MATCH`, `matchCount`, `radiusKm` or a map provider URL.
- `npm run test:mobile:e2e`: 51 passed (1.3 m).
- `npm run audit:gate`: OK (the 2 allowlisted advisories, until 2026-11-30).
  `npm run test:scripts`: 64 / 64.
- CI commands: `npm run lint -w apps/web-angular`, `npm run format:check -w apps/web-angular`,
  `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`,
  `npm run format:check -w apps/mobile`: all clean.
- Native check (Pixel 6 emulator, Android 14, Expo Go SDK 57): `npm run test:mobile:maestro` ran
  every flow once: **24 / 24 flows passed in 48 m 31 s** (harness 49 m 49 s). Then a scratch
  walk (flows outside the repository, `--keep-running --skip-build`, seed collector2) with adb
  screenshots: the Wishlist tab ("AZR-EN001 · Ultra Rare · Azure Dawn · 1st Edition", the note,
  "Near Mint only", "90% TCG ≈ 37.80 CAD"), the remove confirmation naming which copy, the card
  screen opened with `?rarity=Ultra%20Rare` (caption and section "Any printing in Ultra Rare",
  "2 printings of this card in Ultra Rare: any of them fits", no selected printing), then
  AZR-FR001 chosen (the rarity gives way; "Sample market price: fictional price of the local
  sample catalog · updated 2026-09-01"). The walk's first sign-in typed a garbled e-mail once
  (an emulator input glitch; the retry passed). Logcat: no FATAL EXCEPTION, no ReactNativeJS
  error (only Expo Go's "Cannot connect to Expo CLI" once Metro stopped), no token, no
  coordinate; Metro log clean; API log only Flyway's "extension already exists" notices. Metro,
  the harness API and the emulator were shut down; nothing listens on 8082, 8090, 19006, 8180,
  4300, 8480 or 4480.

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
- [x] Deployment documentation (`docs/deployment/`) — first-deploy order with the Cloudflare DNS + certificate steps, environments matrix, runbooks (scale-up path, secret rotation, Redis sidecar, budget alert, restore), backup/restore incl. restore to a different instance, console safeguards (Firebase key, budget; the Maps key restrictions went with the map provider, ADR 0017), temporary staging, per-line cost table (`docs/deployment/README.md` section 13)

## Low-cost first-year production profile (ADR 0016, 2026-10-05)

_Branch `feature/prod-low-cost` (worktree, from `origin/main` at `ded5470`), builders done (infra, API, docs), not pushed, nothing applied. Owner request: prepare the Google Cloud production configuration for a low-cost first year (target ≈ US$115–130/month at list prices) and fix the known go-live blockers without deploying anything._

- [x] ADR 0016 `docs/architecture/adr/0016-low-cost-first-year-production-profile.md`: the 13 choices, the Redis-sidecar trade-off with the per-key table of what an empty restart loses, the single-instance limit, the scale-up signals (sustained api CPU / memory alerts, Cloud SQL connections > 40 or CPU > 80 %, a few thousand actives or > ~200 concurrent WebSocket sessions, any need for two instances) and path (Memorystore Basic 1 GB + `api_max_instances > 1`, then `db-custom-1-3840` and REGIONAL, then 2 vCPU / 2 GiB), the cost table with the official pricing-page sources (Montreal, 2026-10-05): api ≈ 67, web ≈ 1, Cloud SQL ≈ 31, LB ≈ 19, Cloud Armor ≈ 8–10, egress ≈ 4–12, GCS ≈ 1, AR ≈ 0.3, Secret Manager ≈ 0.2, Scheduler 0.70, Pub/Sub + BigQuery ≈ 0–0.5, the rest 0 → **≈ US$131–142/month** (≈ 125 at minimal traffic; the 115–130 target holds only at low egress because Montreal is Cloud Run Tier 2 without a GCS Always Free allowance; US$300 trial credit for 90 days). Previous topology ≈ US$575–775.
- [x] Terraform (commits `25050ca`, `32202ad`, `fc644d0`, `77e3c0a`, `cbee16b`): Cloud SQL `db-g1-small` ZONAL with `edition = ENTERPRISE` explicit (PG16+ defaults to Enterprise Plus), 10 GB SSD auto-resize, 7 backups, PITR 7 d, deletion protection; Valkey 8.1.10-alpine sidecar pinned by digest through an Artifact Registry Docker Hub remote (`127.0.0.1 -::1`, `save ''`, `appendonly no`, `maxmemory 200mb allkeys-lru`, 0.1 vCPU / 512Mi, TCP startup probe, api `depends_on`, `REDIS_URL=redis://localhost:6379` plain env, no `redis-url` secret); api 1 vCPU / 1Gi with the heap capped at 50 % (measured 2026-10-05 on the production image: 513 MiB idle, 595 MiB under ~36 req/s, ~390 MiB non-heap, JVM up in 33 s), **min 1 / max 1** (validated while `redis_mode = sidecar`), CPU always allocated, startup boost, session affinity; Direct VPC egress `/24` `PRIVATE_RANGES_ONLY` (connector + Cloud NAT only behind `ml_enabled`, which stays false); web min 0 / max 2 / 512Mi with every `docker-entrypoint.sh` variable wired (`WS_BASE_URL`, Firebase web config, Maps key + Map ID (both removed in S1, ADR 0017), `ENVIRONMENT`; public values only); Certificate Manager with DNS authorization (+ Origin CA and classic modes); 10 Cloud Scheduler jobs = every scheduled `/internal/jobs/*` route, called over the api's `run.app` URL with audience = public API URL (`INTERNAL_AUDIENCE` / `INTERNAL_INVOKERS` set; ping, catalog-import, card-images status/clear excluded and refused by validation); Spring profile mapping `dev | staging | prod` (was `development`/`production`); generated secrets `location-jitter-secret`, `analytics-actor-salt`, `ads-token-secret`, `consent-ip-salt` (+ `db-password`, `service-token`), `stripe-billing-webhook-secret` container; unread env removed; `STORAGE_PUBLIC_BASE_URL` → the API media route (bucket enforces public access prevention); `domain-events` push off until the receiver exists; `google_billing_budget` module (US$150, 50/90/100 % + forecast, credits excluded, owner-applied); AR cleanup keeps ~10 versions per image; monitoring: api CPU/memory + Cloud SQL disk alerts, connection threshold 40, no Memorystore/connector references. The three roots share one `main.tf`. `deploy.yml` updates the `api` container only (`--container api`), ML opt-in via `DEPLOY_ML`.
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
Mobile halves (owner decision 2026-10-04: mobile resumed, local and free only): stages M1–M7 (2026-10-04/06) implement the mobile half of every user-facing criterion, and each row names its mobile evidence: `apps/mobile/e2e/*.spec.ts` (Playwright on the Expo web build against the isolated stack, 60 specs after stage M8, every JSON answer of the API scanned for coordinate, radius and distance keys and every request checked for map providers since S1) and `apps/mobile/.maestro/*.yaml` (Maestro in Expo Go on the Android emulator, 24 flows after stage M8), plus the jest suites named. DEFERRED-MOBILE now remains only for device push (25: needs an EAS project and a real FCM sender) and iOS (40: no macOS); the admin and moderator criteria (30–34) are web-only by scope (the admin consoles stay on the web; their mobile part is what a collector sees). The statuses are those of the final web verification, with the mobile results added; the mobile evidence is the builder's of each stage; M1–M6 were verified and merged into `main` as #41, #45, #46, #47, #48 and #51; the stage M7 evidence (branch `feature/mobile-m7`) and the stage M8 evidence (branch `feature/launch-readiness`, the 18+ rule and the legal pages in both languages) are the builder's. After stage M7 every row's mobile half matches the web's or states the exact difference: 1 (Google sign-in proven only against the Auth emulator), 25 (device push), 30–34 (admin consoles web-only), 38 (draft texts, same as the web), 40 (iOS not run).

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Register and log in | PASS | acceptance `registration.spec.ts` (consents → emulator e-mail verification → sign out → sign in), `auth.spec.ts`; AuthenticationIT; walkthrough sign-in (emulator ID token → `GET /me`, anonymous 401); mobile (M1): `auth.spec.ts` (sign-up with the legal documents → emulator verification → onboarding → tabs → sign-out; a seed sign-in with session restore; friendly errors; consent screen; password reset), Maestro `sign-up-onboarding.yaml`, `sign-in.yaml`, `sign-out.yaml`; mobile (M7): `google.spec.ts` (Google sign-up through the Auth emulator's simulated account: the fake OAuth credential checked, consent → onboarding → tabs, Google the only sign-in method; the chooser dismissed; Google with the e-mail of a verified password account signs in to it and links Google, an unverified one is taken over — Firebase's trusted-provider rule, as on the web), Maestro `google-sign-in.yaml`, jest `auth/google`, `screens/auth`, `screens/settings`. Difference: mobile Google sign-in is proven only against the emulator (the web build's pop-up and the device flow through expo-auth-session need the Firebase project's OAuth client ids, DEFERRED.md item 4); mobile (M8, launch readiness): the bilingual 18+ checkbox at sign-up and on the consent screen, the onboarding "Age" step for an existing account with the remembered link (`auth.spec.ts`, `age-confirmation.spec.ts`, Maestro `sign-up-onboarding.yaml`, `age-step-existing-account.yaml`, jest `screens/auth`, `screens/account-states`, `screens/onboarding`, `account/ageConfirmation`, `app/auth-gate`), every consent recorded with the language shown |
| 2 | Create/edit profile | PASS | acceptance `registration.spec.ts` (profile step), `settings.spec.ts` (edits shown on the public profile); ProfileIT, TagIT; mobile (M1): `auth.spec.ts` (profile step), `profile.spec.ts` (edit, validation, tags, public preview), Maestro `profile-edit.yaml` |
| 3 | Configure privacy settings | PASS | `settings.spec.ts` (discoverability needs a location, then saved; the state or province only, S1); acceptance `map.spec.ts` / `privacy.spec.ts` (discoverable collectors); SettingsIT, PrivacyPolicyServiceTest; mobile (M1): `account.spec.ts` (privacy switches saved, notification preferences), `location.spec.ts` (discoverable opt-in, off by default, needs a location, the state or province only, S1), Maestro `discoverability.yaml`; mobile (M7): Settings → Blocked users (`blocked.spec.ts`, Maestro `blocked-users.yaml`), "Show my wishlist on my profile" shown on profiles (`collector-wishlist.spec.ts`) |
| 4 | Choose approximate trading location → **declare a location (ADR 0017)** | PASS (S1) | acceptance `registration.spec.ts` (region, country, state and city pickers; no map, no GPS), `auth.spec.ts`, `settings.spec.ts`; LocationIT, RegionsIT, GeoPrivacyContractTest; mobile (S1): `location.spec.ts`, `auth.spec.ts` (pickers), Maestro `sign-up-onboarding.yaml`, `discoverability.yaml` (+ `scripts/check-location.js`) |
| 5 | Select TCG interests | PASS | acceptance `registration.spec.ts` (interests step), `auth.spec.ts`; ProfileIT, TagIT; mobile (M1): `auth.spec.ts` (interests step), `profile.spec.ts`, Maestro `sign-up-onboarding.yaml`, `profile-edit.yaml` |
| 6 | Open dedicated inventory page | PASS | acceptance `inventory.spec.ts`, `inventory.spec.ts`, `smoke.spec.ts`; walkthrough `/inventory`; mobile (M2): Inventory tab, `inventory.spec.ts` (2), Maestro `inventory-add-edit-delete.yaml`; mobile (M7): owner photos on a card (`item-photos.spec.ts`), multi-select bulk actions (`bulk-actions.spec.ts`), the visibility filter and binder reordering (jest `screens/inventory`) — the web's inventory extras |
| 7 | Create private inventory | PASS | acceptance `inventory.spec.ts` (card added Private by default); InventoryIT (owner-only reads, others 404); mobile (M2): `inventory.spec.ts` (cards added private by default, edit, delete), Maestro `inventory-add-edit-delete.yaml` (checked on the API), jest `screens/items` |
| 8 | Create multiple binders | PASS | acceptance `inventory.spec.ts`, `inventory.spec.ts` (five binders, keyboard reorder, delete, `binders.max` dialog); BinderIT; mobile (M2/M6): `binders.spec.ts` (create, rename, delete; `binders.max` explained), `billing.spec.ts` (a sixth binder once Premium), Maestro `binder-create-add-item.yaml`, `premium.yaml` |
| 9 | Move cards between binders | PASS | acceptance `inventory.spec.ts` (card moved into a binder), `inventory.spec.ts` (bulk move); BulkOperationsIT `MOVE_TO_BINDER`, InventoryIT; mobile (M2): `binders.spec.ts` (a card added to a binder and removed), Maestro `binder-create-add-item.yaml` ("Add cards", checked on the API), jest `screens/binders` / `screens/items` (move to a binder) |
| 10 | Toggle private/public visibility | PASS | acceptance `inventory.spec.ts` (made public), `inventory.spec.ts` (bulk public 24 h / private); VisibilityIT, BulkOperationsIT; mobile (M2): `binders.spec.ts` (publish for 24 hours → make private), jest `screens/items` / `features/itemForm` (card visibility), Maestro `binder-create-add-item.yaml` (temporarily public, checked on the API); mobile (M7): `bulk-actions.spec.ts` (bulk public, temporarily public for 24 h, private with the skipped card explained) |
| 11 | Publish a binder | PASS | acceptance `inventory.spec.ts` (publish → another collector sees it); BinderIT, PublicBinderIT; walkthrough (publish → second collector opens the public binder); mobile (M2): `binders.spec.ts` (publish → another collector's view of it), Maestro `binder-create-add-item.yaml` |
| 12 | Another user opens the map | PASS (S1) | acceptance `map.spec.ts` (boundary map of the browsed region, states shaded by binder counts, region switcher), `map.spec.ts`, `smoke.spec.ts`; RegionMapIT; mobile (S1): the Map tab is a placeholder naming the home region (`map.spec.ts`, Maestro `map-placeholder-profile.yaml`); drawing the map on mobile is a follow-up |
| 13 | Public collectors at approximate positions → **per state or province (ADR 0017)** | PASS (S1) | no position exists: acceptance `map.spec.ts` + `privacy.spec.ts` (states only, no coordinate or distance key, no map provider request, cities only on profiles); GeoPrivacyContractTest; mobile: `placePrivacy.test.tsx`, Playwright privacy fixture |
| 14 | Click collector marker → **choose a state** | PASS (S1) | markers are gone by design (ADR 0017): acceptance `map.spec.ts` (click or keyboard on a state, the accessible state list, `/map?region=&subdivision=`); mobile: follow-up with the boundary map |
| 15 | Collector preview appears → **state panel** | PASS (S1) | the preview is removed (ADR 0017); the state panel lists the state's public binders in cursor pages with skeleton, empty state and error with retry (acceptance `map.spec.ts`, `map.spec.ts`; RegionMapIT); mobile: follow-up |
| 16 | Open full profile | PASS (S1) | acceptance `map.spec.ts` (state panel → binder → profile), `registration.spec.ts` (the city on the profile only while discoverable and shown); CollectorProfileIT; mobile (S1): `map.spec.ts` (profile with the state and the shown city), `holders.spec.ts`, Maestro `map-placeholder-profile.yaml` |
| 17 | View public binder | PASS | acceptance `map.spec.ts` / `inventory.spec.ts`, `inventory.spec.ts` (the owner's state only, no private notes); PublicBinderIT; mobile (M2/M5/S1): `binders.spec.ts` (another collector's public binder: public cards, the owner's state, never the city), Maestro `binder-create-add-item.yaml` |
| 18 | Search for a card | PASS | acceptance `search.spec.ts` (top-bar search), `catalog.spec.ts` (autocomplete, filters, printing codes); CatalogSearchIT; walkthrough `/search`, `/cards`; mobile (M2): Search tab, `catalog.spec.ts` (filters, card detail, printing codes), Maestro `search-card-detail.yaml`; mobile (M7): the Search tab's Collectors and Binders segments on `GET /search` like the web's `/search` tabs (`search-segments.spec.ts`: by name or handle with their state or province (no distance since S1), opted-out collectors absent, recent searches per segment; public binders by name with their owner), set pages `sets/[id]` (jest `screens/sets`) |
| 19 | Nearby collectors with that card → **holders in my region** | PASS (S1) | acceptance `search.spec.ts` ("Who has this in my region" → card holders of the browsed region with the holder's state; another region does not list them), `map.spec.ts`; SearchIT, CardHoldersIT; mobile (S1): `holders.spec.ts`, Maestro `card-holders-region.yaml`, `holders-filters.yaml` |
| 20 | Exact coordinates never exposed | PASS (S1: nothing to expose) | no coordinate is stored (FlywayMigrationIT on the migrated schema: no geometry/geography or coordinate-, radius- or distance-named column, no GiST index, no comment describing the old model; plus the fresh-database check); GeoPrivacyContractTest over every response family as every seed account + logs; acceptance PrivacyScanner (coordinate / distance / radius keys, cities outside profiles, map provider requests) on every acceptance test; mobile `placePrivacy.test.tsx`, `coordinateLiterals.test.ts`, the Playwright privacy fixture |
| 21 | Private messaging | PASS | acceptance `messaging.spec.ts` (realtime delivery, unread badge, "Seen", live answer), `messaging.spec.ts` (blocks, photos); ConversationIT, MessagingAuthorizationIT, RealtimeIT; walkthrough (third collector gets 404); mobile (stage M4): `apps/mobile/e2e/messages.spec.ts`, Maestro `messages-inbox-thread.yaml`; mobile (M7): block → Settings → Blocked users → unblock (`blocked.spec.ts`, Maestro `blocked-users.yaml`) |
| 22 | Public community chat | PASS | acceptance `community.spec.ts`, `community.spec.ts` (moderation); CommunityIT, ModerationIT; mobile (stage M4): `apps/mobile/e2e/community.spec.ts`, Maestro `community-post.yaml` |
| 23 | Create wishlist | PASS (S2: simplified wish) | acceptance `wishlist.spec.ts`, `wishlist.spec.ts` (printing picker, public note, Near Mint only, one % TCG term; same selection 409, FREE limit dialog); WishlistIT (only the new fields, old members ignored, note moderation and length, admin price terms); mobile (S2): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-alert-notification.yaml` |
| 24 | New public inventory triggers match → **wishlist alert** | PASS (S2: alert, no stored match) | acceptance `wishlist.spec.ts` (Lisbon pair), `wishlist.spec.ts` (Americas South pair; Near Mint only, one alert, card page link); WishlistAlertsIT (same region yes, other region no, NM-only, rarity, one alert per item, no location, switch off, blocks); mobile (S2): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-alert-notification.yaml` |
| 25 | In-app/push notification received | PASS (in-app + log push) · DEFERRED-CLOUD (real FCM) · DEFERRED-MOBILE (device push: needs an EAS project and a real FCM sender, owner cost rule) | acceptance `wishlist.spec.ts` (live STOMP notification), `wishlist.spec.ts` (bell, `/notifications`); NotificationCentreIT, NotificationRealtimeIT, PushDeliveryIT (log push provider); walkthrough (`WISHLIST_MATCH`, unread 0 → 1; `WISHLIST_ALERT` since S2); mobile in-app (stage M4/S2): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-alert-notification.yaml` (live bell badge, alert → card page) |
| 26 | Send offers | PASS | acceptance `offers.spec.ts` (create → counter → accept → decline), `offers.spec.ts`, `payments.spec.ts`; OfferStateMachineIT, OfferAuthorizationIT, TradeLifecycleIT; walkthrough (offer → counter → accept → trade); mobile (stage M5): `apps/mobile/e2e/offers.spec.ts`, Maestro `offer-trade-rating.yaml` |
| 27 | Eligible users can rate | PASS | acceptance `rating.spec.ts` (no rating without interaction, unrelated 403), `rating.spec.ts`; RatingEligibilityIT, RatingRulesTest; mobile (stage M5): `apps/mobile/e2e/offers.spec.ts` (rate from the completed trade, a reference), Maestro `offer-trade-rating.yaml`, jest `screens/ratings` (no interaction: no rating, the reason explained) |
| 28 | Report collector via popup | PASS | acceptance `reporting.spec.ts`, `reporting.spec.ts` (all entry points); ReportFlowIT, ReportThresholdIT; mobile (stage M5): `apps/mobile/e2e/reports.spec.ts` (profile, conversation), Maestro `report-collector.yaml`, jest entry points (collector profile, community post, public binder; the map preview is gone since S1) |
| 29 | Reason required + confirm | PASS | acceptance `reporting.spec.ts` (reason → confirm), `reporting.spec.ts` (Confirm disabled without a reason); ReportFlowIT; walkthrough (no reason → 400); mobile (stage M5): `apps/mobile/e2e/reports.spec.ts` (Confirm disabled without a reason, "Report sent"), jest `screens/reports` |
| 30 | Admin reviews reports | PASS | acceptance `reporting.spec.ts` (admin sees → acts → audit log → reporter informed); ReportFlowIT, AdminAuthorizationIT; walkthrough (moderator resolves, collector 403); mobile: web-only by scope (admin consoles stay on the web); the reporter's side is mobile (M5: My reports with the status, `reports.spec.ts`) |
| 31 | Auto-delisting detects stale inventory | PASS | acceptance `stale-listings.spec.ts` (`/internal/jobs/freshness` → STALE, nothing deleted); FreshnessJobIT, FreshnessPolicyTest, StrikesIT, DelistingAdminIT; `admin-moderation.spec.ts` (policy editor); mobile: the job is server-side; the collector's side is mobile (M2: stale / hidden cards with "Confirm all", paused listings with "Resume", jest `screens/inventory`); no mobile E2E (the job's timing is proven by the web acceptance spec) |
| 32 | Admin reviews stale listings | PASS | acceptance `stale-listings.spec.ts` (admin "Needs review" queue → Restore → ACTIVE → `listing.restore` audited; closes the stage 11 gap), `admin-moderation.spec.ts` (hide, pause/resume); DelistingAdminIT; walkthrough `/admin/listings`; mobile: web-only by scope (admin console) |
| 33 | Admin suspends accounts | PASS | `admin.spec.ts` (suspend + unsuspend, role restrictions); AdminUsersIT; mobile: web-only by scope (admin console); a suspended collector sees the suspended screen in the app (M1, jest `screens/account-states`) |
| 34 | Admin actions in audit log | PASS | acceptance `reporting.spec.ts`, `stale-listings.spec.ts`, `account-deletion.spec.ts`; `admin.spec.ts`, `admin-moderation.spec.ts`, `payments.spec.ts`, `credits-ads.spec.ts`; AuditIT and the per-phase audited-write ITs; walkthrough (`REPORT_RESOLVED`); mobile: web-only by scope (admin console) |
| 35 | Freemium limits work | PASS | acceptance `freemium.spec.ts`, `freemium.spec.ts`, `inventory.spec.ts`, `admin-rules.spec.ts`; LimitsIT, BinderIT, BinderViewLimitIT; mobile (M2/M6): limits explained where they happen (`binders.spec.ts` `binders.max` 5 of 5; jest binder views, offers per day, wishlist; the map radius cap is gone since S1, ADR 0017) with "See Premium" (`billing.spec.ts`, Maestro `premium.yaml`, jest `screens/billing`) |
| 36 | Premium entitlements override | PASS | acceptance `freemium.spec.ts` (fake billing checkout → Premium lifts `binders.max`), `freemium.spec.ts`, `credits-ads.spec.ts`; LimitsIT, SubscriptionFlowIT, CreditLedgerIT; walkthrough (FREE → PREMIUM → no ads → FREE); mobile (M6): `billing.spec.ts` (fake billing checkout, a decline then a payment → PREMIUM lifts `binders.max` (sixth binder), no "Sponsored" result → "Cancel now" → FREE; a credits unlock adds a day's boost), Maestro `premium.yaml` (plan checked on the API) |
| 37 | Account deletion works | PASS | acceptance `account-deletion.spec.ts` (hidden at once; deletion job anonymises, identity deleted, consents/audit kept), `settings.spec.ts`; DeletionIT, ExportIT; mobile (M1): `account.spec.ts` (deletion request with re-authentication → the deletion-pending screen → cancelled; data export), jest `screens/account-states` |
| 38 | Legal pages exist | PARTIAL | 9 pages served under `/legal/*` in English and French (EN/FR switch, French by default for a French browser, `launch-safety.spec.ts`) with versioned consent recording the language shown (TermsIT, ConsentIT, `smoke.spec.ts` draft banner, walkthrough `/legal/terms`); mobile (M8): the same 9 texts in-app in both languages, synced from the web files, an EN/FR switch on the index and every document, French by default on a French device, the draft banner on both and the translation marking in French, consents with the language shown (`legal-french.spec.ts`, Maestro `legal-french.yaml`, jest `screens/legal`, `features/legalLanguage`); texts are drafts until counsel review and the French translation awaits the lawyer's validation (owner action) |
| 39 | CI runs automatically | PASS | GitHub Actions CI green on `main` for the stage 11 merge (`7bb5c27`) and on stage PRs (API incl. Testcontainers, web, mobile, ML, Terraform); `e2e.yml` now runs the whole Playwright suite on PRs, nightly and on demand (first GitHub run with the next PR); `npm run test:all` mirrors it locally; mobile: CI runs the mobile typecheck, lint, jest and the `mobile-web` Playwright job; the Maestro flows are local only (they need an Android emulator) |
| 40 | E2E covers critical workflows | PASS (web) · PASS (mobile, Android) · DEFERRED-MOBILE (iOS: no macOS) | 67/67 Playwright tests (51 feature + 16 acceptance) against the real local stack, 0 flaky, 0 skipped; mobile (M1–M7): 54/54 Playwright mobile web specs (`apps/mobile/e2e`, isolated stack, 0 flaky, 0 skipped) and 21 Maestro flows in Expo Go on the Android emulator (`apps/mobile/.maestro`), covering accounts, Google sign-in, inventory (photos, bulk actions), binders, the map, card holders, collector and binder search, messages, blocked users, wishlist, offers, trades, ratings, reports, payment protection, disputes and Premium |
| 41 | Runs locally | PASS | `npm run infra:reset -- --yes` → `npm run test:all` green → `npm run dev` ready in 50.6 s → 36/36 API + 28/28 UI walkthrough checks; fake payments/billing/donations, log push/e-mail/analytics, no external credentials; mobile: Expo Go on a local Android emulator against the local stack; `npm run test:mobile:e2e` (isolated API :8090, web build :19006) and `npm run test:mobile:maestro` (Metro :8082) run locally and free (no EAS, no Expo account, no Maestro Cloud) |
| 42 | Deploys to Google Cloud | DEFERRED-CLOUD | owner decision (docs/deployment/DEFERRED.md); Terraform validates (`npm run infra:validate`), never planned or applied |
| 43 | Cloudflare configuration documented | PASS | `infrastructure/cloudflare/README.md` + Cloudflare Terraform (validated by `npm run infra:validate`); applying it is DEFERRED-CLOUD |
| 44 | Production architecture supports www.orenjitrade.com | DEFERRED-CLOUD | designed (ARCHITECTURE.md, ADRs, Terraform for Cloud Run + Cloudflare, validated); not deployed |

### Remaining gaps (after the final verification)

- **Cloud (apply deferred by owner; configuration prepared 2026-10-05, ADR 0016):** the owner runs `terraform apply` (GCP project, state bucket, WIF, the low-cost prod profile incl. the generated `ANALYTICS_ACTOR_SALT` / `ADS_TOKEN_SECRET` / `SERVICE_TOKEN` secrets), the Cloudflare apply and the console steps (`docs/deployment/README.md`); still missing in code: the `/internal/events/pubsub` receiver (domain-events push stays off), sendgrid/ses e-mail adapters (`log` only), the Stripe live keys, device push (FCM) and the first real Pub/Sub → BigQuery run; the sidecar probe / fractional CPU / Certificate Manager questions listed in that section can only be settled at the first apply.
- **Mobile (resumed 2026-10-04, local and free only):** Phases 1–10 done in stages M1–M6 (merged as #41, #45–#48, #51) and the web parity gaps closed in stage M7 (see "Mobile app (stage M1)" to "(stage M7)"; admin consoles stay web-only); the launch-readiness mobile half done in stage M8 (18+ confirmation, French legal pages, safety notice, money-off; branch `feature/launch-readiness`); open: the Expo SDK 58 upgrade (owner-approved, its own PR), the full French UI translation (after the upgrade), Google sign-in against a real Firebase project (OAuth client ids; proven only against the Auth emulator), signed-out browsing (the web's anonymous routes are not mirrored), the owner's decision on app-store purchases before any store build sells Premium or takes donations (ADR 0011 open question: in-app purchase, link out to the web, or web-only purchases), device push delivery (needs an EAS project and real FCM), iOS runs (no macOS), fonts; EAS stays unused (project id placeholder).
- **ML (on hold):** Phase 11 card recognition and scanning.
- **Legal:** counsel review of the 9 draft legal pages and validation of their French translation (criterion 38); the `[to confirm]` placeholders of the Privacy Policy (privacy officer, data locations).
- **Backend debt (local):** Phase 10 analytics events (subscription, credit spend, ad served/clicked, donation) and AnalyticsIT coverage of the Phase 9 payment/dispute events; declare the Phase 8 `ProblemDetail` extensions (`latestOfferId`, `offerId`, `currentVersion`) in OpenAPI, regenerate the clients and drop the web's `problemExtension()` reads; join blocks into the Phase 4 discovery SQL; binder names/descriptions and public notes through `TextModerationService`; `Idempotency-Key` replay fail-open without Redis; avatars re-encoded as JPEG (no WebP encoder); OpenAPI `info.license` lacks `identifier`/`url`; generated client sends `application/problem+json` on 204 operations (web `accept-header.interceptor.ts` workaround).
- **Web debt:** `/sets` index page; admin set/printing creation UI; E2E for the admin plan editor, admin subscription cancel and donation refund/settings; `metadata.<key>` catalog filters not exposed; Leaflet `_leaflet_pos` console error on map teardown during zoom; fake checkouts poll up to ~45 s for the synthetic webhook; initial bundle 887.66 kB close to the 900 kB warning budget (887.59 kB before the map privacy rendering, 877.57 kB before the card pictures); the admin seed account lands on `/onboarding` after sign-in (staff profile not onboarded).
- **Hardening (Phase 13):** dedicated security review and header audit, rate-limit tuning (rapid full reloads reach the 120/min per-user and 60/min anonymous per-IP limits, see stage 12 debt), accessibility pass, load test script, DB index review, backup/restore docs, failure testing; first GitHub run of the E2E workflow.

---

## NEXT TASK

> **Stage S1 — geography (2026-10-08, branch `feature/regions-geography`, not pushed):** builder
> done (see "Platform regions and the self-declared location (stage S1)"): ADR 0017, V106–V111,
> API, web, mobile, seeds, docs and every suite listed there. The owner's local database
> migrates on the next `npm run dev` and loses its trading areas by design.
>
> **Stage S2 — simplified wishlist, wishlist alerts, no matches (2026-10-09, branch
> `feature/regions-s2-wishlist` on top of `feature/regions-geography`, not pushed):** builder done
> (see "A simpler wishlist, wishlist alerts, no matches (stage S2)"): V112, API, web (the shared
> printing picker), mobile, seeds, docs and every suite listed there; review fix 1 (the wish
> dialog's errors in view, the card page's "Any printing in <rarity>" for an alert's `?rarity=`,
> focus, labels) re-ran every suite and the 24 Maestro flows. Merge order: the S1 PR first, then
> S2.
>
> **Exact next task: stage S3 — search, the card page, have/want and search history (spec
> sections 2 and 2b of the 2026-10-08 product change), on a new branch from the S2 branch (or
> `main` once S1 and S2 are merged).** Reuse `shared/catalog/printing-picker` on the card page
> (feed its `holderCounts` input from a new grouped per-printing holder count, read `?printing=` /
> `?rarity=` into it, replace "Selected printing" and "Who has this near me" with "Find this
> card"), extend `/search/card-holders` (rarity, country/subdivision filters, per-printing counts,
> sorts), add "Who wants it" (visible wishlists, the S2 public note and NM / % TCG chips;
> `CollectorDiscoveryService.markersFor` gives the rows' collectors) and "Wanted by N" on inventory
> items (one grouped query, the same fit rules as `WishlistAlertRules`), search result have/want
> counts, the rarity query parsing, and the server-side search history (`/me/search-history`,
> privacy switch, export, deletion). The remaining stages: S4 community photos (section 5), S5 YDK
> + Collectr import (section 6), S6 final docs and the definition-of-done walkthrough (sections
> 8–9). Mobile follow-ups of S1 and S2 are listed in their sections.


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

> **Mobile stage M6 (2026-10-05, branch `feature/mobile-m6` on top of `feature/mobile-m5`):**
> Phases 9 and 10 on the Expo app (see "Mobile app (stage M6)"): payment protection on the trade
> ("Use payment protection", pay on the app's fake checkout, ship, confirm receipt, payout status),
> disputes (statements, photos from the library, thread, timeline; DISPUTE_UPDATE deep links),
> Settings → Payouts, Premium through the fake billing checkout with "See Premium" on reached limits,
> credits (ledger, unlocks, referrals), donations through the fake donation checkout, "Sponsored"
> placements; the mobile half of the acceptance tracker; app-store purchase rules recorded as an open
> owner question (ADR 0011); 57 new jest tests (661 in all), 7 new Playwright specs (45 in all), 2 new
> Maestro flows (17 in all). No API, web, package or dependency change. Committed, not pushed.
> **Next:** independent verification of stage M6 (after M3–M5), then push, PR and merge.

> **Mobile stage M7 (2026-10-06, branch `feature/mobile-m7` on top of `feature/mobile-m6`, `origin/main`
> #49 and #51 merged in):** the web parity gaps closed (see "Mobile app (stage M7)"): Google sign-in
> and sign-up (emulator-proven), the Search tab's Collectors and Binders segments, the card holders
> list with the web's sort and filters, "Looking for" on profiles, Settings → Blocked users, inventory
> owner photos and bulk actions, the visibility filter, binder reordering, the map's freshness / tags
> filters and search box, set pages; every acceptance row's mobile half completed; 9 new Playwright
> specs (54 in all), 4 new Maestro flows (21 in all), `expo-auth-session` added. Merged into `main`
> as #53 (2026-10-06) and into `feature/launch-readiness` for stage M8.

> **Mobile stage M8 (2026-10-06, branch `feature/launch-readiness` with `origin/feature/mobile-m7`
> and then `origin/main` (#53) merged in):** launch readiness on the Expo app (see "Mobile app (stage M8)"): the 18+
> confirmation at sign-up, on the consent screen and as the onboarding "Age" step of existing
> accounts (with the `AGE_CONFIRMATION_REQUIRED` answer routed to it), consents recorded with the
> language shown, the French legal pages with an EN / FR switch, the "Trade safely" notice in
> conversations and on offers / trades, Block / Unblock on the profile, the money-off follow-ups;
> the mobile harness and the Maestro host scripts record the age consent; 6 new Playwright specs
> (60 in all, all green), 3 new Maestro flows (24 in all, 24/24 in one run), `expo-localization`
> added. Committed, not pushed.
> **Next:** push, let PR #52 run CI (the mobile browser suite now passes the gated API) and merge.

> **E2E isolation, test-data purge and 3 km zones (2026-10-04, branch `fix/e2e-isolation-3km-zones`):**
> merged into `main` as #39 (see the section of the same name): `npm run test:e2e` runs on its
> own stack (database `orenjitrade_e2e`, API :8180, web :4300, Redis db 2, files under
> `.local-dev/e2e/`) next to `npm run dev` and deletes its emulator accounts; `npm run e2e:purge`
> removes `@example.test` accounts through the deletion path; web collector maps show 3 km zones
> (radius 1500 m), zoom capped at 14. The mobile half of the 3 km rule (Map
> tab zones, preview bottom sheet, collector profile) is done in mobile stage M3 (above).

> **Low-cost first-year production profile (2026-10-05, branch `feature/prod-low-cost`):**
> infra, API and docs builders done (see the section of the same name): Terraform for a
> ≈ US$131–142/month prod (Cloud SQL `db-g1-small` ZONAL Enterprise, Valkey sidecar, one api
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

**Exact next task — ship PR #52 with mobile stage M8, then the Expo SDK 58 upgrade, then the full
French UI translation:**
1. Push `feature/launch-readiness` (launch readiness parts 1–5 + mobile stage M8, `origin/main`
   with #53 already merged in) and merge PR #52 when every check is green, the mobile browser
   suite included. The checks to repeat for an
   independent verification: `npm run test:mobile` (748 jest tests in 85 suites), `npx expo-doctor`
   (20/21, the known newer-patch notice), `expo export` for android and web, `npm run
   test:mobile:e2e` (60 specs, 0 flaky, 0 skipped), the native check with `npm run
   test:mobile:maestro` (24 flows) on `Pixel_6_API_34`, plus a look at the sign-up checkbox, the
   "Age" step of an account created without the confirmation (`CONFIRM_AGE=false` in
   `create-collector.js`, or `confirmAge: false` in the Playwright helper), the legal pages in both
   languages (EN / FR switch, the French banner and marking), the "Trade safely" notice in a first
   conversation and Block / Unblock on a profile (seed accounts, `LocalDev!2026`, see the age step
   once).
2. The Expo SDK 58 upgrade (owner-approved 2026-10-05) as its own PR after the merges, then close
   the Dependabot Expo PRs.
3. The full French UI translation, web first then mobile: the plan "Exact next task after launch
   readiness — full French UI translation" below.
4. Owner decision (no code until then): how a store build sells Premium and takes donations (ADR 0011
   open question). Device push (EAS + FCM), iOS runs, the fonts and Google sign-in against a real
   Firebase project (OAuth client ids) stay open for the mobile app; cloud deployment (Phase 14) and
   ML (Phase 11) stay deferred / on hold until the owner lifts them.

> **Launch readiness, part 1 — 18+ rule (2026-10-05, branch `feature/launch-readiness`):** done
> (see "Launch readiness, part 1"). **Next mobile task (do not start before the mobile stages
> above are merged; the API is already additive):** add the 18+ confirmation to the Expo app —
> an unticked checkbox "I confirm I am 18 years of age or older" / "Je confirme avoir 18 ans ou
> plus" on `app/(auth)/sign-up.tsx` (`src/account/registration.ts`: post
> `{ documentType: 'AGE_CONFIRMATION', version }` with the other consents through the existing
> `acceptConsents`; the version comes from `GET /public/legal/documents`, which now lists
> `AGE_CONFIRMATION` with `requiredAtRegistration: false`, so keep it out of the "I have read and
> accept" list), the same checkbox on `app/(account)/consent.tsx` while
> `me.onboarding.ageConfirmed === false`, a first onboarding step on `app/onboarding.tsx`
> (`src/account/accountStatus.ts` `needsOnboarding` must also be true while
> `ageConfirmed === false`), a message for `AGE_CONFIRMATION_REQUIRED` in
> `src/api/errorMessages.ts` (route to onboarding), and `apps/mobile/e2e/support/stack.ts` must
> post the `AGE_CONFIRMATION` consent for the collectors it creates (otherwise its discoverability
> and messaging flows get the 403). **Done in mobile stage M8 (2026-10-06, same branch; see
> "Mobile app (stage M8)").**

> **Launch readiness, parts 2 and 3 — trading safety and French legal pages (2026-10-05, same
> branch):** done (see "Launch readiness, parts 2 and 3"). **Next mobile task (after the mobile
> stages above are merged):** ship the French legal texts (copy `legal-content.fr.ts` next to the
> synced English file, a language switch on `app/legal/index.tsx` and `app/legal/[key].tsx`,
> French by default when `expo-localization` reports `fr`), send `language` with every consent in
> `src/account/AccountProvider.tsx` (`acceptConsents`) so the API records which translation was
> read, list the new `trading-safely` key (already in the synced English file), show the
> dismissible safety notice in the conversation screen of stage M3 (and on the offer / trade
> screens when they exist; dismissal in AsyncStorage per user), and add Block / Unblock on the
> mobile collector profile next to Report. **Done in mobile stage M8 (2026-10-06, same branch).**
> **Follow-up for the owner / lawyer:** the `[to confirm]`
> placeholders listed in that section. **Follow-up product task — full French UI:** see the
> assessment "Full UI translation (French)" in that section (runtime library with shared JSON
> catalogs, ≈ 9–11 weeks web + mobile); not started.

> **Launch readiness, parts 4 and 5 — launch configuration and Law 25 operating docs
> (2026-10-05, same branch):** done (see "Launch readiness, parts 4 and 5"). **Next:** push
> `feature/launch-readiness`, open the PR and merge to `main` when CI is green (the shared local
> database then migrates to V105: the local seed re-enables the fake-provider flags, so nothing
> changes for `npm run dev`). **Owner / lawyer follow-ups:** the `[to confirm]` placeholders listed
> in that section and in parts 2 and 3; align the Spring profile names between Terraform and
> `application.yml` before any cloud deployment. **Next mobile task (after the mobile stages are
> merged):** neutral `LIMIT_REACHED` wording in `src/api/errorMessages.ts` and the plan-limit
> notification deep link (`/premium` only when the payload carries it), in addition to the mobile
> follow-ups of parts 1–3. **Done in mobile stage M8 (2026-10-06, same branch).**

**Exact next task after launch readiness — full French UI translation (web first, then mobile):**
1. **Scaffolding (≈ 1 week).** `packages/i18n` with JSON catalogs per namespace (`common`,
   `errors`, `auth`, `onboarding`, `map`, `inventory`, `binders`, `search`, `wishlist`,
   `messages`, `offers`, `trades`, `collectors`, `settings`, `notifications`, `community`,
   `legal-chrome`, `admin`), `en` and `fr-CA`, a typed key helper, a `missing-keys` script in CI.
   Web: Transloco (`@jsverse/transloco`, pinned) with lazy scopes per feature folder, a
   `LanguageService` that reuses the `LegalLanguageService` preference (browser language → stored
   choice → `?lang=`), `LOCALE_ID` / `Intl` plumbing for `fr-CA` dates, numbers and currency,
   French providers for Angular Material (`MatPaginatorIntl`, datepicker), `lang` on `<html>`.
2. **Consumer-facing web strings (≈ 3–4 weeks, ≈ 3,200 strings).** Feature by feature in the
   order users meet them: auth + onboarding, map + collectors, search + catalog, inventory +
   binders, wishlist + notifications, messages, offers + trades, settings, community; replace
   inline English with keys, keep the English catalog as the source, translate to Quebec French
   (vous form, the glossary of the legal pages: « cartable », « zone d'échange », « collectionneur »),
   `api-error-messages.ts` and `offer-problems.ts` through the `errors` namespace (the API keeps
   English `message` / `errorCode`). Each feature's specs run in both languages; Playwright adds a
   French walkthrough of the happy paths (sign-up → onboarding → map → message → offer).
3. **Admin console (≈ 2 weeks, ≈ 1,650 strings, may lag: staff only).**
4. **Mobile (≈ 2 weeks after the web catalogs exist, ≈ 1,100 strings).** i18next +
   `react-i18next` + `expo-localization`, the same JSON catalogs from `packages/i18n`, the legal
   texts in both languages (already listed as the mobile follow-up of parts 2 and 3).
5. **Review and QA (≈ 2 weeks).** Professional French review of the whole catalog, pseudo-locale
   pass for truncation, screenshots of every screen in both languages, Bill 96 check of every
   consumer-facing text with the lawyer. Record the glossary in `docs/product/`.
   Total ≈ 9–11 weeks web + mobile (6–7 weeks consumer web only); no owner decision needed to
   start, cloud deployment stays deferred.

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
   the `_acme-challenge` CNAMEs DNS-only, image build + deploy (no Maps key any more, ADR 0017),
   budget apply with the billing account, post-deploy checks. Confirm at that first apply
   the sidecar TCP probe against the loopback bind, the 0.1 vCPU sidecar, and the Certificate
   Manager authorization on the Cloudflare zone.
4. Backend follow-ups surfaced by this work (no owner decision needed): a database-backed
   `Idempotency-Key` for offers and reports (today Redis-only, lost on a sidecar restart); the
   `/internal/events/pubsub` receiver before enabling the domain-events push subscription
   (ADR 0009); a `storage` field on `InternalCardImageCacheStatus` once the generated clients
   can be regenerated without colliding with the mobile branches.
