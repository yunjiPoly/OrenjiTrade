# Database schema

PostgreSQL 17 + PostGIS 3.5. Flyway migrations live in
`apps/api/src/main/resources/db/migration`. This document is kept in sync with migrations;
update it in the same change.

## Conventions

- Tables and columns are `snake_case`; primary keys are `uuid` (`gen_random_uuid()` or
  app-generated), never exposed sequential ids.
- Every table has `created_at timestamptz not null default now()`; mutable tables add
  `updated_at`. Soft-delete columns are named `deleted_at`.
- Enumerations are `text` columns with `CHECK` constraints (easier to evolve than PG enums).
- Money: `numeric(12,2)` + `currency char(3)`. Never floats.
- Geography: `geography(Point, 4326)` with GiST indexes. Distances in metres via `ST_DWithin`.
- Game-specific data: `jsonb` with GIN indexes when filtered.
- Search: generated `tsvector` columns + `pg_trgm` GIN indexes.
- Migration naming: `V<NNN>__<snake_case_description>.sql`, three-digit zero padded. Repeatable
  migrations (`R__`) only for views/functions. Never modify an applied migration.
- Seed data is not a migration; it lives in `db/seed/*.sql` and runs from `SeedDataRunner`
  under `local`/`dev` profiles only.

## Privacy-sensitive fields

| Table.column | Sensitivity | Rule |
| --- | --- | --- |
| `user_location.home_point` | Precise location | Never read outside `location` module, never serialised, logged or exported; not written by the Phase 1 API |
| `user_location.trading_area_center` | Approximate, user-chosen (stored at 3 decimals) | Private: returned only to the owner (`GET /me/location`, `GET /me/export`); never logged, never in events |
| `user_location.public_point` | Derived imprecise | The only geography public queries may use; `NULL` while not discoverable |
| `account_deletion_request.reason` | Free text from the owner | Never copied into the audit log; cleared when the deletion completes |
| `user_account.email` | PII | Only owner + admins; hashed in analytics |
| `message.body`, `message_attachment` | Private content | Participants + moderators acting on a report |
| `payment_*` | Financial | Provider tokens only; never card numbers |
| `entitlement.note` | Admin free text | Admin console only; never returned to the account owner (`GET /me/plan` omits it) nor logged |
| `usage_counter` | Per-user usage | Owner (`GET /me/plan`) and admins only; never in analytics with the user id |
| `inventory_item.notes` | Private owner notes | Owner only (`GET /inventory/**`, `GET /me/export`); never in public responses (`PublicInventoryItem` has no such field), domain events or logs |
| `inventory_item_image` | Owner photos | Re-encoded JPEG, EXIF/GPS stripped before storage; public only while the item is effectively public; deleted with the item or the account |
| `inventory_freshness_event` | Owner activity trail | Owner/admin views only; purged with the account |

## Entity overview

```mermaid
erDiagram
  USER_ACCOUNT ||--|| PROFILE : has
  USER_ACCOUNT ||--o{ USER_ROLE : has
  USER_ACCOUNT ||--|| USER_LOCATION : has
  USER_ACCOUNT ||--|| PRIVACY_SETTINGS : has
  PROFILE }o--o{ TAG : tagged
  USER_ACCOUNT ||--o{ BINDER : owns
  BINDER ||--o{ INVENTORY_ITEM : contains
  GAME ||--o{ CARD : has
  GAME ||--o{ CARD_SET : has
  CARD ||--o{ CARD_PRINTING : has
  CARD_SET ||--o{ CARD_PRINTING : includes
  CARD_PRINTING ||--o{ CARD_IMAGE : has
  CARD_PRINTING ||--o{ INVENTORY_ITEM : instance
  USER_ACCOUNT ||--o{ WISHLIST_ITEM : wants
  CARD ||--o{ WISHLIST_ITEM : target
  USER_ACCOUNT ||--o{ CONVERSATION_PARTICIPANT : joins
  CONVERSATION ||--o{ CONVERSATION_PARTICIPANT : has
  CONVERSATION ||--o{ MESSAGE : has
  COMMUNITY_CHANNEL ||--o{ COMMUNITY_POST : has
  INVENTORY_ITEM ||--o{ OFFER : receives
  OFFER ||--o{ OFFER_EVENT : history
  OFFER ||--o| TRADE : becomes
  TRADE ||--o| PAYMENT : secured_by
  TRADE ||--o| DISPUTE : may_have
  USER_ACCOUNT ||--o{ RATING : gives
  USER_ACCOUNT ||--o{ COLLECTOR_REPORT : files
  USER_ACCOUNT ||--o{ NOTIFICATION : receives
  USER_ACCOUNT ||--o{ CREDIT_LEDGER_ENTRY : has
  USER_ACCOUNT ||--o| SUBSCRIPTION : has
  PLAN ||--o{ SUBSCRIPTION : grants
  PLAN ||--o{ PLAN_FEATURE : defines
  USER_ACCOUNT ||--o{ AUDIT_LOG : actor
```

Detailed column lists are appended per phase below as migrations land.

## Migrations

