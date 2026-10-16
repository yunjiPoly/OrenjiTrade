# Stage R4 contract — messages and Mark as sold

> Owner spec 2026-10-14 ([`docs/product/specs/2026-10-14-phone-redesign.md`](../../product/specs/2026-10-14-phone-redesign.md)),
> sections 10 (mockup screens 22 to 25), 12 ("Messaging and sales"), 13, 14 and 16 (defaults 3, 4,
> 6, 8 and 10); [ADR 0018](../../architecture/adr/0018-deals-happen-in-the-chat.md), part 2.
> Extends [phase5-chat.md](phase5-chat.md) (conversations, messages, SYSTEM messages),
> [phase7-ratings-reports-admin.md](phase7-ratings-reports-admin.md) (interactions) and
> [phase6-wishlist-notifications.md](phase6-wishlist-notifications.md) (notification types).
> Every change is additive: the paused web keeps every field it reads, and every new response
> field is optional in the schema. Field-level truth: `../openapi.json`. Migration: **V127**
> (`V127__chat_subject_and_sales.sql`).

**Deals happen in the chat and ship by mail.** Collectors never meet: they agree in the chat, the
buyer sends an address and pays the seller outside the app (Interac e-Transfer), the seller ships
with tracking and marks the chat's card or deck core sold, then both rate each other. OrenjiTrade
never handles the money and claims no protection, escrow or guarantee. A sale records that two
collectors agreed, nothing more.

All under `/api/v1`, authenticated.

## The chat's subject (the pinned card)

One chat per pair of collectors (unchanged). Its **subject** is the card or deck core it is about:
the latest one a buyer opened from a listing, or the card its owner shared (spec section 16,
default 8: the latest wins).

| Column (`conversation`, V127) | Notes |
| --- | --- |
| `subject_item_id uuid` | FK `inventory_item` (`ON DELETE SET NULL`): the card |
| `subject_binder_id uuid` | FK `binder` (`ON DELETE SET NULL`): the deck core; `ck_conversation_one_subject` keeps at most one of the two |
| `subject_set_at timestamptz` | when it was pinned; a sale counts for the subject pinned at or before it |
| `subject_set_by uuid` | FK `user_account` (`SET NULL`): its owner (shared it) or the buyer (it was public then) |

- `POST /conversations` `{ recipientId, subjectItemId?, subjectBinderId? }` (both new and
  optional): creates or reuses the pair's chat and pins the subject. It must be the recipient's and
  **public** (a buyer opening it from a listing; for a deck core: `sellsAsCore`, unsold and
  effectively public), or the **caller's own** and still there. 404 for a private, deleted or sold
  subject (nothing is created), 400 for both at once, for a third collector's card and for a binder
  that is not a deck core. Pinning the subject the chat already has pins it again (review fix 1,
  F5 and F6): its time and who pinned it become this pin's, so an earlier sale of it no longer
  shows "Sold" (the seller can record a sale of the copies left) and a card its owner shares is
  listed for the other collector. Without a subject, the chat keeps its pinned card ("Message
  {handle}" on a profile). Blocks and the messaging permission work as before (403
  `MESSAGING_BLOCKED`).
- Every pin (here, or a `CARD_LINK` with `inventoryItemId`) is pushed to both collectors on the new
  realtime queue **`/user/queue/conversations`** `{conversationId}` (review fix 1, F1): their
  clients read the conversation again, so a pinned bar follows a pin the other collector made
  without writing. Nothing else rides on it.
- `GET /conversations/{id}` (new): one conversation of the caller, as in the list, with its
  subject. 404 for non-participants and conversations hidden by a block.
- `ConversationSummary` (the list, `POST`, `PATCH`, `GET /{id}`) gains `subject`
  (`ConversationSubject`, null without one):

  | Field | Notes |
  | --- | --- |
  | `kind` | `CARD` or `DECK_CORE` |
  | `id`, `ownerId` | the item or binder; its owner is the seller, the other collector the buyer |
  | `name`, `printingCode`, `rarity` | the card (a deck core: its name, no code or rarity) |
  | `cardId`, `printingId` | the card and printing (opens "Who has this card"; null for a deck core) |
  | `imageUrl` | the card's picture (the catalog's, never an owner photo), or the deck core's first photo (else the first card picture buyers see; once sold, the first card its sale took, review fix 1, F7) |
  | `askingPriceText` | the price as typed; **null for the buyer while it is not listed** |
  | `sold` | it was marked sold in this chat: a sale not undone, made at or after it was pinned |
  | `listed` | still on offer: in the inventory (a deck core: unsold) and public, or shared by its owner in this chat |
  | `copies` | the owner's copies of a card in the inventory (owner only) |

  When the subject stops being on offer (made private, deleted or sold) the other collector still
  sees its name and picture, with `listed: false` and no price ("No longer listed" on the phone).
  A binder deleted for good, or an account purged, leaves the chat without a subject.
