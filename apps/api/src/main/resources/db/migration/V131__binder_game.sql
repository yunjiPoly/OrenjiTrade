-- V131: a binder holds the cards of one game (stage G of the phone redesign, owner prompt of
-- 2026-10-19/20, docs/product/specs/2026-10-20-finish-the-phone-ui.md, section G "Binders have a
-- game").
--
-- 1. binder.game_id, a foreign key to game.
-- 2. Every existing binder takes the game most of its live cards belong to (counted in cards, the
--    item rows, not copies). A tie: of the tied games, the one that comes first in the owner's
--    profile games, else Yu-Gi-Oh! when it is one of them, else the first in the games' order. A
--    binder without a live card: the owner's first profile game that is ACTIVE and has a card in
--    the catalogue (a game without cards holds no binder), else Yu-Gi-Oh!.
-- 3. The cards of another game leave the binder and stay in the inventory without a binder. Their
--    visibility follows the app's rule for a card that leaves its binder (kept only when the
--    binder was PUBLIC, InventoryService.unfiledVisibility), a little stricter: kept only when the
--    binder was PUBLIC, not HIDDEN by freshness and not sold, otherwise PRIVATE (and no end date).
--    So no card is more public after this migration than before, and publicly_listed stays true
--    to the rules. A deleted card of another game leaves too: its undo would otherwise bring it
--    back into a binder of another game. Each binder that lost cards gets one audit_log row
--    (SYSTEM, binder.game.cards_moved_out, with how many), and a NOTICE in the migration log gives
--    the totals.
-- 4. game_id becomes NOT NULL.
-- 5. binder.game_follows_cards (default false): a binder made without a game (the paused web has
--    no game picker) takes the game of the first card filed in it while it holds none and refuses
--    no card, as the web's binders always did; every binder of this migration has its game and
--    does not follow its cards.
--
-- Locks (docs/database/schema.md, "Locks of binders and inventory items"): the owner lock of
-- every collector who has a binder comes first, taken in the order of their keys as
-- BinderRepository.lockOwners takes them, so no write of those collectors is half done. Then the
-- column is added (an ACCESS EXCLUSIVE lock on binder until the end), then every binder and then
-- every card filed in a binder are locked in ascending id, FOR NO KEY UPDATE, before anything is
-- written; the updates below only write rows this transaction already holds. The rule of a new
-- bulk write asks for chunks of 500 cards; a migration cannot: every binder needs its game before
-- the column becomes NOT NULL, in one transaction, and it runs once, at start-up, before the API
-- serves.

DO $$
BEGIN
    PERFORM pg_advisory_xact_lock(k.key)
       FROM (SELECT DISTINCT hashtextextended('inventory-owner:' || b.owner_id::text, 0) AS key
               FROM binder b
              ORDER BY 1) k;
END
$$;

ALTER TABLE binder ADD COLUMN game_id uuid;

DO $$
DECLARE
    yugioh       uuid;
    binders_set  integer;
    left_binders integer;
    live_moved   integer;
    dead_moved   integer;
