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
| `GET https://api.scryfall.com/bulk-data` | the list of daily bulk files; the adapter takes the one of type `unique_artwork` (its `updated_at` and `jsonl_download_uri`; the older `download_uri` is still read, see "The bulk list of 2026-10-28" below) | at most 1 a day |
| `GET <jsonl_download_uri>` on `https://data.scryfall.io/` | the "Unique Artwork" bulk file: gzip-compressed JSON Lines (`.jsonl.gz`, one card object per line, about 39 MB compressed on 2026-10-28), about 50,000 objects | 1 per new `updated_at` |
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
  (default `apps/api/.local-dev/provider-data/`, git-ignored; the name stays `bulk.json` whatever
  the file's shape, see below). `SCRYFALL_SNAPSHOT_ONLY=true` imports the newest stored file
  without any call.
- **Images unaltered except for the size:** the 320 px JPEG rendition is the only change; images
  are never cropped, covered, recoloured or watermarked.
- **No hotlinking:** the provider is `REHOST_REQUIRED` like every provider (ADR 0015, ADR 0021):
  clients only receive OrenjiTrade's own `/api/v1/public/card-images/{id}`; the source URLs stay in
  `card_image.source_url`, and only URLs of the configured image host matching the card image
  pattern are downloaded (SSRF guard). A bulk address outside the configured bulk host is refused:
  it must start with `https://data.scryfall.io/` and the rest must be exactly `<folder>/<file>`
  (letters, digits, `.`, `_`, `-`, the file starting with a letter or digit, so never `.` or `..`;
  no query string, no other host). Redirects are never followed (a `302` is a final answer and its
  target gets no request), so the bulk host cannot send the importer elsewhere.
- **No implied endorsement:** OrenjiTrade never says or suggests that Scryfall endorses it.
- **Never in tests or CI:** the test profile points the adapter at closed local ports in
  snapshot-only mode, the end-to-end harnesses turn it off (`SCRYFALL_ENABLED=false`), and the
  tests use the fictional fixture `src/test/resources/scryfall/unique-artwork-fixture.json`
  through an offline stub (`CardSourceStub`), which serves the bulk list of 2026-10-28 by default
  and the list before it on request.

## The bulk list of 2026-10-28

On 2026-10-28 Scryfall changed `GET /bulk-data`. Each entry now has `object`, `id`, `type`,
`updated_at`, `uri`, `name`, `description`, `jsonl_download_uri` and `compressed_size`; the fields
`download_uri`, `size`, `content_type` and `content_encoding` are gone. The file behind
`jsonl_download_uri` is gzip-compressed [JSON Lines](https://jsonlines.org/) (`.jsonl.gz`: one
card object per line) instead of one JSON array. The first Magic import after the change failed
in 0.3 s with "Scryfall named a bulk file outside the configured bulk host" (the address was
missing, and a missing address was reported with the guard's message); nothing was downloaded.

What the adapter does since:

- **The address:** `jsonl_download_uri` when the entry has one, else the older `download_uri`
  (`ScryfallDtos.BulkData.downloadAddress()`). The current field comes first: it is the one
  Scryfall documents now, and its gzip file is the smaller download. A list entry with neither
  stops the import with "Scryfall's bulk list gives no download address for unique_artwork". An
  address outside the bulk host stops it with "Scryfall named a bulk file outside the configured
  bulk host (refused: `<scheme>://<host><path>`)": the refused address's scheme, host, port and path
  only, never user information, a query string or a fragment (only their presence is said),
  clipped at 200 characters, in printable ASCII (any other character stays percent-encoded, so
  no line break and no invisible character such as a right-to-left override reaches the
  message). The scheme is kept although other provider messages give host and path only: an
  `http://` address on the right host is refused for its scheme alone, and the message has to
  say so.
- **The file:** stored as the HTTP client hands it over. Spring's JDK client decompresses a
  `Content-Encoding: gzip` answer, so the old JSON array was stored decoded; the `.jsonl.gz` file
  is a gzip file and stays compressed. Reading looks at the gzip magic bytes, not the name, and
  Jackson's `readValues` reads both a root array and values one after another (JSON Lines),
  so every file stored before or after the change is read (`ScryfallCardProviderTest` proves
  the same catalogue from the array and from JSON Lines, with or without a trailing newline,
  with blank lines, CRLF, compressed or decoded; `CardSourcesImportIT` imports a gzip JSON Lines
  file end to end).
- **The name `bulk.json`:** kept. The snapshot store finds a version only by that name
  (`newest()`, `find(version)`), so a new name would hide the files owners already hold, make the
  importer download a version it already has and leave `SCRYFALL_SNAPSHOT_ONLY` without a file.
- **The size limit:** `orenji.card-providers.scryfall.max-bulk-bytes` (default 1 GiB) bounds the
  stored file and, since this change, the decompressed content too (a decompression bomb guard:
  before, the decoded array was what got stored, so the download limit bounded it; the compressed
  file no longer does). "Unique Artwork" is about 39 MB compressed; decompressed it should be a
  few hundred MB (not measured: agents never download it), inside the limit. A download above it
  stops at once with "Scryfall data.scryfall.io/<folder>/<file> is larger than ... bytes; the
  download was stopped and is not retried" and nothing is stored (before review fix 1 it was
  downloaded again on every attempt and reported as "unavailable after 4 attempt(s)
  (IOException)"; the same now holds for TCGdex's archive and YGOPRODeck's files). A stored file
  above it once decompressed stops with "... is larger than ... bytes once decompressed
  (orenji.card-providers.scryfall.max-bulk-bytes)". Raise the property if a larger bulk type is
  ever configured.
- **A stored file that cannot be read:** a file that is complete on disk but cannot be read (a
  damaged gzip file) or is not valid JSON is reused for 24 hours and then for as long as Scryfall
  lists the same `updated_at`, so the message says what to do: "The Scryfall bulk file
  `<version>` cannot be read (to download it again, delete the folder
  PROVIDER_DATA_DIR/scryfall/`<version>`)". After the folder is deleted, the next import
  downloads the file again. Downloads cut short never get that far: the HTTP client reports
  them and nothing is stored.

The bulk type itself (`unique_artwork`, or "Default Cards" below) is unchanged: the fix works for
whichever type is configured.

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
