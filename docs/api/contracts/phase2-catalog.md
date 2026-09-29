# Phase 2 contract — games, cards, sets, printings, catalog search

All under `/api/v1`. Catalog reads are public (`/public/catalog/**` alias not needed: these
routes are permitAll GET). Writes are admin-only. Data model per ADR 0005.

## Tables

- `game(id uuid, slug text unique, name, short_name, publisher, status ACTIVE|HIDDEN, sort_order, schema jsonb, created_at, updated_at)`
  `schema` = `GameSchema`: `{ "conditions": ["MINT","NEAR_MINT",…], "editions": ["FIRST_EDITION","UNLIMITED"], "languages": ["en","fr","ja"], "metadataFields": [{"key":"attack","label":"ATK","type":"number","filterable":true}, …], "rarities": [...] }`
- `card_set(id, game_id, code text, name, release_date, total_cards, series, metadata jsonb, search_vector tsvector generated, unique(game_id, code))`
- `card(id, game_id, name, normalized_name, slug, card_type, subtype, text, metadata jsonb, search_vector tsvector generated (unaccent_immutable(name) weight A, text weight C), unique(game_id, slug))`
- `card_printing(id, card_id, set_id, collector_number, rarity, edition, language default 'en', finish (NORMAL|FOIL|HOLO|REVERSE_HOLO|ALT_ART|…), printing_code text (e.g. LOB-EN001), image_id, market_price numeric(12,2) null, market_price_currency, market_price_updated_at, metadata jsonb, external_ref jsonb ({provider, id}), unique(set_id, collector_number, edition, language, finish))`
- `card_image(id, printing_id, kind FRONT|BACK|ART_CROP, url, width, height, source, storage_key null)`
- `catalog_sync_run(id, provider, game_id, started_at, finished_at, status, cards_upserted, printings_upserted, error)`
- Indexes: GIN on `search_vector`s; GIN trigram on `card.normalized_name`, `card_set.name`; GIN on `card.metadata`, `card_printing.metadata`; btree on `card_printing(card_id)`, `(set_id)`, `(printing_code)`.

## CardProvider

```java
public interface CardProvider {
  String providerId();
  Set<String> supportedGameSlugs();
  List<ProviderCard> searchCards(String gameSlug, String query, int limit);
  Optional<ProviderCard> getCard(String gameSlug, String externalId);
  List<ProviderSet> getSets(String gameSlug);
  List<ProviderPrinting> getCardPrintings(String gameSlug, String externalCardId);
  List<ProviderImage> getImages(String gameSlug, String externalPrintingId);
  Optional<ProviderMarketPrice> getMarketPrices(String gameSlug, String externalPrintingId);
  SyncResult syncCards(String gameSlug, SyncOptions options); // full or incremental
}
```
`MockCardProvider` (profile `local`, `dev`, `test`) serves fixtures from
`db/seed/catalog/<game>.json` (invented names). `CatalogImportService` maps provider DTOs to
entities idempotently (keyed by `external_ref`). Admin trigger: `POST /admin/catalog/sync`
`{ "gameSlug": "yugioh", "provider": "mock", "mode": "FULL|INCREMENTAL" }` → 202 + run id;
`GET /admin/catalog/sync-runs`.

## Endpoints

- `GET /games` → `[ { slug, name, shortName, publisher, schema } ]`
- `GET /games/{slug}` → GameResponse incl. schema
- `GET /sets?game=&query=&page=&size=` → `PageResponse<SetSummary>` `{ id, game, code, name, releaseDate, totalCards }`
- `GET /sets/{id}` → SetDetail + printings page
- `GET /cards?game=&query=&set=&rarity=&language=&edition=&metadata.<key>=&page=&size=` →
  `PageResponse<CardSummary>` `{ id, game, name, slug, cardType, primaryImageUrl, printingCount, metadata (subset per GameSchema.summaryFields) }`
  Ranking: `ts_rank_cd(search_vector, websearch_to_tsquery('simple', unaccent(q)))` + trigram
  similarity fallback when fewer than 5 FTS hits; exact printing-code match (`LOB-EN001`)
  short-circuits to that card.
- `GET /cards/suggest?game=&q=&limit=8` → lightweight autocomplete `[ { id, name, game, setCode, printingCode, imageUrl } ]` (mixes cards and printing codes)
- `GET /cards/{id}` → CardDetail `{ …, metadata, printings: [PrintingSummary] }`
- `GET /cards/{id}/printings` → `[PrintingSummary]` `{ id, setCode, setName, collectorNumber, printingCode, rarity, edition, language, finish, images, marketPrice }`
- `GET /printings/{id}` → PrintingDetail (card + set + images + metadata)
- Admin: `POST /admin/games`, `PUT /admin/games/{slug}` (schema editing), `POST /admin/cards`,
  `PUT /admin/cards/{id}`, `POST /admin/cards/{id}/printings`, `PUT /admin/printings/{id}` —
  audited; used by admin console "Games" and "Cards" sections.

## Seed

`db/seed/catalog/{yugioh,pokemon,mtg,riftbound}.json` — 4 sets and ~40 printings per game,
metadata per docs/development/seed-data.md, image URLs pointing at
`/api/v1/public/placeholder-images/{game}/{slug}.svg` (server-generated SVG placeholders with
the card name; no third-party images).
