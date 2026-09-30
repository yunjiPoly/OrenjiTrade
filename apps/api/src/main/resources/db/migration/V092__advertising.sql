-- V092: internal advertising framework (Phase 10 contract "Advertising framework", feature flag
-- advertising): advertisers, campaigns with budgets and pacing, placements, creatives, targeting
-- rules, impressions, clicks, conversions and daily counters. Always labelled "Sponsored".
--
-- Privacy: targeting uses the game, a region label, a public grid cell, a tag or the plan only,
-- never a point; impressions, clicks and conversions carry a pseudonymous user hash (HMAC of the
-- account id, like analytics) and the public grid cell of the context, never an account id.
-- Tables are prefixed ad_ (the contract names them advertiser, campaign, placement, ...).

-- ---------------------------------------------------------------------------------------------
-- advertiser
-- ---------------------------------------------------------------------------------------------
CREATE TABLE advertiser (
    id            uuid        PRIMARY KEY,
    name          text        NOT NULL,
    contact_email text,
    status        text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
    created_by    uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_advertiser_name CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT ck_advertiser_email CHECK (contact_email IS NULL OR char_length(contact_email) <= 254)
);

COMMENT ON TABLE advertiser IS 'Advertisers of internal campaigns (house ads and direct partners); admin console only.';
COMMENT ON COLUMN advertiser.contact_email IS 'Business contact of the advertiser; admin views only, never in ad responses.';

-- ---------------------------------------------------------------------------------------------
-- ad_placement: where ads may appear (seeded, admins toggle and size them).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ad_placement (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    key        text        NOT NULL,
    name       text        NOT NULL,
    active     boolean     NOT NULL DEFAULT true,
    max_ads    integer     NOT NULL DEFAULT 1,
    updated_by uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_ad_placement_key UNIQUE (key),
    CONSTRAINT ck_ad_placement_key CHECK (key IN ('SEARCH_SPONSORED', 'MAP_PANEL', 'INVENTORY_SIDEBAR', 'COLLECTOR_PROFILE', 'MOBILE_FEED')),
    CONSTRAINT ck_ad_placement_name CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT ck_ad_placement_max CHECK (max_ads BETWEEN 1 AND 5)
);

INSERT INTO ad_placement (key, name, max_ads) VALUES
    ('SEARCH_SPONSORED',  'Sponsored search result', 2),
    ('MAP_PANEL',         'Map side panel',          1),
    ('INVENTORY_SIDEBAR', 'Inventory sidebar',       1),
    ('COLLECTOR_PROFILE', 'Collector profile',       1),
    ('MOBILE_FEED',       'Mobile feed',             1);

-- ---------------------------------------------------------------------------------------------
-- ad_campaign
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ad_campaign (
    id                    uuid          PRIMARY KEY,
    advertiser_id         uuid          NOT NULL REFERENCES advertiser (id),
    name                  text          NOT NULL,
    status                text          NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')),
    start_at              timestamptz   NOT NULL,
    end_at                timestamptz,
    budget_total          numeric(12,2) NOT NULL,
    budget_daily          numeric(12,2),
    spent                 numeric(12,2) NOT NULL DEFAULT 0,
    currency              char(3)       NOT NULL DEFAULT 'CAD',
    pricing               text          NOT NULL CHECK (pricing IN ('CPM', 'CPC', 'FLAT')),
    bid_amount            numeric(12,2) NOT NULL DEFAULT 0,
    priority              integer       NOT NULL DEFAULT 0,
    frequency_cap_per_day integer,
    created_by            uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    updated_at            timestamptz   NOT NULL DEFAULT now(),
    version               integer       NOT NULL DEFAULT 0,
    CONSTRAINT ck_ad_campaign_name CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT ck_ad_campaign_window CHECK (end_at IS NULL OR end_at > start_at),
    CONSTRAINT ck_ad_campaign_budget CHECK (budget_total >= 0 AND spent >= 0),
    CONSTRAINT ck_ad_campaign_daily CHECK (budget_daily IS NULL OR (budget_daily > 0 AND budget_daily <= budget_total)),
    CONSTRAINT ck_ad_campaign_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_ad_campaign_bid CHECK (bid_amount >= 0 AND (pricing = 'FLAT' OR bid_amount > 0)),
    CONSTRAINT ck_ad_campaign_priority CHECK (priority BETWEEN 0 AND 100),
    CONSTRAINT ck_ad_campaign_frequency CHECK (frequency_cap_per_day IS NULL OR frequency_cap_per_day BETWEEN 1 AND 100)
);

