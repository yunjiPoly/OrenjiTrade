# Web stage WH2 contract — the admin console: collectors, catalog, rules and system

> Owner prompt of 2026-10-28 ([`docs/product/specs/2026-10-28-web-redesign-stages.md`](../../product/specs/2026-10-28-web-redesign-stages.md)),
> stage WH2; spec [`2026-10-20-web-redesign.md`](../../product/specs/2026-10-20-web-redesign.md)
> sections 15.5 to 15.7, the rest of 15.8 and 15.9; boards A7 to A23. Every change is additive: no
> migration (the next is still **V136**), new nullable fields, new optional parameters and two new
> endpoints; nothing the phone reads is removed or retyped (the phone has no admin screen and reads
> only `GET /inventory/imports/limits` of what this stage touches, unchanged). Field-level truth:
> `../openapi.json`. Follows [`wh1-admin-console.md`](wh1-admin-console.md).

All under `/api/v1/admin`, ADMIN and SUPER_ADMIN (Spring Security's default `/admin/**` rule;
moderators keep the five moderation paths of WH1). No admin list carries a place; a city never
(GeoPrivacyContractTest reads every response below, ADR 0017).

## API changes (spec 15.8, WH2's part)

| # | Change | Where |
| --- | --- | --- |
| 1 | **Names, never ids (`updatedBy`).** `updatedByHandle` and `updatedByName` (nullable) on `FeatureFlag` (`GET`/`PUT /admin/feature-flags`), `AdminUsageLimit` (`GET`/`PUT /admin/usage-limits`), `InventoryImportSettingsResponse` (`GET`/`PUT /admin/inventory/import-settings`), `WishlistSettingsResponse` (`GET`/`PUT /admin/wishlist/settings`) and `DelistPolicyResponse` (`GET /admin/delist-policies`, `PUT …/{id}`). `null` for a default nobody changed or a gone account. The existing `updatedBy` stays. Names come from the new auth SPI `AccountNames` (handle, display name, staff role), implemented by the users module | `auth`, `users`, the five modules |
| 2 | **Readable audit entries.** `AuditLogEntry.targetLabel` (nullable): "Report #1047", "@handle", a card's name, a printing's "card · code", a set's or a game's name, "Yu-Gi-Oh! catalog" for a sync, "Every game" or a game for the card image cache, a room's name, "A post in {room}", a country's name, "Rating of @handle", "Reference about @handle", a setting key (`binder.views.per_day`, a feature flag's key), "Import limits", "Wishlist terms", "Auto-delist rules", "An announcement". `AuditActor.displayName` and `AuditActor.role` (the actor's highest staff role today, `null` for a collector or SYSTEM). Modules name their own targets through the audit SPI `AuditTargetLabels` (reports, moderation, community, catalog, games, location, binders, inventory, limits) | `audit` + modules |
| 2b | **An archived city channel never reaches staff through the audit log** (WH1's R2-1). For V041's "Montréal / …" channels (`CityChannels`), `community.post.remove` and `community.post.delete` read `details.channel` "archived-channel", `community.channel.update` and `.create` read `details.slug` "archived-channel", and the target reads "An archived channel" or "A post in an archived channel". The stored records are evidence and stay as written | `community` (`CommunityAuditLabels`) |
| 2d | **Named detail values** (review fix 1, spec 15.2). `AuditLogEntry.detailLabels` (always present, may be empty; additive): readable names of the values in `details`, by value. Every UUID in `details` has one: an account's id "@handle" (any key: `authorId`, `ownerId`, `rateeId`, `assigneeId`, …), a report's (`reportId`) "Report #1047", a post's or a flagged post's (`subjectId` with `subjectType` `COMMUNITY_*`) "A post in {room}", and words for an id nothing names ("A moderator note", "A conversation", "A private message", "A deleted account", …). Plain values a module knows: a platform region code (`region.country.update`'s `region`, `previousRegion`) "Americas (North)", a room's slug (`channel`, `slug`) "Americas (North) · Yu-Gi-Oh!", `archived-channel` "An archived channel". Rooms of a region and a game read "{region} · {game}" in `targetLabel` too. The console shows names, never the stored ids or codes; the records stay as written | `audit` (`AuditTargetLabels.valueLabels`), `location`, `community` |
| 2e | **A channel named after a city stays as it is** (review fix 1). `PATCH /admin/community/channels/{id}` on one of V041's city channels refuses (400 `VALIDATION_FAILED`, a field error each) any change of `regionLabel`, `name`, `description`, `game` or `sortOrder`, besides `status` ACTIVE: its city label keeps it archived and unnamed for members and staff | `community` |
| 2f | **Sync reports carry no provider address** (review fixes 1 and 2, ADR 0015). An image that could not be cached reads "An image of {card} could not be cached: {provider} answered HTTP 403" in the run's report (the card's name since review fix 2; no host, path or image id; those stay in the server log), and a failed run's error drops the provider's host and path (`ProviderMessages.clientSafe`). Since review fix 2 the four admin reads (`GET /admin/catalog/games`' newest run, `GET /admin/catalog/sync-runs`, `/sync-runs/{id}` and `/sync-runs/{id}/report`) pass the run's error and the report's errors and warnings through the same cleaning as they are read (`ProviderMessages.safeRun` / `safeReport`), so a run stored before review fix 1 shows no provider address either; the stored row stays as written. No type change | `cards` |
| 2c | **Audit filters.** `GET /admin/audit-logs?actorType=ADMIN|USER|SYSTEM` ("Who": staff, collectors, the system) and `?target=` (≤ 120): "@handle" (that account), "#1047" or "1047" (that report), a usage limit's key (that limit), else the stored target id (a feature flag key, a game slug, a country code). The existing filters stay | `audit` |
| 3 | **Staff search.** `GET /admin/search?q=&limit=5` (`limit` 1–10; a blank `q` is 400; moderators 403): `StaffSearchResponse` `{collectors, cards, reports}`. Collectors by handle (with or without "@"), email or display name, exact handle first: `id`, `handle`, `displayName`, `email`, `status` (never a place). Cards by printing code prefix (`printingCode` set; one row per card and code, as several printings may share a code) then by name (a card found by its code is not listed again): `id`, `name`, `game`. A report by its number ("#1047" or "1047"): `id`, `number`, `reason`, `status`, `reportedHandle`. A text of one character, or starting with "#", searches report numbers only; a text with "@" never searches cards | `admin` (`StaffSearchRepository`) |
| 4 | **Each game's catalogue.** `GET /admin/catalog/games`: `CatalogGameSummary[]` in display order (hidden games too): `game`, `cards`, `sets`, `printings`, `providers` (empty: "No source yet"), `lastRun` (`CatalogSyncRun`, nullable). Counts only | `cards` |
| 5 | **Binders.** `GET /admin/binders?deckCore=true|false` (deck cores only, kind `DECK`, or binders only); `AdminBinder.game` (the binder's game slug) | `binders` |
| 6 | **The room of a reported post** (WH1's U17). `ReportDetail.contextRoomSlug` (nullable): a reported community post's room slug for the console's "Open the room"; `null` for other reports and for an archived city channel. The room view has no deep link to one post: the console opens the room | `reports`, `community` |

Item 5 of 15.8 (an admin References list) was built in WH1.

## What the console reads and writes

| Screen | Requests |
| --- | --- |
| The staff search ("/") | Admins: `GET /admin/search?q=…&limit=5` (one call; replaces WH1's composed lists). Moderators: `GET /admin/reports?number=…&size=5` as in WH1; a word reads "Moderators search report numbers only." A card opens `/admin/cards?open={id}` |
| Users (A7) | `GET /admin/users?query&status&role&page&size` (20, 50, 100; URL as today) |
| Account (A8) | `GET /admin/users/{id}` (the header's place, consents, recent activity), `GET /admin/users/{id}/listing-status`, `GET /admin/users/{id}/history`; Pause / Resume (`POST …/pause-listings`, `…/resume-listings`), Suspend / Unsuspend, roles (`PUT …/roles`) as today. Payment Protection and Refund consents only while `protectedPayments` is on |
| Listings (A9) | `GET /admin/listings/stale?state&page&size` (Needs review; the Stale and Hidden counts from `size=1` reads), `GET /admin/listings?query&state&game&ownerId&page&size`, Restore, Hide as today |
| Binders (A10) | `GET /admin/binders?query&visibility&deckCore&ownerId&page&size` (URL `?kind=binder|deck&ownerId=`), Unpublish as today |
| Cards (A11) | `GET /cards?query&game&page&size` (the list), the drawer: `GET /cards/{id}`, `PUT /admin/cards/{id}`, `POST /admin/cards` (New card), `POST /admin/cards/{id}/printings` (Add printing), `PUT /admin/printings/{id}`, `GET /sets?game` |
| Card data and images (A12) | `GET /admin/catalog/games`, `GET /admin/games`, `POST /admin/catalog/sync {gameSlug, provider, mode, imageMode, imageLimit?}`, `GET /admin/catalog/sync-runs?size=10`, `GET /admin/catalog/sync-runs/{id}` (followed every 1.5 s while running), `GET /admin/catalog/sync-runs/{id}/report` (the Report drawer), `GET /admin/card-images/status`, `POST /admin/card-images/reconcile` (Check the cache), `POST /admin/card-images/clear {game}` (one game, confirmed) |
| Games (A13) | `GET /admin/games`, `GET /admin/catalog/games` (cards per game), `PUT /admin/games/{slug}`, `POST /admin/games` (New game, `?game=new`) |
| Usage limits (A14) | `GET /admin/usage-limits`, `PUT /admin/usage-limits/{id}` (SUPER_ADMIN) |
| Import limits (A15, new) | `GET`/`PUT /admin/inventory/import-settings` (only the fields changed), `GET /admin/system/health` (the Import clean-up job) |
| Wishlist terms (A16) | `GET`/`PUT /admin/wishlist/settings` (the ordered list) |
| Auto-delist (A17) | `GET /admin/delist-policies`, `PUT …/{id}`, `GET /admin/dashboard` (Right now), `GET /admin/system/health` (the freshness job) |
| Feature flags (A18) | `GET /admin/feature-flags`, `PUT /admin/feature-flags/{key} {enabled, rolloutPercent, description}` (switch and rollout, SUPER_ADMIN, confirmed). `mlScanning` is locked in the console |
| Regions (A19) | `GET /admin/regions`, `PUT /admin/regions/countries/{code}` (moving a country confirms first) |
| Notifications (A20) | `GET /admin/notifications/stats?days`, `POST /admin/notifications/broadcast` ("Send an announcement", SUPER_ADMIN, confirmed) |
| System health (A21) | `GET /admin/system/health`, `GET /admin/card-images/status` (Storage) |
| Analytics (A22) | `GET /admin/analytics/summary?days` (the two derived tiles are computed from its totals) |
| Audit log (A23) | `GET /admin/audit-logs?action&actorId&actorType&target&targetType&targetId&from&to&page&size=25`; the Who list from `GET /admin/users?role=SUPER_ADMIN|ADMIN|MODERATOR&size=100` |

Every write ends with a toast "{result}" and "Recorded in the audit log." (the API audits each
one). Errors show the request id and "Try again".
