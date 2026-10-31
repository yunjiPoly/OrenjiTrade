-- V132: review fix 1 of stage G (one game at a time), after V131 (binder.game_id).
--
-- 1. A binder's cover is a card of the binder's game (F7). PATCH and POST /binders refuse a
--    cover printing of another game (409 BINDER_GAME_MISMATCH) for a binder that has its game;
--    V131 left the covers alone, so a binder that holds Pokémon cards could keep a Magic cover and
--    show it in the Pokémon lists. Such covers are cleared here: the binder falls back to its first
--    card's picture, as a binder without a cover always did. A binder made without a game
--    (game_follows_cards, the paused web) refuses no card and no cover; the game-scoped reads
--    leave it out while its cover or a card is of another game (RegionBinderRepository.OF_GAME).
-- 2. Column defaults for the app version before stage G (F8): it inserts binders without
--    game_id and, since V131 made the column NOT NULL, could not create a binder during a rolling
--    update or after a rollback (its seed failed at start-up too). game_id now defaults to
--    Yu-Gi-Oh! (binder_placeholder_game(), the placeholder of a binder made without a game) and
--    game_follows_cards to true: a binder inserted without naming its game follows its cards, as
--    a binder of the paused web does. Every insert of this version names both columns.
--
-- Locks (docs/database/schema.md, "Locks of binders and inventory items"): the owner locks of
-- the collectors whose binder loses its cover, in the order of their keys, then the column
-- defaults (an ACCESS EXCLUSIVE lock on binder until the end, as in V131), then those binders in
-- ascending id, FOR NO KEY UPDATE, before they are written. No inventory_item row is written.

DO $$
BEGIN
    PERFORM pg_advisory_xact_lock(k.key)
       FROM (SELECT DISTINCT hashtextextended('inventory-owner:' || b.owner_id::text, 0) AS key
               FROM binder b
               JOIN card_printing p ON p.id = b.cover_printing_id
               JOIN card c ON c.id = p.card_id
              WHERE NOT b.game_follows_cards
                AND c.game_id <> b.game_id
              ORDER BY 1) k;
END
$$;

CREATE FUNCTION binder_placeholder_game() RETURNS uuid
    LANGUAGE sql STABLE
AS $$ SELECT id FROM game WHERE slug = 'yugioh' $$;

COMMENT ON FUNCTION binder_placeholder_game() IS 'The game of a binder inserted without one (the paused web, the app version before stage G): Yu-Gi-Oh!, until its first card sets the game (binder.game_follows_cards).';

ALTER TABLE binder ALTER COLUMN game_id SET DEFAULT binder_placeholder_game();
ALTER TABLE binder ALTER COLUMN game_follows_cards SET DEFAULT true;

DO $$
DECLARE
    cleared integer;
BEGIN
    PERFORM 1
       FROM binder b
      WHERE NOT b.game_follows_cards
        AND EXISTS (SELECT 1
                      FROM card_printing p
                      JOIN card c ON c.id = p.card_id
                     WHERE p.id = b.cover_printing_id
                       AND c.game_id <> b.game_id)
      ORDER BY b.id
        FOR NO KEY UPDATE;

    UPDATE binder b
       SET cover_printing_id = NULL
     WHERE NOT b.game_follows_cards
       AND EXISTS (SELECT 1
                     FROM card_printing p
                     JOIN card c ON c.id = p.card_id
                    WHERE p.id = b.cover_printing_id
                      AND c.game_id <> b.game_id);
    GET DIAGNOSTICS cleared = ROW_COUNT;

    RAISE NOTICE 'V132: % binders lost a cover of another game', cleared;
END
$$;

COMMENT ON COLUMN binder.game_follows_cards IS 'The binder was made without a game (the paused web; also any insert that does not name the column, default true since V132): while it holds no card (live or undoable), the first card filed in it sets game_id, and it refuses no card and no cover. False for binders made with a game (the phone) and for every binder of V131.';
COMMENT ON COLUMN binder.cover_printing_id IS 'The chosen cover printing, else the first card''s picture; a card of the binder''s game (V132) unless game_follows_cards.';
