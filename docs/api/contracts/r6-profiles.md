# Stage R6 contract — Profiles

> Owner spec 2026-10-14 ([`docs/product/specs/2026-10-14-phone-redesign.md`](../../product/specs/2026-10-14-phone-redesign.md)),
> sections 9 (mockup screens 19 to 21), 10 ("I have it"), 13 and 16. Extends
> [phase1-auth-profiles.md](phase1-auth-profiles.md) (the collector profile),
> [phase3-inventory-binders.md](phase3-inventory-binders.md) (the public lists),
> [phase7-ratings-reports-admin.md](phase7-ratings-reports-admin.md) (ratings and references) and
> [r4-messages-sales.md](r4-messages-sales.md) (the chat's subject and `CARD_LINK` with
> `inventoryItemId`). Two optional query parameters, both additive: the paused web's generated
> calls take them in their request parameters object and keep their signatures. No migration.
> Field-level truth: `../openapi.json`.

All under `/api/v1`. Places are a state or province and a country (ADR 0017); the city appears only
in `GET /collectors/{handle}` of a collector who shows it.

## The profile page, as the phone reads it

One request per part; nothing new on the responses.

| Part of the page | Request | Rules (unchanged, pinned by `CollectorProfilePageIT`) |
| --- | --- | --- |
| Header and the line under it | `GET /collectors/{handle}` | `location.subdivisionName` and `location.city` (only while its owner shows it) make "{city, }{province}"; `memberSince`; `lastActiveBucket` TODAY / THIS_WEEK / THIS_MONTH / LONGER_AGO, `HIDDEN` when the collector hides it (the owner always sees theirs); `onlineStatus` `ONLINE` only when shown; `rating {average, count}`; `canMessage`, `isBlocked` |
| Cards | `GET /collectors/{handle}/inventory?size=10&excludeDeckCoreItems=true` (and pages of 24 for "See all") | effectively public items only: a private card, or a public card in a private binder, never shows |
| Binders | `GET /collectors/{handle}/binders` | effectively public binders holding a public card, and public deck cores |
| Looking for | `GET /collectors/{handle}/wishlist` | 404 while "Let others see what you want" is off (the owner always reads theirs; the phone's Profile tab reads `GET /wishlist`, which carries the wish ids) |
| Ratings & references | the profile's `rating`, `GET /collectors/{handle}/references?limit=10` (the 2 latest shown), and for "See all references" `GET /collectors/{handle}/ratings` | as Phase 7 |

**Blocks** (today's rule, kept): a block in either direction leaves `GET /collectors/{handle}`
answering 200 with `isBlocked: true` and `canMessage: false`, and the cards, binders and wishes
answering 404 both ways. The phone shows the header and "Unblock" to the collector who blocked
(`GET /me/blocks` tells the direction) and "This collector is not available" to the one who was
blocked.

## The cards of a deck core stay out of a profile's Cards

`GET /collectors/{handle}/inventory` gains the optional **`excludeDeckCoreItems`** (boolean,
default `false`). With `true`, the cards filed in a deck core (`binder.sells_as_core`) are left out
of the rows and of `totalItems`: they sell only with the core (owner spec, section 7), and the
profile's Binders already show the core. Without it the list is unchanged (the paused web).

## "I have it": your copies of one card

`GET /inventory/items` gains the optional **`cardId`** (UUID): only the caller's live items of the
printings of that card (private ones too: they are the caller's). It combines with the other
filters (`markedPublic=true`, …). A malformed id is 400.

The phone's "I have it" (another collector's wish on a profile; Home with stage R7):

1. `GET /inventory/items?cardId=<the wished card>&size=50` and picks a copy: the wished printing,
   else the wished rarity, else any printing; a public copy before a private one; the newest. A
   copy filed in one of the caller's deck cores (`GET /binders`, `sellsAsCore`) is never picked:
   it sells only with its core.
2. `POST /conversations {recipientId}` (R4, as "Message"): opens or reuses the pair's chat
   **without** `subjectItemId`, so the chat's card stays what it was (review fix 1: pinning the
   copy here showed it, even a private one with its price, in the other collector's inbox before
   anything was sent, and backing out left it pinned).
3. The chat opens with "I have {card} for your wishlist. Interested?" in the message box and the
   copy waiting beside it; **nothing is sent and nothing changes in the chat** until the
   collector taps send, which posts one `CARD_LINK` with `inventoryItemId` and the text as its
   `body` (the card shared first, then the text, as screen 24 shows it). That message pins the
   copy as the chat's card (R4: the caller is the seller from then on).

## Privacy

`GeoPrivacyContractTest.profilePagesOfStageR6CarryThePlaceOnly` reads every seed collector's page
as every seed collector (the profile, the cards with `excludeDeckCoreItems=true`, the binders, the
wishes when shown, the rating summary, the 2 latest references) and their own copies of a card
with `cardId`: a state or province and a country only, the city only on its owner's profile while
shown, never a coordinate, a distance or a private note.
