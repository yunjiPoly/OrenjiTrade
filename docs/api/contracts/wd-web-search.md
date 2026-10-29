# Web stage WD contract — Search, Who has this card, sets, binders and deck cores

> Owner prompt of 2026-10-28 ([`docs/product/specs/2026-10-28-web-redesign-stages.md`](../../product/specs/2026-10-28-web-redesign-stages.md)),
> stage WD (boards W3 to W9), spec [`2026-10-20-web-redesign.md`](../../product/specs/2026-10-20-web-redesign.md)
> sections 6, 7 and 8. Extends [phase3-inventory.md](phase3-inventory.md) (public binder items) and
> [r3-binders-deck-cores.md](r3-binders-deck-cores.md). One optional query parameter; no new
> endpoint, field or migration. The phone sends no `sort` and reads the same order as before.
> Field-level truth: `../openapi.json`.

## The sort of a public binder's cards

`GET /public/binders/{id}/items?…&sort=name|recent|price` (auth optional, as before).

| `sort` | Order | Used by |
| --- | --- | --- |
| absent, blank or `name` | by card name, then set code, collector number and item id (unchanged) | the phone, the web before WD |
| `recent` | the newest first (`created_at DESC`, then the item id) | the web's binder page by default ("Recently added", spec 8.2) |
| `price` | the lowest plain amount first, then a price that is no plain amount (`askingPriceText` only, "85% TCG"), then the cards without a price; the card name and the item id break ties | the web's sort pill "Price" |

- Any other value is a 400 `VALIDATION_FAILED` with the field `sort` ("must be name, recent or
  price"); at most 16 characters (`@Size`). Case does not matter.
- Every order ends on the item id, so offset pages never overlap or skip a card.
- The filters (`game`, `query`, `availability`), the page size and the privacy rules are as before:
  only cards that are public right now, never a private note, never a coordinate.
- **Reading the items never spends a binder view** (`binder.views.per_day`): only
  `GET /public/binders/{id}` does, once per binder and UTC day for a signed-in caller other than the
  owner. The web reads the binder itself only on an explicit open (a click or Enter on a row, the
  binder page), never on hover, focus, listing or prefetch (owner decision 14 of the web spec).

## What the web reads for the stage (no change)

| Screen | Endpoints |
| --- | --- |
| Search › Cards | `GET /cards/suggest?q&game`, `GET /search/collectors?q&region&game&limit=3` (members only) |
| Search › Binders and the map | `GET /regions/{region}/binder-counts?game`, `GET /regions/{region}/subdivisions/{code}/binders?game&deckCore&q&cursor&limit`, `GET /regions/{region}/binders?game&deckCore&q&cursor&limit` |
| A binder or deck core (beside the list, its page) | `GET /public/binders/{id}` (spends the view), `GET /public/binders/{id}/items?sort&query&page&size`, `GET /collectors/{handle}` (the owner's rating) |
| Search › Wishlist | `GET /wishlist`, `GET /wishlist/availability?region&game`, `GET` and `PUT /me/settings/notifications` (`wishlistAlerts`), `PUT /me/settings/privacy` (`wishlistVisible`), `POST`, `PATCH` and `DELETE /wishlist` |
| Who has this card | `GET /cards/{id}`, `GET /search/card-holders?cardId` (or `printingId`) `&region&sort=province&excludeDeckCoreItems=true&rarity&page&size`, `GET /search/deck-cores?cardId&region&limit=3` |
| A set page | `GET /sets/{id}?page&size=200`, `GET /cards?set&size`, `GET /binders` (own binders of the set's game), `POST /inventory/items` once per tile ("Add from this set": one create per tile until a batch create is offered on the web, spec 7.5) |
| The game pill | `GET /games` (`hasCards`), `GET /me/profile` (the profile's games, the first browsable one is the default) |

Places stay a state or province and a country (ADR 0017): the web shows the province (and the
country of another country's group on Who has this card), never a city outside its owner's profile,
a coordinate or a distance. No count in search results; the map's binder and deck core counts are
the allowed ones (spec 17).

## Tests

`PublicBinderIT.publicBinderItemsSortByNameNewestOrPrice` (the three orders, the default, the 400,
no binder view spent by the items), `PublicSortTest` (the parse), `PublicOrderTest` (every order
ends on the item id). The response is the existing `PublicInventoryItem`, which returns no place,
so `GeoPrivacyContractTest` is unchanged (it already covers the public binder and its owner block).
