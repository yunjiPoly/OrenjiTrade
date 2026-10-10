# Phase 3 contract — inventory, binders, public binders, freshness

> **ADR 0017 (2026-10-08):** binder owners carry a `place` (state or province and country)
> instead of `location: {publicLabel, distanceBucket}`; see
> [s1-regions-location.md](s1-regions-location.md).

All under `/api/v1`. Owner-only unless stated. Effective public visibility is computed server
side: item visible ⇔ item.visibility ∈ {PUBLIC, TEMPORARILY_PUBLIC(not expired)} ∧ binder
visible (or item has no binder) ∧ owner.status = ACTIVE ∧ owner discoverable-or-profile-public ∧
item.freshness_state ≠ HIDDEN. Freshness thresholds come from `delist_policy` (ADR 0014; seed:
ACTIVE 0–14, AGING 15–30, STALE 31–45, HIDDEN 46+ days since `confirmed_at`).

## Tables

- `binder(id, owner_id, name, description, kind (COLLECTION|TRADE|SALE|DECK|CUSTOM), visibility (PRIVATE|PUBLIC|TEMPORARILY_PUBLIC), public_until timestamptz null, sort_order, cover_printing_id null, created_at, updated_at, confirmed_at, last_owner_activity_at, item_count int (maintained), search_vector generated (name+description))`
- `inventory_item(id, owner_id, binder_id null, printing_id, quantity int ≥1, condition, language, edition, finish, asking_price numeric null, currency char(3) default 'CAD', availability (COLLECTION_ONLY|TRADE|SALE|TRADE_OR_SALE|NOT_AVAILABLE), accepts_offers bool, notes text (private), public_notes text, visibility (PRIVATE|PUBLIC|TEMPORARILY_PUBLIC), public_until, created_at, updated_at, confirmed_at, last_owner_activity_at, freshness_state (ACTIVE|AGING|STALE|HIDDEN) maintained by job, hidden_reason null, deleted_at null)`
- `inventory_item_image(id, item_id, storage_key, url, width, height, sort_order)`
- `delist_policy(id, name, active bool, aging_after_days, stale_after_days, hidden_after_days, warn_before_hidden_days, updated_by, updated_at)` — exactly one active row.
- `inventory_freshness_event(id, item_id|binder_id, event (WARNED|AGED|STALED|HIDDEN|RESTORED), created_at)` for audit + notification dedup.
- Indexes: `(owner_id, binder_id)`, `(printing_id) WHERE visibility <> 'PRIVATE' AND deleted_at IS NULL`, partial index for public discovery on `(printing_id, availability, freshness_state)`; GIN on binder search_vector.

## Domain events

`InventoryItemPublished { itemId, ownerId, printingId, cardId, gameSlug, availability, askingPrice, currency, publishedAt }` (emitted when an item becomes publicly visible: created public, visibility changed to public, binder published, restored from HIDDEN) — consumed by wishlist matching (Phase 6) and analytics.
`InventoryItemUnpublished { itemId }`, `BinderPublished { binderId, ownerId }`, `BinderFreshnessChanged { binderId, state }`.

## Endpoints — inventory

- `GET /inventory/items?query=&game=&binderId=&visibility=&availability=&condition=&freshness=&sort=updated|name|price&page=&size=` → `PageResponse<InventoryItemResponse>`
- `POST /inventory/items` body `{ printingId, quantity, condition, language, edition, finish, askingPrice, currency, availability, acceptsOffers, notes, publicNotes, visibility, publicUntil, binderId }` → 201 `InventoryItemResponse`
- `GET /inventory/items/{id}`, `PATCH /inventory/items/{id}` (any subset of the fields above; `visibility=TEMPORARILY_PUBLIC` requires `publicUntil` ≤ 30 days ahead), `DELETE /inventory/items/{id}` (soft delete)
- `POST /inventory/items/{id}/confirm` → refreshes `confirmed_at`, restores HIDDEN → ACTIVE
- `POST /inventory/items/{id}/images` multipart (≤ 4 per item, re-encoded), `DELETE …/images/{imageId}`
- `POST /inventory/items/bulk` body `{ "itemIds": [...], "action": "SET_VISIBILITY|MOVE_TO_BINDER|SET_AVAILABILITY|CONFIRM|DELETE", "visibility": "...", "publicUntil": "...", "binderId": "...", "availability": "..." }` → `{ "updated": n, "skipped": [{ "itemId", "reason" }] }` (transactional; ownership verified for every id)
- `GET /inventory/summary` → `{ totalItems, totalQuantity, byVisibility: {PRIVATE, PUBLIC, TEMPORARILY_PUBLIC}, byGame: {...}, staleCount, hiddenCount, nextExpiry }`

