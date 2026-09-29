# Phase 9 contract — payment protection, shipping confirmation, disputes (feature flag `protectedPayments`)

Never store card numbers, CVV or bank credentials. Never call anything "escrow". Language:
"payment protection" / "protected payment".

## Provider abstraction (ADR 0011)

```java
public interface PaymentProvider {
  String providerId();                                   // "fake" | "stripe"
  SellerOnboarding onboardSeller(UUID userId, String returnUrl);      // Connect account link
  SellerAccountStatus sellerStatus(UUID userId);
  ProtectedPayment createProtectedPayment(CreatePaymentRequest r);   // returns client secret / checkout url
  void releasePayout(String paymentRef);                 // transfer to seller after receipt/dispute window
  Refund refund(String paymentRef, Money amount, String reason);
  WebhookEvent parseWebhook(String payload, Map<String,String> headers); // verifies signature
}
```
`FakePaymentProvider` (local/test): in-memory, exposes `POST /internal/fake-payments/{ref}/succeed|fail` and
emits synthetic webhooks. `StripeConnectProvider`: destination charges with `transfer_data`
and manual payout release (`capture_method=automatic`, transfer created on release), Connect
Express onboarding, webhook signature verification (`Stripe-Signature`).

## Tables

- `seller_account(user_id pk, provider, provider_account_id, status NOT_STARTED|PENDING|ACTIVE|RESTRICTED, payouts_enabled bool, updated_at)`
- `payment(id, trade_id unique, provider, provider_ref, status REQUIRES_ACTION|SECURED|PAYOUT_PENDING|PAID_OUT|REFUNDED|PARTIALLY_REFUNDED|FAILED|CANCELLED, amount, currency, platform_fee, seller_amount, secured_at, payout_released_at, refunded_at, dispute_window_ends_at, created_at, updated_at, version)`
- `payment_event(id, payment_id, event, provider_event_id null, details jsonb, created_at)`
- `payment_webhook_event(id, provider, provider_event_id unique, type, received_at, processed_at null, status RECEIVED|PROCESSED|IGNORED|FAILED, payload jsonb, error null)` — idempotency by `provider_event_id`; retries tolerated.
- `shipment(id, trade_id unique, carrier null, tracking_number null, shipped_at, delivered_at null, notes)`
- `dispute(id, trade_id unique, opened_by, reason NOT_RECEIVED|NOT_AS_DESCRIBED|COUNTERFEIT|DAMAGED|OTHER, description, status OPEN|UNDER_REVIEW|FROZEN|RESOLVED_BUYER|RESOLVED_SELLER|RESOLVED_SPLIT|CLOSED, opened_at, resolved_at, resolved_by, resolution_note, refund_amount null)`
- `dispute_evidence(id, dispute_id, submitted_by, kind TEXT|IMAGE|DOCUMENT|TRACKING (extensible; VIDEO reserved, not enabled), body text null, storage_key null, url null, created_at)`
- `dispute_event(id, dispute_id, actor_id null, event, details jsonb, created_at)`
- `platform_settings` rows: `payments.dispute_window_days` (default 7), `payments.platform_fee_percent`, `payments.auto_release_enabled`.

## Endpoints

- `POST /me/seller-account/onboarding` → `{ url }` ; `GET /me/seller-account` → status
- `POST /trades/{id}/pay` (buyer; trade AWAITING_PAYMENT; seller ACTIVE) → `{ paymentId, clientSecret|checkoutUrl, provider }`; webhook `payment.secured` → payment SECURED, trade PAID, seller notified "Ship now".
- `POST /trades/{id}/ship` `{ carrier?, trackingNumber?, notes? }` (seller; trade PAID) → SHIPPED, buyer notified.
- `POST /trades/{id}/confirm-receipt` (buyer; SHIPPED) → RECEIVED → payout release (`PaymentProvider.releasePayout`) → COMPLETED, PAID_OUT; interaction(TRADE) recorded.
- `POST /internal/jobs/payments-auto-release` (hourly): SHIPPED trades whose `dispute_window_ends_at` (shipped_at + window) passed without dispute → treated as received (buyer notified beforehand at −48 h).
- `POST /trades/{id}/disputes` `{ reason, description }` (buyer; PAID|SHIPPED, within window) → DISPUTED, payout frozen; `POST /disputes/{id}/evidence` (multipart or text; ≤ 10 per party; kinds TEXT|IMAGE|DOCUMENT|TRACKING); `GET /disputes/{id}` (parties + admin) → detail with timeline and evidence; `POST /disputes/{id}/messages` (thread visible to admin).
- Webhooks: `POST /webhooks/payments/{provider}` (permitAll, signature verified, idempotent, stores every event, responds 200 fast, processes via domain event).
- Admin: `GET /admin/transactions?status=&page=` (trades with payment), `GET /admin/transactions/pending-shipment`, `GET /admin/transactions/pending-confirmation`, `GET /admin/disputes?status=`, `GET /admin/disputes/{id}` (full history incl. account history of both parties, ratings, reports, moderator notes), `POST /admin/disputes/{id}/freeze` / `unfreeze`, `POST /admin/disputes/{id}/notes`, `POST /admin/disputes/{id}/resolve` `{ outcome: BUYER|SELLER|SPLIT, refundAmount?, note }` → refund via provider where authorized and/or payout release; `GET /admin/payments?status=`, `POST /admin/payments/{id}/refund` `{ amount, reason }` (SUPER_ADMIN or ADMIN with policy flag), `GET /admin/payments/webhooks?status=`. All audited (`audit_log`) with request id.

## Tests (must exist)

Webhook idempotency (same event id twice → one state change), signature failure → 400 and
event stored as IGNORED, state machine transitions incl. dispute freeze, refund path with
FakePaymentProvider, auto-release job respects window and disputes, authorization (only
parties/admins), feature flag off → `404 FEATURE_DISABLED` on all payment routes.
