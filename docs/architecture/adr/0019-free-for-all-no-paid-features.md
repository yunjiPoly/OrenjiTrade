# ADR 0019 — Free for all: no paid features for now

**Status:** Accepted · **Date:** 2026-10-14 · **Amends:** [0011](0011-payments-stripe-connect-abstraction.md),
[0014](0014-configurable-business-rules.md), [0016](0016-low-cost-first-year-production-profile.md),
[0017](0017-platform-regions-instead-of-geolocation.md) · **Stage:** F1 ("free for all")

(ADR 0018, "deals happen in the chat", belongs to the phone redesign's stage R1, built at the same
time on its own branch.)

## Context

Phase 10 built four ways to make money, each behind a feature flag and switched off at launch
(V105, the launch configuration of 2026-10-05): **Premium subscriptions** (plans with features
and higher limits, per-account entitlements, a billing provider with a fake and a Stripe Billing
adapter, webhooks and an hourly period job), **sponsored placements** (an internal ads framework
with advertisers, campaigns, creatives, targeting, impressions, clicks and conversions), **credits**
(an append-only ledger, products that unlock a perk for a day, referral codes and an hourly
reconcile job) and **voluntary donations** ("Support OrenjiTrade", a fake donation provider, a
public supporters wall). None of them was ever switched on in production; nothing is deployed.

On 2026-10-14 the owner decided: *"can you remove the implementation of premium subscription and
ads? Just save pay service feature in a new branch for later. I am trying to make this app free for
all first."* Asked to be precise, the owner chose to remove all four features everywhere (the
phone, the server and the paused web app), to keep the usage limits that Premium used to raise as
the same caps for everyone (today's free numbers, still edited in `/admin/usage-limits`), and to
keep protected payments.

## Decision

1. **Removed** from `apps/api`, `apps/mobile` and `apps/web-angular`: the `billing`, `credits`,
   `donations` and `ads` modules, their routes, screens, admin pages, jobs, seeds, tests and E2E
   flows; the plans (`plan`, `plan_feature`), the per-account overrides (`entitlement`), the
   `PREMIUM_USER` role, `user_account.plan_code`, the `premiumPlans`, `credits`, `donations` and
   `advertising` flags, the `credits.*` and `donations.*` platform settings, every upgrade offer
   and every sponsored slot. Migrations V120 (ads), V121 (donations), V122 (credits) and V123
   (Premium) drop their tables, columns, rows and flags.
2. **Usage limits stay, the same for every collector.** A new `limits` module holds what the
   billing module had for them: `Limits`, one `usage_limit` row per key (plan_id dropped, the
   FREE row kept with any admin edit; `saved_searches.max`, which limited a feature never built
   and only existed as a Premium perk, goes, as `map.radius.max_km` went with the map radius in
   V109), `usage_counter`, the 429 `LIMIT_REACHED` problem without
   `planCode` or `upgradeUrl`, `GET /api/v1/me/limits` (replaces `GET /me/plan`) and
   `GET`/`PUT /api/v1/admin/usage-limits` (one row per key). A collector who reaches a limit is
   told which limit, how much is used and when it resets; nothing offers a plan.
3. **Protected payments stay** as they are on the server and the web (the `payments` module,
   `PaymentProvider`, `StripeConnectProvider`, `FakePaymentProvider`, the `protectedPayments`
   flag). Nothing they need was shared with billing or donations except a webhook signature
   helper of their own (`payments/infra/WebhookSignatures`); the common `SignedWebhooks` helper,
   used only by billing, donations and ads, is gone.
4. **Saved for later**: the whole implementation stays on the pushed branch
   `archive/paid-features` (main at `bf87f0b`, before stage S6, which changed none of these
   features). Bringing a feature back means restoring its module and clients from that branch
   **plus a new migration** recreating its tables, rows and flags (V011, V090 to V093 are their
   original definitions; usage limits would get their `plan_id` back) — never editing V120 to
   V123.

## Consequences

- The product is free: no screen sells anything, and the legal drafts no longer describe plans,
  credits, donations or advertising (a list of the changes is in IMPLEMENTATION_STATUS.md, stage
  F1, for the lawyer).
- Limits are a single table edited live; a different cap for some collectors would need a new
  decision (and new code: there is no per-account override any more).
- Old data the apps can still meet: the daily "limit reached" notices lose their plan, upgrade
  link and Premium sentence (V123 rewrites them); admin broadcasts that linked to a removed page
  promoted it and are deleted; any other notification linking to one loses the link; outbox rows of the removed events are completed; the run history of the two
  removed jobs is deleted so System Health does not show them as stopped; admin audit rows of the
  old actions (`plan.update`, `credits.grant`, `ads.campaign.create`, `donation.refund`,
  `subscription.cancel`, `entitlement.grant`, ...) stay as history and render as text. The phone
  and the web also ignore an old `upgradeUrl` and never follow an old link to `/premium`,
  `/credits`, `/support` or their checkouts (the phone says the app is free).
- Cost (ADR 0016): two hourly Cloud Scheduler jobs (`credits-reconcile`, `subscriptions-period`)
  and the `ads-token-secret` and `stripe-billing-webhook-secret` secrets go; 7 jobs remain. The
  Redis caches of plans, entitlements, credit balances and products go; the usage limits cache
  (`orenji:cache:usage-limits:v1`, 60 s) and the counters mirror stay.
- ADR 0011's open question on app-store purchases now only concerns protected payments (physical
  goods between people, outside in-app purchase rules); Premium, credits and donations are no
  longer sold anywhere.
- The phone redesign spec of 2026-10-14 (owner's verbatim text) still says these features "keep
  their flags" or "move into Settings": this later decision of the owner wins.
