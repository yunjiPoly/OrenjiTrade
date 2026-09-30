-- V021: binders (Phase 3 contract "Tables").
--
-- A binder groups inventory items and carries its own visibility. Effective public visibility is
-- computed server side (binder visibility, public_until, freshness, owner status and privacy);
-- publicly_listed only materialises the last computed value so the API can emit
-- BinderPublished / BinderUnpublished exactly once per transition. Public reads always re-evaluate
-- the live rules and never trust the flag alone.

CREATE TABLE binder (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id               uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    name                   text        NOT NULL,
    description            text        NOT NULL DEFAULT '',
    kind                   text        NOT NULL DEFAULT 'COLLECTION'
                                       CHECK (kind IN ('COLLECTION', 'TRADE', 'SALE', 'DECK', 'CUSTOM')),
    visibility             text        NOT NULL DEFAULT 'PRIVATE'
                                       CHECK (visibility IN ('PRIVATE', 'PUBLIC', 'TEMPORARILY_PUBLIC')),
    public_until           timestamptz,
    sort_order             integer     NOT NULL DEFAULT 0,
    cover_printing_id      uuid        REFERENCES card_printing (id) ON DELETE SET NULL,
    item_count             integer     NOT NULL DEFAULT 0,
    freshness_state        text        NOT NULL DEFAULT 'ACTIVE'
                                       CHECK (freshness_state IN ('ACTIVE', 'AGING', 'STALE', 'HIDDEN')),
    warned_at              timestamptz,
    publicly_listed        boolean     NOT NULL DEFAULT false,
    listing_changed_at     timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    confirmed_at           timestamptz NOT NULL DEFAULT now(),
    last_owner_activity_at timestamptz NOT NULL DEFAULT now(),
    search_vector          tsvector    GENERATED ALWAYS AS (
                               setweight(to_tsvector('simple', unaccent_immutable(name)), 'A')
                               || setweight(to_tsvector('simple', unaccent_immutable(description)), 'B')
                           ) STORED,
    CONSTRAINT ck_binder_name CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT ck_binder_description CHECK (char_length(description) <= 1000),
    CONSTRAINT ck_binder_item_count CHECK (item_count >= 0),
    CONSTRAINT ck_binder_public_until CHECK ((visibility = 'TEMPORARILY_PUBLIC') = (public_until IS NOT NULL))
);

CREATE INDEX ix_binder_owner_sort ON binder (owner_id, sort_order, created_at);
CREATE INDEX ix_binder_search_vector ON binder USING gin (search_vector);
CREATE INDEX ix_binder_listed_owner ON binder (owner_id) WHERE publicly_listed;
CREATE INDEX ix_binder_confirmed_at ON binder (confirmed_at);
CREATE INDEX ix_binder_expiry ON binder (public_until) WHERE visibility = 'TEMPORARILY_PUBLIC';

COMMENT ON TABLE binder IS 'Collector binders (Phase 3). Deleting a binder keeps its items (they become unfiled) unless the owner asks otherwise.';
COMMENT ON COLUMN binder.visibility IS 'PRIVATE | PUBLIC | TEMPORARILY_PUBLIC (then public_until is required, at most 30 days ahead).';
COMMENT ON COLUMN binder.item_count IS 'Maintained by trigger trg_inventory_item_binder_count (non-deleted items); never written by the application.';
COMMENT ON COLUMN binder.freshness_state IS 'Derived by the freshness job from confirmed_at and the active delist_policy; HIDDEN binders are not public.';
COMMENT ON COLUMN binder.confirmed_at IS 'Last owner confirmation: binder created, published or confirmed, or an item created, confirmed or moved into it.';
COMMENT ON COLUMN binder.warned_at IS 'When the pre-hide warning was emitted for the current confirmation cycle (reset by a confirmation).';
COMMENT ON COLUMN binder.publicly_listed IS 'Materialised effective public visibility at the last reconciliation (event transitions only; reads re-evaluate the rules).';
COMMENT ON COLUMN binder.search_vector IS 'Generated: name (A) + description (B), simple config, accent-insensitive (public binder search, Phase 4).';
