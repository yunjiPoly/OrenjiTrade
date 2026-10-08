-- V108: collectors declare a country, a state/province and an optional city instead of a trading
-- area (ADR 0017, supersedes the location model of ADR 0004). Owner decision 2026-10-08: no
-- coordinates, GPS, geocoding, distances or "nearby" anywhere.
--
-- There are no real users (fictional seed and test data only), so nothing is migrated: the old
-- table with its private centre, radius, source, derived public point, label, grid cell and GiST
-- index is dropped with its data. Every account has no location until it sets one, and nobody
-- stays discoverable without a location.

DROP TABLE user_location;

CREATE TABLE user_location (
    user_id          uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    country_code     text        NOT NULL REFERENCES country (code) ON UPDATE CASCADE,
    subdivision_code text        NOT NULL,
    city             text,
    show_city        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_location_subdivision FOREIGN KEY (country_code, subdivision_code)
        REFERENCES subdivision (country_code, code) ON UPDATE CASCADE,
    CONSTRAINT ck_user_location_city CHECK (
        city IS NULL OR (char_length(city) BETWEEN 1 AND 80 AND city = btrim(city)))
);

CREATE INDEX ix_user_location_subdivision ON user_location (subdivision_code);
CREATE INDEX ix_user_location_country ON user_location (country_code);

COMMENT ON TABLE user_location IS 'Self-declared collector location (ADR 0017): country, state/province and optional city; no coordinates. Owned by the location module.';
COMMENT ON COLUMN user_location.subdivision_code IS 'ISO 3166-2 first-level code (or the alpha-2 code of a whole-country pseudo-subdivision); public as state/province + country.';
COMMENT ON COLUMN user_location.city IS 'Optional free text (trimmed, at most 80 characters, moderated like profile text), never geocoded. Shown only on the owner''s public profile while show_city is true; never in lists, search, analytics or logs.';
COMMENT ON COLUMN user_location.show_city IS '"Show my city on my profile" (default on). When off, the profile shows state/province + country only.';

-- Nobody has a location any more: nobody may stay discoverable (country + subdivision required).
-- The local seed (SeedDataRunner) gives the fictional seed accounts a location again and restores
-- their seeded discoverability.
UPDATE privacy_settings SET discoverable = false, updated_at = now() WHERE discoverable;

-- Distances are gone, so is the switch that hid them.
ALTER TABLE privacy_settings DROP COLUMN show_distance;

COMMENT ON COLUMN privacy_settings.discoverable IS 'Opt-in (default off) to appear in region search, card holder lists and the state binder lists of the map; requires a country and a state/province (ADR 0017).';
COMMENT ON INDEX ix_privacy_settings_map IS 'Collectors that may appear in region search and the state binder lists (discoverable, profile not PRIVATE).';
