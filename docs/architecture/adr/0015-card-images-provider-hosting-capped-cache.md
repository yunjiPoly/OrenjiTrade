# ADR 0015 — Card images: provider hosting policies and a capped local image cache

**Status:** Accepted · **Date:** 2026-10-01 · Extends [ADR 0005](0005-multi-tcg-data-model.md)

## Context

Collectors need real card pictures everywhere a card appears (catalog, inventory, binders,
wishlists, offers and trades, message and community card links, map side lists). The first real
catalog is Yu-Gi-Oh! from YGOPRODeck (documented API, verified 2026-10-01: base
`https://db.ygoprodeck.com/api/v7/`, 20 requests/second or the IP is blocked for an hour, images at
`https://images.ygoprodeck.com/images/{cards|cards_small|cards_cropped}/<id>.jpg`). Its terms
forbid continual hotlinking ("download and re-host the images yourself", or the IP is
blacklisted) and ask clients to store pulled data locally to keep API calls to a minimum. Pokémon,
Magic and Riftbound sources will follow with different terms (some CDNs explicitly allow
hotlinking). The full Yu-Gi-Oh! catalog is 14,592 cards / 14,764 artworks (≈ 128 KB per full
image), more than a developer machine should store, and the owner requires that the local image
cache never exceeds 500 MB.

## Decision

1. **Metadata and images are separate.** The complete provider catalog (cards, sets, printings,
   artwork references) is always imported into PostgreSQL, whatever the image cache holds. Image
   files live in a separate, capped cache; a full cache never fails an import.
2. **One `card_image` row per provider artwork** (`provider` + `provider_image_id` unique), owned
   by the card (`card_id`) and optionally by one printing (printing-specific images such as the
   mock placeholders). `card.image_id` is the primary artwork; printings without their own image
   resolve their picture through their card. Inventory items, binder entries, wishlist entries,
   offers and messages reference printings/cards, never image files: images are never duplicated
   per copy. The row keeps the provider `source_url` (server-side only) and the cache state
   (`cache_status` NOT_CACHED / CACHED / FAILED / MISSING_AT_SOURCE, storage key, type, size,
   dimensions, SHA-256, download and access times, attempts, last error).
3. **Hosting policy per provider.** `CardProvider.imageHostingPolicy()` is `REHOST_REQUIRED`
   (default, YGOPRODeck) or `HOTLINK_ALLOWED`. A single `CardImageUrlResolver` produces the URL of
   every DTO that carries card imagery: re-host-only artworks always point at OrenjiTrade's own
   `GET /api/v1/public/card-images/{id}`, hotlink-allowed artworks at the provider URL, cards
   without artwork at the server-generated placeholder SVG. Re-host-only provider URLs never reach
   browsers (contract test). This includes payloads outside the catalog DTOs: notifications about
   one card carry `data.cardImageUrl` (+ `cardName`, `game`), message offer links
   `OfferLink.imageUrl`, admin listings `AdminListingItem.imageUrl`.
4. **Capped, game-agnostic cache** (`CardImageCache`): `CARD_IMAGE_LOCAL_CACHE_MAX_MB` (default
   500; values above 500 stop the start-up, never silently lowered; smaller values allowed). Final
   files, temporary download files and outstanding reservations together never exceed the limit:
   bytes are reserved in `card_image_cache_reservation` under a lock on the single
   `card_image_cache_usage` row (`SELECT … FOR UPDATE`) before streaming (announced
   `Content-Length`, bounded by the 2 MB per-image maximum, else that maximum); the body streams
   into `.tmp/<reservation>.part` and is aborted when it exceeds the reservation; it must decode as
   an image (HTML, empty and other content refused); one rendition is stored (320 px wide JPEG,
   quality 0.82, never upscaled, metadata stripped — the JVM has no WebP encoder) at the
   deterministic key `<game>/<provider>/<shard>/<providerImageId>.jpg`, deduplicated by SHA-256;
   the usage is committed and the reservation released in one locked transaction before the
   atomic move. Reservations expire (a crash cannot leak capacity); downloads are single-flight
   per image and bounded (4 in parallel); reconciliation (start-up and on demand) removes orphan
   temporary files and unreferenced files, marks rows whose file vanished NOT_CACHED, recomputes
   the usage from the disk and evicts least-recently-used images when the limit was lowered.
5. **Provider etiquette in the adapter** (`ProviderHttpClient`, reusable): descriptive
   `User-Agent`, pacing per host (default 5 requests/second, configurable, hard ceiling 15),
   exponential backoff for timeouts, connection errors, 5xx and 429 (honouring `Retry-After`),
   never retrying other 4xx; image URLs are only fetched from the configured image base (SSRF
   guard). YGOPRODeck syncs call `checkDBVer.php` first and reuse the raw JSON snapshot stored
   (git-ignored) per `database_version`; a new version is downloaded once (`cardinfo.php?misc=yes`
   + `cardsets.php`).
6. **Fills are explicit and selective.** Imports take an image mode: `NONE`, `REFERENCED`
   (artworks members reference through inventory, binders, wishlists, offers/trades and card links
   — the default), `ALL` (until the cache is full) or `LIMIT n` (referenced first, then by card
   name: deterministic, so a second run downloads nothing). The serving endpoint may fill one
   missing artwork on demand (rate-limited, single-flight, 3 s wait) while capacity remains,
   otherwise it serves the placeholder with a short cache lifetime; cached files are served with
   `Cache-Control: public, max-age=31536000, immutable` and the SHA-256 as ETag. The start-up seed
   stays on the offline `MockCardProvider`; tests and CI never touch the network.

## Consequences

- Adding Pokémon, Magic or Riftbound means writing a `CardProvider` adapter (mapping, hosting
  policy, `openImage`); cache, serving, resolver, importer and reports are reused unchanged.
- Clients render whatever URL the API sends and never build provider URLs: the web app has one
  game-agnostic `app-card-image` (5:7 frame, lazy, skeleton, placeholder art on a missing or
  failing URL) on every card surface, and provider credits per game (YGOPRODeck, Konami / 4K Media)
  in the footer and on card and set pages.
- A local developer sees real pictures for what the demo and their own data reference; everything
  else shows placeholders until fetched. `npm run card-images:status|clear` manage the cache.
- In the cloud the same cache would need shared storage (GCS) and per-instance coordination; the
  accounting already lives in PostgreSQL. Deferred with the cloud deployment.
- YGOPRODeck card data and images are © 4K Media Inc., a subsidiary of Konami Digital
  Entertainment, Inc.; attribution to YGOPRODeck is shown in docs and must be reviewed by counsel
  before any public launch (docs/providers/ygoprodeck.md).
- Rejected: hotlinking provider images (forbidden, privacy leak of visitors' IPs to the provider);
  storing every artwork (full size ≈ 2 GB; even the 320 px renditions, ≈ 45 KB each, would need
  ≈ 650 MB, above the 500 MB cap); storing full and cropped variants (one
  UI-sized rendition is enough); a separate image service (modular monolith, ADR 0001).
