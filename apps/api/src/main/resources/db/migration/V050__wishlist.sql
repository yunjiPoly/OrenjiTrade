-- V050: wishlist items and wishlist matches (Phase 6 contract "Tables").
--
-- PRIVACY: wishlist rows never carry a location. Matching measures the distance between the
-- stored public points (user_location.public_point) of the wishlist owner and of the item owner
-- only (ADR 0004); wishlist_match keeps a distance bucket, never metres or coordinates.

CREATE TABLE wishlist_item (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    game_slug        text          NOT NULL,
    card_id          uuid          REFERENCES card (id) ON DELETE CASCADE,
    printing_id      uuid          REFERENCES card_printing (id) ON DELETE CASCADE,
    rarity           text,
    condition_min    text,
    edition          text,
    language         text,
    max_price        numeric(12,2),
    currency         char(3)       NOT NULL DEFAULT 'CAD',
    radius_km        integer       NOT NULL DEFAULT 25,
    trade_preference text          NOT NULL DEFAULT 'ANY'
                                   CHECK (trade_preference IN ('ANY', 'TRADE', 'SALE')),
    notes            text          NOT NULL DEFAULT '',
    active           boolean       NOT NULL DEFAULT true,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),
    last_matched_at  timestamptz,
    CONSTRAINT ck_wishlist_item_target CHECK (card_id IS NOT NULL OR printing_id IS NOT NULL),
    CONSTRAINT ck_wishlist_item_game CHECK (game_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT ck_wishlist_item_rarity CHECK (rarity IS NULL OR char_length(rarity) BETWEEN 1 AND 40),
    CONSTRAINT ck_wishlist_item_condition CHECK (condition_min IS NULL OR condition_min ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_wishlist_item_edition CHECK (edition IS NULL OR edition ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_wishlist_item_language CHECK (language IS NULL OR language ~ '^[a-z]{2}$'),
    CONSTRAINT ck_wishlist_item_price CHECK (max_price IS NULL OR max_price >= 0),
    CONSTRAINT ck_wishlist_item_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_wishlist_item_radius CHECK (radius_km BETWEEN 1 AND 20000),
    CONSTRAINT ck_wishlist_item_notes CHECK (char_length(notes) <= 500)
);

-- Contract indexes (matching looks wishlist items up by printing or card).
CREATE INDEX ix_wishlist_item_active_card ON wishlist_item (active, card_id);
CREATE INDEX ix_wishlist_item_active_printing ON wishlist_item (active, printing_id);
-- Owner list and the nightly rematch of recently edited items.
CREATE INDEX ix_wishlist_item_owner ON wishlist_item (owner_id, created_at DESC);
CREATE INDEX ix_wishlist_item_updated ON wishlist_item (updated_at) WHERE active;

COMMENT ON TABLE wishlist_item IS 'Cards a collector is looking for (Phase 6). card_id is always filled by the API (derived from the printing when one is given); printing_id NULL = any printing of the card.';
COMMENT ON COLUMN wishlist_item.condition_min IS 'Worst acceptable condition, a code of the game''s GameSchema.conditions (ordered best first); NULL = any.';
COMMENT ON COLUMN wishlist_item.max_price IS 'Maximum asking price in currency (numeric(12,2)); items priced in another currency never match a set maximum; unpriced items always pass.';
COMMENT ON COLUMN wishlist_item.radius_km IS 'Matching radius between the public points of the two collectors, capped at the API by the plan (usage_limit map.radius.max_km).';
COMMENT ON COLUMN wishlist_item.notes IS 'PRIVATE owner notes: returned only to the owner (and the owner''s export); never in the public wishlist summary, notifications or logs.';
COMMENT ON COLUMN wishlist_item.last_matched_at IS 'When the item last gained a match.';

CREATE TABLE wishlist_match (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_item_id  uuid        NOT NULL REFERENCES wishlist_item (id) ON DELETE CASCADE,
    inventory_item_id uuid        NOT NULL REFERENCES inventory_item (id) ON DELETE CASCADE,
    matched_at        timestamptz NOT NULL DEFAULT now(),
    distance_bucket   text        NOT NULL
                                  CHECK (distance_bucket IN ('LT_1KM', 'KM_1_5', 'KM_5_10', 'KM_10_25',
                                                             'KM_25_50', 'GT_50KM')),
    notified          boolean     NOT NULL DEFAULT false,
    dismissed         boolean     NOT NULL DEFAULT false,
    CONSTRAINT uq_wishlist_match UNIQUE (wishlist_item_id, inventory_item_id)
);

CREATE INDEX ix_wishlist_match_item_matched ON wishlist_match (wishlist_item_id, matched_at DESC, id DESC);
CREATE INDEX ix_wishlist_match_inventory ON wishlist_match (inventory_item_id);

COMMENT ON TABLE wishlist_match IS 'A public inventory item matching a wishlist item (idempotent: one row per pair, inserted with ON CONFLICT DO NOTHING). Rows of items that stop being public stay but are not served.';
COMMENT ON COLUMN wishlist_match.distance_bucket IS 'Bucketed distance between the two public points at match time (ADR 0004); never metres.';
COMMENT ON COLUMN wishlist_match.notified IS 'Whether a WISHLIST_MATCH notification was created for the match (false for matches found when the wishlist item was created or edited, and beyond the daily alert limit).';