CREATE INDEX ix_ad_campaign_serving ON ad_campaign (status, start_at, end_at);
CREATE INDEX ix_ad_campaign_advertiser ON ad_campaign (advertiser_id);

COMMENT ON TABLE ad_campaign IS 'Internal campaigns; ACTIVE ones inside [start_at, end_at) serve while their total and paced daily budgets allow.';
COMMENT ON COLUMN ad_campaign.bid_amount IS 'CPM: price per 1000 impressions; CPC: price per click; FLAT: 0 (budget_total is the flat fee).';
COMMENT ON COLUMN ad_campaign.spent IS 'Derived from ad_campaign_daily counters after every impression and click (FLAT: budget_total once served).';

-- ---------------------------------------------------------------------------------------------
-- ad_creative
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ad_creative (
    id           uuid        PRIMARY KEY,
    campaign_id  uuid        NOT NULL REFERENCES ad_campaign (id) ON DELETE CASCADE,
    placement_id uuid        NOT NULL REFERENCES ad_placement (id),
    headline     text        NOT NULL,
    body         text        NOT NULL DEFAULT '',
    image_url    text,
    cta_label    text        NOT NULL,
    landing_url  text        NOT NULL,
    status       text        NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_ad_creative_headline CHECK (char_length(headline) BETWEEN 1 AND 80),
    CONSTRAINT ck_ad_creative_body CHECK (char_length(body) <= 200),
    CONSTRAINT ck_ad_creative_cta CHECK (char_length(cta_label) BETWEEN 1 AND 30),
    CONSTRAINT ck_ad_creative_image CHECK (image_url IS NULL OR (char_length(image_url) <= 500 AND (image_url ~ '^https://' OR image_url ~ '^/[^/]'))),
    CONSTRAINT ck_ad_creative_landing CHECK (char_length(landing_url) <= 500 AND (landing_url ~ '^https://' OR landing_url ~ '^/[^/]'))
);

CREATE INDEX ix_ad_creative_campaign ON ad_creative (campaign_id);
CREATE INDEX ix_ad_creative_placement ON ad_creative (placement_id, status);

-- ---------------------------------------------------------------------------------------------
-- ad_targeting_rule: kinds combine with AND, values of one kind with OR; no rule of a kind = any.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ad_targeting_rule (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid        NOT NULL REFERENCES ad_campaign (id) ON DELETE CASCADE,
    kind        text        NOT NULL CHECK (kind IN ('GAME', 'REGION_LABEL', 'GEO_CELL', 'TAG', 'PLAN')),
    value       text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_ad_targeting_rule_value CHECK (char_length(value) BETWEEN 1 AND 120),
    CONSTRAINT ck_ad_targeting_rule_cell CHECK (kind <> 'GEO_CELL' OR value ~ '^r-?[0-9]{1,6}c-?[0-9]{1,6}$'),
    CONSTRAINT uq_ad_targeting_rule UNIQUE (campaign_id, kind, value)
);

COMMENT ON TABLE ad_targeting_rule IS 'Targeting by GAME slug, REGION_LABEL (public label or one of its comma-separated parts), GEO_CELL (public ~1 km grid cell id), TAG slug or PLAN code (FREE, PREMIUM, ANONYMOUS); never a coordinate.';