| Version | File | Purpose |
| --- | --- | --- |
| V001 | `V001__extensions.sql` | Extensions (`postgis`, `pg_trgm`, `unaccent`, `pgcrypto`) and the `unaccent_immutable(text)` helper |
| V002 | `V002__event_publication.sql` | Spring Modulith 2.1 event publication registry (`event_publication`, transactional outbox) |
| V003 | `V003__users.sql` | Phase 1-A: `user_account`, `user_role`, `legal_document` (+ 8 seeded documents), `user_consent`, `audit_log`, `job_run` |
| V004 | `V004__profiles.sql` | Phase 1-B: `profile`, `tag` (+ 22 curated tags), `profile_tag`, `moderation_rule` (+ neutral placeholder banned terms), `privacy_settings`; trigram index on `user_account.handle` |
| V005 | `V005__location.sql` | Phase 1-B: `user_location` (ADR 0004: private centre, derived public point) |
| V006 | `V006__settings.sql` | Phase 1-B: `notification_preferences` |
| V007 | `V007__deletion.sql` | Phase 1-B: `account_deletion_request` |
| V010 | `V010__feature_flags.sql` | Phase 2: `feature_flag` (+ 7 default flags) |
| V011 | `V011__plans_limits.sql` | Phase 2 (Phase 10 foundation): `plan` (+ FREE, PREMIUM), `plan_feature`, `usage_limit` (+ contract limits), `usage_counter`, `entitlement`; `user_account.plan_code` → FK to `plan.code` |
| V012 | `V012__games.sql` | Phase 2: `game` (+ yugioh, pokemon, mtg, riftbound with their GameSchema) |
| V013 | `V013__catalog.sql` | Phase 2: `card_set`, `card`, `card_printing`, `card_image`, `catalog_sync_run`; FTS + trigram + JSONB GIN indexes |
| V020 | `V020__delist_policy.sql` | Phase 3: `delist_policy` (+ the single active default policy ACTIVE 0-14 / AGING 15-30 / STALE 31-45 / HIDDEN 46+ days, warn 5 days before hiding) |
| V021 | `V021__binder.sql` | Phase 3: `binder` (visibility, temporary publication, freshness, materialised public listing flag, generated `search_vector`) |
| V022 | `V022__inventory.sql` | Phase 3: `inventory_item`, trigger `trg_inventory_item_binder_count` (maintains `binder.item_count`), `inventory_item_image`, `inventory_freshness_event` |

(Sections for later phases are added as they are implemented.)

### V001 — extensions and helper functions

All statements are idempotent (`CREATE EXTENSION IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`), so
the migration also succeeds on a database that the local `docker compose` init script already
prepared.

| Object | Purpose |
| --- | --- |
| extension `postgis` | `geography(Point, 4326)` columns, `ST_DWithin`, GiST indexes (collector search) |
| extension `pg_trgm` | trigram GIN indexes for fuzzy card / collector name search |
| extension `unaccent` | accent-insensitive search (`Pokémon` matches `Pokemon`) |
| extension `pgcrypto` | `gen_random_uuid()` primary keys, `digest()` |
| function `unaccent_immutable(text) RETURNS text` | `IMMUTABLE PARALLEL SAFE STRICT` wrapper around `unaccent('public.unaccent', ...)`; required because `unaccent()` itself is only `STABLE` and therefore cannot back generated `tsvector` columns or expression indexes |

### V002 — `event_publication` (Spring Modulith outbox)

Copied verbatim from `spring-modulith-events-jdbc` 2.1.1 (`schemas/v2/schema-postgresql.sql`, the
current non-legacy structure). `spring.modulith.events.jdbc.schema-initialization.enabled` is
`false`: Flyway owns the table. Rows are written in the same transaction as the domain change and
completed (`completion-mode=update`) once every `@ApplicationModuleListener` succeeded; incomplete
rows are republished on restart. The optional `event_publication_archive` table
(`completion-mode=archive`) is not created.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `listener_id` | `text` | fully qualified listener method |
| `event_type` | `text` | event class name |
| `serialized_event` | `text` | JSON (Jackson 3) |
| `publication_date` | `timestamptz` | when the event was published |
| `completion_date` | `timestamptz` | null while outstanding |
| `status` | `text` | `PUBLISHED`, `PROCESSING`, `RESUBMITTED`, `FAILED`, `COMPLETED` (managed by Modulith) |
| `completion_attempts` | `int` | retry counter |
| `last_resubmission_date` | `timestamptz` | last republish |

Indexes: `event_publication_serialized_event_hash_idx` (hash on `serialized_event`, used by
Modulith to complete publications) and `event_publication_by_completion_date_idx`
(`completion_date`, used to find outstanding / completed rows).

### V003 — accounts, roles, legal consents, audit log, job runs (Phase 1-A)

No location data lives in these tables (see ADR 0004); `user_location` arrives with the location
module. Enumerations are `text` + `CHECK` constraints; the Java side maps them with
`@Enumerated(STRING)`.

#### `user_account`

One row per identity-provider user, created on the first authenticated request
(`UserAccountService.resolve`, `INSERT ... ON CONFLICT (provider_uid) DO NOTHING`).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK, app-generated (`gen_random_uuid()` default); seed accounts use `00000000-0000-4000-8000-0000000000NN` |
| `provider_uid` | `text` | Firebase uid, `UNIQUE` (`uq_user_account_provider_uid`); never shown to other users |
| `email` | `text` | PII: owner and admins only |
| `email_verified` | `boolean` | synced from the ID token on every login |
| `handle` | `text` | `[a-z0-9_]{3,24}` (`ck_user_account_handle`), unique case-insensitively via `uq_user_account_handle_lower` on `lower(handle)`; derived from the email local part with a numeric suffix on collision |
| `display_name` | `text` | initial value: provider name or the handle |
| `status` | `text` | `ACTIVE` (default), `SUSPENDED`, `DELETION_REQUESTED`, `DELETED` |
| `suspended_until` | `timestamptz` | null = indefinite; expired suspensions are lifted lazily on the next request |
| `suspension_reason` | `text` | admin-provided |
| `plan_code` | `text` | `FREE` (default) or `PREMIUM`; FK → `plan.code` since V011 (`fk_user_account_plan`, `ON UPDATE CASCADE`) |
| `created_at`, `updated_at` | `timestamptz` | |
| `last_active_at` | `timestamptz` | written at most once per 5 minutes per user (Redis `SET NX` throttle) |
| `deleted_at` | `timestamptz` | set by the deletion job |

Indexes: `ix_user_account_email_lower`, `ix_user_account_status`, `ix_user_account_created_at`.

#### `user_role`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` | FK → `user_account.id` (cascade) |
| `role` | `text` | `USER`, `PREMIUM_USER`, `MODERATOR`, `ADMIN`, `SUPER_ADMIN`; PK `(user_id, role)` |
| `granted_at` | `timestamptz` | |
| `granted_by` | `uuid` | acting admin, null for provisioning/seed |

Every account keeps `USER`. Only a `SUPER_ADMIN` may grant or revoke `ADMIN`/`SUPER_ADMIN`.

