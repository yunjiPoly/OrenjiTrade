# TCGdex (Pokémon TCG catalog and card images)

OrenjiTrade imports the English Pokémon Trading Card Game catalog from TCGdex's open card database
through `TcgdexCardProvider` (`apps/api/.../cards/infra/tcgdex`), behind the game-agnostic
`CardProvider` interface ([ADR 0005](../architecture/adr/0005-multi-tcg-data-model.md)) and the
capped card image cache ([ADR 0015](../architecture/adr/0015-card-images-provider-hosting-capped-cache.md));
the choice of source is [ADR 0021](../architecture/adr/0021-five-games-and-their-card-sources.md)
(stage R10). English cards only (owner order of 2026-10-20).

Source of truth: the repository <https://github.com/tcgdex/cards-database> (MIT licence) and
TCGdex's documentation, <https://tcgdex.dev>. The adapter was written from the repository's
published format and tested on hand-written fixtures only (agents never call TCGdex or GitHub);
re-check the repository's layout, the image addresses and the licence before the first real
import and before changing the adapter.

## What is downloaded

| Request | Use | Calls |
| --- | --- | --- |
| `GET https://api.github.com/repos/tcgdex/cards-database/commits/master` with `Accept: application/vnd.github.sha` | the newest commit of the branch (40 hex characters) | at most 1 a day |
| `GET https://codeload.github.com/tcgdex/cards-database/zip/<sha>` | the repository archive of that commit (one zip) | 1 per new commit |
| `GET https://assets.tcgdex.net/en/<serie>/<set>/<number>/high.jpg` | the picture of one printing — only by the image cache | 1 per printing ever cached |

No per-card API call is made: the database is downloaded instead. GitHub requires a `User-Agent`;
unauthenticated calls are limited to 60 an hour, far above one a day.

## Rules we follow

- **Download, don't call per card:** one call for the commit, one archive per new commit, kept raw
  under `PROVIDER_DATA_DIR/tcgdex/<sha>/cards-database.zip` (default
  `apps/api/.local-dev/provider-data/`, git-ignored). An archive younger than 24 hours is reused
  without any call; `TCGDEX_SNAPSHOT_ONLY=true` imports the newest stored archive without any call.
- **Keep the MIT notice:** the repository's `LICENSE` is written beside every stored archive
  (`<sha>/LICENSE`); any copy of the data keeps that notice, and the app credits "Card data
  courtesy of TCGdex (MIT licence)". The licence covers TCGdex's data, not the publisher's card
  artwork (below).
- **A `User-Agent` and an `Accept` header on every request**, paced per host at
  `TCGDEX_REQUESTS_PER_SECOND` (default 5), transient failures retried with backoff.
- **No hotlinking:** `REHOST_REQUIRED` like every provider (ADR 0015, ADR 0021): clients only receive
  `/api/v1/public/card-images/{id}`; the asset URLs stay in `card_image.source_url`, and only
  English card images of the configured asset host are downloaded (SSRF guard).
- **Never in tests or CI:** the test profile points the adapter at closed local ports in
  snapshot-only mode, the end-to-end harnesses turn it off (`TCGDEX_ENABLED=false`), and the tests
  use the fictional repository `src/test/resources/tcgdex/cards-database/` zipped in memory by the
  offline stub (`CardSourceStub`).

## Reading the repository

The `data/` folder holds the international cards (`data-asia/`, the Asian-language cards, is not
read): `data/<Serie>.ts`, `data/<Serie>/<Set>.ts` and `data/<Serie>/<Set>/<number>.ts`, each a
TypeScript module assigning one object literal (`const card: Card = { … }; export default card`).
`TsLiteral` rewrites the literal as JSON without a JavaScript engine: strings in any quotes,
unquoted keys, numbers, nested objects and arrays, trailing commas and comments; a bare reference
(`set: Set`, `serie: serie`) becomes null, since a card's set and serie come from its folder. A file
that is anything else (a function call, a spread, a template placeholder) is skipped and counted in
the import report ("data files that could not be read skipped"), never fatal.

## Mapping to the generic model

| TCGdex | OrenjiTrade |
| --- | --- |
| serie `tcgp` (Pokémon TCG Pocket, a digital game) | left out (`excluded-series`), counted |
| a set or card without `name.en` | left out (English only), counted |
| set `id`, `name.en`, `releaseDate` (or its `en`), `cardCount.official`, serie `name.en` | one `card_set`: code = `abbreviations.official` or `tcgOnline` (`DAA`) when it is a unique 2–10 letter or digit code, else the id without punctuation (`sv03.5` → `SV035`); `metadata.tcgdexId`, `metadata.abbreviation` |
| a card's English `name` | one `card` per name (typographic and straight apostrophes unified): `card.external_ref = {"provider": "tcgdex", "id": "name:<name>"}` |
| `category` | `card.card_type` `Pokémon`, `Trainer` or `Energy` |
| `stage` (`Stage1` → `Stage 1`), `trainerType`, `energyType` | `card.subtype` |
| `hp`, `types`, `stage`, the first weakness | `card.metadata`: `hp`, `types`, `stage`, `weakness` (pokemon GameSchema), from the card's earliest printing |
| `abilities`, `attacks`, `effect` (English) | `card.text` |
| a card file `<set>/<number>.ts` | one `card_printing`: `external_ref.id` `<setId>-<number>`, `collector_number` = the number (`001`, `TG05`), `printing_code` `<SET>-<NUMBER>` when it fits, language `en`, edition `UNLIMITED` |
| `rarity` (`None` → none) | `rarity` as TCGdex writes it (`Common`, `Double rare`, `Promo`, …) |
| `variants` (`{normal, reverse, holo, firstEdition, wPromo}` or a list of `{type}`) | `finish` `NORMAL` if normal exists, else `HOLO`, else `REVERSE_HOLO`; the list in `metadata.variants` |
| `illustrator`, `regulationMark` | `metadata.illustrator`, `metadata.regulationMark` |
| the printing's folder | one `card_image` per printing (`provider_image_id` = `<setId>-<number>`, `source_url` `https://assets.tcgdex.net/en/<serie>/<set>/<number>/high.jpg`); the printing points at it; the card's primary artwork is its earliest printing's |
| prices | not imported |

## Commands

```bash
npm run catalog:import -- --game pokemon --provider tcgdex --images all   # metadata + every printing's picture (about 0.85 GB)
npm run card-images:status
```

The admin console equivalent is `POST /api/v1/admin/catalog/sync` with `provider: tcgdex`.

## Copyright and attribution

Card data courtesy of TCGdex (<https://tcgdex.dev>, MIT licence). Pokémon card names, texts and
images are © The Pokémon Company, Nintendo, Creatures and GAME FREAK; TCGdex's licence does not
cover them. Wording shown wherever Pokémon card data or images are shown (the phone's credit under a
card's pictures, `CARD_DATA_ATTRIBUTIONS` in `apps/mobile/src/lib/cardImages.ts`; Settings ›
Appearance lists "Pokémon card data from TCGdex."):

> Card data courtesy of TCGdex (MIT licence). Pokémon card content is © The Pokémon Company,
> Nintendo, Creatures and GAME FREAK. OrenjiTrade is not affiliated with them.

**Draft for the lawyer review.** Before any public launch a legal review is required: showing
Pokémon card images, the MIT notice's placement, trademark use and the wording.
