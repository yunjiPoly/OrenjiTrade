-- V013: card catalog (ADR 0005, ADR 0012, Phase 2 contract): sets, cards, printings, images and
-- provider sync runs. Game-specific attributes live in JSONB metadata described by game.schema.
-- Text search: generated tsvector columns (simple config + unaccent) and pg_trgm indexes.
--
-- external_ref = {"provider": "mock", "id": "..."} identifies rows imported from a CardProvider so
-- CatalogImportService can upsert idempotently; admin-created rows have no external_ref.

-- ---------------------------------------------------------------------------------------------
-- card_set
-- ---------------------------------------------------------------------------------------------
CREATE TABLE card_set (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id       uuid        NOT NULL REFERENCES game (id) ON DELETE RESTRICT,
    code          text        NOT NULL,
    name          text        NOT NULL,
    release_date  date,
    total_cards   integer,
    series        text,
    metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    external_ref  jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    search_vector tsvector    GENERATED ALWAYS AS (
                      setweight(to_tsvector('simple', unaccent_immutable(code)), 'A')
                      || setweight(to_tsvector('simple', unaccent_immutable(name)), 'A')
                      || setweight(to_tsvector('simple', unaccent_immutable(coalesce(series, ''))), 'C')
                  ) STORED,
    CONSTRAINT uq_card_set_game_code UNIQUE (game_id, code),
    CONSTRAINT ck_card_set_code CHECK (code ~ '^[A-Z0-9]{2,10}$'),
    CONSTRAINT ck_card_set_name CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT ck_card_set_total CHECK (total_cards IS NULL OR total_cards >= 0),
    CONSTRAINT ck_card_set_metadata CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT ck_card_set_external_ref CHECK (external_ref IS NULL OR (external_ref ? 'provider' AND external_ref ? 'id'))
);

CREATE INDEX ix_card_set_search_vector ON card_set USING gin (search_vector);
CREATE INDEX ix_card_set_name_trgm ON card_set USING gin (lower(unaccent_immutable(name)) gin_trgm_ops);
CREATE INDEX ix_card_set_game_release ON card_set (game_id, release_date DESC);
CREATE UNIQUE INDEX uq_card_set_external_ref ON card_set ((external_ref ->> 'provider'), (external_ref ->> 'id'))
    WHERE external_ref IS NOT NULL;

COMMENT ON TABLE card_set IS 'Card sets / expansions per game; code is upper-case and unique per game.';
COMMENT ON COLUMN card_set.metadata IS 'Game-specific set attributes (e.g. block, symbol); free-form object.';
COMMENT ON COLUMN card_set.external_ref IS 'Provider identity {provider, id} of imported sets (idempotent upserts).';

-- ---------------------------------------------------------------------------------------------
-- card: one row per distinct card (rules object) of a game.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE card (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         uuid        NOT NULL REFERENCES game (id) ON DELETE RESTRICT,
    name            text        NOT NULL,
    normalized_name text        GENERATED ALWAYS AS (lower(unaccent_immutable(name))) STORED,
    slug            text        NOT NULL,
    card_type       text,
    subtype         text,
    text            text        NOT NULL DEFAULT '',
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    external_ref    jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    search_vector   tsvector    GENERATED ALWAYS AS (
                        setweight(to_tsvector('simple', unaccent_immutable(name)), 'A')
                        || setweight(to_tsvector('simple', unaccent_immutable(coalesce(card_type, '') || ' ' || coalesce(subtype, ''))), 'B')
                        || setweight(to_tsvector('simple', unaccent_immutable(text)), 'C')
                    ) STORED,
    CONSTRAINT uq_card_game_slug UNIQUE (game_id, slug),
    CONSTRAINT ck_card_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
    CONSTRAINT ck_card_name CHECK (char_length(name) BETWEEN 1 AND 150),
    CONSTRAINT ck_card_text CHECK (char_length(text) <= 4000),
    CONSTRAINT ck_card_metadata CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT ck_card_external_ref CHECK (external_ref IS NULL OR (external_ref ? 'provider' AND external_ref ? 'id'))
);

CREATE INDEX ix_card_search_vector ON card USING gin (search_vector);
CREATE INDEX ix_card_normalized_name_trgm ON card USING gin (normalized_name gin_trgm_ops);
CREATE INDEX ix_card_metadata ON card USING gin (metadata);
CREATE INDEX ix_card_game_name ON card (game_id, normalized_name);
CREATE UNIQUE INDEX uq_card_external_ref ON card ((external_ref ->> 'provider'), (external_ref ->> 'id'))
    WHERE external_ref IS NOT NULL;

COMMENT ON TABLE card IS 'Game-agnostic card (ADR 0005); printings carry set, rarity, edition, language and finish.';
COMMENT ON COLUMN card.normalized_name IS 'Generated lower(unaccent(name)): trigram typo tolerance and accent-insensitive matching.';
COMMENT ON COLUMN card.metadata IS 'Game-specific attributes described by game.schema.metadataFields (e.g. level/atk for Yu-Gi-Oh!, hp/types for Pokémon); filtered with @> (GIN).';
COMMENT ON COLUMN card.search_vector IS 'Generated: name (A), card type + subtype (B), rules text (C), simple config, accent-insensitive.';

