# Phase 8 contract — public offers and trade workflow

## Tables

- `offer(id, item_id (target inventory item), seller_id (item owner), buyer_id (offerer), kind CASH|TRADE|MIXED, cash_amount numeric null, currency, status OPEN|COUNTERED|ACCEPTED|DECLINED|CANCELLED|EXPIRED, message ≤ 500, expires_at, created_at, updated_at, version int (optimistic), parent_offer_id null (counter chain root), current_turn SELLER|BUYER)`
- `offer_trade_item(offer_id, inventory_item_id (offerer's item), quantity)` for TRADE/MIXED — items must be the buyer's own, effective-public not required but must exist and not be deleted.
- `offer_event(id, offer_id, actor_id, event CREATED|COUNTERED|ACCEPTED|DECLINED|CANCELLED|EXPIRED|VIEWED, snapshot jsonb, created_at)` — full audit history.
- `trade(id, offer_id unique, seller_id, buyer_id, kind, cash_amount, currency, status AGREED|AWAITING_PAYMENT|PAID|SHIPPED|RECEIVED|COMPLETED|CANCELLED|DISPUTED, protection_enabled bool, meetup bool, created_at, updated_at, completed_at)`
- `trade_event(id, trade_id, actor_id|null, event, details jsonb, created_at)`
- Items with `accepts_offers=false` and availability NOT_AVAILABLE/COLLECTION_ONLY reject offers (`422 OFFERS_NOT_ACCEPTED`). Mixed offers only when the seller enabled `accepts_mixed` (profile setting) — default true for TRADE_OR_SALE items.

## Endpoints

- `POST /offers` `{ itemId, kind, cashAmount?, currency?, tradeItemIds?: [{inventoryItemId, quantity}], message?, expiresInHours? (default 72, max 168) }` → 201 OfferResponse (rate 20/day; one OPEN offer per buyer per item → `409 OFFER_ALREADY_OPEN`; buyer ≠ seller; blocks respected). Emits `OfferCreated` → OFFER_RECEIVED notification + system message in the pair conversation (created if absent) with an OFFER_LINK.
- `GET /offers?role=buyer|seller&status=&cursor=` → `CursorPage<OfferSummary>`
- `GET /offers/{id}` → OfferResponse `{ id, item: PublicInventoryItem, seller: CollectorMarker-lite, buyer: …, kind, cashAmount, currency, tradeItems: [PublicInventoryItem], message, status, currentTurn, expiresAt, history: [OfferEvent], counterOf, createdAt }` (participants only)
- `POST /offers/{id}/counter` `{ cashAmount?, tradeItemIds?, message? }` (only the party whose turn it is; creates a new offer row linked by parent, marks the previous COUNTERED, resets expiry) → OfferResponse
- `POST /offers/{id}/accept` (party whose turn it is) → creates `trade` (status AGREED, or AWAITING_PAYMENT when protection is enabled and `protectedPayments` flag on), records `interaction(OFFER_ACCEPTED)` (rating eligibility), notifies both.
- `POST /offers/{id}/decline` `{ reason? }`, `POST /offers/{id}/cancel` (buyer, while OPEN)
- `POST /internal/jobs/offers-expire` (hourly): OPEN/COUNTERED past `expires_at` → EXPIRED + notification.
- Trades: `GET /trades?role=&status=&cursor=`, `GET /trades/{id}` → `{ id, offer, status, protectionEnabled, meetup, timeline: [TradeEvent], nextAction: { actor: BUYER|SELLER, action: PAY|SHIP|CONFIRM_RECEIPT|MEET|NONE }, payment: PaymentSummary|null, dispute: DisputeSummary|null }`
- `POST /trades/{id}/meetup` (both parties mark as in-person; no payment protection), `POST /trades/{id}/complete` (both parties confirm → COMPLETED; records `interaction(TRADE)`; inventory quantities decremented via `InventoryService.reserveAndTransfer` — seller item quantity −1 (or removed), buyer may "add to inventory" from the trade page), `POST /trades/{id}/cancel` `{ reason }` (before PAID).
- Shipping/payment states are Phase 9 (`/trades/{id}/pay`, `/ship`, `/confirm-receipt`).

## State machine tests

Offer: OPEN→COUNTERED→(COUNTERED)*→ACCEPTED|DECLINED|EXPIRED; OPEN→CANCELLED (buyer) |
DECLINED (seller) | EXPIRED; ACCEPTED terminal. Only current_turn may act; optimistic locking
via `version` (`409 STALE_OFFER`). Every transition appends `offer_event`.

## UI

Item detail (public binder) → "Make an offer" dialog (cash / trade picker from own inventory /
mixed) → offer page with history timeline and Counter / Accept / Decline actions; Offers inbox
(sent / received tabs); trade page with next-action banner. Mobile equivalents under Messages
(Offers segment) and Profile → Trades.