- `ConversationParticipant` gains `place` (`Place`: state or province and country, with its
  `label`), only while that collector is discoverable; never a city (ADR 0017). The phone's status
  line reads "Online · {province}" or "{province}".
- `LastMessage` gains `systemTopic` (`OFFER` or `SALE` for a SYSTEM message, else absent) and
  `sale` (`SaleNotice`, the sale a SYSTEM sale message announces), so the inbox words a sale for
  the reader and an old offer as "Offer (no longer available)".

## Sharing one's own card

`SendMessageRequest` gains `inventoryItemId` (optional). A `CARD_LINK` carries either
`cardPrintingId` (a catalog printing, as before) or `inventoryItemId` (one of the caller's own
cards, live in their inventory; 400 for anyone else's, a deleted one, or both fields at once).
With `inventoryItemId` the message's payload gains `item` (`SharedItem {itemId, ownerId,
askingPriceText, rarity}`, kept as it was when shared) next to `card`, and the card becomes the
chat's subject (shared by its owner: the other collector sees it, with its price, even while it is
private; it stays private for everybody else).

## Mark as sold (the `deals` module)

`sale` (V127): `id`, `conversation_id` (FK, cascade), `seller_id`, `buyer_id` (FK `user_account`,
cascade; `ck_sale_parties`), `kind` (`CARD`, `DECK_CORE`), `inventory_item_id` / `binder_id` (FK,
`SET NULL`; at most one), `name` (≤ 200, the subject's name then), `quantity` (1-9 999),
`tracking_number` (≤ 64, trimmed; the two collectors only), `item_removed` (the last copy left),
`removed_item_ids uuid[]` (a deck core's cards that left with it), `created_at`, `undone_at`.

- `POST /conversations/{id}/sales` `{ quantity?, trackingNumber?, subjectItemId?, subjectBinderId? }` → **201** `SaleResponse
  {id, conversationId, kind, itemId, binderId, sellerId, buyerId, name, quantity, trackingNumber,
  remaining, removed, createdAt, undoableUntil, undoneAt}`.
  - **The seller only**: the chat's subject must be the caller's (403 `FORBIDDEN`); 409
    `CONFLICT` for a chat without a subject; 404 for non-participants and chats hidden by a block;
    403 `MESSAGING_BLOCKED` when the buyer cannot take part (suspended, deleted).
  - `subjectItemId` / `subjectBinderId` (optional, at most one; review fix 1, F1): the card or deck
    core the seller's chat shows. 409 **`SUBJECT_CHANGED`** when it is no longer the chat's subject
    (the buyer pinned another listing since the seller looked; checked before the copies, as the
    card shown may hold more copies than a deck core sells), and nothing is sold. The phone always
    sends it; a client that names nothing (the paused web) sells the chat's current subject.
  - `quantity`: 1 by default, at most the copies held (400 otherwise); a deck core sells as one
    (400 for another number). `trackingNumber`: letters, digits, spaces, dots and dashes, starting
    with a letter or a digit, at most 64 once trimmed (inner spaces collapsed); 400 otherwise.
  - 409 `NOTHING_LEFT_TO_SELL` when the card is no longer in the inventory or the deck core is
    already sold. Two sales of the last copy at once: the second waits for the owner lock and
    answers 409.
  - Effects, in one transaction: the copies leave the inventory (at 0 the card is soft-deleted,
    restorable with its photos for 10 minutes; a deck core gets `sold_at` and its live cards are
    soft-deleted the same way, so it leaves Search and every public list); the `sale` row; a
    `SALE` interaction (`subject_type SALE`), so both can rate each other at once; a SYSTEM message
    in the chat (no sender; payload `sale` = `SaleNotice {saleId, sellerId, buyerId, kind, name,
    quantity, trackingNumber, undone}` and the de-duplication key `sale:<id>:SOLD`; neutral body
    "{seller} marked {name} as sold to {buyer}." without the tracking number), read for the seller
    and unread for the buyer, pushed to both on `/user/queue/messages`; an in-app notification for
    the buyer (`SALE_RECORDED`, not configurable, like `SYSTEM`): title "{seller} marked {name} as
    sold to you", `data {conversationId, saleId, sellerHandle, deepLink: /messages/<id>}`.
- `POST /sales/{id}/undo` → **200** the sale with `undoneAt`.
  - **The seller only** (403 `FORBIDDEN` for the buyer, 404 for anyone else), **within 10 minutes**
    (409 `SALE_UNDO_CLOSED`, extension `undoableUntil`) and **while nobody rated it** (409
    `SALE_ALREADY_RATED`). A repeated undo answers the undone sale.
  - It puts back exactly what the sale took: copies left after the sale get the sold ones back; a
    card that left comes back with its copies, binder, visibility, price, note and photos; a deck
    core loses `sold_at` and its cards come back into it. When a later sale of the card took its
    last copies since, the card comes back with this sale's copies and the later sale is marked as
    not having taken the last copies, so its own undo adds its copies back (review fix 1, F4;
    the copies went into the deleted card before). 409 `SALE_UNDO_CLOSED` when that cannot
    be done (the card's binder was deleted since): nothing is undone then. It removes the `SALE`
    interaction, withdraws the SYSTEM message (`deleted_at`; its copy, `sale.undone: true`, is
    pushed to both so their phones drop it; the chat's last message goes back to the newest one
    left) and the buyer's notification. Never refused by `inventory.items.max`.
- The interaction and the rating never overlap with an undo: `POST /ratings` holds its interaction
  `FOR KEY SHARE`, the undo takes it `FOR UPDATE` and then checks for a rating.
- Export: section `deals` (`sales`: role, the other collector's id, kind, name, quantity, tracking
  number, times). Account purge: the account's sales go (the other collector keeps the chat's
  message).

## Ratings and notifications

- `InteractionKind` gains `SALE` (V127 replaces `interaction_kind_check` and
  `interaction_subject_type_check` with `ck_interaction_kind` / `ck_interaction_subject_type`).
  `GET /ratings/eligibility` lists `SALE` interactions; the phone's "Rate {other}" in a sale message
  opens the rating with `kind=SALE`.
- Each sale can be rated, but the rated collector's summary (`rating_summary`: average and count)
  counts only the newest `SALE` rating each collector gave them (review fix 1, F10; a default the
  owner can change); every rating stays listed.
- `NotificationType` gains `SALE_RECORDED` (in-app only, follows the in-app master switch).

## Error codes (new)

`NOTHING_LEFT_TO_SELL` (409), `SALE_UNDO_CLOSED` (409), `SALE_ALREADY_RATED` (409),
`SUBJECT_CHANGED` (409, review fix 1).

## Locks

A sale and its undo write inventory items and binders: `BinderService.lockOwners` of the seller
first, then the binder rows, then the item rows, each in ascending id and `FOR NO KEY UPDATE`
(`InventorySales`; docs/database/schema.md, "Locks of binders and inventory items"; the four cases
`SALE`, `SALE_UNDO`, `DECK_CORE_SALE` and `DECK_CORE_SALE_UNDO` of
`InventoryLockOrderIT.everyWriteStartsWithTheOwnerLock`). The undo takes the owner lock before the
sale row and the interaction. Pinning a subject holds the item or binder `FOR KEY SHARE` before
the conversation row is written, so a binder delete or an account purge that holds the row never
waits for that conversation in turn.

## Privacy

- Places: the participant's place and every subject carry a state or province and a country only
  (`GeoPrivacyContractTest.chatSubjectsAndSalesCarryThePlaceOnly`).
- Tracking numbers are seen by the two collectors (and by moderators acting on a report, as
  messages are); never in logs, analytics, events or the message body other clients show.
- The buyer's address and the seller's e-Transfer email are never stored by the API: the phone
  keeps them in its secure storage and puts them into the message box; they reach the server only
  inside a message the collector sends (moderated and rate-limited like any message).
- Quick replies (review fix 1, P2): the ten fixed texts repeat by design (one seller answering six
  buyers "Yes, still available" was flagged for repeated content), so an exact quick reply skips
  the repeated-content threshold; rate limits and banned terms still apply (spec section 13).
