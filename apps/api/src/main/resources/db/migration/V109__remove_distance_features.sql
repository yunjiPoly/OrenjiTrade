-- V109: everything built on distances goes with the coordinates (ADR 0017). No real users, so data
-- built on distances is dropped rather than migrated.

-- ---------------------------------------------------------------------------------------------
-- Wishlist: the radius and the distance bucket of matches. Matching now compares platform
-- regions (stage S1); the wish form and the matches feature themselves are reworked later.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE wishlist_item DROP COLUMN radius_km;
ALTER TABLE wishlist_match DROP COLUMN distance_bucket;

-- Matches were found by distance: forget them (the rematch job finds them again by region) and
-- the match alerts whose text named a distance.
DELETE FROM wishlist_match;
DELETE FROM notification WHERE type = 'WISHLIST_MATCH';

COMMENT ON TABLE wishlist_match IS 'Inventory items matching a wishlist item, between collectors of the same platform region (ADR 0017); no distance.';

-- The seeded welcome notification promised collectors "nearby" on the map: the seed recreates it.
DELETE FROM notification WHERE id = '00000000-0000-4000-9a00-000000000101';

-- ---------------------------------------------------------------------------------------------
-- Plan perks built on the map radius (usage limit, entitlements, credit product, plan copy).
-- The credit ledger is append-only and keeps its history.
-- ---------------------------------------------------------------------------------------------
DELETE FROM usage_limit WHERE limit_key = 'map.radius.max_km';
DELETE FROM entitlement WHERE feature_key = 'map.radius.max_km';
DELETE FROM credit_product WHERE key = 'map_radius_day';

UPDATE plan SET description = 'Everything you need to publish binders and find collectors in your region.', updated_at = now()
 WHERE code = 'FREE' AND description = 'Everything you need to publish binders and find collectors nearby.';
UPDATE plan SET description = 'Unlimited binder views and alerts, advanced filters and no ads.', updated_at = now()
 WHERE code = 'PREMIUM' AND description = 'Unlimited binder views and alerts, a wider map radius, advanced filters and no ads.';

-- ---------------------------------------------------------------------------------------------
-- Advertising: target platform regions, countries and subdivisions instead of region labels and
-- grid cells; impressions and clicks record the region and subdivision codes.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE ad_targeting_rule DROP CONSTRAINT ck_ad_targeting_rule_cell;
ALTER TABLE ad_targeting_rule DROP CONSTRAINT ad_targeting_rule_kind_check;
-- The local seed's deck-box campaign targeted the "Montréal" label: it targets Quebec now.
UPDATE ad_targeting_rule SET value = 'CA-QC', kind = 'SUBDIVISION'
 WHERE campaign_id = '00000000-0000-4000-a200-000000000102' AND kind = 'REGION_LABEL' AND value = 'Montréal';
DELETE FROM ad_targeting_rule WHERE kind IN ('REGION_LABEL', 'GEO_CELL');
ALTER TABLE ad_targeting_rule ADD CONSTRAINT ck_ad_targeting_rule_kind
    CHECK (kind IN ('GAME', 'REGION', 'COUNTRY', 'SUBDIVISION', 'TAG', 'PLAN'));
ALTER TABLE ad_targeting_rule ADD CONSTRAINT ck_ad_targeting_rule_place CHECK (
    (kind <> 'REGION' OR value ~ '^[a-z]+(-[a-z]+)*$')
    AND (kind <> 'COUNTRY' OR value ~ '^[A-Z]{2}$')
    AND (kind <> 'SUBDIVISION' OR value ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'));

COMMENT ON TABLE ad_targeting_rule IS 'Targeting by GAME slug, REGION (platform region code), COUNTRY (ISO 3166-1 alpha-2), SUBDIVISION (ISO 3166-2), TAG slug or PLAN code (FREE, PREMIUM, ANONYMOUS); never a coordinate or a city.';

ALTER TABLE ad_impression DROP COLUMN geo_cell;
ALTER TABLE ad_impression ADD COLUMN region_code text;
ALTER TABLE ad_impression ADD COLUMN subdivision_code text;
ALTER TABLE ad_impression ADD CONSTRAINT ck_ad_impression_region CHECK (region_code IS NULL OR region_code ~ '^[a-z]+(-[a-z]+)*$');
ALTER TABLE ad_impression ADD CONSTRAINT ck_ad_impression_subdivision CHECK (subdivision_code IS NULL OR subdivision_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$');

ALTER TABLE ad_click DROP COLUMN geo_cell;
ALTER TABLE ad_click ADD COLUMN region_code text;
ALTER TABLE ad_click ADD COLUMN subdivision_code text;
ALTER TABLE ad_click ADD CONSTRAINT ck_ad_click_region CHECK (region_code IS NULL OR region_code ~ '^[a-z]+(-[a-z]+)*$');
ALTER TABLE ad_click ADD CONSTRAINT ck_ad_click_subdivision CHECK (subdivision_code IS NULL OR subdivision_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$');

-- The locally seeded house ad promised "A 100 km map radius" (fictional seed data only).
UPDATE ad_creative
   SET headline = 'Browse more binders with Premium',
       body = 'Unlimited binder views, advanced filters and no ads.',
       updated_at = now()
 WHERE id = '00000000-0000-4000-a200-000000001031'
   AND body = 'A 100 km map radius, unlimited binder views and no ads.';
