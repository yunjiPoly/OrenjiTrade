# Stage R7 contract — Home's feed

> Owner prompt of 2026-10-19 ([`docs/product/specs/2026-10-19-home-full-design.md`](../../product/specs/2026-10-19-home-full-design.md)),
> section 5; it replaces section 5 of the redesign spec
> ([`2026-10-14-phone-redesign.md`](../../product/specs/2026-10-14-phone-redesign.md)) and adds to
> its section 12, "Home feed". Mockup v50 screens 10, 10b and 10c. Extends
> [phase3-inventory.md](phase3-inventory.md) (public listings), [s2-wishlist.md](s2-wishlist.md)
> (public wishes), [r3-binders-deck-cores.md](r3-binders-deck-cores.md) (deck cores) and
> [g-one-game.md](g-one-game.md) (`game=`). One new endpoint and one migration (V133), both
> additive: the paused web builds and passes its checks against the regenerated client, unchanged.
> Field-level truth: `../openapi.json`.

All under `/api/v1`. Places are a state or province and a country, never a city or a coordinate
(ADR 0017); nothing is sponsored (ADR 0019).

## `GET /feed` (signed in)

| Parameter | Rule |
| --- | --- |
| `game` | **required**: a slug of `GET /games` (an `ACTIVE` game). Missing or unknown: 400 `VALIDATION_FAILED`, field `game` |
| `region` | a platform region code (`GET /regions`); default: the caller's home region, else `americas-north`. Unknown: 400, field `region` |
| `kind` | `ALL` (default), `NEW_CARDS`, `WANTED` or `DECK_CORES` (any case). Other: 400, field `kind` |
| `cursor` | the `nextCursor` of the previous page (opaque; a malformed one is 400, field `cursor`) |
| `limit` | 1 to 50, 20 by default (out of range: 400) |

Anonymous: 401. The guests' Home is stage R15.

**Order and paging.** Newest first by `at`, then `id` (both descending); a keyset cursor over the
two (`FeedIT` pages the whole region with 3 per page and with 50 and finds the same list). A
new-card post is dated by its newest card, so its `at` moves when cards join or leave its hour
while its `id` stays. The cursor also carries the time the first page was read: the pages after
it date and count new-card posts by the cards listed until then only, so a card listed in between
can no longer lift a post not seen yet above the cursor and out of every page (R7 review F2); a
refresh shows that post at the top with its new card. A post whose newest card leaves between two
pages (made private, sold, deleted) is dated by an older card and can come back once on a later
page, same `id`, new `at`: **clients dedupe by `id` and keep the copy already shown** (the phone's
`feedRows` does). Nothing that existed when the first page was read is skipped while the window
does not move. The cursor is opaque; one of before this change is a 400 (`cursor`).

**The window.** Nothing that became public more than `orenji.feed.window-days` days ago is ever
returned (an application property, `FEED_WINDOW_DAYS`, 30 by default, 1 to 365); the page says it
in `windowDays`. The last page has `nextCursor: null` and `hasMore: false`: the phone then shows
"You're all caught up".

### What can appear

The privacy core of the feed, all decided in one SQL query (`FeedRepository`) before the limit:

- only **discoverable collectors located in the region** (`DiscoverySql.DISCOVERABLE` and
  `IN_REGION`: opted in to the map, account active, profile not private);
- **never the caller's own posts**;
- **never a collector in a block relation with the caller, in either direction**
  (`DiscoverySql.notBlocked`), left out in the SQL before the limit, like every discovery list;
- **new cards**: effectively public (`InventoryItemRepository.LISTED`: the card, its binder and its
  owner public right now), fresh (`ACTIVE` or `AGING`) cards of the game, dated by
  `inventory_item.listing_changed_at` while `publicly_listed` (the time the card became public),
  grouped per collector and per clock hour (UTC); the cards filed in a deck core are **not**
  new-card posts, the deck core's post covers them (as `excludeDeckCoreItems` does for card
  holders);
