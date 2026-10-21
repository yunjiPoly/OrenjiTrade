-- V130: One Piece joins the supported games (stage G of the phone redesign, owner prompt of
-- 2026-10-19/20, docs/product/specs/2026-10-20-finish-the-phone-ui.md, section G "Games").
--
-- Slug onepiece, "One Piece Card Game", short name "One Piece", ACTIVE, between Magic (30) and
-- Riftbound (40) in the games' order. The catalogue holds no One Piece card yet (it waits for
-- Bandai's permission): GET /games answers hasCards false, so the phone shows it dimmed with "Cards
-- coming soon", nobody browses it or makes a binder of it, and collectors may still list it on
-- their profile.
--
-- GameSchema (ADR 0005):
-- - conditions: the same six as the other games;
-- - editions: UNLIMITED only (One Piece has no first editions);
-- - languages: English only (owner order of 2026-10-20: the app supports English cards only);
-- - finishes: NORMAL and PARALLEL. A parallel art (alternate art) is a variant of the printing
--   with the same code: the catalogue keeps it as a second printing of that code whose finish is
--   PARALLEL (card_printing's variant key holds the finish), with its own artwork;
-- - rarities as the official card list names them: C, UC, R, SR, SEC, L (leader), SP (SP card),
--   TR (treasure rare) and P (promo);
-- - card metadata: colours, category (Leader, Character, Event, Stage, DON!!), cost, power,
--   counter, life (leaders), attribute and types (the traits, an open list).

INSERT INTO game (slug, name, short_name, publisher, status, sort_order, schema) VALUES
('onepiece', 'One Piece Card Game', 'One Piece', 'Bandai', 'ACTIVE', 35, $json$
{
  "conditions": ["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"],
  "editions": ["UNLIMITED"],
  "languages": ["en"],
  "finishes": ["NORMAL", "PARALLEL"],
  "rarities": ["C", "UC", "R", "SR", "SEC", "L", "SP", "TR", "P"],
  "metadataFields": [
    {"key": "colors", "label": "Color", "type": "string_list", "filterable": true,
     "options": ["Red", "Green", "Blue", "Purple", "Black", "Yellow"]},
    {"key": "category", "label": "Category", "type": "string", "filterable": true,
     "options": ["Leader", "Character", "Event", "Stage", "DON!!"]},
    {"key": "cost", "label": "Cost", "type": "number", "filterable": true},
    {"key": "power", "label": "Power", "type": "number", "filterable": true},
    {"key": "counter", "label": "Counter", "type": "number", "filterable": true},
    {"key": "life", "label": "Life", "type": "number", "filterable": true},
    {"key": "attribute", "label": "Attribute", "type": "string", "filterable": true,
     "options": ["Slash", "Strike", "Ranged", "Special", "Wisdom"]},
    {"key": "types", "label": "Type", "type": "string_list", "filterable": false}
  ],
  "summaryFields": ["colors", "category", "cost", "power"]
}
$json$::jsonb)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON COLUMN profile.games IS 'Game slugs (yugioh, pokemon, mtg, onepiece, riftbound): ACTIVE games of the games module.';
