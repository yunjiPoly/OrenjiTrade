-- V102: card_image stays writable by code that predates V100 (ADR 0015).
--
-- V100 made card_image.card_id and card_image.game_id NOT NULL. Application versions built before
-- V100 still insert printing images as (id, printing_id, kind, url, width, height, source) only:
-- an older Cloud Run revision serving traffic during a rolling deploy, or another local checkout
-- (main) sharing the developer database. Their inserts then failed with a not-null violation and,
-- locally, the mock catalog seed aborted the API start-up. When a row names its printing but not
-- its owners, they are derived from the printing here; rows that set them are left untouched.

CREATE FUNCTION card_image_fill_owner() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF NEW.printing_id IS NOT NULL AND (NEW.card_id IS NULL OR NEW.game_id IS NULL) THEN
        SELECT coalesce(NEW.card_id, p.card_id), coalesce(NEW.game_id, c.game_id)
          INTO NEW.card_id, NEW.game_id
          FROM card_printing p
          JOIN card c ON c.id = p.card_id
         WHERE p.id = NEW.printing_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_card_image_fill_owner
    BEFORE INSERT OR UPDATE OF printing_id, card_id, game_id ON card_image
    FOR EACH ROW EXECUTE FUNCTION card_image_fill_owner();

COMMENT ON FUNCTION card_image_fill_owner() IS 'Backward compatibility with writers that predate V100: fills card_image.card_id/game_id from printing_id when they are missing.';