#### `legal_document`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `document_type` | `text` | `TERMS`, `PRIVACY`, `COMMUNITY_GUIDELINES`, `MARKETPLACE_POLICY`, `PAYMENT_PROTECTION`, `REFUND_DISPUTE`, `COOKIES`, `ACCEPTABLE_USE` |
| `version` | `text` | e.g. `2026-09-01`; `UNIQUE (document_type, version)` |
| `title`, `url` | `text` | `url` is the web path (`/legal/terms`) |
| `required_at_registration` | `boolean` | `true` for TERMS, PRIVACY, COMMUNITY_GUIDELINES, ACCEPTABLE_USE |
| `published_at` | `timestamptz` | |
| `current` | `boolean` | at most one current version per type (`uq_legal_document_current`, partial unique index) |

V003 seeds the eight documents in version `2026-09-01`. Publishing a new version = insert the row
and flip `current` in one transaction; every user then sees it in `requiredConsents` and receives
`428 TERMS_ACCEPTANCE_REQUIRED` on non-exempt routes until they accept it.

#### `user_consent`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `user_account.id` (cascade) |
| `document_type`, `version` | `text` | FK → `legal_document (document_type, version)`; `UNIQUE (user_id, document_type, version)` |
| `accepted_at` | `timestamptz` | |
| `ip_hash` | `text` | SHA-256 hex of `<server salt>:<client IP>` (`orenji.consents.ip-salt`); the raw address is never stored |
| `user_agent` | `text` | truncated to 512 characters |

Consents survive account deletion (the account row is anonymised instead).

#### `audit_log`

Append-only; written by `AuditService.record` inside the caller's transaction.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `occurred_at` | `timestamptz` | |
| `actor_user_id` | `uuid` | acting account, null for `SYSTEM` |
| `actor_type` | `text` | `USER`, `ADMIN`, `SYSTEM` |
| `action` | `text` | dotted name: `user.suspend`, `user.unsuspend`, `user.roles.update`, `user.suspension.expired`, `consent.accept`, ... |
| `target_type` | `text` | e.g. `USER` |
| `target_id` | `text` | id of the target as text |
| `details` | `jsonb` | structured, PII-free details (never coordinates) |
| `request_id` | `text` | the `X-Request-Id` of the triggering request |

Indexes: `ix_audit_log_target (target_type, target_id)`, `ix_audit_log_actor (actor_user_id)`,
`ix_audit_log_occurred_at (occurred_at DESC)`, `ix_audit_log_action (action)`.

#### `job_run`

Execution record of internal jobs (`/internal/jobs/**`, scheduled tasks), written by
`JobRunService`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `name` | `text` | job name (`ping`, later `account-deletion`, `auto-delist`, ...) |
| `started_at`, `finished_at` | `timestamptz` | |
| `status` | `text` | `RUNNING` (default), `SUCCEEDED`, `FAILED` |
| `details` | `jsonb` | counters or an error summary |

Index: `ix_job_run_name_started_at (name, started_at DESC)`.

### V004 — profiles, tags, moderation rules, privacy settings (Phase 1-B)

#### `profile`

One row per account once the collector saved a profile, uploaded an avatar or set tags. The handle
stays on `user_account`; the display name is mirrored there (shown by `/me` and admin views).

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` | PK, FK → `user_account.id` (cascade) |
| `display_name` | `text` | 1-80 characters (`ck_profile_display_name`); public |
| `bio` | `text` | ≤ 500 characters (`ck_profile_bio`), default `''`; public; banned-term checked (`PROFILE` rules) |
| `avatar_key` | `text` | `ObjectStorage` key `avatars/<user id>/<32 hex>.jpg` of the 512×512 re-encoded avatar; never a server path. The public URL is derived at read time (local: `GET /api/v1/public/media/{key}`, GCS: bucket URL) |
| `games` | `text[]` | slugs of ACTIVE rows of `game` (validated by the service through the games module's `GameCatalog`, V012); ≤ 16 (`ck_profile_games`) |
| `languages` | `text[]` | ISO 639-1 codes; ≤ 10 (`ck_profile_languages`) |
| `completed_at` | `timestamptz` | first `PUT /me/profile` (onboarding flag `profileComplete`) |
| `created_at`, `updated_at` | `timestamptz` | |
| `search_vector` | `tsvector` | generated: `to_tsvector('simple', unaccent_immutable(display_name || ' ' || bio))` (collector search, Phase 4) |

Indexes: `ix_profile_search_vector` (GIN), `ix_profile_display_name_trgm` (GIN trigram on
`lower(unaccent_immutable(display_name))`), `ix_profile_games` (GIN on the array). V004 also adds
`ix_user_account_handle_trgm` (GIN trigram on `user_account.handle`).

#### `tag`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `slug` | `text` | `UNIQUE` (`uq_tag_slug`), `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 48 characters; custom labels map to the accent-free, dashed slug so "Cube Drafter" and "cube-drafter" are the same tag |
| `label` | `text` | 2-24 characters |
| `category` | `text` | `GAME`, `ROLE`, `STYLE`, `LOGISTICS`, `LANGUAGE`, `CUSTOM` |
| `status` | `text` | `ACTIVE` (default; searchable and selectable), `HIDDEN` (kept on profiles, not shown), `BANNED` |
| `usage_count` | `integer` | profiles carrying the tag; recomputed from `profile_tag` on every change (`TagRepository.recountUsage`) |
| `created_by` | `uuid` | creator of a `CUSTOM` tag, FK → `user_account.id` (`ON DELETE SET NULL`) |
| `created_at`, `updated_at` | `timestamptz` | |

Indexes: `ix_tag_label_trgm` (GIN trigram on `lower(unaccent_immutable(label))`, tag search),
`ix_tag_status_usage (status, usage_count DESC)`, `ix_tag_category`. V004 seeds 22 curated tags
(games, roles, styles, logistics, languages). `GET /tags` only returns `ACTIVE` tags, and `CUSTOM`
ones only while at least one profile uses them.

#### `profile_tag`

| Column | Type | Notes |
| --- | --- | --- |
| `profile_user_id` | `uuid` | FK → `profile.user_id` (cascade) |
| `tag_id` | `uuid` | FK → `tag.id` (cascade); PK `(profile_user_id, tag_id)` |
| `created_at` | `timestamptz` | |

