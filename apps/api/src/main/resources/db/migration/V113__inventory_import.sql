-- V113: inventory import (stage S5, owner spec 2026-10-08 section 6): the preview of a YDK deck
-- file or of a Collectr CSV export, kept on the server for a short time between the upload and
-- the commit, the settings that bound a file, and the inventory size limit an import respects.
--
-- A preview holds what its rows need and nothing else of the file: a passcode, or a card name,
-- set, number and rarity as written (so a row that fits nothing can be shown), and the copies.
-- Never the file, never its name, never a price.

-- ---------------------------------------------------------------------------------------------
-- inventory_import: one preview, owned by its collector
-- ---------------------------------------------------------------------------------------------
CREATE TABLE inventory_import (
    id            uuid        PRIMARY KEY,
    owner_id      uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    source        text        NOT NULL CHECK (source IN ('YDK', 'COLLECTR_CSV')),
    status        text        NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING', 'COMMITTING', 'COMMITTED')),
    include_main  boolean     NOT NULL DEFAULT true,
    include_extra boolean     NOT NULL DEFAULT true,
    include_side  boolean     NOT NULL DEFAULT true,
    ignored_lines integer     NOT NULL DEFAULT 0,
    revision      bigint      NOT NULL DEFAULT 0,
    total_chunks  integer,
    chunks_done   integer     NOT NULL DEFAULT 0,
    result        jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    committed_at  timestamptz,
    CONSTRAINT ck_inventory_import_ignored CHECK (ignored_lines >= 0),
    CONSTRAINT ck_inventory_import_chunks
        CHECK (chunks_done >= 0 AND (total_chunks IS NULL OR chunks_done <= total_chunks)),
    CONSTRAINT ck_inventory_import_started
        CHECK ((status = 'PENDING') = (total_chunks IS NULL)),
    CONSTRAINT ck_inventory_import_committed
        CHECK ((status = 'COMMITTED') = (committed_at IS NOT NULL)),
    CONSTRAINT ck_inventory_import_result
        CHECK (result IS NULL OR jsonb_typeof(result) = 'object')
);

CREATE INDEX ix_inventory_import_owner ON inventory_import (owner_id, created_at DESC);
CREATE INDEX ix_inventory_import_expires ON inventory_import (expires_at);

COMMENT ON TABLE inventory_import IS 'Preview of an inventory import (YDK deck file or Collectr CSV export), stored between the upload and the commit and purged after expires_at (job inventory-import-purge). Owner only: another collector gets 404.';
COMMENT ON COLUMN inventory_import.status IS 'PENDING: editable preview. COMMITTING: the commit wrote at least one chunk and the rows are frozen; a repeated commit continues after chunks_done. COMMITTED: done, result kept until expires_at so a repeated commit answers the same.';
COMMENT ON COLUMN inventory_import.include_main IS 'YDK: whether the copies of the main deck count (include_extra, include_side: the extra and the side deck).';
COMMENT ON COLUMN inventory_import.ignored_lines IS 'Lines of the file that were no card (YDK: no passcode; CSV: rows without a card name).';
COMMENT ON COLUMN inventory_import.revision IS 'Raised by every edit; a commit that planned from an older revision plans again.';
COMMENT ON COLUMN inventory_import.total_chunks IS 'Chunks of at most 500 items the commit writes, one transaction each (docs/database/schema.md, "A new bulk write"); NULL until the commit starts.';
COMMENT ON COLUMN inventory_import.result IS 'Counts of the commit so far (itemsCreated, itemsMerged, copiesAdded, rowsImported); never file content.';
COMMENT ON COLUMN inventory_import.expires_at IS 'A PENDING preview is refused after it; a commit moves it to committed_at + the same time to live.';

