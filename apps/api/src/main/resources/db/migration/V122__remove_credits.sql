-- V122: OrenjiTrade credits leave OrenjiTrade (stage F1 "free for all", owner decision of
-- 2026-10-14; ADR 0019): the append-only ledger and its derived balances, the credit products,
-- referral codes and redemptions of V091, the credits.* platform settings, the credits feature flag
-- and the perks credits had bought. The code is kept on the branch archive/paid-features; bringing
-- credits back means that code plus a new migration recreating these objects (V091 is their
-- definition).
--
-- Foreign keys checked: the credit tables reference user_account only, and no table references
-- them. The ledger's append-only trigger and function go with the table (the trigger fires on
-- UPDATE, DELETE and TRUNCATE, never on DROP). No analytics event or notification belongs to
-- credits. Audit rows of the old admin actions (credits.grant, credits.product.update,
-- credits.settings.update) stay in audit_log as history.

DROP VIEW credit_balance;
DROP TABLE credit_ledger_entry;
DROP FUNCTION credit_ledger_entry_append_only();
DROP TABLE referral_redemption;
DROP TABLE referral_code;
DROP TABLE credit_product;

DELETE FROM platform_settings WHERE key LIKE 'credits.%';

DELETE FROM feature_flag WHERE key = 'credits';

-- Perks bought with credits (time-boxed entitlements, V011): they end with the credits. The other
-- entitlements go with the Premium plans (V123).
DELETE FROM entitlement WHERE source = 'CREDIT_PURCHASE';

-- The admin console's System Health lists every job name that ever ran (job_run): the hourly
-- credits-reconcile job no longer exists, so its history would show as a job that stopped.
DELETE FROM job_run WHERE name = 'credits-reconcile';