-- ---------------------------------------------------------------------------------------------
-- ad_impression / ad_click / ad_conversion
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ad_impression (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    serve_id      uuid        NOT NULL,
    creative_id   uuid        NOT NULL REFERENCES ad_creative (id) ON DELETE CASCADE,
    campaign_id   uuid        NOT NULL REFERENCES ad_campaign (id) ON DELETE CASCADE,
    placement_key text        NOT NULL,
    user_hash     text,
    geo_cell      text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_ad_impression_serve UNIQUE (serve_id),
    CONSTRAINT ck_ad_impression_hash CHECK (user_hash IS NULL OR user_hash ~ '^[0-9a-f]{32}$'),
    CONSTRAINT ck_ad_impression_cell CHECK (geo_cell IS NULL OR geo_cell ~ '^r-?[0-9]{1,6}c-?[0-9]{1,6}$')
);

CREATE INDEX ix_ad_impression_campaign ON ad_impression (campaign_id, created_at);
CREATE INDEX ix_ad_impression_frequency ON ad_impression (campaign_id, user_hash, created_at) WHERE user_hash IS NOT NULL;

COMMENT ON COLUMN ad_impression.serve_id IS 'Nonce of the signed impression token issued with the ad; one impression per serve.';
COMMENT ON COLUMN ad_impression.user_hash IS 'HMAC of the viewer''s account id (the analytics actor hash); NULL for signed-out viewers.';

CREATE TABLE ad_click (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    serve_id      uuid        NOT NULL,
    creative_id   uuid        NOT NULL REFERENCES ad_creative (id) ON DELETE CASCADE,
    campaign_id   uuid        NOT NULL REFERENCES ad_campaign (id) ON DELETE CASCADE,
    impression_id uuid        REFERENCES ad_impression (id) ON DELETE SET NULL,
    placement_key text        NOT NULL,
    user_hash     text,
    geo_cell      text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_ad_click_serve UNIQUE (serve_id),
    CONSTRAINT ck_ad_click_hash CHECK (user_hash IS NULL OR user_hash ~ '^[0-9a-f]{32}$'),
    CONSTRAINT ck_ad_click_cell CHECK (geo_cell IS NULL OR geo_cell ~ '^r-?[0-9]{1,6}c-?[0-9]{1,6}$')
);

CREATE INDEX ix_ad_click_campaign ON ad_click (campaign_id, created_at);

CREATE TABLE ad_conversion (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    click_id    uuid          NOT NULL REFERENCES ad_click (id) ON DELETE CASCADE,
    creative_id uuid          NOT NULL REFERENCES ad_creative (id) ON DELETE CASCADE,
    campaign_id uuid          NOT NULL REFERENCES ad_campaign (id) ON DELETE CASCADE,
    kind        text          NOT NULL CHECK (kind IN ('SIGNUP', 'PURCHASE', 'OTHER')),
    value       numeric(12,2),
    currency    char(3),
    user_hash   text,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT ck_ad_conversion_value CHECK ((value IS NULL AND currency IS NULL) OR (value >= 0 AND currency ~ '^[A-Z]{3}$')),
    CONSTRAINT uq_ad_conversion_click_kind UNIQUE (click_id, kind)
);

CREATE INDEX ix_ad_conversion_campaign ON ad_conversion (campaign_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- ad_campaign_daily: counters per campaign and UTC day (pacing and reporting).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ad_campaign_daily (
    campaign_id uuid   NOT NULL REFERENCES ad_campaign (id) ON DELETE CASCADE,
    day         date   NOT NULL,
    impressions bigint NOT NULL DEFAULT 0,
    clicks      bigint NOT NULL DEFAULT 0,
    conversions bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (campaign_id, day),
    CONSTRAINT ck_ad_campaign_daily_counts CHECK (impressions >= 0 AND clicks >= 0 AND conversions >= 0)
);

COMMENT ON TABLE ad_campaign_daily IS 'Impressions, clicks and conversions per campaign and UTC day; budget pacing and admin stats read it.';
