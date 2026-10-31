-- V126 (stage R3 of the phone redesign, "Binders and deck cores"; owner spec 2026-10-14,
-- sections 7 and 12 "Binders and deck cores"): a binder can be sold as one bundle, a deck core,
-- with photos, one price and a note (the binder's description). Additive only: the paused web
-- keeps every column it reads, and a binder is a plain binder until its owner turns the switch on.
-- V124 is kept for another branch; R2 is V125.

-- "Sell as a deck core": the binder is offered as one bundle. A deck core needs no cards; the
-- cards its owner puts in it sell only together (search can leave them out of the card holders).
ALTER TABLE binder ADD COLUMN sells_as_core boolean NOT NULL DEFAULT false;

-- The asking price as typed ("$180", "Trade only"), at most 40 characters, trimmed by the API. A
-- plain amount ("180", "$180", "180,00 $") also fills asking_price in the binder's currency, as for
-- inventory items (V125); any other text leaves it NULL.
ALTER TABLE binder ADD COLUMN asking_price_text varchar(40);
ALTER TABLE binder ADD CONSTRAINT ck_binder_asking_price_text CHECK (
    asking_price_text IS NULL
    OR (asking_price_text = btrim(asking_price_text) AND asking_price_text <> ''));
ALTER TABLE binder ADD COLUMN asking_price numeric(12, 2);
ALTER TABLE binder ADD CONSTRAINT ck_binder_asking_price CHECK (
    asking_price IS NULL OR asking_price >= 0);
ALTER TABLE binder ADD COLUMN currency char(3) NOT NULL DEFAULT 'CAD';
ALTER TABLE binder ADD CONSTRAINT ck_binder_currency CHECK (currency ~ '^[A-Z]{3}$');

-- When a deck core was sold (stage R4 marks it; spec section 16, default 6: a sold deck core is
-- hidden). A sold binder is never public, and neither are the cards still filed in it.
ALTER TABLE binder ADD COLUMN sold_at timestamptz;

COMMENT ON COLUMN binder.sells_as_core IS 'Sell as a deck core: the binder is offered as one bundle (photos, one price, the description as its public note); its cards are optional key cards.';
COMMENT ON COLUMN binder.asking_price_text IS 'Asking price of a deck core as the owner typed it (<= 40 characters, trimmed; e.g. $180, Trade only). A plain amount also fills asking_price; NULL = no price.';
COMMENT ON COLUMN binder.asking_price IS 'The amount of a plain-amount asking_price_text, in currency; NULL for a text price or none.';
COMMENT ON COLUMN binder.currency IS 'ISO 4217 currency of asking_price (CAD by default, as inventory items).';
COMMENT ON COLUMN binder.sold_at IS 'When the deck core was marked sold (stage R4); a sold binder is not public. NULL = not sold.';
COMMENT ON COLUMN binder.description IS 'Description (<= 1 000 characters, API); the public note of a deck core (the phone caps it at 500).';

-- Photos of a binder (the deck core's photos): at most 4 (API), the upload rules of
-- inventory_item_image (8 MB, JPEG / PNG / WebP by content, re-encoded as a JPEG without EXIF or
-- GPS data). Deleted with the binder; the API deletes the stored objects.
CREATE TABLE binder_image (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    binder_id   uuid        NOT NULL REFERENCES binder (id) ON DELETE CASCADE,
    storage_key text        NOT NULL,
    url         text        NOT NULL,
    width       integer     NOT NULL,
    height      integer     NOT NULL,
    sort_order  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_binder_image_storage_key UNIQUE (storage_key),
    CONSTRAINT ck_binder_image_size CHECK (width > 0 AND height > 0),
    CONSTRAINT ck_binder_image_url CHECK (char_length(url) BETWEEN 1 AND 1000)
);

CREATE INDEX ix_binder_image_binder ON binder_image (binder_id, sort_order);

COMMENT ON TABLE binder_image IS 'Owner photos of a binder (a deck core): EXIF/GPS stripped, re-encoded as JPEG by the API, at most 4 per binder.';
COMMENT ON COLUMN binder_image.storage_key IS 'ObjectStorage key (binders/<owner id>/<random>.jpg); responses derive the URL from it.';
COMMENT ON COLUMN binder_image.url IS 'URL at upload time (informational); responses always derive the current URL from storage_key.';

-- The public deck cores of a region (search, map counts): few rows, read by owner.
CREATE INDEX ix_binder_deck_core ON binder (owner_id) WHERE sells_as_core AND sold_at IS NULL;
