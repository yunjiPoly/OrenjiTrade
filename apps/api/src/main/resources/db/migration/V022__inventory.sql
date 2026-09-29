-- V022: inventory items, item images and freshness events (Phase 3 contract "Tables").
--
-- PRIVACY: inventory_item.notes is private to the owner (never in public responses, events or
-- logs). Items never carry a location: public views derive the owner's approximate position from
-- user_location.public_point only (ADR 0004).

CREATE TABLE inventory_item (
    id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id               uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    binder_id              uuid          REFERENCES binder (id) ON DELETE SET NULL,
    printing_id            uuid          NOT NULL REFERENCES card_printing (id) ON DELETE RESTRICT,
    quantity               integer       NOT NULL DEFAULT 1,
    condition              text          NOT NULL,
    language               text          NOT NULL,
    edition                text          NOT NULL,
    finish                 text          NOT NULL,
    asking_price           numeric(12,2),
    currency               char(3)       NOT NULL DEFAULT 'CAD',
    availability           text          NOT NULL DEFAULT 'COLLECTION_ONLY'
                                         CHECK (availability IN ('COLLECTION_ONLY', 'TRADE', 'SALE',
                                                                 'TRADE_OR_SALE', 'NOT_AVAILABLE')),
    accepts_offers         boolean       NOT NULL DEFAULT false,
    notes                  text          NOT NULL DEFAULT '',
    public_notes           text          NOT NULL DEFAULT '',
    visibility             text          NOT NULL DEFAULT 'PRIVATE'
                                         CHECK (visibility IN ('PRIVATE', 'PUBLIC', 'TEMPORARILY_PUBLIC')),
    public_until           timestamptz,
    freshness_state        text          NOT NULL DEFAULT 'ACTIVE'
                                         CHECK (freshness_state IN ('ACTIVE', 'AGING', 'STALE', 'HIDDEN')),
    hidden_reason          text,
    warned_at              timestamptz,
    publicly_listed        boolean       NOT NULL DEFAULT false,
    listing_changed_at     timestamptz,
    created_at             timestamptz   NOT NULL DEFAULT now(),
    updated_at             timestamptz   NOT NULL DEFAULT now(),
    confirmed_at           timestamptz   NOT NULL DEFAULT now(),
    last_owner_activity_at timestamptz   NOT NULL DEFAULT now(),
    deleted_at             timestamptz,
    CONSTRAINT ck_inventory_item_quantity CHECK (quantity BETWEEN 1 AND 9999),
    CONSTRAINT ck_inventory_item_condition CHECK (condition ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_inventory_item_language CHECK (language ~ '^[a-z]{2}$'),
    CONSTRAINT ck_inventory_item_edition CHECK (edition ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_inventory_item_finish CHECK (finish ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_inventory_item_price CHECK (asking_price IS NULL OR asking_price >= 0),
    CONSTRAINT ck_inventory_item_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_inventory_item_notes CHECK (char_length(notes) <= 2000),
    CONSTRAINT ck_inventory_item_public_notes CHECK (char_length(public_notes) <= 500),
    CONSTRAINT ck_inventory_item_public_until CHECK ((visibility = 'TEMPORARILY_PUBLIC') = (public_until IS NOT NULL)),
    CONSTRAINT ck_inventory_item_hidden_reason CHECK (
        hidden_reason IS NULL OR hidden_reason IN ('STALE_UNCONFIRMED', 'OWNER_PAUSED', 'MODERATION'))
);

-- Contract indexes.
CREATE INDEX ix_inventory_item_owner_binder ON inventory_item (owner_id, binder_id);
CREATE INDEX ix_inventory_item_printing_public ON inventory_item (printing_id)
    WHERE visibility <> 'PRIVATE' AND deleted_at IS NULL;
CREATE INDEX ix_inventory_item_public_discovery ON inventory_item (printing_id, availability, freshness_state)
    WHERE publicly_listed;
-- Owner lists, binder contents, freshness job, expiries.
CREATE INDEX ix_inventory_item_binder ON inventory_item (binder_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_inventory_item_owner_updated ON inventory_item (owner_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_inventory_item_confirmed_at ON inventory_item (confirmed_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_inventory_item_expiry ON inventory_item (public_until) WHERE visibility = 'TEMPORARILY_PUBLIC';
CREATE INDEX ix_inventory_item_listed_owner ON inventory_item (owner_id) WHERE publicly_listed;

COMMENT ON TABLE inventory_item IS 'Collector inventory (Phase 3). Soft-deleted rows (deleted_at) are invisible to everyone and purged with the account.';
COMMENT ON COLUMN inventory_item.condition IS 'Condition code from the game''s GameSchema.conditions (e.g. NEAR_MINT).';
COMMENT ON COLUMN inventory_item.asking_price IS 'Asking price in currency (numeric(12,2)); NULL = no price given.';
COMMENT ON COLUMN inventory_item.notes IS 'PRIVATE owner notes: returned only to the owner (and the owner''s export); never in public responses, events or logs.';
COMMENT ON COLUMN inventory_item.public_notes IS 'Notes shown on public listings (<= 500 characters).';
COMMENT ON COLUMN inventory_item.visibility IS 'PRIVATE | PUBLIC | TEMPORARILY_PUBLIC (public_until required, at most 30 days ahead). Effective visibility additionally needs a visible binder (or none), an ACTIVE discoverable-or-public-profile owner and freshness <> HIDDEN.';
COMMENT ON COLUMN inventory_item.freshness_state IS 'Derived by the freshness job from confirmed_at and the active delist_policy; never deletes anything.';
COMMENT ON COLUMN inventory_item.hidden_reason IS 'Why a HIDDEN listing is hidden (STALE_UNCONFIRMED from the freshness job).';
COMMENT ON COLUMN inventory_item.warned_at IS 'When the pre-hide warning was emitted for the current confirmation cycle (reset by a confirmation).';
COMMENT ON COLUMN inventory_item.publicly_listed IS 'Materialised effective public visibility at the last reconciliation: InventoryItemPublished / InventoryItemUnpublished are emitted when it flips. Public reads re-evaluate the rules.';

-- ---------------------------------------------------------------------------------------------
-- binder.item_count is maintained here, whatever writes the items (API, bulk operations, jobs).
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION inventory_item_binder_count() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP <> 'INSERT' AND OLD.binder_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE binder SET item_count = item_count - 1 WHERE id = OLD.binder_id;
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.binder_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE binder SET item_count = item_count + 1 WHERE id = NEW.binder_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_inventory_item_binder_count
    AFTER INSERT OR DELETE OR UPDATE OF binder_id, deleted_at ON inventory_item
    FOR EACH ROW EXECUTE FUNCTION inventory_item_binder_count();

-- ---------------------------------------------------------------------------------------------
-- inventory_item_image: owner photos of an item (at most 4, re-encoded by the API).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE inventory_item_image (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     uuid        NOT NULL REFERENCES inventory_item (id) ON DELETE CASCADE,
    storage_key text        NOT NULL,
    url         text        NOT NULL,
    width       integer     NOT NULL,
    height      integer     NOT NULL,
    sort_order  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_inventory_item_image_storage_key UNIQUE (storage_key),
    CONSTRAINT ck_inventory_item_image_size CHECK (width > 0 AND height > 0),
    CONSTRAINT ck_inventory_item_image_url CHECK (char_length(url) BETWEEN 1 AND 1000)
);

CREATE INDEX ix_inventory_item_image_item ON inventory_item_image (item_id, sort_order);

COMMENT ON TABLE inventory_item_image IS 'Owner photos of an inventory item: EXIF/GPS stripped, re-encoded as JPEG by the API.';
COMMENT ON COLUMN inventory_item_image.storage_key IS 'ObjectStorage key (inventory/<owner id>/<random>.jpg); responses derive the URL from it.';
COMMENT ON COLUMN inventory_item_image.url IS 'URL at upload time (informational); responses always derive the current URL from storage_key.';

-- ---------------------------------------------------------------------------------------------
-- inventory_freshness_event: freshness audit trail and notification de-duplication.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE inventory_freshness_event (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    item_id    uuid        REFERENCES inventory_item (id) ON DELETE CASCADE,
    binder_id  uuid        REFERENCES binder (id) ON DELETE CASCADE,
    event      text        NOT NULL CHECK (event IN ('WARNED', 'AGED', 'STALED', 'HIDDEN', 'RESTORED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_inventory_freshness_event_target CHECK ((item_id IS NULL) <> (binder_id IS NULL))
);

CREATE INDEX ix_inventory_freshness_event_item ON inventory_freshness_event (item_id, created_at DESC) WHERE item_id IS NOT NULL;
CREATE INDEX ix_inventory_freshness_event_binder ON inventory_freshness_event (binder_id, created_at DESC) WHERE binder_id IS NOT NULL;
CREATE INDEX ix_inventory_freshness_event_owner ON inventory_freshness_event (owner_id, created_at DESC);

COMMENT ON TABLE inventory_freshness_event IS 'Freshness transitions of items or binders (exactly one target): WARNED, AGED, STALED, HIDDEN, RESTORED. Audit trail and notification de-duplication.';
