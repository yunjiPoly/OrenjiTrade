# Phase 4 contract — map discovery and unified search

All under `/api/v1`. Discovery reads work for anonymous users with reduced detail
(anonymous: no distance buckets, no messaging CTA). Every response obeys ADR 0004: only
`publicPoint` (≤3 decimals) and `distanceBucket`.

## Collectors nearby (map markers)

`GET /collectors/nearby?lat=&lng=&radiusKm=&game=&availability=&freshness=&tags=&hasPrintingId=&hasCardId=&query=&limit=200`
- `lat/lng` optional: default is the caller's own trading-area centre; anonymous callers must
  supply them (a city centre chosen on the client). `radiusKm` capped by plan limit
  (`map.radius.max`, FREE 25, PREMIUM 100) → `429 LIMIT_REACHED` beyond it.
- Filters: `game` (slug), `availability` (TRADE|SALE|TRADE_OR_SALE|ACCEPTS_OFFERS),
  `freshness` (ACTIVE|AGING; STALE/HIDDEN never appear), `tags` (slugs, any), `hasPrintingId` /
  `hasCardId` (collector has an effective-public item for it), `query` (name/handle/tag text).
- Response:
```json
{ "center": {"lat":45.52,"lng":-73.58}, "radiusKm": 10,
  "collectors": [ { "id":"uuid","handle":"maika","displayName":"…","avatarUrl":"…",
     "publicPoint": {"lat":45.522,"lng":-73.581}, "publicLabel":"Plateau-Mont-Royal, Montréal",
     "distanceBucket":"KM_1_5", "rating": {"average":4.8,"count":12}, "tags":["trader","local-meetups"],
     "games":["yugioh","pokemon"], "lastActiveBucket":"TODAY", "onlineStatus":"HIDDEN",
     "binderFreshness":"ACTIVE", "publicBinderCount":2, "publicItemCount":143,
     "matchingItems": [ { "itemId":"…","printingCode":"AZR-EN001","availability":"TRADE_OR_SALE","askingPrice":45.00,"currency":"CAD","condition":"NEAR_MINT" } ] } ],
  "total": 37, "truncated": false }
```
- SQL: `ST_DWithin(ul.public_point, ST_MakePoint(:lng,:lat)::geography, :radiusM)` joined to
  privacy (`discoverable = true`, status ACTIVE, not deletion-requested) and, when
  `hasPrintingId/hasCardId/availability`, an EXISTS over effective-public inventory. Ranking:
  freshness (ACTIVE > AGING), then distance, then rating. Cached in Redis 60 s per
  rounded-centre/radius/filter key.
- `GET /collectors/{handle}/preview` → the marker preview payload above for a single collector
  (used by the preview card; adds `canMessage`, `isBlocked`).

## Unified search

`GET /search?q=&lat=&lng=&radiusKm=&types=cards,printings,sets,collectors,binders&game=&limit=` →
```json
{ "query":"blue eyes", "cards":[CardSummary], "printings":[PrintingSummary], "sets":[SetSummary],
  "collectors":[CollectorMarker (with matchingItems when a card/printing was resolved)],
  "binders":[PublicBinderSummary], "resolved": { "printingId": "…|null", "cardId": "…|null" } }
```
Behaviour: if `q` matches a printing code or a single card unambiguously, `resolved` is set and
`collectors` lists nearby holders of it (same engine as `/collectors/nearby` with
`hasPrintingId`/`hasCardId`). Text matching per ADR 0012. Analytics events `search_performed`
/ `search_no_results` emitted (query text truncated, geo cell only).

`GET /search/card-holders?printingId=|cardId=&lat=&lng=&radiusKm=&availability=&condition=&minPrice=&maxPrice=&freshness=&edition=&language=&acceptsOffers=&sort=distance|price|freshness&page=&size=` →
`PageResponse<CardHolderResult>` `{ collector: CollectorMarker, item: PublicInventoryItem }` —
the "who near me has this card" list view with all spec filters.

`GET /search/suggest?q=&lat=&lng=&limit=10` → mixed autocomplete
`[ { "type":"CARD|PRINTING|SET|COLLECTOR|BINDER|TAG", "id", "label", "sublabel", "imageUrl", "game" } ]`.

## Web `/map` page

Layout per spec: full-height map (MapAdapter: Google when key, Leaflet otherwise), top search
(unified suggest; selecting a card filters markers to holders and shows a "Holders of X" list
panel), right collapsible panel = Messages (Phase 5; placeholder conversation list until then),
bottom filters bar (Game, Distance radius slider bounded by plan, Availability, Freshness,
Tags). Markers = collector avatars (clustered above 60). Marker click → preview card
(displayName, avatar, distanceBucket, rating, tags, lastActive, binderFreshness, games,
buttons View profile / View public binder / Message). Viewport moves re-query
`/collectors/nearby` (debounced) with the visible radius. Keyboard alternative: a "List"
toggle rendering the same collectors as an accessible list. Legend explains approximate
positions ("Positions are approximate to protect privacy").

Mobile Map tab: same data, bottom-sheet preview, "Search this area" button, list toggle.
