# Stage R9 contract — Notifications and the bell

> Owner prompt of 2026-10-19/20
> ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section "R9. Notifications (31) and the bell"; mockup v50 screen 31. Extends
> [phase6-wishlist-notifications.md](phase6-wishlist-notifications.md) (the notification centre),
> [s2-wishlist.md](s2-wishlist.md) (wishlist alerts) and [r4-messages-sales.md](r4-messages-sales.md)
> (`SALE_RECORDED`). One optional parameter on two endpoints and new keys in the `data` of three
> types: no migration, nothing removed or retyped; the paused web builds and passes its checks
> against the regenerated client, unchanged. Field-level truth: `../openapi.json`.

All under `/api/v1`, signed in (anonymous: 401). Places are a state or province, never a city or a
coordinate (ADR 0017).

## `excludeTypes` on `GET /notifications` and `GET /notifications/unread-count`

| Parameter | Rule |
| --- | --- |
| `excludeTypes` | optional list of `NotificationType`, repeated (`?excludeTypes=MESSAGE&excludeTypes=SYSTEM`) or comma-separated (`?excludeTypes=MESSAGE,SYSTEM`); at most 30. An unknown type is a 400 `VALIDATION_FAILED` on both endpoints |

- The list leaves those types out of every page; `unreadOnly`, `cursor` and `limit` work as before
  with it, and the cursor of a page read with `excludeTypes` continues the same filtered list.
- The unread count leaves them out of the count.
- **Without `excludeTypes` both behave exactly as before** (every in-app type counted and listed).
- The phone always sends `excludeTypes=MESSAGE`: chats have their own badge in Messages (the
  inbox's unread chats). Community posts never notify, so there is nothing else to leave out.
- `POST /notifications/read-all` is unchanged: it marks every unread notification read, chats'
  notices included (they only mirror the chats' own unread state, which lives in the
  conversations; the Messages badge does not read them).

**The web's client.** Since web stage WE the web sends `excludeTypes=MESSAGE` with both endpoints
and `web-omits.mjs` omits nothing ([we-web-home.md](we-web-home.md)). Before that: **the paused
web's client.** `getUnreadNotificationCount` had no parameter; the generated Angular
service would have turned `op('body', false, options)` into `op(requestParameters?, observe?, …)`
and broken the paused web's calls. `packages/api-client/tools/web-omits.mjs` leaves `excludeTypes`
out of that one operation in the web's client only (`scripts/lib/web-client-omits.test.mjs` checks
the omission still names a real parameter). `packages/shared-types` (the phone) keeps it. The
list's `ListNotificationsRequestParams` simply gains the optional field.

## New keys in `data` (stage R9, the phone's rows)

Additive keys of the `data` object of new notifications; notifications stored before keep their
old `data`, and clients fall back on `title` and `body` when a key is missing.

| Type | New keys |
| --- | --- |
| `WISHLIST_ALERT` | `collectorHandle` (the lister), `province` (the lister's state or province, or the country of a whole-country pseudo-subdivision such as Puerto Rico; **never a city**), `askingPriceText` (the price as its owner typed it, when there is one), `askingPrice` (a decimal string) and `currency` (when the item has an amount) |
| `SALE_RECORDED` | `itemName` (the card's or the deck core's name), `saleKind` (`CARD` or `DECK_CORE`), `hasTracking` (a boolean: a tracking number came with the sale; **never the number**), and for a card `cardName`, `game` and `cardImageUrl` (stored API-relative, served absolute like every notification picture) |
| `BINDER_STALE_WARNING`, `BINDER_HIDDEN` | `binderName` (null for the cards without a binder; they already had `binderId`, `itemCount` and, for a warning, `hidesAt`) |

Kept as they were, on purpose:

- `RATING_RECEIVED` still carries no comment (Phase 7: a moderator may hide a rating, and the
  notification would keep it): the phone's muted line is "See it on your profile."
- `REPORT_DECISION` still never names the reported collector (Phase 7: "without disclosing
  specifics"): the phone says "Report reviewed: thanks for your report" and the status line.
- Push payloads (`notificationId`, `type`, `deepLink`) are unchanged.

The seed's freshness reminder of collector3 (`00000000-0000-4000-9a00-000000000301`) names its
binder and the day it leaves search.

## What the phone does with them

- The bell (Home, Search, Inventory, Messages, Profile): `GET /notifications/unread-count?excludeTypes=MESSAGE`;
  an orange dot while it is above 0, spoken "Notifications, {n} new" (or "Notifications"); realtime
  pushes of other types raise it, a pushed `MESSAGE` does not.
- Notifications: "New" is `GET /notifications?unreadOnly=true&excludeTypes=MESSAGE&limit=50`
  (more pages by cursor on scroll while `hasMore`), "Earlier" pages
  `GET /notifications?excludeTypes=MESSAGE&limit=20` by cursor once New is whole, without the
  notifications New shows. Tapping a row: `POST /notifications/{id}/read`, then its target
  (`WISHLIST_ALERT` the card page on its printing, `SALE_RECORDED` the chat, `RATING_RECEIVED` the
  caller's profile at its ratings; nothing for the other types). A tapped push opens the same
  target; a `MESSAGE` push (never listed here) opens its chat from its `deepLink`. "Mark all as read":
  `POST /notifications/read-all`. "Still have them": `POST /binders/{id}/confirm`; the row shows
  the confirmed state while the binder's `freshness.confirmedAt` is at or after the reminder.

## Tests

- `NotificationCentreIT.excludeTypesLeavesTypesOutOfTheListAndTheUnreadCount`: counts with and
  without `excludeTypes` (repeated, comma-separated), pages of 2 with no gap and no excluded type,
  the unread filter with it, 400 for an unknown type, 401 signed out.
- `WishlistAlertsIT`, `WishlistRulesTest`: `collectorHandle`, `province` (the province, not the
  country; Puerto Rico), the price keys or none.
- `SaleIT`: `itemName`, `saleKind`, `hasTracking` (a card with a number, a deck core without), the
  picture stored API-relative and served absolute.
- `ActivityNotificationsIT`: `binderName` on the warning and on the hidden notice; none for the
  unfiled cards.
- `GeoPrivacyContractTest`: the seeded alert's `province` and `collectorHandle`, and both phone
  reads (`excludeTypes=MESSAGE`) of collector1 and collector2 through the place and privacy checks.
