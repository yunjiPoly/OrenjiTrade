# Stage S2 — a simpler wishlist, wishlist alerts, no matches

Owner product change of 2026-10-08, section 4 (stage S2, 2026-10-09). Supersedes the wishlist
parts of [`phase6-wishlist-notifications.md`](phase6-wishlist-notifications.md) (kept as history)
and the wishlist matching of [`s1-regions-location.md`](s1-regions-location.md). Regions and places:
ADR 0017. Migration: `V112__simplified_wishlist.sql`.

## The wish

A wish holds only:

| Field | Rules |
| --- | --- |
| which copy | `cardId` (any printing), optionally with `rarity` (any printing of that rarity: one of the rarities of the card's printings), or `printingId` (that printing; it fixes its own rarity, so `rarity` is empty — a rarity equal to the printing's is accepted and dropped, another one is 400) |
| `note` | public, optional, plain text (no control characters other than line feed and tab), at most 280 characters counted as code points after trimming (`\r\n` becomes `\n`), checked with `TextModerationService` (scope PROFILE, like the bio): BLOCK is 400 `note: contains a term that is not allowed`, FLAG is accepted and logged without the text. Shown wherever the wish is visible |
| `nearMintOnly` | default false: only Near Mint or better (Mint) copies fit the wish (alerts; "Who wants it" in S3) |
| `priceTerm` | optional, at most one, one of the admin list (`GET /wishlist/price-terms`): a display term for sellers relative to the TCG market price, **never a filter** |

Removed (V112 drops the columns and their data; private notes were **not** copied into the public
note): maximum price and currency, trade/buy preference, radius, private notes, language, minimum
condition, edition (a printing fixes it), the per-wish alert switch (`active`), match counts and
`lastMatchedAt`. Like every request body of the API, unknown members (an old client's `maxPrice`,
`tradePreference`, `notes`, `active`, `radiusKm` ...) are **ignored** and never stored (no such
column exists); `PATCH` reads only its documented members.

One wish per selection and collector: the same card + printing (or any) + rarity (or any) twice is
409 `CONFLICT` (also enforced by the unique index `uq_wishlist_item_selection`). The plan limit
`wishlist.items.max` (FREE 20, PREMIUM 500) still applies (429 `LIMIT_REACHED`).

## Endpoints

| Route | Answer |
| --- | --- |
| `GET /api/v1/wishlist` | `[WishlistItemResponse]` newest first: `{id, game, card{id,name,imageUrl}, printing (PrintingSummary, null = any printing), rarity (null = any), note, nearMintOnly, priceTerm {label, percent, orMore} or null, createdAt, updatedAt}` |
| `POST /api/v1/wishlist` | 201 `{cardId|printingId, rarity?, note?, nearMintOnly?, priceTerm?}`; 400 `VALIDATION_FAILED` (target, rarity, note, price term), 409, 429 |
| `PATCH /api/v1/wishlist/{id}` | any subset of `printingId` (another printing of the same card, or null = any), `rarity`, `note`, `priceTerm` (null clears), `nearMintOnly` (not null); changing `printingId` without `rarity` clears the stored rarity; 404 for others' wishes |
| `DELETE /api/v1/wishlist/{id}` | 204 |
| `GET /api/v1/wishlist/price-terms` | `{terms: [{label: "85% TCG", percent: 85, orMore: false}, ...]}` in display order (signed in) |
| `GET /api/v1/collectors/{handle}/wishlist` | `[{card, printing, rarity, note, nearMintOnly, priceTerm}]` only while the collector shows their wishlist (privacy setting `wishlistVisible`, default off, "Let others see what you want"), their profile is visible to the caller and no block exists; 404 otherwise. Never a place |
| `GET /api/v1/admin/wishlist/settings` | ADMIN: `{priceTerms: ["80% TCG", ...], updatedBy, updatedAt}` |
| `PUT /api/v1/admin/wishlist/settings` | ADMIN, audited `wishlist.settings.update`: `{priceTerms}` 1 to 10 terms `"<percent>% TCG"` with an optional `+` ("or more"), percent 1-200, duplicates dropped, order kept; 400 otherwise. Wishes that chose a removed term keep it (its label still reads correctly); new and edited wishes may only choose a listed term |

Removed endpoints: `GET /wishlist/{id}/matches`, `POST /wishlist/matches/{id}/dismiss`,
`POST /internal/jobs/wishlist-rematch` (and its Cloud Scheduler job). `OpenApiExportTest` asserts
that no `matches` / `rematch` path, no `WishlistMatch*` schema and no `WISHLIST_MATCH` value remain.

### Price terms and the market price

