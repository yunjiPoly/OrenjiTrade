# Phase 6 contract — wishlist, matching, notifications, push

> **ADR 0017 (2026-10-08):** wishes have no `radiusKm` and matches no `distanceBucket`; the
> matcher pairs a public listing with the wishes of collectors in the same platform region (no
> `ST_DWithin`). See [s1-regions-location.md](s1-regions-location.md).

All under `/api/v1`, authenticated. Matching is deterministic SQL over public inventory —
never binder-to-binder, never ML.

## Tables

- `wishlist_item(id, owner_id, game_slug, card_id null, printing_id null, rarity null, condition_min null (ordered enum), edition null, language null, max_price numeric null, currency, radius_km int, trade_preference (ANY|TRADE|SALE), notes, active bool, created_at, updated_at, last_matched_at)`
  (at least one of card_id/printing_id required). Index `(active, card_id)`, `(active, printing_id)`.
- `wishlist_match(id, wishlist_item_id, inventory_item_id, matched_at, distance_bucket, notified bool, dismissed bool, unique(wishlist_item_id, inventory_item_id))`
- `notification(id, user_id, type, title, body, data jsonb (deep link + ids), dedup_key unique, created_at, read_at null, seen_at null, channel_state jsonb ({push: SENT|FAILED|SKIPPED, email: …}))`
- `push_token(id, user_id, platform IOS|ANDROID|WEB, token unique, created_at, last_seen_at, invalid_at null)`
- `notification_rate_limit` is Redis (`notif:{userId}:{type}:{day}`), limits from `usage_limit` (`wishlist.alerts.per_day` FREE 5 / PREMIUM unlimited).

## Endpoints

- `GET /wishlist` → `[WishlistItemResponse]` `{ id, game, card: {id,name,imageUrl}|null, printing: PrintingSummary|null, rarity, conditionMin, edition, language, maxPrice, currency, radiusKm, tradePreference, notes, active, matchCount, lastMatchedAt, createdAt }`
- `POST /wishlist` (limit `wishlist.items.max` FREE 20 / PREMIUM 500 → `429 LIMIT_REACHED`), `PATCH /wishlist/{id}`, `DELETE /wishlist/{id}`
- `GET /wishlist/{id}/matches?cursor=` → `CursorPage<WishlistMatchResponse>` `{ id, item: PublicInventoryItem, collector: CollectorMarker, distanceBucket, matchedAt, dismissed }` ; `POST /wishlist/matches/{id}/dismiss`
- `GET /collectors/{handle}/wishlist` (only when `wishlistVisible`) → summary `[ { card, printing, conditionMin } ]`
- `GET /notifications?cursor=&unreadOnly=` → `CursorPage<NotificationResponse>` `{ id, type, title, body, data, createdAt, readAt }`; `GET /notifications/unread-count`; `POST /notifications/{id}/read`; `POST /notifications/read-all`
- `POST /me/push-tokens` `{ platform, token }` / `DELETE /me/push-tokens/{token}`
- `POST /internal/jobs/wishlist-rematch` (nightly safety net re-running matching for items updated in the last 24 h)

## Matching pipeline (event-driven, ADR 0009)

`InventoryItemPublished` → `WishlistMatcher` (idempotent, `@ApplicationModuleListener`):
```
SELECT w.* FROM wishlist_item w
JOIN user_location ul ON ul.user_id = w.owner_id
WHERE w.active AND w.owner_id <> :ownerId
  AND (w.printing_id = :printingId OR (w.printing_id IS NULL AND w.card_id = :cardId))
  AND (w.condition_min IS NULL OR rank(:condition) >= rank(w.condition_min))
  AND (w.edition IS NULL OR w.edition = :edition) AND (w.language IS NULL OR w.language = :language)
  AND (w.max_price IS NULL OR :askingPrice IS NULL OR :askingPrice <= w.max_price)
  AND (w.trade_preference = 'ANY' OR availability_compatible(w.trade_preference, :availability))
  AND ST_DWithin(ul.public_point, :ownerPublicPoint, w.radius_km * 1000)
  AND NOT EXISTS (block either direction)
```
→ insert `wishlist_match` (ignore conflicts) → `NotificationService.notify(userId, type
WISHLIST_MATCH, dedupKey "wishlist:{wishlistItemId}:{inventoryItemId}", data {…})` which
applies notification preferences, quiet hours, daily limit per type (limit-reached creates a
single "You have more matches — upgrade" notification once per day), then fans out: in-app
row + realtime `/user/queue/notifications`, push via `PushProvider` (FCM adapter with
multicast + invalid-token cleanup; `LogPushProvider` locally), email via `EmailProvider`
(log locally). Body example: "Azure-Eyes Sky Dragon AZR-EN001 was listed ~4 km away".

Notification types: WISHLIST_MATCH, MESSAGE, OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_COUNTERED,
OFFER_DECLINED, BINDER_EXPIRING, BINDER_STALE_WARNING, BINDER_HIDDEN, RATING_RECEIVED,
TRADE_UPDATE, SHIPMENT_STATUS, PAYMENT_UPDATE, REPORT_DECISION, SYSTEM.

## Web / mobile

Wishlist page: list with add dialog (card autocomplete → optional printing, condition,
edition, language, max price, radius slider bounded by plan, trade preference), matches
drawer per item (collector marker + item + "Message" CTA). Notification centre: bell menu
(web) / Profile tab section (mobile) with unread badge, realtime updates, mark-read.
Mobile registers the Expo/FCM push token after permission prompt; tapping a notification
deep-links (`orenjitrade://wishlist/{id}`, `/conversations/{id}`).
