# ADR 0021 — Five games and their card sources

**Status:** Accepted · **Date:** 2026-10-21 · **Relates to:**
[0005](0005-multi-tcg-data-model.md) (one catalog for every game),
[0015](0015-card-images-provider-hosting-capped-cache.md) (images: re-hosted, capped cache),
[0019](0019-free-for-all-no-paid-features.md) (free), [0020](0020-camera-card-scan-reads-text-on-the-phone.md)
(numbered before this one) · **Spec:** [`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md),
section "R10. Card data for Magic and Pokémon" (verbatim) · **Providers:**
[YGOPRODeck](../../providers/ygoprodeck.md), [Scryfall](../../providers/scryfall.md),
[TCGdex](../../providers/tcgdex.md)

The owner's prompt names this record "ADR 0020"; 0020 was already the camera card scan, so it takes
the next free number.

## Context

Since stage G (2026-10-20) the phone shows five games: Yu-Gi-Oh!, Pokémon, Magic: The Gathering,
One Piece and Riftbound. `GET /api/v1/games` says per game whether the catalogue holds a card
(`hasCards`); a game without cards is dimmed in "Choose a game" with "Cards coming soon", cannot be
browsed and cannot hold binders, but can stay on a profile. Until this stage only Yu-Gi-Oh! had a
real source (YGOPRODeck, ADR 0015); the other games had nothing outside the fictional catalogue of
local development.

The owner's prompt of 2026-10-19/20 (stage R10) asks for two more sources, run by the owner as for
Yu-Gi-Oh! (agents never run a real import): Magic from Scryfall's daily bulk file "Unique Artwork",
English paper cards with one image per artwork; Pokémon from TCGdex's card database (MIT licence),
English only, one image per printing. One Piece and Riftbound keep waiting. The owner ordered on
2026-10-20 that the app supports English cards only.

## Decision

1. **One source per game, each behind `CardProvider`** (ADR 0005); the importer, the image cache,
   the serving endpoint and the import report are shared.

   | Game | Source | What is imported | Images |
   | --- | --- | --- | --- |
   | Yu-Gi-Oh! | YGOPRODeck (`ygoprodeck`) | the whole catalog (ADR 0015) | one per artwork |
   | Magic: The Gathering | Scryfall (`scryfall`), bulk file "Unique Artwork" | English paper cards | one per artwork (`illustration_id`) |
   | Pokémon | TCGdex (`tcgdex`), github.com/tcgdex/cards-database (MIT) | English cards | one per printing |
   | One Piece | none yet | — | — |
   | Riftbound | none yet | — | — |

2. **Magic: Scryfall's "Unique Artwork" bulk file.** One card object per artwork, so the catalogue
   holds one printing per artwork: a card is an Oracle card (`oracle_id`), a printing is a set code
   plus a collector number (rarity Common, Uncommon, Rare, Mythic Rare, Special or Bonus; edition
   `UNLIMITED`; language `en`; the printing's first finish, the finishes listed in its metadata;
   collectors record the finish of their own copy, as the edition for Yu-Gi-Oh!). Only English
   paper cards: `lang` `en`, not digital, `games` with `paper`; art series cards, tokens, emblems
   and oversized cards are left out and counted in the import report. The image of a printing is
   its front face's artwork, the `normal` size scaled to the 320 px JPEG; it is never cropped,
   covered, recoloured or watermarked. Etiquette: the bulk file instead of per-card calls; a
   `User-Agent` and an `Accept` header on every call; at most 10 calls a second (default 8); the
   file is refreshed at most daily (a stored file younger than 24 hours is reused without any call;
   an older one is replaced only when `GET /bulk-data` names a newer `updated_at`). Nothing implies
   that Scryfall endorses OrenjiTrade. Terms: https://scryfall.com/docs/api and
   https://scryfall.com/docs/api/bulk-data.
3. **Pokémon: TCGdex's card database, downloaded.** One call asks GitHub for the newest commit of
   the repository's branch; an archive of that commit is downloaded once and kept raw beside the
   repository's `LICENSE` (the MIT notice stays with the copy), instead of one API call per card.
   The repository's TypeScript data files are read as object literals (`TsLiteral`, no JavaScript
   engine; a file that is not a plain literal is skipped and counted). English only: a set or card
   without an English name is left out; Pokémon TCG Pocket (a digital game, serie `tcgp`) is left
   out. Pokémon has no Oracle-like identity, so a card is an English name (typographic and straight
   apostrophes unified) and a printing is one TCGdex card (set plus number, rarity as TCGdex writes
   it, finish `NORMAL`, else `HOLO`, else `REVERSE_HOLO`); set codes are the official abbreviation
   (`DAA`) when it is unique, else the TCGdex id without punctuation (`sv03.5` → `SV035`). One
   image per printing from TCGdex's image host. The same refresh rule as Scryfall applies.
4. **Images follow ADR 0015 for every game: never hotlink provider images.** Every provider is
   `REHOST_REQUIRED`: artworks are downloaded once into the same capped cache (5 GB), one 320 px
   JPEG each, and clients only ever see `/api/v1/public/card-images/{id}`; provider URLs stay in
   `card_image.source_url` on the server, and each adapter downloads only image URLs of its own
   configured host (SSRF guard). Expected sizes: Magic about 1.9 GB, Pokémon about 0.85 GB, all
   five games about 3.5 to 4.2 GB.
5. **A printing shows its own artwork.** Magic and Pokémon printings point at their own provider
   artwork through `card_printing.image_id` (a card-level `card_image` row of the printing's card;
   no migration): printing lists, suggestions, holder rows and inventory items show the printing's
   picture. A card shows its earliest printing (the catalogue's existing rule), so a card's primary
   artwork (`card.image_id`) is its earliest printing's.
6. **One Piece and Riftbound stay "Cards coming soon".** One Piece needs Bandai's written
   permission: the official card list forbids reproduction and the community APIs scrape it.
   Riftbound needs Riot's `riftbound-content-v1` API with an approved production key, kept on the
   server, and the line "Riot Games does not endorse or sponsor this project" wherever its cards
   show. Both games stay ACTIVE with `hasCards` false until then (the fictional catalogue of local
   development holds Riftbound cards; production does not).
7. **Imports are the owner's step.** `npm run catalog:import -- --game mtg --provider scryfall
   --images all`, `npm run catalog:import -- --game pokemon --provider tcgdex --images all`, then
   `npm run card-images:status`. Seeds, tests and CI never call a provider: the test profile points
   every adapter at a closed local port in snapshot-only mode, the end-to-end harnesses turn every
   provider off (`NO_CARD_PROVIDERS`), and the adapters are tested against small hand-written
   fixtures in each provider's format.
8. **No market prices from Scryfall or TCGdex.** The prompt does not ask for them and their price
   terms were not reviewed; Yu-Gi-Oh! keeps YGOPRODeck's indicative prices.

## Consequences

- The phone credits each source where its pictures show and in Settings › Appearance: "Card data
  and images courtesy of Scryfall" with Wizards of the Coast's Fan Content Policy notice; "Card
  data courtesy of TCGdex (MIT licence)" with "Pokémon card content is © The Pokémon Company,
  Nintendo, Creatures and GAME FREAK. OrenjiTrade is not affiliated with them." Both notices are
  drafts for the lawyer review (with YGOPRODeck's, before any public launch).
- Pokémon card images are copyrighted by The Pokémon Company and its partners; TCGdex's MIT
  licence covers its data, not the publisher's artwork. Showing them is part of the same legal
  review as YGOPRODeck's and Scryfall's images.
- After a fixture or real import, Magic and Pokémon turn browsable on their own (`hasCards`): no
  phone release is needed.
- The adapters were written against the providers' published formats and tested on hand-written
  fixtures only (agents never call a provider); the owner's first real import is the first contact
  with the real files. Its report lists every skipped row by category.
- The GameSchema rarity lists of `mtg` and `pokemon` (which only check printings made by an admin)
  are left as they are; aligning them with the imported vocabulary is a follow-up after the first
  real import (a migration like V101 for Yu-Gi-Oh!).
- Rejected: one API call per card (both providers ask for the bulk download); Scryfall's "Default
  Cards" or "All Cards" files (every printing in every language: several times the images, and the
  owner chose one image per artwork); PokémonTCG.io (per-card API with a key; the owner chose
  TCGdex); one card per Pokémon printing (a name like "Pikachu" would show dozens of identical
  results in Search typing); hotlinking either provider's images.
