# Phase 10 contract — plans, entitlements, usage limits, credits, ads, donations, billing abstraction

## Plans and limits (ADR 0014)

Tables: `plan(id, code FREE|PREMIUM|…, name, description, monthly_price, currency, active, sort_order)`,
`plan_feature(plan_id, feature_key, enabled bool, value text null)` (e.g. `filters.advanced=true`, `ads.enabled=false`),
`usage_limit(id, plan_id, limit_key, window DAY|MONTH|TOTAL, max_value int null (null = unlimited), updated_by, updated_at)`
(keys: `binder.views.per_day` FREE 30, `wishlist.alerts.per_day` FREE 5, `wishlist.items.max` FREE 20/PREMIUM 500, `map.radius.max_km` FREE 25/PREMIUM 100, `search.filters.advanced` (feature), `binders.max` FREE 5/PREMIUM 50, `saved_searches.max` FREE 0/PREMIUM 50, `offers.per_day` 20/100),
`usage_counter(user_id, limit_key, window_start, count, unique(user_id, limit_key, window_start))` (Redis fast path + DB persistence),
`subscription(id, user_id, plan_id, status ACTIVE|PAST_DUE|CANCELLED|EXPIRED|TRIAL, provider (fake|stripe|apple|google), provider_ref, current_period_end, cancel_at_period_end, created_at)`,
`entitlement(id, user_id, feature_key, value, source SUBSCRIPTION|ADMIN_GRANT|PROMO|CREDIT_PURCHASE, expires_at null, granted_by, note)` — explicit overrides beat plan values.

Service: `Limits.check(userId, key)` → `LimitDecision { allowed, limit, used, remaining, planCode, upgradeUrl }`; `Limits.consume(...)`; `Entitlements.has(userId, featureKey)`. Controllers throw `LimitReachedException` → `429 LIMIT_REACHED` with extensions `{ limitKey, limit, used, resetsAt, upgradeUrl:"/premium" }`; UI shows a clear dialog explaining the limit and the premium benefit — never silent failure.

Endpoints: `GET /plans` (public), `GET /me/plan` → `{ plan, subscription, limits: [{key, limit, used, resetsAt}], entitlements: [] }`, `POST /me/subscription/checkout` `{ planCode, provider }` → `{ url|clientSecret }` via `BillingProvider` (fake locally; Stripe Billing adapter; App Store / Play receipt validation endpoints `POST /me/subscription/mobile-receipt` reserved for platform billing compliance), `POST /me/subscription/cancel`, webhooks `POST /webhooks/billing/{provider}` (idempotent like payments).
Admin: `GET/PUT /admin/plans`, `GET/PUT /admin/usage-limits` (edit values live; Redis invalidation; audited), `GET /admin/subscriptions?…`, `POST /admin/users/{id}/entitlements` (grant/revoke, audited).

## OriEnji credits (non-cash, non-transferable, non-withdrawable)

`credit_ledger_entry(id, user_id, amount int (±), type EARN|SPEND|GRANT|EXPIRE|ADJUST|REVERSAL, reason (REFERRAL|PROMO|REWARD|FEATURE_UNLOCK|ADMIN|…), reference_type, reference_id, idempotency_key unique, created_by, created_at)` — append-only (no UPDATE/DELETE privileges; trigger blocks changes), `credit_balance` is a materialised view / computed `SUM(amount)` with a Redis cache; reconciliation job compares cache vs sum.
Endpoints: `GET /me/credits` → `{ balance, entries: CursorPage }`, `POST /me/credits/spend` `{ featureKey, idempotencyKey }` (e.g. `premium_search_day` costs N credits → entitlement 24 h), admin `POST /admin/credits/grant` `{ userId, amount, reason, note }` (audited), `GET /admin/credits/ledger?userId=`. Referral: `referral_code(user_id, code)`, `POST /me/referrals/redeem` grants both parties.

## Advertising framework (feature flag `advertising`; internal campaigns first)

Tables: `advertiser(id, name, contact_email, status)`, `campaign(id, advertiser_id, name, status DRAFT|ACTIVE|PAUSED|ENDED, start_at, end_at, budget_total, budget_daily, spent, currency, pricing CPM|CPC|FLAT)`, `placement(id, key SEARCH_SPONSORED|MAP_PANEL|INVENTORY_SIDEBAR|COLLECTOR_PROFILE|MOBILE_FEED, name, active)`, `creative(id, campaign_id, placement_id, headline, body, image_url, cta_label, landing_url, status)`, `targeting_rule(id, campaign_id, kind GAME|REGION_LABEL|GEO_CELL|TAG|PLAN, value)` — geography only via `public_label`/grid cell, never precise points, `ad_impression(id, creative_id, user_id null (hashed), placement_key, geo_cell, created_at)`, `ad_click(...)`, `ad_conversion(...)`.
`AdProvider` interface (`selectAds(placement, context) → [AdResponse]`, `recordImpression`, `recordClick`); `InternalCampaignAdProvider` picks active creatives matching targeting with budget pacing; a future `ExternalNetworkAdProvider` adapter slot. Endpoints: `GET /ads?placement=&game=&geoCell=` (returns `[]` for users with `ads.enabled=false` entitlement or flag off), `POST /ads/{creativeId}/impression`, `GET /ads/{creativeId}/click` → 302 to landing (recorded). Admin CRUD under `/admin/ads/**` with reporting `GET /admin/ads/campaigns/{id}/stats`. UI always labels "Sponsored".

## Donations (feature flag `donations`)

`donation(id, user_id null, amount, currency, provider, provider_ref, status PENDING|SUCCEEDED|FAILED|REFUNDED, message null, public_thanks bool, created_at)`. `DonationProvider` (fake | stripe checkout). `POST /donations/checkout` `{ amount, currency, message?, publicThanks? }` → `{ url }`; webhook updates; `GET /public/donations/supporters` (opt-in names only). Clearly labelled "voluntary support"; never affects rating, ranking or trust.

## Tests

Limit enforcement (FREE hits `binder.views.per_day`; PREMIUM entitlement unlimited; admin edit takes effect after cache invalidation), entitlement override beats plan, ledger append-only (update/delete rejected), balance = sum, idempotent spend, ad targeting never reads `home_point`, donation success path with fake provider.