Index: `ix_profile_tag_tag_id`. At most 12 tags per profile (service rule).

#### `moderation_rule`

Admin-editable text rules (ADR 0014), cached ≤ 60 s per instance by `TextModerationService`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `kind` | `text` | `BANNED_TERM` (evaluated today), `RATE_LIMIT`, `THRESHOLD` |
| `pattern` | `text` | 1-200 characters; case-insensitive regular expression matched against accent-stripped text; invalid patterns are skipped with a warning |
| `action` | `text` | `FLAG` (accepted, logged for review) or `BLOCK` (400) |
| `scope` | `text` | `MESSAGE`, `POST`, `TAG`, `PROFILE` |
| `active` | `boolean` | |
| `created_at`, `updated_by`, `updated_at` | | audit columns |

Index: `ix_moderation_rule_scope_active (scope, active)`. V004 seeds invented, neutral placeholder
terms (`zorblax`, `quuxspam`, `blorpscam` → `BLOCK` for `TAG` and `PROFILE`; `fnordpromo` → `FLAG`
for `PROFILE`) that exercise the engine locally; real lists are managed through the admin console
(admin endpoints arrive with Phase 7 moderation).

#### `privacy_settings`

A missing row means the safe defaults below.

| Column | Type | Default | Notes |
| --- | --- | --- | --- |
| `user_id` | `uuid` | | PK, FK → `user_account.id` (cascade) |
| `discoverable` | `boolean` | `false` | opt-in to the map; while `false`, `user_location.public_point` is `NULL` |
| `show_distance` | `boolean` | `true` | others see a bucketed distance |
| `show_online_status` | `boolean` | `false` | presence (Phase 5) |
| `show_last_active` | `boolean` | `true` | bucketed last activity on the public profile |
| `profile_visibility` | `text` | `MEMBERS` | `PUBLIC`, `MEMBERS`, `PRIVATE` (404 for everyone but the owner) |
| `messaging_permission` | `text` | `MEMBERS_WITH_PROFILE` | `EVERYONE`, `MEMBERS_WITH_PROFILE`, `NOBODY` |
| `wishlist_visible` | `boolean` | `false` | Phase 6 |
| `search_discoverable` | `boolean` | `true` | collector name search (Phase 4) |
| `created_at`, `updated_at` | `timestamptz` | | |

Index: `ix_privacy_settings_discoverable` (partial, `WHERE discoverable`). The rules built on these
switches live in `PrivacyPolicyService` (profiles module).

### V005 — `user_location` (ADR 0004)

Read and written only by the location module (`UserLocationRepository`, explicit PostGIS SQL).

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` | PK, FK → `user_account.id` (cascade) |
| `home_point` | `geography(Point, 4326)` | **PRIVATE**; reserved for an explicit "use my location" flow, never written by the Phase 1 API, never selected, serialised, logged or exported |
| `trading_area_center` | `geography(Point, 4326)` | **PRIVATE**, not null; the user-chosen centre rounded to 3 decimals; returned only to its owner |
| `trading_area_radius_m` | `integer` | 1 000-50 000 (`ck_user_location_radius`) |
| `source` | `text` | `MANUAL` or `DEVICE` (only records where the centre came from; the server snaps both) |
| `public_point` | `geography(Point, 4326)` | **PUBLIC**; derived by `ApproximateLocationService`: snap to the ~1 km cell (`row = floor(lat / 0.009)`, `col = floor(lng / (0.009 / cos(row centre lat)))`), offset inside the cell by `HMAC-SHA256(LOCATION_JITTER_SECRET, user id)` with a 0.001° margin, rounded to 3 decimals. Same user + same cell ⇒ same point. `NULL` while the collector is not discoverable, pending deletion or suspended |
| `public_label` | `text` | **PUBLIC** region label of the public point (`StaticRegionGeocoder`: ~34 Montréal-area neighbourhoods and Canadian cities, offline) |
| `grid_cell` | `text` | `r<row>c<col>`; `NULL` exactly when `public_point` is (`ck_user_location_public`); the only location value analytics may carry |
| `created_at`, `updated_at` | `timestamptz` | |

Indexes: `ix_user_location_public_point` (GiST, partial `WHERE public_point IS NOT NULL`, nearby
search in Phase 4), `ix_user_location_grid_cell` (partial).

### V006 — `notification_preferences`

A missing row means the defaults (push and in-app on, email off, `MARKETING` fully off).

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` | PK, FK → `user_account.id` (cascade) |
| `push_enabled`, `email_enabled`, `in_app_enabled` | `boolean` | master switches (`true`, `false`, `true`) |
| `categories` | `jsonb` | object `{CATEGORY: {push, email, inApp}}` keyed by `WISHLIST_MATCH`, `MESSAGE`, `OFFER`, `RATING`, `TRADE`, `BINDER_FRESHNESS`, `REPORT_DECISION`, `MARKETING`; missing keys mean the defaults, unknown keys are ignored when reading (`ck_notification_preferences_categories`: must be an object). Never filtered in SQL, so no GIN index |
| `quiet_hours` | `jsonb` | object `{enabled, start "HH:mm", end "HH:mm", timezone}` (IANA zone validated by the service), default disabled 22:00-08:00 America/Toronto |
| `created_at`, `updated_at` | `timestamptz` | |

### V007 — `account_deletion_request`

`POST /me/deletion-requests` → `PENDING` (7-day grace period, account `DELETION_REQUESTED`, every
session revoked, public traces hidden) → `account-deletion` job → `COMPLETED` (account anonymised,
module data purged by every `DeletionParticipant`, identity-provider user deleted; consents and audit
kept), or `CANCELLED` by the owner during the grace period.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `user_account.id` (cascade; account rows are anonymised, never deleted) |
| `status` | `text` | `PENDING`, `PROCESSING` (reserved), `COMPLETED`, `CANCELLED` |
| `reason` | `text` | optional owner text ≤ 1 000 characters; never audited; set to `NULL` on completion |
| `export_requested` | `boolean` | the owner wants their export first (`GET /me/export` stays available while pending) |
| `requested_at`, `scheduled_for` | `timestamptz` | `scheduled_for = requested_at + orenji.account.deletion-grace-days` |
| `cancelled_at`, `completed_at` | `timestamptz` | |
| `created_at`, `updated_at` | `timestamptz` | |

