-- V100: card images from catalog providers and the capped local image cache (ADR 0015).
--
-- card_image becomes "one row per provider artwork": it is owned by a card (every row) and
-- optionally by one printing (printing-specific artwork, e.g. the mock placeholders). Printings
-- without their own artwork resolve their picture through card.image_id (the card's primary
-- artwork). Provider artworks keep their source reference (source_url, server-side only, never
-- returned to members) whether or not the file is cached; the cache columns describe the one local
-- rendition (re-encoded JPEG) stored under the card image cache directory.
--
-- The cache never holds more than orenji.card-images.cache.max-mb (<= 500 MB): bytes are reserved
-- in card_image_cache_reservation under a lock on the single card_image_cache_usage row
-- (SELECT ... FOR UPDATE) before a download starts; used + reserved + request > limit is refused.

-- ---------------------------------------------------------------------------------------------
-- card_image: provider artwork, owner references, cache state
-- ---------------------------------------------------------------------------------------------
ALTER TABLE card_image ALTER COLUMN printing_id DROP NOT NULL;
ALTER TABLE card_image ALTER COLUMN url DROP NOT NULL;
ALTER TABLE card_image ALTER COLUMN source DROP DEFAULT;

ALTER TABLE card_image
    ADD COLUMN game_id          uuid REFERENCES game (id) ON DELETE CASCADE,
    ADD COLUMN card_id          uuid REFERENCES card (id) ON DELETE CASCADE,
    ADD COLUMN provider         text,
    ADD COLUMN provider_image_id text,
    ADD COLUMN position         integer     NOT NULL DEFAULT 0,
    ADD COLUMN source_url       text,
    ADD COLUMN cache_status     text,
    ADD COLUMN content_type     text,
    ADD COLUMN file_size_bytes  bigint,
    ADD COLUMN checksum_sha256  text,
    ADD COLUMN downloaded_at    timestamptz,
    ADD COLUMN last_accessed_at timestamptz,
    ADD COLUMN attempt_count    integer     NOT NULL DEFAULT 0,
    ADD COLUMN last_attempt_at  timestamptz,
    ADD COLUMN last_error       text;

-- Existing rows (Phase 2: one placeholder FRONT image per printing) get their card and game.
UPDATE card_image i
   SET card_id = p.card_id,
       game_id = c.game_id
  FROM card_printing p
  JOIN card c ON c.id = p.card_id
 WHERE p.id = i.printing_id;

ALTER TABLE card_image ALTER COLUMN card_id SET NOT NULL;
ALTER TABLE card_image ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE card_image ALTER COLUMN source SET DEFAULT 'placeholder';

ALTER TABLE card_image
    ADD CONSTRAINT ck_card_image_provider_ref
        CHECK ((provider IS NULL) = (provider_image_id IS NULL)),
    ADD CONSTRAINT ck_card_image_provider_image_id
        CHECK (provider_image_id IS NULL OR provider_image_id ~ '^[A-Za-z0-9._-]{1,64}$'),
    ADD CONSTRAINT ck_card_image_location
        CHECK (url IS NOT NULL OR provider_image_id IS NOT NULL),
    ADD CONSTRAINT ck_card_image_source_url
        CHECK (source_url IS NULL OR char_length(source_url) BETWEEN 1 AND 1000),
    ADD CONSTRAINT ck_card_image_provider_columns
        CHECK (provider_image_id IS NULL OR (source_url IS NOT NULL AND cache_status IS NOT NULL)),
    ADD CONSTRAINT ck_card_image_cache_status
        CHECK (cache_status IS NULL OR cache_status IN ('NOT_CACHED', 'CACHED', 'FAILED', 'MISSING_AT_SOURCE')),
    ADD CONSTRAINT ck_card_image_cached_file
        CHECK (cache_status IS DISTINCT FROM 'CACHED'
               OR (storage_key IS NOT NULL AND file_size_bytes IS NOT NULL AND checksum_sha256 IS NOT NULL
                   AND content_type IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL)),
    ADD CONSTRAINT ck_card_image_checksum
        CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT ck_card_image_file_size
        CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
    ADD CONSTRAINT ck_card_image_position
        CHECK (position >= 0),
    ADD CONSTRAINT ck_card_image_attempts
        CHECK (attempt_count >= 0),
    ADD CONSTRAINT ck_card_image_last_error
        CHECK (last_error IS NULL OR char_length(last_error) <= 500),
    ADD CONSTRAINT ck_card_image_storage_key
        CHECK (storage_key IS NULL OR (storage_key !~ '(^/|\\|\.\.)' AND char_length(storage_key) <= 300));

CREATE UNIQUE INDEX uq_card_image_provider ON card_image (provider, provider_image_id)
    WHERE provider_image_id IS NOT NULL;
CREATE INDEX ix_card_image_card ON card_image (card_id, position);
CREATE INDEX ix_card_image_game_cache ON card_image (game_id, cache_status)
    WHERE provider_image_id IS NOT NULL;
CREATE INDEX ix_card_image_checksum ON card_image (checksum_sha256)
    WHERE checksum_sha256 IS NOT NULL;
CREATE INDEX ix_card_image_storage_key ON card_image (storage_key)
    WHERE storage_key IS NOT NULL;

