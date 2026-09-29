-- V005: collector location (ADR 0004).
--
-- PRIVACY: home_point and trading_area_center are private. Only the location module reads them
-- and they are never serialised to other users, logged or put into events. Every public query
-- uses public_point, a server-derived point (1 km grid snap + deterministic per-user HMAC jitter,
-- 3 decimals) that is NULL while the collector is not discoverable.

CREATE TABLE user_location (
    user_id               uuid                    PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    home_point            geography(Point, 4326),
    trading_area_center   geography(Point, 4326)  NOT NULL,
    trading_area_radius_m integer                 NOT NULL,
    source                text                    NOT NULL CHECK (source IN ('MANUAL', 'DEVICE')),
    public_point          geography(Point, 4326),
    public_label          text,
    grid_cell             text,
    created_at            timestamptz             NOT NULL DEFAULT now(),
    updated_at            timestamptz             NOT NULL DEFAULT now(),
    CONSTRAINT ck_user_location_radius CHECK (trading_area_radius_m BETWEEN 1000 AND 50000),
    CONSTRAINT ck_user_location_public CHECK (
        (public_point IS NULL AND grid_cell IS NULL) OR (public_point IS NOT NULL AND grid_cell IS NOT NULL))
);

CREATE INDEX ix_user_location_public_point ON user_location USING gist (public_point) WHERE public_point IS NOT NULL;
CREATE INDEX ix_user_location_grid_cell ON user_location (grid_cell) WHERE grid_cell IS NOT NULL;

COMMENT ON TABLE user_location IS 'Collector location (ADR 0004): private centre + derived public point.';
COMMENT ON COLUMN user_location.home_point IS 'PRIVATE. Precise device location if ever shared (not written by the Phase 1 API). Read only inside the location module; never serialised, logged or exported.';
COMMENT ON COLUMN user_location.trading_area_center IS 'PRIVATE. User-chosen approximate centre, stored rounded to 3 decimals. Returned only to the owner (GET /me/location, GET /me/export); never in public responses.';
COMMENT ON COLUMN user_location.trading_area_radius_m IS 'Radius of the trading area in metres (1-50 km).';
COMMENT ON COLUMN user_location.source IS 'MANUAL (map pick / region) or DEVICE (the centre came from the device; the server still snaps).';
COMMENT ON COLUMN user_location.public_point IS 'PUBLIC. Derived: ~1 km grid snap + deterministic HMAC-SHA256 jitter, rounded to 3 decimals. NULL while the collector is not discoverable or a deletion is pending. The only geography public queries may use.';
COMMENT ON COLUMN user_location.public_label IS 'PUBLIC. Region label derived for the public point, e.g. "Plateau-Mont-Royal, Montréal".';
COMMENT ON COLUMN user_location.grid_cell IS 'Id of the ~1 km grid cell of the public point ("r<row>c<col>"); the only location value analytics may carry.';