-- ---------------------------------------------------------------------------------------------
-- card_printing: a card in a set with a given collector number, edition, language and finish.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE card_printing (
    id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id                 uuid          NOT NULL REFERENCES card (id) ON DELETE CASCADE,
    set_id                  uuid          NOT NULL REFERENCES card_set (id) ON DELETE RESTRICT,
    collector_number        text          NOT NULL,
    rarity                  text,
    edition                 text          NOT NULL DEFAULT 'UNLIMITED',
    language                text          NOT NULL DEFAULT 'en',
    finish                  text          NOT NULL DEFAULT 'NORMAL',
    printing_code           text,
    image_id                uuid,
    market_price            numeric(12,2),
    market_price_currency   char(3),
    market_price_updated_at timestamptz,
    metadata                jsonb         NOT NULL DEFAULT '{}'::jsonb,
    external_ref            jsonb,
    created_at              timestamptz   NOT NULL DEFAULT now(),
    updated_at              timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_printing_variant UNIQUE (set_id, collector_number, edition, language, finish),
    CONSTRAINT ck_card_printing_collector_number CHECK (char_length(collector_number) BETWEEN 1 AND 20),
    CONSTRAINT ck_card_printing_edition CHECK (edition ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_card_printing_finish CHECK (finish ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_card_printing_language CHECK (language ~ '^[a-z]{2}$'),
    CONSTRAINT ck_card_printing_code CHECK (printing_code IS NULL OR printing_code ~ '^[A-Z0-9]{2,10}-[A-Z0-9]{1,12}$'),
    CONSTRAINT ck_card_printing_price CHECK (market_price IS NULL OR (market_price >= 0 AND market_price_currency IS NOT NULL)),
    CONSTRAINT ck_card_printing_currency CHECK (market_price_currency IS NULL OR market_price_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_card_printing_metadata CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT ck_card_printing_external_ref CHECK (external_ref IS NULL OR (external_ref ? 'provider' AND external_ref ? 'id'))
);

CREATE INDEX ix_card_printing_card_id ON card_printing (card_id);
CREATE INDEX ix_card_printing_set_id ON card_printing (set_id);
-- text_pattern_ops serves both the exact printing-code short-circuit and prefix autocomplete.
CREATE INDEX ix_card_printing_code ON card_printing (printing_code text_pattern_ops) WHERE printing_code IS NOT NULL;
CREATE INDEX ix_card_printing_metadata ON card_printing USING gin (metadata);
CREATE UNIQUE INDEX uq_card_printing_external_ref ON card_printing ((external_ref ->> 'provider'), (external_ref ->> 'id'))
    WHERE external_ref IS NOT NULL;

COMMENT ON TABLE card_printing IS 'Concrete printing of a card; inventory items (Phase 3) reference it.';
COMMENT ON COLUMN card_printing.printing_code IS 'Upper-case code printed on the card, e.g. LOB-EN001; an exact match short-circuits catalog search.';
COMMENT ON COLUMN card_printing.image_id IS 'Primary card_image (FRONT); NULL means the server-generated placeholder SVG.';
COMMENT ON COLUMN card_printing.market_price IS 'Indicative market price from the provider (display only, never a transaction price).';
COMMENT ON COLUMN card_printing.metadata IS 'Printing-specific attributes (e.g. foil pattern, artist, variant); free-form object.';

-- ---------------------------------------------------------------------------------------------
-- card_image
-- ---------------------------------------------------------------------------------------------
CREATE TABLE card_image (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    printing_id uuid        NOT NULL REFERENCES card_printing (id) ON DELETE CASCADE,
    kind        text        NOT NULL CHECK (kind IN ('FRONT', 'BACK', 'ART_CROP')),
    url         text        NOT NULL,
    width       integer,
    height      integer,
    source      text        NOT NULL DEFAULT 'placeholder',
    storage_key text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_image_printing_kind UNIQUE (printing_id, kind),
    CONSTRAINT ck_card_image_url CHECK (char_length(url) BETWEEN 1 AND 1000),
    CONSTRAINT ck_card_image_size CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0))
);

ALTER TABLE card_printing
    ADD CONSTRAINT fk_card_printing_image FOREIGN KEY (image_id) REFERENCES card_image (id) ON DELETE SET NULL;

COMMENT ON TABLE card_image IS 'Printing images. Locally only server-generated placeholders (/api/v1/public/placeholder-images/...); no third-party image hotlinking.';
COMMENT ON COLUMN card_image.url IS 'Absolute URL, or an API-relative path starting with / resolved against the API origin at read time.';
COMMENT ON COLUMN card_image.storage_key IS 'ObjectStorage key when the image is stored by OrenjiTrade (future uploads/mirrors).';

-- ---------------------------------------------------------------------------------------------
-- catalog_sync_run: one import of a provider catalog for a game.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE catalog_sync_run (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider           text        NOT NULL,
    game_id            uuid        NOT NULL REFERENCES game (id) ON DELETE CASCADE,
    mode               text        NOT NULL CHECK (mode IN ('FULL', 'INCREMENTAL')),
    status             text        NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    requested_by       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    started_at         timestamptz,
    finished_at        timestamptz,
    sets_upserted      integer     NOT NULL DEFAULT 0,
    cards_upserted     integer     NOT NULL DEFAULT 0,
    printings_upserted integer     NOT NULL DEFAULT 0,
    error              text
);

CREATE INDEX ix_catalog_sync_run_created_at ON catalog_sync_run (created_at DESC);
CREATE INDEX ix_catalog_sync_run_game ON catalog_sync_run (game_id, created_at DESC);

COMMENT ON TABLE catalog_sync_run IS 'Catalog imports (admin POST /admin/catalog/sync, local seed); counters are rows inserted or changed.';
COMMENT ON COLUMN catalog_sync_run.error IS 'Client-safe failure summary (no stack traces).';
