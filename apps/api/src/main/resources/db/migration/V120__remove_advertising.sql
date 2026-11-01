-- V120: advertising leaves OrenjiTrade (stage F1 "free for all", owner decision of 2026-10-14; ADR
-- 0019). The internal ads framework of V092 (advertisers, placements, campaigns, creatives,
-- targeting, impressions, clicks, conversions, daily counters) and its feature flag are removed
-- with the code that wrote them. The code is kept on the branch archive/paid-features; bringing ads
-- back means that code plus a new migration recreating these tables (V092 is their definition).
--
-- Foreign keys checked: only ad_* tables reference advertiser and ad_* tables (user_account is
-- referenced by advertiser.created_by and ad_campaign.created_by, never the other way round), so
-- the tables are dropped children first, without CASCADE. Nothing else reads them: no analytics
-- event, notification or job belongs to ads. Audit rows of the old admin actions (ads.*) stay in
-- audit_log as history; the admin audit page shows their action names as text.

DROP TABLE ad_conversion;
DROP TABLE ad_click;
DROP TABLE ad_impression;
DROP TABLE ad_campaign_daily;
DROP TABLE ad_targeting_rule;
DROP TABLE ad_creative;
DROP TABLE ad_campaign;
DROP TABLE ad_placement;
DROP TABLE advertiser;

DELETE FROM feature_flag WHERE key = 'advertising';
