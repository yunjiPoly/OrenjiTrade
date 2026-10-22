# Scryfall (Magic: The Gathering catalog and card images)

OrenjiTrade imports the Magic: The Gathering catalog from Scryfall through `ScryfallCardProvider`
(`apps/api/.../cards/infra/scryfall`), behind the game-agnostic `CardProvider` interface
([ADR 0005](../architecture/adr/0005-multi-tcg-data-model.md)) and the capped card image cache
([ADR 0015](../architecture/adr/0015-card-images-provider-hosting-capped-cache.md)); the choice of
source is [ADR 0021](../architecture/adr/0021-five-games-and-their-card-sources.md) (stage R10).

Source of truth for everything below: Scryfall's API documentation,
<https://scryfall.com/docs/api> and <https://scryfall.com/docs/api/bulk-data>. The adapter was
written from the published format and tested on hand-written fixtures only (agents never call
Scryfall); re-check the documentation before the first real import and before changing the
adapter.

## Endpoints used

| Endpoint | Use | Calls |
| --- | --- | --- |
| `GET https://api.scryfall.com/bulk-data` | the list of daily bulk files; the adapter takes the one of type `unique_artwork` (its `updated_at` and `download_uri`) | at most 1 a day |
| `GET <download_uri>` on `https://data.scryfall.io/` | the "Unique Artwork" bulk file: one card object per artwork, about 50,000 objects | 1 per new `updated_at` |
| `GET https://cards.scryfall.io/normal/front/…/<id>.jpg` | the `normal` image (488 px wide JPEG) of one artwork — only by the image cache | 1 per artwork ever cached |

No per-card API call is made. The `art_crop`, `border_crop` and `png` images are never used (no
crops; the 320 px rendition does not need the larger files).

## Rules we follow (provider terms)

- **A `User-Agent` and an `Accept` header on every request:** `OrenjiTrade-catalog-importer/0.1
  (+https://www.orenjitrade.com)` and `application/json;q=0.9,*/*;q=0.8` (images: `image/jpeg`).
- **At most 10 calls a second:** Scryfall asks for 50 to 100 ms between requests. Requests are
  paced per host at `SCRYFALL_REQUESTS_PER_SECOND` (default **8**; the application refuses to start
  above 10) and only transient failures are retried (timeouts, connection errors, 5xx, 429 with
  `Retry-After`), with exponential backoff.
- **The bulk file, refreshed at most daily:** a stored file younger than 24 hours is reused without
  any call; after that, one `GET /bulk-data` call, and a download only when it names a newer
  `updated_at`. The raw file is kept under `PROVIDER_DATA_DIR/scryfall/<updated_at>/bulk.json`
  (default `apps/api/.local-dev/provider-data/`, git-ignored). `SCRYFALL_SNAPSHOT_ONLY=true` imports
  the newest stored file without any call.
- **Images unaltered except for the size:** the 320 px JPEG rendition is the only change; images
  are never cropped, covered, recoloured or watermarked.
- **No hotlinking:** the provider is `REHOST_REQUIRED` like every provider (ADR 0015, ADR 0021):
  clients only receive OrenjiTrade's own `/api/v1/public/card-images/{id}`; the source URLs stay in
  `card_image.source_url`, and only URLs of the configured image host matching the card image
  pattern are downloaded (SSRF guard). A bulk `download_uri` outside the configured bulk host is
  refused.
- **No implied endorsement:** OrenjiTrade never says or suggests that Scryfall endorses it.
- **Never in tests or CI:** the test profile points the adapter at closed local ports in
  snapshot-only mode, the end-to-end harnesses turn it off (`SCRYFALL_ENABLED=false`), and the
  tests use the fictional fixture `src/test/resources/scryfall/unique-artwork-fixture.json`
  through an offline stub (`CardSourceStub`).

## Mapping to the generic model

