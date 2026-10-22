-- V133 (stage R7 of the phone redesign, "Home"; owner prompt of 2026-10-19,
-- docs/product/specs/2026-10-19-home-full-design.md, section 5): the Home feed lists what became
-- public in the last 30 days: cards (inventory_item.listing_changed_at, the time the materialised
-- publicly_listed last flipped), wishes (wishlist_item.created_at) and deck cores. A deck core is
-- public as a deck core from the later of two times: when the binder became public
-- (binder.listing_changed_at) and when its owner turned "Sell as a deck core" on. Nothing stored
-- the second one: an already public binder switched to a deck core kept its old listing time and
-- would never reach Home. Additive only: the paused web reads none of this.

-- When the binder last became a deck core: set by the trigger below when sells_as_core turns on
-- (or a binder is made as a deck core), cleared when it turns off. A write may name the time
-- itself (the local seed keeps its deck cores' times relative to now).
ALTER TABLE binder ADD COLUMN core_since timestamptz;

-- Deck cores made before this migration: the time is unknown, so the binder's creation time
-- (never more recent than the truth: nothing old reaches Home as new).
UPDATE binder SET core_since = created_at WHERE sells_as_core;

CREATE FUNCTION binder_core_since() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF NOT NEW.sells_as_core THEN
        NEW.core_since := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        NEW.core_since := COALESCE(NEW.core_since, now());
    ELSIF NOT OLD.sells_as_core AND NEW.core_since IS NOT DISTINCT FROM OLD.core_since THEN
        NEW.core_since := now();
    ELSIF NEW.core_since IS NULL THEN
        NEW.core_since := COALESCE(OLD.core_since, now());
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_binder_core_since
    BEFORE INSERT OR UPDATE OF sells_as_core, core_since ON binder
    FOR EACH ROW EXECUTE FUNCTION binder_core_since();

COMMENT ON COLUMN binder.core_since IS 'When the binder last became a deck core (sells_as_core turned on; trigger trg_binder_core_since); NULL while it is not one. The Home feed dates a deck core from the later of this and listing_changed_at.';
COMMENT ON COLUMN binder.listing_changed_at IS 'When publicly_listed last flipped (the binder became public or stopped being public).';
COMMENT ON COLUMN inventory_item.listing_changed_at IS 'When publicly_listed last flipped: for a public card, when it became public (the Home feed''s time of a new card).';

-- The feed reads the cards and wishes of the window, newest first.
CREATE INDEX ix_inventory_item_listed_since ON inventory_item (listing_changed_at)
    WHERE publicly_listed AND deleted_at IS NULL;
CREATE INDEX ix_wishlist_item_created ON wishlist_item (created_at);
