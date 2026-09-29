# IMPLEMENTATION_STATUS.md

Living checklist for the OrenjiTrade MVP. Legend: `[ ]` NOT STARTED · `[-]` IN PROGRESS ·
`[x]` COMPLETE (workflow verified to work, tests pass) · `[!]` BLOCKED.

A feature is marked complete only when: implementation exists, API works, UI works where
applicable, authorization works, validation works, error handling works, tests pass,
documentation is updated. Each completed item lists location, tests, migrations, and debt.

**Last updated:** 2026-09-29 (session 1)
**Next task:** see "NEXT TASK" at the bottom.

---

## Phase 0 — Foundation

- [-] Monorepo structure (`apps/`, `packages/`, `infrastructure/`, `docs/`, `.github/`)
- [-] Root docs: `README.md`, `CLAUDE.md`, `IMPLEMENTATION_STATUS.md`
- [-] Architecture docs: `docs/architecture/ARCHITECTURE.md`, ADRs 0001–0013
- [-] Local infra: `docker-compose.yml` (PostGIS 17, Redis, Firebase Auth emulator), `.env.example`
- [ ] Spring Boot API skeleton (`apps/api`): Gradle KTS, Java 21 toolchain, Boot 4.1, Flyway V001 (extensions), actuator health/readiness, Problem Details handler, request-id filter, structured JSON logging, springdoc OpenAPI (local profile), Testcontainers PostGIS base test
- [ ] Angular web skeleton (`apps/web-angular`): Angular 22, Material M3, design tokens, app shell (top bar, routes `/map`, `/inventory`, `/admin`), strict TS, ESLint, Playwright config
- [ ] Mobile skeleton (`apps/mobile`): Expo 57, expo-router tabs, strict TS, jest-expo, Maestro folder
- [ ] ML skeleton (`apps/ml`): FastAPI, `/health`, `/v1/identify` stub, pytest, Dockerfile
- [ ] Shared packages: `packages/design-tokens`, `packages/api-client` (generated Angular client), `packages/shared-types` (OpenAPI types)
- [ ] Dockerfiles for api, web (nginx), ml
- [ ] CI (`.github/workflows/ci.yml`): lint, format, unit, integration (Testcontainers), security scan, Docker build
- [ ] Terraform skeleton: modules + `environments/{dev,staging,prod}`; Cloudflare DNS documentation
- [ ] Everything builds: `gradlew build`, `ng build`, `tsc --noEmit` (mobile), `pytest`, `terraform validate`

## Phase 1 — Auth + Users

- [ ] Identity provider abstraction (`IdentityTokenVerifier`), Firebase adapter, emulator wiring, test stub
- [ ] Bearer token filter → `AuthenticatedUser` principal; user auto-provisioning on first login
- [ ] `user_account`, roles (USER, PREMIUM_USER, MODERATOR, ADMIN, SUPER_ADMIN), suspension
- [ ] Profile: display name, avatar (signed upload), bio, games, tags
- [ ] Tag system (`tag`, `profile_tag`), searchable, admin moderation hooks
- [ ] Privacy settings entity + defaults favouring safety
- [ ] Approximate location: trading-area selection, public point derivation, geo privacy test
- [ ] Account settings (notification prefs, messaging permissions, discoverability)
- [ ] Account deletion framework (request → job → anonymise/remove → audit)
- [ ] Terms acceptance with version + timestamp at registration
- [ ] Web: register/login/verify/reset, onboarding (games, tags, trading area), settings pages
- [ ] Mobile: login/register, profile tab, settings
- [ ] Tests: auth filter, RBAC, ownership, geo privacy contract, deletion job

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

- [ ] Card scanning pipeline: upload → storage → event → ML worker → candidates → user confirmation → inventory
- [ ] ML service `/v1/identify` with confidence, graceful degradation
- [ ] Mobile camera scan flow
- [ ] Tests: pytest for service; API tolerance when ML unavailable

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
| 2 | Create/edit profile | [ ] |
| 3 | Configure privacy settings | [ ] |
| 4 | Choose approximate trading location | [ ] |
| 5 | Select TCG interests | [ ] |
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
| 20 | Exact coordinates never exposed | [ ] |
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
| 37 | Account deletion works | [ ] |
| 38 | Legal pages exist | [ ] |
| 39 | CI runs automatically | [ ] |
| 40 | E2E covers critical workflows | [ ] |
| 41 | Runs locally | [ ] |
| 42 | Deploys to Google Cloud | [ ] |
| 43 | Cloudflare configuration documented | [ ] |
| 44 | Production architecture supports www.orenjitrade.com | [ ] |

---

## NEXT TASK

Phase 0: scaffold `apps/api`, `apps/web-angular`, `apps/mobile`, `apps/ml`, packages, Dockerfiles,
CI, and Terraform skeleton; make every application build; then begin Phase 1.