| Scryfall card object | OrenjiTrade |
| --- | --- |
| `lang` ≠ `en`, `digital`, `games` without `paper` | left out (English paper cards only), counted in the report's warnings |
| `layout` `art_series`, `token`, `double_faced_token`, `emblem`; `oversized` | left out, counted |
| `oracle_id` (a reversible card's: its first face's) | `card.external_ref = {"provider": "scryfall", "id": "<oracle_id>"}`: one card per Oracle card |
| `name`, `oracle_text` (faces' texts joined by `//`) | `card.name`, `card.text` |
| front face's `type_line` | `card.card_type` (before the dash: `Legendary Creature`) and `card.subtype` (after it: `Elf Druid`) |
| `mana_cost` (faces joined), `cmc`, `color_identity`, `type_line`, `power`, `toughness` | `card.metadata`: `manaCost`, `manaValue`, `colorIdentity`, `typeLine`, `power`, `toughness` (mtg GameSchema) |
| `set`, `set_name`, `set_id`, `set_type`, earliest `released_at` | one `card_set` per set code (upper-cased), `metadata.setType` |
| card object `id`, `set` + `collector_number` | one `card_printing` per artwork: `collector_number`, `printing_code` `<SET>-<NUMBER>` when it fits the code pattern (`★7` does not: no code), edition `UNLIMITED`, language `en` |
| `rarity` | `Common`, `Uncommon`, `Rare`, `Mythic Rare`, `Special`, `Bonus` |
| `finishes` | `finish` = `NORMAL` if non-foil exists, else `FOIL`, else `ETCHED`; the list in `metadata.finishes` (collectors record the finish of their own copy) |
| `artist`, `promo` | `metadata.artist`, `metadata.promo` |
| `illustration_id` (the front face's), `image_uris.normal` | one `card_image` per artwork (`provider_image_id` = illustration id, `source_url` server-side); the printing points at it (`card_printing.image_id`); the card's primary artwork (`card.image_id`) is its earliest printing's |
| `image_status` `missing` or `placeholder` | no artwork: the placeholder shows |
| `prices` | not imported |

An artwork listed by two Oracle cards stays with the first and is reported.

### What "Unique Artwork" leaves out (owner decision)

"Unique Artwork" holds one card object per artwork, the printing Scryfall picked for the best
scan. A reprint that shares its artwork with another printing (core sets, Commander decks, Masters
sets) has no card object there, so its set code and collector number are not in the catalogue: the
card and its picture are, but a collector cannot list the exact printing they own. The owner's
prompt names this file, so stage R10 keeps it. The alternative, for the owner to decide: Scryfall's
**"Default Cards"** file (every card object in English, or in its printed language when it has no
English version; "All Cards" is the one with every language). With today's English paper filter it
gives every English paper printing, and the importer already keeps one image per
`illustration_id` across printings, so the picture cache stays about 1.9 GB while the bulk file and
the printing rows grow. Switching is additive (the next import adds the missing printings; nothing
imported changes) and needs a small change: the bulk type `default_cards` with a snapshot folder of
its own (the stored file is reused for 24 hours whatever the bulk type). See ADR 0021.

### Codes typed as printed

A Magic printing code is `<SET>-<NUMBER>` with Scryfall's unpadded collector number (`ZTK-12`).
The card prints the set code apart from a padded number (`ZTK`, `0012`), so `GET /cards`,
`GET /cards/suggest` and the unified search read a space as the dash and, only when the code as
typed finds no printing, the number without its leading zeros (`ZTK 0012`, `ztk - 012` and
`ZTK-012` find `ZTK-12`). That unpadded number is the whole number: a suggestion lists `ZTK-12`
and `ZTK-12P`, never `ZTK-120` (review fix 2). A code typed without any separator (`ztk12`) is
not guessed: a set code may end in a digit (`M21`).

## Commands

```bash
npm run catalog:import -- --game mtg --provider scryfall --images all     # metadata + every artwork (about 1.9 GB)
npm run catalog:import -- --game mtg --provider scryfall --images limit:60
npm run card-images:status
```

The admin console equivalent is `POST /api/v1/admin/catalog/sync` with `provider: scryfall`.

## Copyright and attribution

Card data and images courtesy of Scryfall (<https://scryfall.com>). Magic: The Gathering card
names, texts and images are property of Wizards of the Coast. Wording shown wherever Magic card
data or images are shown (the phone's credit under a card's pictures, `CARD_DATA_ATTRIBUTIONS` in
`apps/mobile/src/lib/cardImages.ts`; Settings › Appearance lists "Magic card data and images from
Scryfall."):

> Card data and images courtesy of Scryfall. OrenjiTrade is unofficial Fan Content permitted under
> the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are
> property of Wizards of the Coast. ©Wizards of the Coast LLC.

**Draft for the lawyer review.** Before any public launch a legal review is required: Scryfall's
terms for this use, Wizards of the Coast's Fan Content Policy (OrenjiTrade is free for everyone,
ADR 0019) and the notice's wording.
