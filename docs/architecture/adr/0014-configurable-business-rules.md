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
