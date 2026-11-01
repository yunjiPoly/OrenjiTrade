# Stage G contract — One game at a time

> Owner prompt of 2026-10-19/20 ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section G (mockup v50 screens 34 and 35, changes to 10 to 18). Extends
> [phase2-catalog.md](phase2-catalog.md) (the games), [phase3-inventory.md](phase3-inventory.md)
> (binders and items), [phase4-map-search.md](phase4-map-search.md) and [r5-search.md](r5-search.md)
> (the discovery reads) and [s2-wishlist.md](s2-wishlist.md). Three migrations (V130, V131 and,
from review fix 1, V132). Every
> change is additive: new response fields, optional request fields and optional query
> parameters, two new error codes and a new bulk skip reason; the paused web builds and passes
> its checks against the regenerated client, unchanged. Field-level truth: `../openapi.json`.

All under `/api/v1`. Places stay a state or province and a country (ADR 0017); nothing here adds
a place, a count to search results or a paid feature (ADR 0019).

## Games

| Change | What |
| --- | --- |
| One Piece | V130: slug `onepiece`, "One Piece Card Game", short name "One Piece", publisher Bandai, `ACTIVE`, sort order 35 (between Magic 30 and Riftbound 40). GameSchema: the six conditions, edition `UNLIMITED`, language `en` only (owner order of 2026-10-20: English cards only), finishes `NORMAL` and `PARALLEL` (a parallel art is a second printing of the same code whose finish is `PARALLEL`), rarities `C`, `UC`, `R`, `SR`, `SEC`, `L`, `SP`, `TR`, `P` (the official card list's), metadata `colors`, `category`, `cost`, `power`, `counter`, `life`, `attribute`, `types` |
| `hasCards` | `GET /games` and `GET /games/{slug}` (and the admin's game responses) carry `hasCards`: whether the catalogue holds a card of the game (`EXISTS` over `card`). A game without cards can be on a profile, but is not browsed on the phone and holds no binder. The games cache (`games:v2`, 60 s) is dropped after every catalogue import, so a game's first cards show at once |

## Binders hold the cards of one game

`binder.game_id` (V131, `NOT NULL`, FK to `game`) and `binder.game_follows_cards` (V131, default
`false`; since V132 `game_id` defaults to Yu-Gi-Oh! and `game_follows_cards` to `true`, so an
insert that names neither, as the app version before stage G makes them, is a binder that follows
its cards; the app names both). Responses: `BinderResponse` gains `game` (the slug), `gameId` and,
from review fix 1, `gameLocked` (the game can't change now: the binder holds a card, or a card
deleted or sold from it can still come back with an undo; exactly when `PATCH` answers 409
`BINDER_GAME_LOCKED`), always sent.

| Request | Rule | Error |
| --- | --- | --- |
| `POST /binders` | `gameId` (optional in the schema): an `ACTIVE` game with cards. The phone always sends it. Without it (the paused web, which has no game picker) the binder **follows its cards** (`binder.game_follows_cards`): it takes the game of the first card filed in it while it holds none (Yu-Gi-Oh! until then) and refuses no card, as the web's binders always did (its suites file several games into one binder). The one-game rules below apply to every other binder | 400 `VALIDATION_FAILED`, field `gameId`, for an unknown, hidden or card-less game |
| `PATCH /binders/{id}` | `gameId` (not null) changes the game only while the binder holds no card: no live card, and no deleted card that an undo can still bring back (`restorable_until` not passed: the owner's delete, a sale) | 409 `BINDER_GAME_LOCKED`; 400 as above |
| `POST` and `PATCH /binders` `coverPrintingId` (review fix 1) | a binder that has its game (made with `gameId`, or given one by a `PATCH`) takes a cover printing of that game only; a new game in a `PATCH` needs a cover of that game or `coverPrintingId: null`. A binder that follows its cards refuses no cover. V132 cleared the covers of another game that V131 kept | 409 `BINDER_GAME_MISMATCH` |
| `POST /inventory/items` with `binderId` | the card's game is the binder's | 409 `BINDER_GAME_MISMATCH` |
| `PATCH /inventory/items/{id}` | a move into a binder, or another printing while filed, keeps the card's game equal to the binder's (a printing of another game may leave the binder in the same request with `binderId: null`) | 409 `BINDER_GAME_MISMATCH` |
| `POST /inventory/items/bulk` `MOVE_TO_BINDER` | per card: a card of another game is skipped with reason `BINDER_GAME_MISMATCH` and stays where it was; the others move | none (200 with `skipped`) |
| `POST /inventory/items/batch` (the camera scan) | every line's card is of the binder's game: the whole batch or nothing | 409 `BINDER_GAME_MISMATCH`, nothing written |

Every one of these writes keeps the lock rule (docs/database/schema.md, "Locks of binders and
inventory items"): the binder update holds the binder's row lock when it reads `item_count` and
the undoable cards, so no card can come in between the check and the write.

## `game=` on the discovery reads the phone calls

Each endpoint takes the optional **`game`** (a slug of `GET /games`). With it, only that game
counts or is listed; without it, the endpoint answers as before (the paused web). An unknown or
hidden game is a 400 (`VALIDATION_FAILED`, field `game`). The game only narrows: blocks
(`DiscoverySql.notBlocked`, before the limit and in the count), discoverability, regions and
public visibility apply as before. A binder that holds a live card of another game (a binder the
paused web made, which follows its cards and refuses none), whatever that card's visibility, or
whose cover is a card of another game, is left out of every game's counts and lists (review fix 1,
P1): its other cards would show as the browsed game's. Without `game` it shows as before.

| Endpoint | With `game` |
| --- | --- |
| `GET /regions/{region}/binder-counts` | only the binders of the game (`binder.game_id`, holding no card of another game) count, deck cores included; the anonymous cache keys the game (`binder-counts:v2|<region>|game=<slug>`; the key without a game is unchanged) |
| `GET /regions/{region}/subdivisions/{code}/binders`, `GET /regions/{region}/binders` | only the binders and deck cores of the game, with `deckCore` and `q` as before |
| `GET /search/card-holders` | only the copies whose card is of the game (`totalItems` counts the same rows): a card of another game has no holders. The phone sends no `game` here: the card says which game it is |
| `GET /search/deck-cores` | only the deck cores of the game (holding no card of another game) |
| `GET /search/collectors` | only the collectors who list the game on their profile or show a public card of it |
| `GET /wishlist/availability` | only the ids of the caller's wishes of the game |

`GET /wishlist` takes no parameter (a first parameter would change the paused web's generated
call): the phone keeps the browsed game's wishes from it (each wish carries `game`). The card
search (`GET /cards`, `GET /cards/suggest`) already took `game`.

## Privacy

`GeoPrivacyContractTest.oneGameAtATimeCarriesPlacesOnly` calls every endpoint above with each of
the five games (One Piece without cards included), signed out, as a fresh collector and as two
seed collectors: places only, never a city outside its owner's profile, a coordinate or a private
note, and never a collector who is not discoverable.

## Tests

`BinderGameMigrationIT` (V131 on binders of one game, mixed games, the three ties, empty binders,
deleted cards, the visibility rule, the audit rows, `NOT NULL`), `BinderCoverGameMigrationIT`
(V132: covers of another game cleared, a binder that follows its cards keeps its cover, the
defaults), `BinderGameIT` (create, the lock and `gameLocked` during an undo window, the cover's
game, the mismatch single, bulk and scan batch), `SearchGameIT` (the counts, both binder lists,
holders and their count, deck cores, collectors; a binder made without a game that holds two
games under neither, and one that holds one game's cards under a cover of another game; blocks
both ways with `game=`), `InventoryLockOrderIT` (`PATCH gameId`, the
first card that sets a binder's game), `WishlistAvailabilityIT` (+1), `GamesIT` (One Piece,
`hasCards`), `SeedDataRunnerIT` (every seed binder holds its own game).
