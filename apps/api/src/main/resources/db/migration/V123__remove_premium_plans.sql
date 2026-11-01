-- V123: Premium subscriptions leave OrenjiTrade and the usage limits become the same caps for every
-- collector (stage F1 "free for all", owner decision of 2026-10-14; ADR 0019). Removed: the plans
-- and their feature switches (V011), the per-account overrides (entitlements, V011), the
-- subscriptions, their history and the billing provider webhooks (V090), user_account.plan_code,
-- the PREMIUM_USER role, the premiumPlans feature flag and saved_searches.max (a Premium perk of a
-- feature never built). Kept: usage_limit and usage_counter, one limit per key with today's FREE
-- numbers, edited in /admin/usage-limits as before.
--
-- The code is kept on the branch archive/paid-features; bringing Premium back means that code plus
-- a new migration recreating these objects (V011 and V090 are their definitions) and giving
-- usage_limit its plan_id back.
--
-- Foreign keys checked: subscription references plan and user_account; subscription_event and
-- billing_webhook_event reference subscription; plan_feature and usage_limit reference plan;
-- user_account.plan_code references plan.code (fk_user_account_plan); entitlement references
-- user_account only. No other table references these. The dependants are dropped first, without
-- CASCADE.

-- ---------------------------------------------------------------------------------------------
-- Subscriptions and billing webhooks (V090).
-- ---------------------------------------------------------------------------------------------
DROP TABLE billing_webhook_event;
DROP TABLE subscription_event;
DROP TABLE subscription;

-- ---------------------------------------------------------------------------------------------
-- Per-account overrides (admin grants, promotions, subscription perks; the credit purchases went
-- with V122) and the plan feature switches (filters.advanced, ads.enabled).
-- ---------------------------------------------------------------------------------------------
DROP TABLE entitlement;
DROP TABLE plan_feature;

-- ---------------------------------------------------------------------------------------------
-- usage_limit: one row per key, the FREE plan's value of today. A key that only another plan
-- defined (none in the migrations; this is defensive) was unlimited for FREE collectors, so it
-- stays unlimited for everyone. Counters (usage_counter) are per user and key: untouched.
-- ---------------------------------------------------------------------------------------------
INSERT INTO usage_limit (plan_id, limit_key, kind, limit_window, max_value, description)
SELECT DISTINCT ON (l.limit_key) f.id, l.limit_key, l.kind, l.limit_window, NULL, l.description
  FROM usage_limit l
  JOIN plan f ON f.code = 'FREE'
 WHERE NOT EXISTS (SELECT 1 FROM usage_limit x WHERE x.plan_id = f.id AND x.limit_key = l.limit_key)
 ORDER BY l.limit_key;

DELETE FROM usage_limit
 WHERE plan_id <> (SELECT id FROM plan WHERE code = 'FREE');

-- saved_searches.max (V011: 0 on FREE, 50 on PREMIUM) limited a feature that was never built: it
-- only existed as a Premium perk, so it goes with Premium, as map.radius.max_km went with the map
-- radius (V109). Nothing consumed it; any counter of it goes too. A saved-searches feature would
-- bring its own limit in its own migration.
DELETE FROM usage_limit WHERE limit_key = 'saved_searches.max';
DELETE FROM usage_counter WHERE limit_key = 'saved_searches.max';

ALTER TABLE usage_limit
    DROP CONSTRAINT uq_usage_limit_plan_key,
    DROP COLUMN plan_id;

-- The unique constraint's index serves the lookups by key.
DROP INDEX ix_usage_limit_key;
ALTER TABLE usage_limit ADD CONSTRAINT uq_usage_limit_key UNIQUE (limit_key);

COMMENT ON TABLE usage_limit IS 'Usage limits, the same for every collector (ADR 0014, ADR 0019: no plans); edited live through /admin/usage-limits (audited, cache evicted).';

