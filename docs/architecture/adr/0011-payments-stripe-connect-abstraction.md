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

## Amendment 2026-10-05 (mobile stage M6): app-store purchase rules — OPEN OWNER QUESTION

**Status:** open; nothing is decided here. The mobile app (Expo, local and free only) mirrors the
web's payment protection, Premium, credits and donations on the **same local fake providers**
(`FakePaymentProvider`, `FakeBillingProvider`, `FakeDonationProvider`): their checkouts are
screens of the app (`checkout/fake/[ref]`, `checkout/fake-billing/[ref]`,
`checkout/fake-donation/[ref]`) that never ask for a card and never move money. No in-app purchase
(StoreKit / Google Play Billing) and no real provider is added, and `POST
/me/subscription/mobile-receipt` stays reserved (501 `NOT_IMPLEMENTED`).

Before any store release with real money, the owner must decide how purchases work in the store
apps, because Apple (App Store Review Guidelines 3.1.1 / 3.1.3) and Google (Play Payments policy)
require their in-app purchase systems for **digital goods and services sold inside the app**, with
regional exceptions that change over time (e.g. external purchase links where a store allows or is
required to allow them). How each OrenjiTrade purchase is likely affected (to be confirmed with
counsel and the current store rules):

| Purchase | Nature | Store rule (summary) |
| --- | --- | --- |
| Payment protection (a card bought from another collector) | physical goods between people | outside IAP: a regular payment provider (Stripe Connect) is allowed |
| Premium subscription | digital service unlocked in the app | IAP required when sold in the app, unless an exception applies |
| Credits | earned only (referrals, grants), never sold today | no purchase; becomes an IAP question if credits are ever sold |
| Donations ("Support OrenjiTrade") | voluntary payment to a company, not a registered charity | treated like a digital tip / purchase by the stores: IAP, or no in-app donation |

Options for Premium (and donations):

1. **In-app purchase** — StoreKit / Play Billing products mirroring the plans, receipts validated
   by the API (`/me/subscription/mobile-receipt`, a new `BillingProvider` for each store, store
   server notifications as webhooks), store fees (15–30 %), entitlements shared with web
   subscriptions; most work, fully compliant everywhere.
2. **Link out to the web** — the app explains Premium and links to orenjitrade.com to subscribe or
   donate, only where the store allows such links (entitlement programs, regional rules); the API
   already applies a web subscription to the account everywhere.
3. **Web-only purchases** — the store apps show the current plan and its limits but sell nothing
   and do not link to a purchase ("reader"-style); Premium and donations are bought on the website
   only. Least work, least friction with the stores, weakest conversion.

Until the owner decides, the local builds keep the fake providers (clearly labelled "Local test
payment"), and no store build is produced (EAS stays unused).