Indexes: `uq_account_deletion_request_active` (unique partial on `user_id` for `PENDING`/`PROCESSING`:
one active request per account), `ix_account_deletion_request_due` (partial on `scheduled_for`
`WHERE status = 'PENDING'`, used by the job with `FOR UPDATE SKIP LOCKED`),
`ix_account_deletion_request_user (user_id, requested_at DESC)`.

Anonymisation (`UserAccount.anonymise`): `email = deleted+<id>@anonymized.invalid`,
`handle = deleted_<16 hex of the id>`, `display_name = 'Deleted collector'`, status `DELETED`,
`deleted_at` set, only `USER` kept, `last_active_at` cleared. `provider_uid` is kept on purpose (the
identity is deleted at the provider; a still-valid old ID token then resolves to the `DELETED` row and
gets 403 instead of provisioning a new account), and identity attributes are never re-synced onto a
deleted row.

### V010 — `feature_flag` (ADR 0014)

Runtime switches edited by `SUPER_ADMIN`s through `PUT /api/v1/admin/feature-flags/{key}` (audited
`feature_flag.update`). The whole table is cached in Redis (`orenji:cache:feature-flags:v1`, 60 s) and
evicted after every write, so all API instances apply a change at once.

| Column | Type | Notes |
| --- | --- | --- |
| `key` | `text` | PK, lowerCamelCase (`ck_feature_flag_key`: `^[a-z][a-zA-Z0-9]{1,63}$`) |
| `enabled` | `boolean` | master switch |
| `description` | `text` | ≤ 500 characters |
| `rollout_percent` | `integer` | 0-100 (`ck_feature_flag_rollout`); share of accounts seeing an enabled flag, bucket = `CRC32(key:userId) mod 100`; anonymous callers only see flags at 100 % |
| `updated_by` | `uuid` | FK → `user_account.id` (`ON DELETE SET NULL`); `NULL` for migration defaults and the local seed |
| `updated_at`, `created_at` | `timestamptz` | |

Seeded rows (production-safe defaults): `mlScanning=false`, `protectedPayments=false`,
`publicChat=true`, `premiumPlans=true`, `advertising=false`, `credits=true`, `donations=false`. The
local/dev `FeatureFlagSeedContributor` enables `protectedPayments`, `advertising` and `donations`
(fake providers) unless an admin already edited them (`updated_by` set); `mlScanning` stays off.
A disabled flag makes guarded routes answer `404 FEATURE_DISABLED` (extension `feature`).

### V011 — plans, plan features, usage limits, usage counters, entitlements (ADR 0014)

Foundation of the Phase 10 contract "Plans and limits" (subscriptions come with Phase 10). Rules are
cached in Redis (`orenji:cache:plans:v1`, per-user `orenji:cache:entitlements:v1:<userId>`, 60 s) and
evicted after every admin write.

#### `plan`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `code` | `text` | `UNIQUE` (`uq_plan_code`), `^[A-Z][A-Z0-9_]{1,31}$`; referenced by `user_account.plan_code` |
| `name` | `text` | 1-80 characters |
| `description` | `text` | ≤ 1 000 characters |
| `monthly_price` | `numeric(12,2)` | display price, ≥ 0 |
| `currency` | `char(3)` | ISO 4217, default `CAD` |
| `active` | `boolean` | inactive plans are hidden from `GET /plans`; users on an inactive plan get the FREE rules; FREE cannot be disabled (service rule) |
| `sort_order` | `integer` | display order |
| `created_at`, `updated_by`, `updated_at` | | audit columns |

Seeded: `FREE` (0.00 CAD) and `PREMIUM` (4.99 CAD, placeholder price).

#### `plan_feature`

| Column | Type | Notes |
| --- | --- | --- |
| `plan_id` | `uuid` | FK → `plan.id` (cascade); PK `(plan_id, feature_key)` |
| `feature_key` | `text` | dotted lower-case key (`ck_plan_feature_key`), e.g. `filters.advanced`, `ads.enabled` |
| `enabled` | `boolean` | |
| `value` | `text` | optional parameter, ≤ 200 characters |
| `updated_by`, `updated_at` | | |

Seeded: FREE `filters.advanced=false`, `ads.enabled=true`; PREMIUM `filters.advanced=true`,
`ads.enabled=false`.

