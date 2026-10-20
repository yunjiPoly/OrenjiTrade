# Stage R5 contract — Search

> Owner spec 2026-10-14 ([`docs/product/specs/2026-10-14-phone-redesign.md`](../../product/specs/2026-10-14-phone-redesign.md)),
> sections 8 (mockup screens 11 to 15), 12 ("Search, wishlist and recent searches"), 13 and 16
> (defaults 2, 7, 8 and 9). Extends [phase4-map-search.md](phase4-map-search.md) (search, card
> holders), [s2-wishlist.md](s2-wishlist.md) (the wishlist) and
> [r3-binders-deck-cores.md](r3-binders-deck-cores.md) (the search API R3 built for this stage).
> Every change is additive: the paused web keeps every field and every generated call it uses (its
> `listWishlist()` keeps its signature: the region of "Available" has its own endpoint). No
> migration. Field-level truth: `../openapi.json`.

All under `/api/v1`. Places are a state or province and a country (ADR 0017): never a city, a
coordinate or a distance. Lists that page or count leave both directions of a block out in SQL,
before the limit and of the count (`DiscoverySql.notBlocked`).

## Collectors while a card is typed

`GET /search/collectors?q=&region=&limit=3` (auth optional) → `[CollectorByName {id, handle,
displayName, avatarUrl, place}]`.

- The "Collectors" section under the cards of the phone's card search (screen 12; default 7 of
  section 16: the card search also lists matching collectors).
- Discoverable collectors (opted in, listed, with a location) of `region` (default: the caller's
  home region, else `americas-north`; 400 for an unknown code) who allow name search
  (`searchDiscoverable`), whose handle (a leading `@` is ignored) or display name **contains**
  `q`, accent- and case-insensitively. No fuzzy match: a card name must not bring unrelated
  collectors.
- Order: a handle that starts with the text, then a display name that does, then by handle.
- `limit` 1 to 10 (default 3); `q` 1 to 100 characters (400 otherwise).
- Never the caller, never a collector blocked with them in either direction: left out in SQL,
  before the limit (`CollectorSearchRepository.byName`).
- Emits **no** analytics event.

## Who has this card

`GET /search/card-holders?…&sort=province` (new sort value; `freshness` and `price` unchanged).

- The holders grouped by state or province for the card page (screen 13): the caller's **own
  state or province first**, then the **other ones of the caller's country**, then the **rest of
  the region**, by country name and then by state or province name; inside a group the freshest
  listing first (the `freshness` order). The pure rule is `search.domain.ProvinceOrder` (unit
  tested); the SQL mirrors it with the caller's declared codes only (a subquery on
  `user_location`). A caller signed out or without a location gets every holder in the last tier.
- The phone passes `excludeDeckCoreItems=true` with it (R3): a deck core's cards never show as
  rows; `GET /search/deck-cores?cardId=&region=&limit=3` (R3) gives the "Also in a deck core"
  banner.
- The phone groups consecutive rows by `collector.place.subdivisionCode`; no group count, no
  holder count is shown.
- **`rarity`** (optional, review fix 1, additive; at most 64 characters, exact, blank = none):
  only the printings of the card in that rarity, as the catalogue names it (`p.rarity`), in the
  rows and in `totalItems` alike. The card page passes it when a wish of any printing in one
  rarity opens it (`/cards/<id>?rarity=`, "Available" and the wishlist alert), so the page lists
  what the wish counts as available (`GET /wishlist/availability` matches the same way).
- "Any printing ▾" uses `printingId` (exactly one of `printingId`, `cardId`, as before).
- 400 for an unknown sort: "must be freshness, price or province".

## Wishlist availability

`GET /wishlist` items gain `available` (boolean, always sent): computed for the **caller's home
region** (else `americas-north`).

`GET /wishlist/availability?region=` → `WishlistAvailability {region, available: [wish id]}`: the
caller's wishes "Available" in `region` (default: the home region; 400 for an unknown code), in the
order of the list. The phone's Wishlist segment asks it for the region it browses. Ids only: no
count, no holder, no place. `POST` and `PATCH /wishlist` answer with `available` for the home
region.

A wish is available while at least one item:

- fits it as for the wishlist alert (`WishlistAlertRules`): the wished printing, or any printing
  of the wished card of the wished rarity when one is set; with "Near Mint only", Near Mint or
  better, or a condition the owner did not state (default 5 of section 16);
- is one buyers see (`InventoryItemRepository.SHOWN_PUBLICLY`): listed on its own, or a card of an
  effectively public, unsold deck core (Who has this card then shows the core in its banner);
- is fresh (ACTIVE or AGING);
- belongs to a discoverable, listed collector with a location in the region, who is not the
  wisher, with no block in either direction.

**One grouped query** for the whole wishlist (`WishlistAvailabilityRepository`: the wishes joined
to the fitting printings and items, `GROUP BY w.id`), never one query per wish.

## The collectors section of `GET /search` (hardening list)

`GET /search?types=collectors…` now leaves the collectors in a block relation with a signed-in
caller out **in SQL**, before the limit and of the count (`CollectorSearchRepository.discover(…,
viewerId, …)`); the 60-second discovery cache keeps such a caller's page under a key that carries
the caller (hashed with the rest of the request). Before, they were dropped after the limit and a
page came back short. The markers step still drops a collector blocked after the page was cached.

## Analytics (hardening list)

`search_performed` and `search_no_results` no longer carry the search text (`payload.query`): only
`query_length`, the surface, the game, the filter names, the result count and the region. A text
may name a collector (collectors are found by handle while a card is typed), and the phone's
recent searches promise "Only you see your searches".

## On the phone only (no API)

- Recent searches: up to 8 per account, on the device (AsyncStorage), newest first; Settings ›
  Privacy › "Remember my searches" (on by default) clears them and stops them while off. There is
  no server history (default 2 of section 16).
- "Check TCGplayer price": the phone opens
  `https://www.tcgplayer.com/search/{yugioh|pokemon|magic}/product?q={name}` in the browser,
  `/search/all/` for a game TCGplayer has no category for (default 9). Nothing is fetched from or
  stored about TCGplayer.

## Privacy

`GeoPrivacyContractTest.searchOfStageR5CarriesPlacesOnly` signs in anonymously, as a new account
and as a seed collector, and checks the collectors by name of every region, the province-sorted
card holders without a deck core's cards, the wishlist with `available` and the availability of
every region: a state and a country, never a city, a coordinate, a distance key or a number with
more than 3 decimals, never a collector who is not discoverable, never an item's private note.
