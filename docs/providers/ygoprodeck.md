# YGOPRODeck (Yu-Gi-Oh! TCG catalog and card images)

OrenjiTrade imports the real Yu-Gi-Oh! Trading Card Game catalog from YGOPRODeck through
`YgoProDeckCardProvider` (`apps/api/.../cards/infra/ygoprodeck`), behind the game-agnostic
`CardProvider` interface ([ADR 0005](../architecture/adr/0005-multi-tcg-data-model.md)) and the
capped card image cache ([ADR 0015](../architecture/adr/0015-card-images-provider-hosting-capped-cache.md)).

Source of truth for everything below: the provider's API guide, <https://ygoprodeck.com/api-guide/>
(verified 2026-10-01). Re-check it before changing the adapter.

## Endpoints used

| Endpoint | Use | Calls |
| --- | --- | --- |
| `GET https://db.ygoprodeck.com/api/v7/checkDBVer.php` | `[{"database_version": "147.20", "last_update": "2026-09-28 00:05:08"}]` — called first by every sync | 1 per import |
| `GET https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes` | the complete card catalog in one response (≈ 25 MB JSON, 14,592 cards on 2026-10-01) | 1 per new database version |
| `GET https://db.ygoprodeck.com/api/v7/cardsets.php` | every set with code, name, card count and TCG release date | 1 per new database version |
| `GET https://images.ygoprodeck.com/images/cards/<imageId>.jpg` | full-size artwork (≈ 128 KB, 421 × 614 JPEG) — only by the image cache | 1 per artwork ever cached |

`cards_small` (≈ 21 KB, 168 × 246) is smaller than the 320 px rendition OrenjiTrade shows (no
upscaling), and `cards_cropped` (art only) is not needed; neither is downloaded.

## Rules we follow (provider terms)

- **Rate limit:** 20 requests/second; exceeding it blocks the IP for one hour. OrenjiTrade paces
  requests per host at `YGOPRODECK_REQUESTS_PER_SECOND` (default **5**; the application refuses to
  start above 15) and retries only transient failures (timeouts, connection errors, 5xx, 429 with
  `Retry-After`), with exponential backoff. Other 4xx answers are never retried.
- **No hotlinking:** the guide forbids continually hotlinking its images and asks clients to
  download and re-host them (otherwise the IP is blacklisted). The provider is therefore
  `REHOST_REQUIRED`: browsers only ever receive OrenjiTrade's own
  `/api/v1/public/card-images/{id}` URLs (cached file, on-demand fill or placeholder); the source
  URLs stay in `card_image.source_url` on the server. A contract test (`CardImageUrlContractIT`)
  scans every DTO with card imagery for provider URLs.
- **Store data locally, minimise calls:** the guide asks clients to store the data they pull
  locally and keep API calls to a minimum. Each sync calls `checkDBVer.php` first; when a raw snapshot of that `database_version` exists under
  `PROVIDER_DATA_DIR/ygoprodeck/<version>/` (default `apps/api/.local-dev/provider-data/`,
  git-ignored) it is reused without any further call. Images are downloaded once into the capped
  local cache and served from there.
- **Descriptive User-Agent:** `OrenjiTrade-catalog-importer/0.1 (+https://www.orenjitrade.com)`.
- **Never in tests or CI:** the test profile points the adapter at closed local ports; tests use an
  offline stub (`YgoProDeckStub`) with fictional fixtures and images generated in memory.

## Mapping to the generic model

| YGOPRODeck | OrenjiTrade |
| --- | --- |
| card `id` (passcode) | `card.external_ref = {"provider": "ygoprodeck", "id": "<id>"}` |
| `name`, `desc` | `card.name`, `card.text` |
| `type` | `card.card_type` Monster / Spell / Trap / Skill / Token |
| `typeline` (without the race), spell/trap `race` | `card.subtype` (e.g. `Fusion / Effect`, `Quick-Play`) |
| `attribute`, `level` (rank for Xyz), `linkval`, `linkmarkers`, `scale`, `atk`, `def`, `race`, `archetype`, `frameType`, `misc_info.konami_id` | `card.metadata`: `attribute`, `level` / `rank`, `linkRating`, `linkMarkers`, `pendulumScale`, `atk`, `def`, `monsterType` (monsters) or `property` (spells/traps), `archetype`, `frameType`, `konamiId` (yugioh GameSchema, migration V101) |
| `cardsets.php` products sharing a code (e.g. LOB and its 25th Anniversary edition) | one `card_set` per code, named after the largest product; the others in `metadata.products` |
| `card_sets[]` entry (`set_code` LOB-EN001, `set_rarity`, `set_rarity_code`, `set_price`) | one `card_printing` per code and rarity: `printing_code`, `collector_number` (after the dash), `rarity` (spelling variants unified), `language` `en`, `finish` `NORMAL`, `edition` `UNLIMITED` (YGOPRODeck has no edition; collectors record the edition of their own copy on the inventory item), `metadata.rarityCode`, `metadata.setName` when the product differs from the set name, `set_price` > 0 → indicative `market_price` in USD dated by `last_update` |
| `card_images[]` (`id`, first = default artwork) | one `card_image` per artwork (`provider_image_id`, `position`, `source_url`), `card.image_id` = first; printings show their card's primary artwork |

Provider data errors are skipped and listed as warnings in the import report (invalid printing
codes such as `DB49`; a code and rarity claimed by two different cards: the lower card id keeps it).

## Commands

```bash
npm run catalog:import -- --game yugioh --provider ygoprodeck --images referenced   # metadata + referenced artworks
npm run catalog:import -- --game yugioh --provider ygoprodeck --images limit:60      # metadata + 60 artworks
npm run card-images:status
npm run card-images:clear -- --yes --game yugioh
```

The admin console equivalent is `POST /api/v1/admin/catalog/sync` with `provider: ygoprodeck` and
`imageMode`. See [local setup](../development/local-setup.md#card-images-and-the-real-yu-gi-oh-catalog).

## Copyright and attribution

Yu-Gi-Oh! card names, texts and images are © 4K Media Inc., a subsidiary of Konami Digital
Entertainment, Inc. Card data and images are provided by YGOPRODeck (<https://ygoprodeck.com>).
Suggested attribution wherever real card data or images are shown:

> Card data and images courtesy of YGOPRODeck. Yu-Gi-Oh! is a trademark of Konami Digital
> Entertainment, Inc.; card content © 4K Media Inc. OrenjiTrade is not affiliated with Konami or
> 4K Media.

The web app shows this wording (`apps/web-angular/src/app/shared/catalog/card-data-attribution`)
in the footer of every page and on the card and set pages of Yu-Gi-Oh! cards, with a
`noopener noreferrer` link to <https://ygoprodeck.com>. Pictures are only ever loaded from
OrenjiTrade's own routes; `e2e/card-images.spec.ts` blocks the provider's hosts and fails on any
request, `img` source or API answer pointing at `images.ygoprodeck.com`.

**Before any public launch** a production legal review is required: the provider's terms for
commercial use, the right to re-host and display card images, trademark use and the attribution
wording (tracked with the other legal items, acceptance criterion 38). Until then the real catalog
is a local development and demo feature only.
