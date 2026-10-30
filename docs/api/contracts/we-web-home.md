# Web stage WE contract — Home, profiles, notifications and settings

> Owner prompt of 2026-10-28 ([`docs/product/specs/2026-10-28-web-redesign-stages.md`](../../product/specs/2026-10-28-web-redesign-stages.md)),
> stage WE; spec [`2026-10-20-web-redesign.md`](../../product/specs/2026-10-20-web-redesign.md)
> sections 5, 11, 12 and 13, decisions 13 and 16; boards W1, W2 and W23 to W25. Extends
> [r7-home-feed.md](r7-home-feed.md), [r6-profiles.md](r6-profiles.md) and
> [r9-notifications.md](r9-notifications.md). One optional query parameter and one change of the
> account deletion's notifications step, both additive: no migration (the next is still **V135**),
> no field removed or retyped, the phone unchanged. Field-level truth: `../openapi.json`.

All under `/api/v1`. Places are a state or province and a country, never a city or a coordinate
(ADR 0017).

## `previews` on `GET /feed`

| Parameter | Rule |
| --- | --- |
| `previews` | optional, 1 to 6: how many card pictures a new-cards post carries in `newCards.previews` (newest first). Without it: 4, the phone's grid (unchanged). 0 or 7 and more: 400 `VALIDATION_FAILED` |

The web's Home asks for 6 (spec 5.2: six 100×147 tiles; from 7 cards the 6th tile reads "+N",
N = `total` minus the 5 shown). `total`, the post's id, its time, its place and the paging are the
same whatever `previews` says. `FeedRules.previews` (unit test) and `FeedIT` (a post of five cards
read with `previews=6`: all five, newest first) pin it; `GeoPrivacyContractTest.homeFeedCarriesPlacesOnly`
reads every chip with `previews=6` as every seed account.

## What the web reads (no other change)

| Screen | Requests |
| --- | --- |
| Home | `GET /feed?region&game&kind&limit=20&previews=6` and its cursor pages; one more `limit=1` read every 5 minutes while the tab is visible (newer posts: a pill without a number); the map card: `GET /regions/{region}/binder-counts?game` and the bundled boundaries; Get started: `GET /me/location`, `GET /inventory/items?markedPublic=true&size=1` (its `totalItems`) and `GET /wishlist` |
| "I have it" | `GET /inventory/items?cardId&size=50` and `GET /binders` (a public copy outside a deck core becomes the chat's card), then `POST /conversations {recipientId[, subjectItemId]}`; nothing is sent (R6's rule: a private copy is never pinned) |
| A profile | R6's reads, the cards with `excludeDeckCoreItems=true&size=12` and, once two or more games are listed, `&game=`; "See all" in pages of 24; your own wishes from `GET /wishlist` (their ids for Edit) |
| The bell, `/notifications` | `GET /notifications/unread-count?excludeTypes=MESSAGE`, `GET /notifications?excludeTypes=MESSAGE` (the web client sends `excludeTypes` since this stage: `packages/api-client/tools/web-omits.mjs` no longer leaves it out), `POST /notifications/read-all`, `POST /binders/{id}/confirm` for "Still have them" |
| Settings › Location | `PUT /me/location`, `DELETE /me/location`, `PUT /me/settings/privacy` ("Show me on the map"; 409 `LOCATION_REQUIRED` without a location) |

`GeoPrivacyContractTest.profilePagesOfStageR6CarryThePlaceOnly` also reads the web's profile
calls (`size=12&excludeDeckCoreItems=true&game=yugioh`, then `size=24&page=1`).

**The web client's types.** `FeedCollector`'s `id`, `handle` and `displayName` are typed nullable
on the web since this stage (`WEB_CLIENT_NOT_NULL` no longer lists it): Home shows a guest's post
as "A collector" (R15). `CollectorMarker` and `PublicBinderOwner` keep their web typing until
stage WG.

## The account deletion renames the deleted collector in others' notifications (WC review V3-1)

The deletion job's notifications step (`NotificationService.purge`, run by the real account
deletion job) deletes the account's own notifications, as before, and now also:

- in the other collectors' `MESSAGE` notifications sent by the account (`data.senderId`), the
  title becomes "New message from Deleted collector" and the body "Deleted collector {phrase}."
  (the phrase it had: "sent you a message", "sent you a photo", "shared a card with you", …), as
  the chat shows "Deleted collector";
- in the other collectors' `WISHLIST_ALERT` notifications about the account's listing
  (`data.collectorId`), "listed by @{handle} in" becomes "listed by Deleted collector in" and
  `data.collectorHandle` becomes "Deleted collector".

Rows that name the account without its id (a rating's `raterHandle`, a sale's `sellerHandle`) keep
the words they were written with. No DTO, OpenAPI or schema change. `DeletedCollectorNotificationsIT`
runs the real deletion job (with the no-op identity client) and checks that no stored notification
keeps the deleted collector's handle.