BEGIN
    SELECT id INTO yugioh FROM game WHERE slug = 'yugioh';

    -- The rows, in the one order: binders, then the cards filed in them.
    PERFORM 1 FROM binder ORDER BY id FOR NO KEY UPDATE;
    PERFORM 1 FROM inventory_item WHERE binder_id IS NOT NULL ORDER BY id FOR NO KEY UPDATE;

    -- Live cards per binder and game.
    CREATE TEMP TABLE v131_cards ON COMMIT DROP AS
    SELECT i.binder_id, c.game_id, count(*) AS cards
      FROM inventory_item i
      JOIN card_printing p ON p.id = i.printing_id
      JOIN card c ON c.id = p.card_id
     WHERE i.binder_id IS NOT NULL
       AND i.deleted_at IS NULL
     GROUP BY i.binder_id, c.game_id;

    -- The majority game, then the tie rule.
    CREATE TEMP TABLE v131_game ON COMMIT DROP AS
    SELECT DISTINCT ON (b.id) b.id AS binder_id, vc.game_id
      FROM binder b
      JOIN v131_cards vc ON vc.binder_id = b.id
      JOIN game g ON g.id = vc.game_id
      LEFT JOIN profile pr ON pr.user_id = b.owner_id
     ORDER BY b.id,
              vc.cards DESC,
              array_position(COALESCE(pr.games, '{}'::text[]), g.slug) NULLS LAST,
              (g.slug = 'yugioh') DESC,
              g.sort_order,
              g.slug;

    -- A binder without a live card.
    INSERT INTO v131_game (binder_id, game_id)
    SELECT b.id,
           COALESCE(
               (SELECT g.id
                  FROM unnest(pr.games) WITH ORDINALITY AS pg(slug, position)
                  JOIN game g ON g.slug = pg.slug
                 WHERE g.status = 'ACTIVE'
                   AND EXISTS (SELECT 1 FROM card c WHERE c.game_id = g.id)
                 ORDER BY pg.position
                 LIMIT 1),
               yugioh)
      FROM binder b
      LEFT JOIN profile pr ON pr.user_id = b.owner_id
     WHERE NOT EXISTS (SELECT 1 FROM v131_game vg WHERE vg.binder_id = b.id);

    UPDATE binder b
       SET game_id = vg.game_id
      FROM v131_game vg
     WHERE vg.binder_id = b.id;
    GET DIAGNOSTICS binders_set = ROW_COUNT;

    -- The cards of another game, live or deleted, and what their binder lets them keep.
    CREATE TEMP TABLE v131_moved ON COMMIT DROP AS
    SELECT i.id,
           i.binder_id,
           i.deleted_at IS NULL AS live,
           (b.visibility = 'PUBLIC' AND b.freshness_state <> 'HIDDEN' AND b.sold_at IS NULL)
               AS keeps_visibility
      FROM inventory_item i
      JOIN binder b ON b.id = i.binder_id
      JOIN card_printing p ON p.id = i.printing_id
      JOIN card c ON c.id = p.card_id
     WHERE c.game_id <> b.game_id;

    -- Unfiled; the count trigger takes the live ones out of binder.item_count.
    UPDATE inventory_item i
       SET binder_id = NULL,
           visibility = CASE WHEN m.keeps_visibility THEN i.visibility ELSE 'PRIVATE' END,
           public_until = CASE WHEN m.keeps_visibility THEN i.public_until ELSE NULL END
      FROM v131_moved m
     WHERE m.id = i.id;

    INSERT INTO audit_log (actor_type, action, target_type, target_id, details)
    SELECT 'SYSTEM',
           'binder.game.cards_moved_out',
           'BINDER',
           m.binder_id::text,
           jsonb_build_object(
               'migration', 'V131',
               'binderGame', g.slug,
               'cards', count(*) FILTER (WHERE m.live),
               'deletedCards', count(*) FILTER (WHERE NOT m.live))
      FROM v131_moved m
      JOIN binder b ON b.id = m.binder_id
      JOIN game g ON g.id = b.game_id
     GROUP BY m.binder_id, g.slug;

    SELECT count(DISTINCT binder_id),
           count(*) FILTER (WHERE live),
           count(*) FILTER (WHERE NOT live)
      INTO left_binders, live_moved, dead_moved
      FROM v131_moved;

    RAISE NOTICE 'V131: % binders got a game; % cards of another game (and % deleted ones) left % binders and stay in the inventory without a binder',
        binders_set, live_moved, dead_moved, left_binders;
END
$$;

ALTER TABLE binder ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE binder ADD COLUMN game_follows_cards boolean NOT NULL DEFAULT false;
ALTER TABLE binder
    ADD CONSTRAINT fk_binder_game FOREIGN KEY (game_id) REFERENCES game (id);
CREATE INDEX ix_binder_game ON binder (game_id);

COMMENT ON COLUMN binder.game_follows_cards IS 'The binder was made without a game (the paused web): while it holds no card (live or undoable), the first card filed in it sets game_id, and it refuses no card. False for binders made with a game (the phone) and for every binder of V131.';
COMMENT ON COLUMN binder.game_id IS 'The one game whose cards the binder holds (stage G); chosen at creation, changeable only while the binder holds no card (409 BINDER_GAME_LOCKED); a card of another game is refused (409 BINDER_GAME_MISMATCH) unless game_follows_cards.';