`InventoryItemResponse` = `{ id, printing: PrintingSummary, card: {id, name, game}, binder: {id, name}|null, quantity, condition, language, edition, finish, askingPrice, currency, availability, acceptsOffers, notes, publicNotes, visibility, publicUntil, effectivePublic: bool, freshness: { state, confirmedAt, updatedAt, label: "Updated 3 hours ago" }, images: [], createdAt, updatedAt }`

## Endpoints — binders

- `GET /binders` (mine) → `[BinderResponse]`; `POST /binders` `{ name, description, kind, visibility, publicUntil }`; `GET|PATCH|DELETE /binders/{id}` (delete moves items to no binder unless `?deleteItems=true`)
- `POST /binders/{id}/publish` body `{ "mode": "PUBLIC|ONE_HOUR|ONE_DAY|UNTIL_DISABLED" }` → sets visibility/public_until; `POST /binders/{id}/unpublish`; `POST /binders/{id}/confirm`
- `GET /binders/{id}/items?…` (owner: all; others: only effective-public items via the public route below)
- `PUT /binders/reorder` `{ "binderIds": [...] }`

`BinderResponse` = `{ id, name, description, kind, visibility, publicUntil, itemCount, publicItemCount, coverImageUrl, freshness: { state, confirmedAt, updatedAt, label }, createdAt, updatedAt }`

## Public views (permitAll GET, privacy enforced)

- `GET /collectors/{handle}/binders` → `[PublicBinderSummary]` (only effective-public binders with ≥1 effective-public item)
- `GET /public/binders/{id}` → `PublicBinderResponse` `{ id, name, description, owner: {id, handle, displayName, avatarUrl, location: {publicLabel, distanceBucket}}, freshness, itemCount, games: [] }`
- `GET /public/binders/{id}/items?game=&query=&availability=&page=&size=` → `PageResponse<PublicInventoryItem>` `{ id, printing: PrintingSummary, card, quantity, condition, language, edition, finish, askingPrice, currency, availability, acceptsOffers, publicNotes, images, freshness }` — never `notes`, never owner coordinates.
- `GET /collectors/{handle}/inventory?…` → effective-public items across binders (same shape).

## Jobs

`POST /internal/jobs/freshness` (hourly): recompute `freshness_state` for items and binders
from `confirmed_at` and the active `delist_policy`; emit `WARNED` events `warn_before_hidden_days`
before hiding (notification "Confirm your binder is still available"); `HIDDEN` items emit
`InventoryItemUnpublished`. Never deletes. `POST /internal/jobs/delist` (daily): pauses public
listings of owners with `unresponsive_strikes ≥ policy.max_strikes` (strike logic Phase 5+;
job exists and no-ops without strikes).

## Web `/inventory` page (Phase 3 UI)

Left: binder list (All cards, Unfiled, then binders with visibility icon + counts, "New binder").
Top: search, game filter, visibility segmented control (All / Private / Public / Temporarily
public), availability + condition + freshness filters, sort, view toggle (grid/table).
Main: card grid/table rows with image, name, set/printing code, condition chip, quantity
stepper, price, availability chip, visibility icon, freshness badge; row click opens an edit
side panel (all fields, images, confirm availability, delete). Multi-select → bulk bar (change
visibility incl. temporary with duration picker, move to binder, set availability, confirm,
delete). "Add card" opens a dialog with catalog autocomplete (`/cards/suggest`) → printing
picker → details form. Binder manager dialog (create/rename/publish with duration/reorder).
Summary strip (totals, stale count with "Confirm all" CTA). Empty/skeleton/error states.
