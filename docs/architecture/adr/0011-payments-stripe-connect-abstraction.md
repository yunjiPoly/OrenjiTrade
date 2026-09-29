# ADR 0011 — Payments through a provider abstraction (Stripe Connect), feature-flagged

**Status:** Accepted · **Date:** 2026-09-29

## Context
OrenjiTrade is an intermediary. It must never hold card data or self-custody funds and must
not describe anything as regulated escrow (spec §24, §26).

## Decision
`PaymentProvider` interface (`createProtectedPayment`, `capture`, `releasePayout`, `refund`,
`onboardSeller`, `parseWebhook`). `FakePaymentProvider` for local/test; `StripeConnectProvider`
using destination charges with delayed transfers (manual payout release after buyer
confirmation or dispute-window expiry). Webhooks verify signatures, are idempotent through a
`payment_webhook_event` table keyed by provider event id, and keep full history. Real-money
mode is behind the `protectedPayments` feature flag and requires provider configuration plus
legal review before production.

## Consequences
- Local development never needs Stripe keys.
- The user-facing language is "payment protection", never "escrow".
- Dispute evidence is a typed, extensible model; unboxing videos are explicitly deferred.