COMMENT ON TABLE card_image IS 'One row per artwork: provider artworks (provider + provider_image_id, cached locally or not) and printing-specific images (mock placeholders). Never duplicated per inventory copy.';
COMMENT ON COLUMN card_image.card_id IS 'Owning card (always set); card-level artworks have printing_id NULL.';
COMMENT ON COLUMN card_image.printing_id IS 'Owning printing for printing-specific images; NULL for card-level provider artworks.';
COMMENT ON COLUMN card_image.url IS 'Legacy/placeholder location (absolute or API-relative path); NULL for provider artworks, whose client URL is derived (CardImageUrlResolver).';
COMMENT ON COLUMN card_image.source_url IS 'SERVER-SIDE ONLY: where the provider serves the artwork. Never returned to members (REHOST_REQUIRED providers such as YGOPRODeck must not be hotlinked).';
COMMENT ON COLUMN card_image.cache_status IS 'Provider artworks: NOT_CACHED, CACHED, FAILED, MISSING_AT_SOURCE. NULL for placeholders.';
COMMENT ON COLUMN card_image.storage_key IS 'Path of the cached rendition relative to the card image cache directory (<game>/<provider>/<shard>/<providerImageId>.jpg); several rows may share one file when their checksums are identical.';
COMMENT ON COLUMN card_image.position IS 'Artwork order within the card; 0 is the primary artwork.';

-- ---------------------------------------------------------------------------------------------
-- card.image_id: primary artwork of a card (printings without their own image use it)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE card ADD COLUMN image_id uuid;
ALTER TABLE card
    ADD CONSTRAINT fk_card_image FOREIGN KEY (image_id) REFERENCES card_image (id) ON DELETE SET NULL;

COMMENT ON COLUMN card.image_id IS 'Primary artwork (card_image, position 0) of the card; printings without their own image resolve their picture through it. NULL means the placeholder.';

-- ---------------------------------------------------------------------------------------------
-- Cache accounting: one usage row (locked FOR UPDATE) + capacity reservations with expiry
-- ---------------------------------------------------------------------------------------------
CREATE TABLE card_image_cache_usage (
    id             smallint    PRIMARY KEY DEFAULT 1,
    used_bytes     bigint      NOT NULL DEFAULT 0,
    file_count     integer     NOT NULL DEFAULT 0,
    reconciled_at  timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_card_image_cache_usage_single CHECK (id = 1),
    CONSTRAINT ck_card_image_cache_usage_bytes CHECK (used_bytes >= 0),
    CONSTRAINT ck_card_image_cache_usage_files CHECK (file_count >= 0)
);

INSERT INTO card_image_cache_usage (id) VALUES (1);

COMMENT ON TABLE card_image_cache_usage IS 'Single row: bytes of the final files in the card image cache. Locked with SELECT ... FOR UPDATE for every reservation, commit, eviction and reconciliation.';

CREATE TABLE card_image_cache_reservation (
    id         uuid        PRIMARY KEY,
    image_id   uuid        REFERENCES card_image (id) ON DELETE SET NULL,
    bytes      bigint      NOT NULL,
    owner      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CONSTRAINT ck_card_image_cache_reservation_bytes CHECK (bytes > 0),
    CONSTRAINT ck_card_image_cache_reservation_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_card_image_cache_reservation_owner CHECK (char_length(owner) BETWEEN 1 AND 100)
);

CREATE INDEX ix_card_image_cache_reservation_expires ON card_image_cache_reservation (expires_at);

COMMENT ON TABLE card_image_cache_reservation IS 'Capacity reserved by an in-flight download (temporary files never exceed it). Expired rows are reclaimed under the usage lock, so a crash cannot leak capacity.';
COMMENT ON COLUMN card_image_cache_reservation.owner IS 'Instance id of the API process that holds the reservation.';

-- ---------------------------------------------------------------------------------------------
-- catalog_sync_run: image mode, provider database version, progress and the import report
-- ---------------------------------------------------------------------------------------------
ALTER TABLE catalog_sync_run
    ADD COLUMN image_mode          text    NOT NULL DEFAULT 'NONE',
    ADD COLUMN image_limit         integer,
    ADD COLUMN provider_db_version text,
    ADD COLUMN phase               text,
    ADD COLUMN report              jsonb;

ALTER TABLE catalog_sync_run
    ADD CONSTRAINT ck_catalog_sync_run_image_mode
        CHECK (image_mode IN ('NONE', 'REFERENCED', 'ALL', 'LIMIT')),
    ADD CONSTRAINT ck_catalog_sync_run_image_limit
        CHECK ((image_mode = 'LIMIT') = (image_limit IS NOT NULL) AND (image_limit IS NULL OR image_limit > 0)),
    ADD CONSTRAINT ck_catalog_sync_run_phase
        CHECK (phase IS NULL OR phase IN ('FETCHING', 'METADATA', 'IMAGES', 'DONE')),
    ADD CONSTRAINT ck_catalog_sync_run_report
        CHECK (report IS NULL OR jsonb_typeof(report) = 'object');

COMMENT ON COLUMN catalog_sync_run.image_mode IS 'Image cache fill after the metadata import: NONE, REFERENCED (artworks of cards in inventories, binders, wishlists, offers, messages), ALL (until the cache is full) or LIMIT (image_limit artworks).';
COMMENT ON COLUMN catalog_sync_run.provider_db_version IS 'Provider catalog version (YGOPRODeck checkDBVer database_version) the run imported.';
COMMENT ON COLUMN catalog_sync_run.report IS 'Import report (counts, image cache figures, truncated error list); client-safe, never provider URLs.';