-- ---------------------------------------------------------------------------------------------
-- inventory_import_row: one row of the file, matched to the catalog
-- ---------------------------------------------------------------------------------------------
CREATE TABLE inventory_import_row (
    id                     uuid    PRIMARY KEY,
    import_id              uuid    NOT NULL REFERENCES inventory_import (id) ON DELETE CASCADE,
    position               integer NOT NULL,
    passcode               text,
    source_name            text,
    source_set             text,
    source_number          text,
    source_rarity          text,
    qty_main               integer,
    qty_extra              integer,
    qty_side               integer,
    file_quantity          integer NOT NULL,
    quantity               integer,
    card_id                uuid    REFERENCES card (id) ON DELETE SET NULL,
    unmatched_reason       text,
    printing_count         integer NOT NULL DEFAULT 0,
    suggested_printing_ids uuid[]  NOT NULL DEFAULT '{}',
    printing_id            uuid    REFERENCES card_printing (id) ON DELETE SET NULL,
    printing_choice        text,
    condition              text,
    condition_source       text    NOT NULL DEFAULT 'DEFAULT',
    language               text,
    edition                text,
    included               boolean NOT NULL DEFAULT true,
    commit_chunk           integer,
    CONSTRAINT uq_inventory_import_row_position UNIQUE (import_id, position),
    CONSTRAINT ck_inventory_import_row_position CHECK (position >= 0),
    CONSTRAINT ck_inventory_import_row_passcode CHECK (passcode IS NULL OR passcode ~ '^[0-9]{1,10}$'),
    CONSTRAINT ck_inventory_import_row_source
        CHECK (char_length(source_name) <= 150 AND char_length(source_set) <= 120
               AND char_length(source_number) <= 40 AND char_length(source_rarity) <= 60),
    CONSTRAINT ck_inventory_import_row_sections
        CHECK ((qty_main IS NULL OR qty_main >= 0) AND (qty_extra IS NULL OR qty_extra >= 0)
               AND (qty_side IS NULL OR qty_side >= 0)),
    CONSTRAINT ck_inventory_import_row_file_quantity CHECK (file_quantity BETWEEN 0 AND 9999),
    CONSTRAINT ck_inventory_import_row_quantity CHECK (quantity IS NULL OR quantity BETWEEN 1 AND 9999),
    CONSTRAINT ck_inventory_import_row_reason
        CHECK (unmatched_reason IS NULL OR unmatched_reason IN
               ('UNKNOWN_PASSCODE', 'UNKNOWN_CARD', 'AMBIGUOUS_CARD', 'UNKNOWN_GAME', 'NO_PRINTING', 'INVALID_QUANTITY')),
    CONSTRAINT ck_inventory_import_row_choice
        CHECK (printing_choice IS NULL OR printing_choice IN ('AUTO', 'MANUAL', 'MOST_RECENT')),
    CONSTRAINT ck_inventory_import_row_condition
        CHECK (condition IS NULL OR condition ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_inventory_import_row_condition_source
        CHECK (condition_source IN ('DEFAULT', 'FILE', 'EDITED')),
    CONSTRAINT ck_inventory_import_row_language CHECK (language IS NULL OR language ~ '^[a-z]{2}$'),
    CONSTRAINT ck_inventory_import_row_edition
        CHECK (edition IS NULL OR edition ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_inventory_import_row_printing_count CHECK (printing_count >= 0),
    CONSTRAINT ck_inventory_import_row_chunk CHECK (commit_chunk IS NULL OR commit_chunk >= 1)
);

-- The foreign keys to the catalog (ON DELETE SET NULL) are checked from the catalog side when a
-- card or a printing is deleted.
CREATE INDEX ix_inventory_import_row_card ON inventory_import_row (card_id) WHERE card_id IS NOT NULL;
CREATE INDEX ix_inventory_import_row_printing ON inventory_import_row (printing_id) WHERE printing_id IS NOT NULL;
CREATE INDEX ix_inventory_import_row_chunk ON inventory_import_row (import_id, commit_chunk) WHERE commit_chunk IS NOT NULL;

COMMENT ON TABLE inventory_import_row IS 'One row of an import preview. Of the file it keeps only what the preview shows (passcode; card name, set, number and rarity as written) and the copies: never a price.';
COMMENT ON COLUMN inventory_import_row.passcode IS 'YDK: the card passcode, without leading zeros.';
COMMENT ON COLUMN inventory_import_row.source_name IS 'CSV: the card name as the file wrote it (shown when the row fits nothing).';
COMMENT ON COLUMN inventory_import_row.qty_main IS 'YDK: copies in the main deck (qty_extra, qty_side: extra and side deck); NULL for CSV rows.';
COMMENT ON COLUMN inventory_import_row.file_quantity IS 'Copies the file says (YDK: every section together); 0 when the file wrote no number of copies.';
COMMENT ON COLUMN inventory_import_row.quantity IS 'Copies the collector typed for this row; NULL = the copies of the file (YDK: of the sections that count).';
COMMENT ON COLUMN inventory_import_row.card_id IS 'The card the row is; NULL when it fits nothing (unmatched_reason) or when the card left the catalog.';
COMMENT ON COLUMN inventory_import_row.suggested_printing_ids IS 'CSV: the printings that fit what the row says, when that is fewer than every printing of the card (at most 50).';
COMMENT ON COLUMN inventory_import_row.printing_id IS 'The printing chosen: by the import when the row fits exactly one (AUTO), by the collector (MANUAL) or by "use the most recent printing" (MOST_RECENT); NULL = to choose.';
COMMENT ON COLUMN inventory_import_row.condition_source IS 'DEFAULT: the file names no condition, so the row has the last (lowest) condition of the game. FILE: from the file. EDITED: typed by the collector.';
COMMENT ON COLUMN inventory_import_row.language IS 'CSV: the language the file names for the copy; NULL = the printing''s (edition: likewise).';
COMMENT ON COLUMN inventory_import_row.commit_chunk IS 'The chunk that writes this row, set when the commit starts; NULL = not imported (left out, to choose, unmatched).';

-- ---------------------------------------------------------------------------------------------
-- inventory.import.* platform settings (ADR 0014), edited through
-- PUT /api/v1/admin/inventory/import-settings.
-- ---------------------------------------------------------------------------------------------
INSERT INTO platform_settings (key, value, description) VALUES
    ('inventory.import.ydk_max_kb',          '100',  'Largest YDK deck file in kB (1-1024).'),
    ('inventory.import.ydk_max_lines',       '500',  'Most lines of a YDK deck file (10-5000).'),
    ('inventory.import.csv_max_kb',          '2048', 'Largest Collectr CSV export in kB (16-8192).'),
    ('inventory.import.csv_max_rows',        '5000', 'Most rows of a Collectr CSV export (10-20000).'),
    ('inventory.import.preview_ttl_minutes', '60',   'Minutes an import preview is kept, and its result after the commit (5-1440).');

-- ---------------------------------------------------------------------------------------------
-- inventory.items.max: the inventory size limit (ADR 0014). No plan limits it today: the row
-- exists so POST /inventory/items and the import have a limit to respect, and an admin gives it a
-- number through /admin/usage-limits when the owner decides one.
-- ---------------------------------------------------------------------------------------------
INSERT INTO usage_limit (plan_id, limit_key, kind, limit_window, max_value, description)
SELECT p.id, 'inventory.items.max', 'COUNTER', 'TOTAL', NULL, 'Inventory items'
  FROM plan p
ON CONFLICT (plan_id, limit_key) DO NOTHING;