The list lives in `platform_settings` key `wishlist.price_terms` (ADR 0014 pattern; seeded by V112
with `80% TCG, 85% TCG, 90% TCG, 100% TCG, 100% TCG+`; cached 60 s in Redis, evicted on admin
writes). Clients show the approximate amount next to a term when the wish names one printing with a
market price: `percent × price`, two decimals ("85% TCG ≈ 21.25 USD"); with any printing, only the
term.

`MarketPrice` now carries `source`: `YGOPRODECK` (the `set_price` of the YGOPRODeck card database,
TCGplayer-based, USD, dated by the provider database's last update — `YgoProDeckMapper`), `SAMPLE`
(the fictional local sample catalog, `MockCardProvider`, CAD) or `CATALOG` (entered by staff). The
UIs label it "TCG market price" / "Sample market price" / "Market price" with the source and date
in a tooltip (web) or hint (mobile).

## Wishlist alerts (what replaces matches)

Default chosen by the owner's spec: wishes drive no stored matches. They drive "Who wants it" and
"Wanted by N" (stage S3, computed live) and a **wishlist alert**:

- `InventoryItemPublished` (after commit, Spring Modulith registry) → `WishlistAlerts`: the item is
  effectively public and fresh; wishes of **other** collectors fit it when they name its printing,
  or its card with no rarity or the item's rarity; with `nearMintOnly`, the item is Near Mint or
  better (`array_position` in the game's ordered conditions); the two collectors are in the **same
  platform region** (the lister discoverable with a location, the wisher with a location — owners
  without a location get no alerts, and the wishlist page prompts them to set country and state);
  no block in either direction; the wisher's account is active.
- One alert per collector: the most specific fitting wish (one printing, then one rarity, then any
  printing; oldest first) names the link.
- De-duplication: `wishlist_alert_sent (user_id, inventory_item_id)` — a sent-alert key, not a
  matches list. An item alerts a collector at most once, however often it is republished and
  however many wishes it fits. The notification's own dedup key is
  `wishlist-alert:<userId>:<inventoryItemId>`.
- `WISHLIST_ALERT` notification: title "Wishlist alert: <card>", body "<card> <code> <rarity> was
  just listed by @handle in <state>, <country>." (never a city, a price or a distance), data
  `{wishlistItemId, inventoryItemId, cardId, printingId?, rarity?, collectorId, cardName, game,
  cardImageUrl, regionCode, deepLink}`; `deepLink` = `/cards/<cardId>?printing=<id>` (one-printing
  wish), `/cards/<cardId>?rarity=<rarity>` (rarity wish) or `/cards/<cardId>`. The card page (web
  and mobile) reads both: `?printing=` shows that printing, `?rarity=` shows "Any printing in
  <rarity>" with the printings of that rarity and picks none of them; the printing picker of stage
  S3 replaces that block.
- Settings: one switch, `wishlistAlerts` in `GET|PUT /me/settings/notifications` (default true;
  `notification_preferences.wishlist_alerts`). On: in-app and push, following the master switches
  and quiet hours; never email. The `WISHLIST_MATCH` category is gone from the channel matrix (an old
  client sending it gets 400 like any unknown category). The daily plan limit
  `wishlist.alerts.per_day` (FREE 5, PREMIUM unlimited) still applies; beyond it one SYSTEM notice
  "More wishlist alerts are waiting" per day.
- Analytics: `wishlist_item_created` carries `game`, `target` (card / rarity / printing),
  `near_mint_only`, `has_price_term` (never the note). `wishlist_matched` is gone; alerts are not an
  analytics event.

## Data

`wishlist_item(id, owner_id, game_slug, card_id, printing_id null, rarity null, public_note ≤ 280,
near_mint_only, price_term null, created_at, updated_at)`; checks: a rarity only without a printing,
`price_term ~ '^[1-9][0-9]{0,2}% TCG\+?$'`. `wishlist_alert_sent(user_id, inventory_item_id,
sent_at)` cascades with the account and the item and is cleared by the wishlist's account-deletion
participant. The owner's data export section `wishlist` lists every wish with its note, Near Mint
flag and term.

## Clients

- Web: the shared printing picker (`shared/catalog/printing-picker`, reused by the card page in
  S3), the wish dialog (note, Near Mint only, terms, picker), the wishlist page, Settings →
  Notifications "Wishlist alerts", `/admin/wishlist` (price terms). `/wishlist/<id>` links open the
  list.
- Mobile: the wish editor ("Which copy" chooser, note, Near Mint only, terms), the Wishlist tab,
  Settings → Notifications "Wishlist alerts", alerts open the card screen with `?printing=` /
  `?rarity=`.
