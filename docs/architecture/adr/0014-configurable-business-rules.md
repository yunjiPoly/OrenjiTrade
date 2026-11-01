# ADR 0014 — Business rules (limits, delisting, flags) are data, not code

**Status:** Accepted · **Date:** 2026-09-29

## Context
Freemium limits (§29), auto-delist thresholds (§18), feature flags (§57), report reasons,
tag moderation lists and rate limits must change without a deployment.

## Decision
Tables `feature_flag`, `plan`, `plan_feature`, `usage_limit`, `usage_counter`, `entitlement`,
`delist_policy`, `moderation_rule` are edited through `/admin` (audited) and cached in Redis
with short TTL + explicit invalidation. Services resolve rules through `RuleResolver`
interfaces (`FeatureFlags.isEnabled("mlScanning")`, `Limits.check(user, "wishlist.alerts")`).
Seed migrations provide sane defaults; code contains no numeric limit constants.

## Consequences
- Admin changes take effect within the cache TTL (≤60 s) on all instances.
- Every rule table has `updated_by`/`updated_at` and audit entries.

## Amendment 2026-10-14 (stage F1, ADR 0019)

`plan`, `plan_feature` and `entitlement` are gone with Premium (V123). `usage_limit` holds one row
per key, the same for every collector (its `plan_id` was dropped, the FREE value kept), still
edited live through `/admin/usage-limits` (audited, cached ≤ 60 s, evicted on write) and still
counted in `usage_counter`. `Limits` lives in the `limits` module and resolves a key to that single
row; there is no per-account override any more. "Freemium limits" are now simply usage limits.