#### `usage_limit`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK (admin edits address limits by id) |
| `plan_id` | `uuid` | FK → `plan.id` (cascade); `UNIQUE (plan_id, limit_key)` |
| `limit_key` | `text` | dotted lower-case key |
| `kind` | `text` | `COUNTER` (consumed per window) or `CAP` (bound of a requested value, e.g. radius) |
| `limit_window` | `text` | `DAY`, `MONTH`, `TOTAL` (the contract's `window`; renamed because `WINDOW` is reserved in PostgreSQL). DAY/MONTH start at 00:00 UTC; caps always use `TOTAL` (`ck_usage_limit_cap_window`) |
| `max_value` | `integer` | `NULL` = unlimited; ≥ 0 (0 blocks the action) |
| `description` | `text` | ≤ 500 characters |
| `updated_by`, `updated_at` | | |

Index: `ix_usage_limit_key`. Seeded limits (FREE / PREMIUM): `binder.views.per_day` 30 / unlimited,
`wishlist.alerts.per_day` 5 / unlimited, `wishlist.items.max` 20 / 500 (TOTAL),
`map.radius.max_km` 25 / 100 (CAP), `binders.max` 5 / 50 (TOTAL), `saved_searches.max` 0 / 50
(TOTAL), `offers.per_day` 20 / 100.

#### `usage_counter`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` | FK → `user_account.id` (cascade) |
| `limit_key` | `text` | |
| `window_start` | `timestamptz` | start of the DAY/MONTH window; `1970-01-01T00:00Z` for TOTAL |
| `count` | `integer` | ≥ 0 |
| `updated_at` | `timestamptz` | |

PK `(user_id, limit_key, window_start)`; index `ix_usage_counter_window_start` (housekeeping).
`Limits.consume` increments with one atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < max
RETURNING count`, so concurrent requests can never pass the limit; the value is mirrored in Redis
(`orenji:usage:<user>:<key>:<window epoch>`, TTL ≤ 10 min, written after commit) for the `check` fast
path. TOTAL counters owned by another module (e.g. `binders.max` = number of binders) are read through
a `LimitUsageSource` bean instead.

#### `entitlement`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `user_account.id` (cascade) |
| `feature_key` | `text` | a limit key or a feature key defined by the plans |
| `value` | `text` | limits: a non-negative integer or `unlimited`; features: `true` / `false` |
| `source` | `text` | `SUBSCRIPTION`, `ADMIN_GRANT`, `PROMO`, `CREDIT_PURCHASE` |
| `expires_at` | `timestamptz` | `NULL` = no expiry |
| `granted_by` | `uuid` | FK → `user_account.id` (`ON DELETE SET NULL`) |
| `note` | `text` | admin note ≤ 500 characters (**admin only**) |
| `created_at` | `timestamptz` | |
| `revoked_at`, `revoked_by` | | revocation keeps the row (history) |

Index: `ix_entitlement_user_active (user_id, feature_key) WHERE revoked_at IS NULL`. Active = not
revoked and not expired; active entitlements beat plan values, the most generous one winning.

### V012 — `game` (ADR 0005)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `slug` | `text` | `UNIQUE` (`uq_game_slug`), `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 32; immutable |
| `name`, `short_name`, `publisher` | `text` | |
| `status` | `text` | `ACTIVE` or `HIDDEN` (hidden games vanish from public catalog endpoints, card search and profile choices) |
| `sort_order` | `integer` | display order |
| `schema` | `jsonb` | **GameSchema** object (`ck_game_schema`): `conditions`, `editions`, `languages`, `finishes`, `rarities` vocabularies, `metadataFields` `[{key, label, type string/number/string_list/boolean, filterable, options?}]`, `summaryFields` (metadata keys of `CardSummary`). Never filtered in SQL, so no GIN index |
| `created_at`, `updated_at` | `timestamptz` | |

Index: `ix_game_status_sort (status, sort_order)`. Seeded: `yugioh` (attribute, level, atk, def,
monsterType), `pokemon` (hp, types, stage, weakness), `mtg` (manaCost, manaValue, colorIdentity,
typeLine, power, toughness), `riftbound` (domain, energy, might, type). Cached in Redis
(`orenji:cache:games:v1`, 60 s), evicted on admin writes (`game.create`, `game.update`).

### V013 — card catalog (ADR 0005, ADR 0012)

Imported rows carry `external_ref = {"provider": "...", "id": "..."}` (unique per provider through
partial expression indexes `uq_<table>_external_ref`); `CatalogImportService` upserts by it and only
rewrites rows whose values changed. Admin-created rows have no `external_ref`.

#### `card_set`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `game_id` | `uuid` | FK → `game.id` (`RESTRICT`); `UNIQUE (game_id, code)` |
| `code` | `text` | upper-case `^[A-Z0-9]{2,10}$`; immutable through the admin API |
| `name` | `text` | 1-120 characters |
| `release_date` | `date` | |
| `total_cards` | `integer` | ≥ 0 |
| `series` | `text` | |
| `metadata` | `jsonb` | object; free-form game-specific set attributes (not filtered, no GIN index) |
| `external_ref` | `jsonb` | provider identity |
| `created_at`, `updated_at` | `timestamptz` | |
| `search_vector` | `tsvector` | generated: code (A) + name (A) + series (C), `simple` config, `unaccent_immutable` |

Indexes: `ix_card_set_search_vector` (GIN), `ix_card_set_name_trgm` (GIN trigram on
`lower(unaccent_immutable(name))`), `ix_card_set_game_release (game_id, release_date DESC)`,
`uq_card_set_external_ref`.

#### `card`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `game_id` | `uuid` | FK → `game.id` (`RESTRICT`); `UNIQUE (game_id, slug)` |
| `name` | `text` | 1-150 characters |
| `normalized_name` | `text` | generated `lower(unaccent_immutable(name))` (accent-insensitive, trigram typo tolerance) |
| `slug` | `text` | derived from the name on creation (`-2`, `-3` suffix on collision), never changed afterwards (stable page and placeholder URLs) |
| `card_type`, `subtype` | `text` | e.g. Monster / Effect, Pokémon / Stage 1, Creature / Merfolk Noble, Unit / Calm |
| `text` | `text` | rules text ≤ 4 000 characters |
| `metadata` | `jsonb` | object of game-specific attributes typed by `game.schema.metadataFields` (admin writes are type-checked); `GET /cards?metadata.<key>=` filters with `metadata @> {...}` |
| `external_ref` | `jsonb` | provider identity |
| `created_at`, `updated_at` | `timestamptz` | |
| `search_vector` | `tsvector` | generated: name (A), card type + subtype (B), text (C); `simple` config + `unaccent_immutable` |

Indexes: `ix_card_search_vector` (GIN, `websearch_to_tsquery` ranked with `ts_rank_cd`),
`ix_card_normalized_name_trgm` (GIN `gin_trgm_ops`: `%`, `<%`, `LIKE '%q%'`), `ix_card_metadata`
(GIN, `@>`), `ix_card_game_name (game_id, normalized_name)`, `uq_card_external_ref`.

#### `card_printing`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK; referenced by inventory items (Phase 3) |
| `card_id` | `uuid` | FK → `card.id` (cascade) |
| `set_id` | `uuid` | FK → `card_set.id` (`RESTRICT`) |
| `collector_number` | `text` | 1-20 characters |
| `rarity` | `text` | label from the game's `rarities` |
| `edition` | `text` | upper-case code (`FIRST_EDITION`, `UNLIMITED`, ...), default `UNLIMITED` |
| `language` | `text` | ISO 639-1, default `en` |
| `finish` | `text` | upper-case code (`NORMAL`, `FOIL`, `HOLO`, `REVERSE_HOLO`, `ETCHED`, ...), default `NORMAL` |
| `printing_code` | `text` | upper-case `SET-NUMBER` (`^[A-Z0-9]{2,10}-[A-Z0-9]{1,12}$`, e.g. `LOB-EN001`); not unique (finish variants share it); an exact match short-circuits card search |
| `image_id` | `uuid` | FK → `card_image.id` (`ON DELETE SET NULL`); the FRONT image; `NULL` → placeholder |
| `market_price`, `market_price_currency`, `market_price_updated_at` | `numeric(12,2)`, `char(3)`, `timestamptz` | indicative provider price (display only); price requires a currency (`ck_card_printing_price`) |
| `metadata` | `jsonb` | object of printing-specific attributes (artist, foil pattern, frame, ...) |
| `external_ref` | `jsonb` | provider identity |
| `created_at`, `updated_at` | `timestamptz` | |

Constraint `uq_card_printing_variant (set_id, collector_number, edition, language, finish)`. Indexes:
`ix_card_printing_card_id`, `ix_card_printing_set_id`, `ix_card_printing_code` (`text_pattern_ops`,
partial: equality and prefix autocomplete), `ix_card_printing_metadata` (GIN),
`uq_card_printing_external_ref`.

#### `card_image`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `printing_id` | `uuid` | FK → `card_printing.id` (cascade); `UNIQUE (printing_id, kind)` |
| `kind` | `text` | `FRONT`, `BACK`, `ART_CROP` |
| `url` | `text` | absolute URL or API-relative path (`/api/v1/public/placeholder-images/<game>/<card slug>.svg`), resolved against the request origin when served; the local catalog never hotlinks third-party images |
| `width`, `height` | `integer` | pixels (placeholders 488 × 680) |
| `source` | `text` | `placeholder` or the provider |
| `storage_key` | `text` | `ObjectStorage` key for stored images (future uploads) |
| `created_at`, `updated_at` | `timestamptz` | |

#### `catalog_sync_run`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `provider` | `text` | provider id (`mock` locally) |
| `game_id` | `uuid` | FK → `game.id` (cascade) |
| `mode` | `text` | `FULL`, `INCREMENTAL` |
| `status` | `text` | `QUEUED` → `RUNNING` → `SUCCEEDED` / `FAILED`; only a QUEUED run starts (idempotent event listener) |
| `requested_by` | `uuid` | admin; `NULL` for the local/dev seed import |
| `created_at`, `started_at`, `finished_at` | `timestamptz` | |
| `sets_upserted`, `cards_upserted`, `printings_upserted` | `integer` | rows inserted or actually changed (a repeated import reports 0) |
| `error` | `text` | client-safe summary, never a stack trace |

Indexes: `ix_catalog_sync_run_created_at`, `ix_catalog_sync_run_game (game_id, created_at DESC)`.

### Phase 3 — effective public visibility (V020–V022)

An item is public ⇔ `visibility` is `PUBLIC`, or `TEMPORARILY_PUBLIC` with `public_until > now()`
∧ its binder is public (or it has none) ∧ `freshness_state <> 'HIDDEN'` ∧ it is not deleted ∧ its
game is `ACTIVE` ∧ the owner is listed. A binder is public ⇔ the same visibility/expiry rule ∧ the
binder's `freshness_state <> 'HIDDEN'` ∧ the owner is listed. The owner is listed ⇔
`user_account.status = 'ACTIVE'` (or `SUSPENDED` with `suspended_until <= now()`) ∧
(`privacy_settings.discoverable` ∨ `profile_visibility = 'PUBLIC'`) ∧ `profile_visibility <>
'PRIVATE'`. The SQL lives in `PublicVisibilityRules` (binders module) and
`InventoryItemRepository.LISTED`; every public read re-evaluates it. `publicly_listed` only
materialises the last evaluation so the API emits `InventoryItemPublished` /
`InventoryItemUnpublished` / `BinderPublished` / `BinderUnpublished` exactly once per transition
(reconciled after every write, on account state and privacy changes, and hourly by the freshness
job, which also catches expiries).

### V020 — `delist_policy` (ADR 0014)

Freshness thresholds as data. Exactly one row is active (`uq_delist_policy_active`, a unique index
on the constant `true` restricted to active rows). Cached in Redis (`orenji:cache:delist-policy:v1`,
60 s) and evicted after every admin write (`PUT /api/v1/admin/delist-policies/{id}`, audited
`delist_policy.update`).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `name` | `text` | 1-80 characters |
| `active` | `boolean` | the policy the freshness job applies |
| `aging_after_days` | `integer` | first day of AGING (default 15) |
| `stale_after_days` | `integer` | first day of STALE (default 31) |
| `hidden_after_days` | `integer` | first day of HIDDEN (default 46); `ck_delist_policy_order`: `1 <= aging < stale < hidden <= 3650` |
| `warn_before_hidden_days` | `integer` | warning lead time (default 5); `0 <= warn < hidden` |
| `max_strikes` | `integer` | 1-100 (default 3); unresponsiveness strikes before the `delist` job pauses listings (strike tracking arrives with Phases 5/7) |
| `updated_by` | `uuid` | FK → `user_account.id` (`ON DELETE SET NULL`); `NULL` for the migration default |
| `created_at`, `updated_at` | `timestamptz` | |

An age of *n* days means `confirmed_at <= now() - n days`; `FreshnessPolicy` (Java) and the job's
SQL use the same cut-offs.

### V021 — `binder`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `owner_id` | `uuid` | FK → `user_account.id` (cascade) |
| `name` | `text` | 1-80 characters |
| `description` | `text` | ≤ 1 000 characters, default `''` |
| `kind` | `text` | `COLLECTION` (default), `TRADE`, `SALE`, `DECK`, `CUSTOM` |
| `visibility` | `text` | `PRIVATE` (default), `PUBLIC`, `TEMPORARILY_PUBLIC`; `ck_binder_public_until`: `public_until` is set exactly for `TEMPORARILY_PUBLIC` |
| `public_until` | `timestamptz` | end of a temporary publication (≤ 30 days ahead, checked by the API; publish modes ONE_HOUR / ONE_DAY); expired ones are turned `PRIVATE` by the freshness job (reads already treat them as private) |
| `sort_order` | `integer` | position in the owner's list (`PUT /binders/reorder`) |
| `cover_printing_id` | `uuid` | FK → `card_printing.id` (`ON DELETE SET NULL`); chosen cover |
| `item_count` | `integer` | ≥ 0; non-deleted items, maintained by `trg_inventory_item_binder_count` only |
| `freshness_state` | `text` | `ACTIVE`, `AGING`, `STALE`, `HIDDEN` (derived by the freshness job); a HIDDEN binder is not public |
| `warned_at` | `timestamptz` | pre-hide warning of the current confirmation cycle (reset by a confirmation) |
| `publicly_listed` | `boolean` | materialised effective visibility (events only) |
| `listing_changed_at` | `timestamptz` | last flip of `publicly_listed` |
| `created_at`, `updated_at` | `timestamptz` | |
| `confirmed_at` | `timestamptz` | last confirmation: binder created, published or confirmed, or an item created, confirmed or moved into it |
| `last_owner_activity_at` | `timestamptz` | last owner write on the binder or its items |
| `search_vector` | `tsvector` | generated: name (A) + description (B), `simple` config + `unaccent_immutable` (public binder search, Phase 4) |

Indexes: `ix_binder_owner_sort (owner_id, sort_order, created_at)`, `ix_binder_search_vector` (GIN),
`ix_binder_listed_owner (owner_id) WHERE publicly_listed`, `ix_binder_confirmed_at`,
`ix_binder_expiry (public_until) WHERE visibility = 'TEMPORARILY_PUBLIC'`.

Deleting a binder (`DELETE /binders/{id}`) unfiles its items (they keep their visibility only when
the binder was `PUBLIC` without an end date, otherwise they become `PRIVATE`) or soft-deletes them
with `?deleteItems=true`.

### V022 — inventory items, photos and freshness events

#### `inventory_item`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `owner_id` | `uuid` | FK → `user_account.id` (cascade) |
| `binder_id` | `uuid` | FK → `binder.id` (`ON DELETE SET NULL`); `NULL` = unfiled |
| `printing_id` | `uuid` | FK → `card_printing.id` (`RESTRICT`) |
| `quantity` | `integer` | 1-9 999 |
| `condition` | `text` | upper-case code from the game's `GameSchema.conditions` (checked by the API; default `NEAR_MINT`) |
| `language`, `edition`, `finish` | `text` | default to the printing's values; ISO 639-1 / upper-case codes |
| `asking_price` | `numeric(12,2)` | ≥ 0, `NULL` = no price |
| `currency` | `char(3)` | ISO 4217, default `CAD` |
| `availability` | `text` | `COLLECTION_ONLY` (default), `TRADE`, `SALE`, `TRADE_OR_SALE`, `NOT_AVAILABLE` |
| `accepts_offers` | `boolean` | |
| `notes` | `text` | **PRIVATE** owner notes (≤ 2 000); owner and export only |
| `public_notes` | `text` | ≤ 500, shown on public listings |
| `visibility` | `text` | `PRIVATE`, `PUBLIC`, `TEMPORARILY_PUBLIC` (`ck_inventory_item_public_until` as for binders). API default: `PUBLIC` inside a binder (the binder decides), `PRIVATE` unfiled |
| `public_until` | `timestamptz` | end of a temporary publication (≤ 30 days ahead) |
| `freshness_state` | `text` | `ACTIVE`, `AGING`, `STALE`, `HIDDEN`, derived by the freshness job; a confirmation resets it to `ACTIVE` |
| `hidden_reason` | `text` | `STALE_UNCONFIRMED` (freshness job); `OWNER_PAUSED`, `MODERATION` reserved for Phase 7 |
| `warned_at` | `timestamptz` | pre-hide warning of the current confirmation cycle |
| `publicly_listed` | `boolean` | materialised effective visibility (events only) |
| `listing_changed_at` | `timestamptz` | last flip of `publicly_listed` |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` = last owner edit |
| `confirmed_at` | `timestamptz` | last owner confirmation (create, confirm, bulk CONFIRM, making the item public, publishing or confirming its binder) |
| `last_owner_activity_at` | `timestamptz` | last owner write |
| `deleted_at` | `timestamptz` | soft delete (invisible to everyone; purged with the account) |

Indexes (contract): `ix_inventory_item_owner_binder (owner_id, binder_id)`,
`ix_inventory_item_printing_public (printing_id) WHERE visibility <> 'PRIVATE' AND deleted_at IS
NULL`, `ix_inventory_item_public_discovery (printing_id, availability, freshness_state) WHERE
publicly_listed`. Also `ix_inventory_item_binder`, `ix_inventory_item_owner_updated`,
`ix_inventory_item_confirmed_at` (freshness job), `ix_inventory_item_expiry`,
`ix_inventory_item_listed_owner`.

Trigger `trg_inventory_item_binder_count` (`AFTER INSERT OR DELETE OR UPDATE OF binder_id,
deleted_at`, row level) keeps `binder.item_count` equal to the binder's non-deleted items.

#### `inventory_item_image`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `item_id` | `uuid` | FK → `inventory_item.id` (cascade); at most 4 per item (API) |
| `storage_key` | `text` | `UNIQUE`; `ObjectStorage` key `inventory/<owner id>/<random>.jpg` |
| `url` | `text` | URL at upload time (informational); responses derive the current URL from `storage_key` |
| `width`, `height` | `integer` | pixels of the stored rendition (≤ 1600 on the long side) |
| `sort_order` | `integer` | position |
| `created_at` | `timestamptz` | |

#### `inventory_freshness_event`

Append-only trail of freshness transitions (audit + notification de-duplication, Phase 6).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `owner_id` | `uuid` | FK → `user_account.id` (cascade) |
| `item_id` | `uuid` | FK → `inventory_item.id` (cascade) |
| `binder_id` | `uuid` | FK → `binder.id` (cascade); `ck_inventory_freshness_event_target`: exactly one of `item_id`, `binder_id` |
| `event` | `text` | `WARNED` (once per confirmation cycle, public listings only), `AGED`, `STALED`, `HIDDEN`, `RESTORED` (left HIDDEN: confirmation or a more lenient policy) |
| `created_at` | `timestamptz` | |

Indexes: `ix_inventory_freshness_event_item`, `ix_inventory_freshness_event_binder` (partial),
`ix_inventory_freshness_event_owner`.
