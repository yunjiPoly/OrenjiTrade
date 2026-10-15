# Stage R3 contract — binders and deck cores

> Owner spec 2026-10-14 ([`docs/product/specs/2026-10-14-phone-redesign.md`](../../product/specs/2026-10-14-phone-redesign.md)),
> sections 7 (mockup screens 16 to 18 and Inventory › Binders), 12 ("Binders and deck cores"),
> 13, 14 and 16 (default 6). Extends [phase3-inventory.md](phase3-inventory.md) (binders, public
> binders), [phase4-map-search.md](phase4-map-search.md) and the map of
> [s1-regions-location.md](s1-regions-location.md). Every change is additive: the paused web
> keeps every field it reads, and every new response field is optional in the schema (always
> sent) so that clients built before R3 keep compiling. Field-level truth: `../openapi.json`.
> Migration: **V126** (`V126__binder_deck_cores.sql`).

**A deck core is a binder sold as one bundle.** It needs no cards: photos, one price and a note
are enough. The cards its owner puts in it are its key cards; they sell only together, so the
card holders can leave them out (stage R5 shows the core on the card page instead).

**The core decides what buyers see of its cards (review fix 1).** Every live card filed in an
effectively public, unsold deck core is one of its key cards, whatever the card's own visibility
(`InventoryItemRepository.IN_PUBLIC_CORE`: not deleted, its game active, its freshness not
HIDDEN, the core listed and its owner's listings public). The card's own visibility alone decides
whether it is listed **on its own** (`LISTED`: who has this card, public item lists, `itemCount`,
covers and item photos). So no client ever flips a card public to put it in a deck core, and a
card that leaves the core (taken out, the core deleted, or the switch turned off) is exactly as
private or public as its collector made it. A key card shows a card's name, its copies, its game
and its catalog picture, never an item's own photo, note, condition or price.

All under `/api/v1`.

## The binder's columns (V126)

| Column | Notes |
| --- | --- |
| `sells_as_core boolean NOT NULL DEFAULT false` | "Sell as a deck core" |
| `asking_price_text varchar(40)` | the price as typed (`$180`, `Trade only`), trimmed, one line; `ck_binder_asking_price_text` |
| `asking_price numeric(12,2)`, `currency char(3) DEFAULT 'CAD'` | a plain amount of the text (`common/AskingPriceText`, the parser of stage R2's cards) also gives the amount; any other text leaves it null; the currency is never read from the text |
| `sold_at timestamptz` | when the deck core was sold (stage R4 sets it; spec section 16, default 6). A sold binder is never public, and neither are the cards still filed in it (`PublicVisibilityRules.binderListed`) |
| `binder.description` | the deck core's public note (the API keeps its 1 000 characters for the paused web; the phone caps it at 500) |

`binder_image` (like `inventory_item_image`): `id`, `binder_id` (cascade), `storage_key`
(`binders/<owner id>/<random>.jpg`, unique), `url`, `width`, `height`, `sort_order`,
`created_at`; at most 4 per binder (API).

## The owner's binders

- `POST /binders` and `PATCH /binders/{id}` accept `sellsAsCore` (boolean; not null on a
  `PATCH`) and `askingPriceText` (at most 40 characters once trimmed, one line: 400
  `askingPriceText` otherwise; `null` or blanks clear it and its amount).
- `PATCH /binders/{id}` accepts `confirm: true`: the update also confirms the binder and its
  cards, as `POST /binders/{id}/confirm` does (the phone's "Save changes"). Making the binder
  public confirms it as before.
- Turning the switch off keeps the photos, the price and the note for the owner (turning it on
  again brings them back); public views show them for a deck core only.
- `BinderResponse` gains `sellsAsCore`, `askingPriceText`, `askingPrice`, `currency`, `soldAt`,
  `photos [BinderImage {id, url, width, height, sortOrder}]`, `previewImages [uri]` and
  `keyCards [BinderKeyCard {cardId, name, quantity}]` (see "Showcase" below; the owner's key
  cards count every card of the binder).
- The data export's `binders` section gains `sellsAsCore`, `askingPriceText`, `askingPrice`,
  `currency`, `soldAt` and the photo URLs.

## Photos

- `POST /binders/{id}/images` (multipart part `file`) → 201 `BinderResponse`: the item photo
  rules — JPEG, PNG or WebP by content (415 otherwise), at most 8 MB (413), at most 8 192 pixels a
  side (400), re-encoded as a JPEG of at most 1 600 pixels without any metadata (EXIF and GPS
  stripped), **at most 4 per binder (409 CONFLICT)**. 404 for another collector's binder, before
  the upload is read. Rate-limited: 60 an hour (`binder-image-upload`).
- `DELETE /binders/{id}/images/{imageId}` → 204; 404 for another collector's binder or an unknown
  photo.
- The stored files go after the commit with their photo, with the binder (`DELETE
  /binders/{id}`) and with the account (purge).
- Locks: a photo write is a binder write (`BinderService.addPhoto` / `deletePhoto`): the owner
  lock, then the binder row (`docs/database/schema.md`, "Locks of binders and inventory items";
  `InventoryLockOrderIT.everyWriteStartsWithTheOwnerLock` cases `BINDER_PHOTO_ADD`,
  `BINDER_PHOTO_DELETE` and `BINDER_DECK_CORE`). The file is written before the transaction.
- The route lives in the inventory module (`inventory/api/BinderPhotoController`, like `GET
  /binders/{id}/items`): it uses the item photo processor, and the dependency points from
  inventory to binders.

## Showcase (lists and pages)

- `previewImages`: up to 3 pictures for lists — a deck core's first photo when it has one,
  otherwise the card pictures (printing images) of the binder's first items, one per printing, in
  the order they were added (in public views the cards buyers see: public items, and every card
  of a public deck core).
- `keyCards`: a deck core's cards with their copies, every printing of a card together, most
  copies first then by name, at most 30; empty for other binders. Public views count every live
  card of the public deck core, whatever its own visibility (`SHOWN_PUBLICLY`); the owner's view
  every live card. A deleted card leaves them until it is restored.
- `games` (public views): the games of the cards buyers see, a public deck core's cards included
  (so the deck core page names its game); `itemCount` stays the number of cards listed on their
  own.
- `photos`: in public views a deck core's only.

## Public binders

- **A public deck core shows without cards**: `GET /collectors/{handle}/binders`, search, the map
  and the profile's `publicBinderCount` list an effectively public binder that holds a public
  card **or is a deck core** (not sold).
- `PublicBinderSummary` (collector lists, search, the state and region lists, the deck cores of a
  card) and `PublicBinderResponse` (`GET /public/binders/{id}`) gain `sellsAsCore`,
  `askingPriceText` (a deck core's; null otherwise), `photos`, `previewImages` and `keyCards`.
- `PublicBinderResponse` gains `ownerPublicBinderCount` (the seller row of the deck core page:
  "{province} · {n} public binders").
- Places stay a state or province and a country (ADR 0017); never a city, a private note or a
  private card. `GeoPrivacyContractTest.deckCoresCarryThePlaceOnly` covers the deck core page,
  its key cards, the deck cores of a card, binder search and the state and region lists filtered
  to deck cores, and the map's deck core counts.

## Search (built here for the screens of stage R5)

- `GET /search/card-holders?…&excludeDeckCoreItems=true` (optional, default false): leaves out the
  cards filed in a deck core (the phone passes it from R5, with the "Also in a deck core" banner).
- `GET /search/deck-cores?cardId=&region=&limit=3` (limit 1–10, default 3; region as everywhere,
  400 for an unknown code) → `[PublicBinderSummary]`: the public deck cores of discoverable
  collectors of the region that hold the card among their key cards (any printing, whatever the
  card's own visibility), most recently updated first; never the caller's own, never a collector
  blocked with the caller.
- `GET /search?types=binders&q=…&deckCore=true|false` (optional): deck cores only, or the other
  binders only. The text matches a binder's name and description (as before), its **owner's
  handle** (a substring; a leading `@` is allowed) and, **for a deck core, the names of its key
  cards** (every live card of the public core; never a card of a plain binder, a deleted card, a
  card hidden as stale, or the cards of a binder whose switch is off). The `game` filter counts
  the cards buyers see the same way.
- `GET /regions/{region}/subdivisions/{code}/binders?deckCore=&q=&cursor=&limit=`: the same
  optional `deckCore` and `q` (the same matching).
- **New:** `GET /regions/{region}/binders?deckCore=&q=&cursor=&limit=` — the same list for every
  state and province of the region (Search › Binders without a state); 404 for an unknown
  region.
- `GET /regions/{region}/binder-counts`: `SubdivisionBinderCount` gains `deckCoreCount` and the
  answer `deckCoreTotal`. `binderCount` and `total` count every public binder, deck cores
  included: the map's state card says "{binderCount − deckCoreCount} binders · {deckCoreCount}
  deck cores". The anonymous cache key became `binder-counts:v2|<region>`.

## Not in R3

- Selling a deck core (`sold_at`, its cards leaving the inventory) is stage R4's, with the chat
  subject that pins a deck core to a conversation; R3's deck core page opens the chat without a
  pinned card.
- The collectors section of search (`CollectorSearchRepository`) still counts the binders that
  hold a public card in a marker's `publicBinderCount`; a collector whose only public binder is
  a deck core without cards shows 0 there until stage R6 reworks profiles.
