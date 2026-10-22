# Stage R10 contract — Card data for Magic and Pokémon

> Owner prompt of 2026-10-19/20
> ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section "R10. Card data for Magic and Pokémon";
> [ADR 0021](../../architecture/adr/0021-five-games-and-their-card-sources.md). Extends
> [phase2-catalog.md](phase2-catalog.md) (the catalog and its imports) and
> [g-one-game.md](g-one-game.md) (`hasCards`). No new endpoint, no new or retyped field, no
> migration: two more providers for the existing import endpoints, and printings that point at their
> own artwork. The OpenAPI document and the generated clients are unchanged; the paused web builds
> and passes its checks as before. Field-level truth: `../openapi.json`.

## Providers

| Provider id | Game slug | Source | Images |
| --- | --- | --- | --- |
| `ygoprodeck` | `yugioh` | YGOPRODeck (unchanged) | one per artwork |
| `scryfall` | `mtg` | Scryfall's daily bulk file "Unique Artwork": English paper cards ([docs/providers/scryfall.md](../../providers/scryfall.md)) | one per artwork (`illustration_id`) |
| `tcgdex` | `pokemon` | TCGdex's card database, github.com/tcgdex/cards-database (MIT): English cards ([docs/providers/tcgdex.md](../../providers/tcgdex.md)) | one per printing |
| `mock` | every game with a fixture | the fictional catalog (local, dev, test) | placeholders |

- `GET /api/v1/admin/catalog/providers` (ADMIN) lists `scryfall: ["mtg"]` and
  `tcgdex: ["pokemon"]` beside the others while they are enabled (`SCRYFALL_ENABLED`,
  `TCGDEX_ENABLED`, both `true` by default; the end-to-end harnesses and CI turn them off).
- `POST /api/v1/admin/catalog/sync` (ADMIN) and `POST /internal/jobs/catalog-import` (service
  token, `npm run catalog:import`) accept `provider` `scryfall` with `gameSlug` `mtg`, and `tcgdex`
  with `gameSlug` `pokemon`; another pair is a 400 `VALIDATION_FAILED` on `gameSlug` ("the provider
  does not serve this game"), as before. `imageMode` defaults to `REFERENCED` (both offer image
  downloads); the owner's commands use `--images all`.
- A provider that cannot be reached fails the run (status `FAILED`, `error` "… is unavailable …
  The catalog already imported was kept"); the catalogue already imported stays untouched.
- The run's `providerDbVersion` is Scryfall's `updated_at` as 14 digits (`20261020090312`) or
  TCGdex's commit SHA. The report's `warnings` count every row left out, by category ("non-English
  cards skipped", "digital-only cards skipped", "art series cards, tokens and emblems skipped",
  "cards without an English name skipped", "cards of excluded series (digital games) skipped", "data
  files that could not be read skipped", …).
- **`hasCards`** (`GET /api/v1/games`, `GET /api/v1/games/{slug}`, the admin list) turns `true` for
  `mtg` and `pokemon` after their first import (the games cache is dropped after every import); until
  then the phone shows them dimmed with "Cards coming soon". `onepiece` and `riftbound` stay without
  a source (production: `hasCards` false).

## Pictures of Magic and Pokémon printings

- Every provider is re-host-only: every picture URL a client receives is OrenjiTrade's own
  `/api/v1/public/card-images/{id}` (cached file, on-demand fill or placeholder) or the placeholder
  SVG; Scryfall's and TCGdex's URLs never leave the server.
- A Magic or Pokémon printing points at its own artwork. Every representation of a printing shows
  it: `PrintingSummary.images` (`GET /cards/{id}/printings`, `GET /printings/{id}`, set pages,
  inventory items, binders, holders), printing suggestions (`GET /cards/suggest`, kind `PRINTING`).
  Before this stage a printing without its own placeholder image showed its card's primary artwork;
  it still does when the printing has no artwork of its own (Yu-Gi-Oh!).
- A card (`CardSummary.primaryImageUrl`, card suggestions) shows its earliest printing's picture, as
  before; for Magic and Pokémon that is also the card's primary artwork.
- No market price comes from Scryfall or TCGdex (`marketPrice` stays null for their printings).

## Privacy

No representation of a place or a person changes: `GeoPrivacyContractTest` needs no new endpoint.
Catalog data is public game data; the providers are only ever called by the owner's import, never
by a request of a member or visitor.
