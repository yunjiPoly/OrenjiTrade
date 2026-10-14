# Stage R2 contract — the inventory and adding cards of the phone redesign

> Owner spec 2026-10-14 ([`docs/product/specs/2026-10-14-phone-redesign.md`](../../product/specs/2026-10-14-phone-redesign.md)),
> sections 6 (mockup screens 1 to 9), 12 ("Inventory") and 16 (defaults 4 and 5). Extends
> [phase3-inventory.md](phase3-inventory.md); every change is additive (the paused web keeps
> every field it reads). Field-level truth: `../openapi.json`. Migration: V117.

All under `/api/v1`, owner only unless stated.

## The asking price as typed

- `inventory_item.asking_price_text varchar(40)` (nullable, trimmed; one line).
- `POST /inventory/items` and `PATCH /inventory/items/{id}` accept `askingPriceText`. A **plain
  amount** — digits (at most 10) with an optional decimal part of one or two digits after `.` or
  `,`, an optional `$` before or after, spaces (also a no-break space) between the sign and the
  number: `12`, `12.5`, `12.50`, `12,50`, `$12.50`, `$ 12`, `12,50 $` — also fills `askingPrice`
  in the item's `currency` (sent, kept, or `CAD` on a new item; never read from the text). Any
  other text (`85% TCG`, `Trade only`, `12.`, `1,200.00`, `$12$`, `12 CAD`) leaves `askingPrice`
  null. The parser: `common/AskingPriceText` (shared with the deck cores of stage R3).
- Sending `askingPrice` and `askingPriceText` together is a 400 (`askingPriceText`). On a
  `PATCH`, `askingPriceText: null` clears both; `askingPrice` without `askingPriceText` (the
  paused web) sets the amount and clears the text, which no longer says the same.
- `InventoryItemResponse` and `PublicInventoryItem` gain `askingPriceText` (always present,
  nullable). The phone shows it exactly as typed; for a card priced before R2 (only an amount)
  it shows the amount in its currency (`$42.00`); nothing without a price.
- `GET /inventory/items?sort=price` sorts on `asking_price` (highest first by default): a price
  that is not a plain amount comes after every amount, then the cards without any price.

## A condition that is not stated

- `inventory_item.condition` is nullable: `NULL` = not stated (cards added on the phone, whose
  collector writes the condition in the public note).
- `POST /inventory/items` accepts `conditionStated: false` (then no `condition` may be sent:
  400). Without it, `condition` (or its default NEAR_MINT) is stated as before.
- A `PATCH` that sends `condition` states it; any other `PATCH` keeps a not-stated condition.
- Responses keep `condition` a required string for the paused web: **empty when not stated**, with
  the new `conditionStated: false` (always sent; optional in the schema so that clients built
  before R2 keep compiling). A nullable `condition` was tried and breaks the web's build
  (`features/inventory/data/item-form.ts:145`, `shared/offers/offer-target.ts:55`: `string | null`
  is not assignable to `string`), so the empty string is the least misleading form: the web shows
  "—" (its label of a missing condition) rather than a false "Near Mint", and its edit form asks
  for a condition before it saves.
- Wishlist alerts: a Near Mint only wish treats a not-stated condition as a possible match (the
  buyer checks in the chat; spec section 16, default 5) — `WishlistAlertRules.NEAR_MINT_SQL` and
  `conditionFits`.
- The data export carries `condition: null` and `conditionStated: false`; the admin listings and
  the map's matching items an empty `condition`.

## Cards added on the phone

The phone sends `availability: TRADE_OR_SALE`, `acceptsOffers: false`, `conditionStated: false`,
and leaves language, edition and finish to the server (the printing's: the game's defaults for
that printing), `currency` to its default (CAD). It never changes these afterwards: an edit sends
only quantity, `askingPriceText`, visibility (PRIVATE | PUBLIC), `binderId`, `publicNotes` and
`confirm`.

## A save confirms the card

`PATCH /inventory/items/{id}` accepts `confirm: true`: the update also confirms the item, as
`POST …/confirm` does (freshness back to ACTIVE, a HIDDEN item listed again when its visibility
allows it, a RESTORED freshness event). The phone's "Save changes" always sends it ("saving a
card counts as still available"); the paused web never does.

## Undo a delete

- `DELETE /inventory/items/{id}` and the `DELETE` of `POST /inventory/items/bulk` (an owner's own
  deletes) keep the row restorable for **10 minutes** (`inventory_item.restorable_until`; the
  constant `InventoryService.RESTORE_WINDOW`, spec section 16, default 4) and keep its photos.
- `POST /inventory/items/{id}/restore` → 200 `InventoryItemResponse`: brings the item back exactly
  as it was (copies, prices, notes, photos, binder, visibility; the binder counts it again and its
  listing is reconciled). A live item is answered as it is (a repeated undo). 404 for unknown and
  other owners' items; **409 `RESTORE_WINDOW_CLOSED`** once the 10 minutes have passed, and for an
  item that left another way (a trade, its binder deleted with it); 429 `LIMIT_REACHED` when
  `inventory.items.max` was reached meanwhile (no number today).
- Deleting a binder ends the undo of the cards deleted from it (their photos go at once): such a
  card could no longer come back where it was.
- The job `inventory-photo-purge` (recorded in `job_run`, run after every hourly `freshness` job,
  no endpoint of its own) closes the windows that have passed and deletes those items' photos
  (rows, then the stored objects after the commit). The restore checks the time itself, so the
  undo ends at 10 minutes whatever the job does; the photos go within the hour after.

## Sorts and filters

- `GET /inventory/items?sort=created`: creation, newest first ("Recently added", the phone's
  default). `unfiled=true` ("No binder") and `visibility` exist since Phase 3.
- "Show {n} cards" of the phone's filter sheet reads `totalItems` of the same query with `size=1`.

## Catalog (Add cards, Choose the printing)

- `GET /cards/suggest` entries gain `setName` and `rarity` (PRINTING entries: "Exact printings")
  and `printingCount` (CARD entries: "Yu-Gi-Oh! · 14 printings"); null otherwise.
- `PrintingSummary` gains `setReleaseDate` (the set's, nullable): "{set} · {year}".

## Errors

`RESTORE_WINDOW_CLOSED` (409) joins the `ErrorCode` list.