-- ---------------------------------------------------------------------------------------------
-- user_account.plan_code (V003, a reference to plan.code since V011), then the plans themselves.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE user_account
    DROP CONSTRAINT fk_user_account_plan,
    DROP COLUMN plan_code;

DROP TABLE plan;

-- ---------------------------------------------------------------------------------------------
-- The PREMIUM_USER role (granted by an active subscription only).
-- ---------------------------------------------------------------------------------------------
DELETE FROM user_role WHERE role = 'PREMIUM_USER';

ALTER TABLE user_role DROP CONSTRAINT user_role_role_check;
ALTER TABLE user_role
    ADD CONSTRAINT ck_user_role_role CHECK (role IN ('USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'));

DELETE FROM feature_flag WHERE key = 'premiumPlans';

-- ---------------------------------------------------------------------------------------------
-- Old data the apps can still meet.
-- ---------------------------------------------------------------------------------------------
-- The daily "limit reached" notices (SYSTEM, data.kind = LIMIT_REACHED) carried the plan code and,
-- while premiumPlans was on, an upgradeUrl and a deepLink to /premium with an invitation to
-- upgrade. They are rewritten as the API writes them now: the limit and when it resets, no plan,
-- no link to a screen that no longer exists.
UPDATE notification
   SET data = data - 'planCode' - 'upgradeUrl' - 'deepLink',
       body = replace(
                replace(
                  replace(
                    replace(body, ' wishlist alerts on your plan.', ' wishlist alerts.'),
                    ' notifications of this kind on your plan.', ' notifications of this kind.'),
                  '; upgrade to Premium for unlimited alerts.', '. The limit resets tomorrow.'),
                ' Upgrade to Premium for unlimited alerts.', ' The limit resets tomorrow.')
 WHERE type = 'SYSTEM'
   AND data ->> 'kind' = 'LIMIT_REACHED';

-- Admin broadcasts (SYSTEM, data.kind = BROADCAST) that linked to a screen removed by stage F1
-- (Premium, credits, "Support OrenjiTrade" and their checkouts) promoted those features ("Go
-- Premium", "Invite a friend and earn credits", "Keep OrenjiTrade running with a donation"): a
-- broadcast is a mass announcement, not a collector's own history, so they are deleted. No table
-- references a notification. (A broadcast that talked about them without a link cannot be told
-- apart from any other and stays as written.)
DELETE FROM notification
 WHERE type = 'SYSTEM'
   AND data ->> 'kind' = 'BROADCAST'
   AND (data ->> 'deepLink' ~ '^/(premium|credits|support)([/?#]|$)'
        OR data ->> 'deepLink' ~ '^/checkout/fake-(billing|donation)(/|$)');

-- Any other notification linking to one of these screens (none is written by the API; this is
-- defensive) keeps its text and loses the link.
UPDATE notification
   SET data = data - 'deepLink'
 WHERE data ->> 'deepLink' ~ '^/(premium|credits|support)([/?#]|$)'
    OR data ->> 'deepLink' ~ '^/checkout/fake-(billing|donation)(/|$)';

-- Transactional outbox (V002): incomplete publications of the removed billing events cannot be
-- read any more (their classes are gone) and their listeners applied webhooks and plan changes to
-- the dropped tables: completed here, as V112 did for the removed wishlist events.
UPDATE event_publication
   SET completion_date = now(), status = 'COMPLETED'
 WHERE completion_date IS NULL
   AND event_type IN ('com.orenjitrade.api.billing.events.BillingWebhookReceived',
                      'com.orenjitrade.api.billing.events.SubscriptionChanged');

-- System Health lists every job name that ever ran: the hourly subscriptions-period job is gone.
DELETE FROM job_run WHERE name = 'subscriptions-period';

-- Audit rows of the old actions (plan.update, usage_limit.update with a plan, subscription.*,
-- entitlement.*) stay in audit_log as history; the admin audit page shows them as text.