- **wishes** of collectors who show their wishlist (`privacy_settings.wishlist_visible`), for a card
  of the game, dated by `wishlist_item.created_at` (a wish made before its owner turned "Show my
  wishlist" on is not posted again);
- **deck cores**: public, unsold (`sold_at IS NULL`) deck cores of the game (a binder that also
  holds another game's card, or whose cover is one, is no deck core of any game, as on Search),
  dated by the later of `binder.listing_changed_at` (the binder became public) and
  `binder.core_since` (V133: it became a deck core).

### The page

| Field | What |
| --- | --- |
| `region`, `game`, `kind` | what was read |
| `windowDays` | the window (30) |
| `items` | the posts of this page |
| `nextCursor`, `hasMore` | the next page, `null` / `false` after the last |
| `gameHasPosts` | the game has a post of any kind in the window, whatever `kind` (first page; `true` on later pages): `false` is the empty state without chips (screen 10c) |
| `regionHasPosts` | the region has a post of any kind and game in the window: with `gameHasPosts` false, the phone says "Nothing new in {game} yet" (`true`) or "Nothing new in {region} yet" (`false`) |

### A post

Every post: `id` (stable across pages and refreshes: the wish's id, the binder's id, or for new
cards `md5('NEW_CARDS:<owner id>:<hour>')` read as a UUID, `FeedRules.cardsPostId`), `kind`
(`NEW_CARDS`, `WANTED` or `DECK_CORE`), `at` (when it became public; the newest card of a group),
`collector {id, handle, displayName, avatarUrl}` (`id` added for "Message" and "I have it", which
open the chat with that collector) and `place` (the `Place` of other public responses: region,
country and subdivision codes and names, `label`; never a city). Exactly one of the following is
set, by kind (the others are `null`):

| Kind | Field | Content |
| --- | --- | --- |
| `NEW_CARDS` | `newCards` | `total` (the cards of the group) and `previews`, the newest 4 at most, newest first: `{itemId, cardId, printingId, name, printingCode, rarity, imageUrl, askingPriceText, askingPrice, currency}` (`itemId` for "Message", which pins that card; the amount for a price set before stage R2 or on the web) |
| `WANTED` | `wanted` | `{wishId, cardId, name, imageUrl, printing, rarity, nearMintOnly, priceTerm}`: what the Wishlist segment's terms formatter reads (`printing` is the `PrintingSummary` of a one-printing wish, `null` for any printing; `priceTerm` the `WishPriceTerm`) |
| `DECK_CORE` | `deckCore` | `{binderId, name, askingPriceText, photoUrl, photoCount, previewImages, noteFirstLine}`: the first photo and the number of photos; for a core without photos, up to 3 of its key cards' pictures; the first non-empty line of its public note, at most 120 characters (the last one "…" when cut) |

**Pictures.** Card pictures come only through `/api/v1/public/card-images/{id}` (or the
catalogue's placeholder path), photos through their stored public media URLs; never a provider URL
(ADR 0015).

**No cache.** A page is the caller's own (their posts and blocks are left out): nothing is cached
in Redis. Each page runs one query for the posts, one for the cards of the new-card groups, and the
existing public reads of the cards, wishes, deck cores and collectors of the page.

## V133

`binder.core_since timestamptz` (nullable): when the binder last became a deck core. A trigger
(`trg_binder_core_since`, `BEFORE INSERT OR UPDATE OF sells_as_core, core_since`) sets it when
`sells_as_core` turns on (or a binder is made as a deck core) unless the write names it, and clears
it when the switch turns off. Existing deck cores take their creation time (never newer than the
truth). Without it, a public binder switched to a deck core kept its old listing time and never
reached Home. Two indexes for the window: `ix_inventory_item_listed_since`
(`listing_changed_at` of publicly listed live cards) and `ix_wishlist_item_created`.

## The local seed

`db/seed/inventory.json` dates the seed's public cards and binders relative to the API's start
(`listedMinutesAgo`, written again at every start; everything else 45 days back, outside the
window) and keeps the rows Home shows confirmed no earlier than that; the wishlist seed does the
same for three wishes. In Americas (North), Yu-Gi-Oh!: collector5's 12 cards 5 minutes ago and
one card 6 hours ago, collector2's wish (1 hour) and deck core "Moth Queen core" ($95, 3 hours),
collector5's wish (2 days), collector2's 3 cards (3 days), collector5's deck core "Monarch
core" ("Trade only", 4 days), collector1's 5 cards (9 days) and collector5's wish (12 days)
(`docs/development/seed-data.md`, "Home's feed").

## Privacy and tests

`GeoPrivacyContractTest.homeFeedCarriesPlacesOnly` reads the feed as every seed account, in every
region and game and with every kind: places only, never a city (not even on the poster's own
post), a coordinate, a distance or a private note, never the reader's own post, never a collector
who is not discoverable; the seed's Yu-Gi-Oh! feed holds all three kinds. `FeedIT` (each kind,
the hour, the window, a binder turned into a deck core, paging, region and game scoping, the caller
left out, blocks both ways before the limit, a hidden wishlist, a private and a stale card, cards in
a public deck core, a sold deck core, a collector who leaves the map, validation), `FeedRulesTest`
(the window, the hour, the post id, the note line, the limit, the filter), `SeedDataRunnerIT`
(`seedsHomesFeedRelativeToNow`).
