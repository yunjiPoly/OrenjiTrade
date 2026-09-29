-- V012: supported trading card games (ADR 0005). The four launch games are reference data present
-- in every environment (profiles validate their slugs); admins edit names, status and the
-- GameSchema document through /admin/games (audited).
--
-- schema = GameSchema JSON: conditions, editions, languages, finishes and rarities vocabularies,
-- metadataFields [{key, label, type string|number|string_list|boolean, filterable, options?}] and
-- summaryFields (metadata keys included in CardSummary).

CREATE TABLE game (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       text        NOT NULL,
    name       text        NOT NULL,
    short_name text        NOT NULL,
    publisher  text        NOT NULL DEFAULT '',
    status     text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'HIDDEN')),
    sort_order integer     NOT NULL DEFAULT 0,
    schema     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_game_slug UNIQUE (slug),
    CONSTRAINT ck_game_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 32),
    CONSTRAINT ck_game_name CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT ck_game_short_name CHECK (char_length(short_name) BETWEEN 1 AND 24),
    CONSTRAINT ck_game_schema CHECK (jsonb_typeof(schema) = 'object')
);

CREATE INDEX ix_game_status_sort ON game (status, sort_order);

COMMENT ON TABLE game IS 'Supported trading card games; HIDDEN games disappear from public catalog endpoints and profile choices.';
COMMENT ON COLUMN game.schema IS 'GameSchema JSON (vocabularies, metadata fields, summary fields); drives filters and presentation, not Java classes (ADR 0005).';

INSERT INTO game (slug, name, short_name, publisher, status, sort_order, schema) VALUES
('yugioh', 'Yu-Gi-Oh! Trading Card Game', 'Yu-Gi-Oh!', 'Konami', 'ACTIVE', 10, $json$
{
  "conditions": ["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"],
  "editions": ["FIRST_EDITION", "UNLIMITED", "LIMITED"],
  "languages": ["en", "fr", "de", "it", "es", "pt", "ja", "ko"],
  "finishes": ["NORMAL"],
  "rarities": ["Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Ultimate Rare", "Starlight Rare"],
  "metadataFields": [
    {"key": "attribute", "label": "Attribute", "type": "string", "filterable": true,
     "options": ["DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"]},
    {"key": "level", "label": "Level", "type": "number", "filterable": true},
    {"key": "atk", "label": "ATK", "type": "number", "filterable": true},
    {"key": "def", "label": "DEF", "type": "number", "filterable": true},
    {"key": "monsterType", "label": "Type", "type": "string", "filterable": true,
     "options": ["Dragon", "Spellcaster", "Warrior", "Beast", "Fiend", "Machine", "Aqua", "Fairy", "Insect", "Winged Beast"]}
  ],
  "summaryFields": ["attribute", "level", "atk", "def"]
}
$json$::jsonb),
('pokemon', 'Pokémon Trading Card Game', 'Pokémon', 'The Pokémon Company', 'ACTIVE', 20, $json$
{
  "conditions": ["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"],
  "editions": ["FIRST_EDITION", "UNLIMITED"],
  "languages": ["en", "fr", "de", "it", "es", "ja"],
  "finishes": ["NORMAL", "HOLO", "REVERSE_HOLO"],
  "rarities": ["Common", "Uncommon", "Rare", "Double Rare", "Ultra Rare", "Illustration Rare", "Special Illustration Rare"],
  "metadataFields": [
    {"key": "hp", "label": "HP", "type": "number", "filterable": true},
    {"key": "types", "label": "Types", "type": "string_list", "filterable": true,
     "options": ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless"]},
    {"key": "stage", "label": "Stage", "type": "string", "filterable": true,
     "options": ["Basic", "Stage 1", "Stage 2", "VMAX", "ex"]},
    {"key": "weakness", "label": "Weakness", "type": "string", "filterable": false}
  ],
  "summaryFields": ["hp", "types", "stage"]
}
$json$::jsonb),
('mtg', 'Magic: The Gathering', 'Magic', 'Wizards of the Coast', 'ACTIVE', 30, $json$
{
  "conditions": ["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"],
  "editions": ["UNLIMITED"],
  "languages": ["en", "fr", "de", "it", "es", "pt", "ja"],
  "finishes": ["NORMAL", "FOIL", "ETCHED"],
  "rarities": ["Common", "Uncommon", "Rare", "Mythic Rare"],
  "metadataFields": [
    {"key": "manaCost", "label": "Mana cost", "type": "string", "filterable": false},
    {"key": "manaValue", "label": "Mana value", "type": "number", "filterable": true},
    {"key": "colorIdentity", "label": "Color identity", "type": "string_list", "filterable": true,
     "options": ["W", "U", "B", "R", "G"]},
    {"key": "typeLine", "label": "Type line", "type": "string", "filterable": false},
    {"key": "power", "label": "Power", "type": "string", "filterable": false},
    {"key": "toughness", "label": "Toughness", "type": "string", "filterable": false}
  ],
  "summaryFields": ["manaCost", "typeLine", "colorIdentity"]
}
$json$::jsonb),
('riftbound', 'Riftbound', 'Riftbound', 'Riot Games', 'ACTIVE', 40, $json$
{
  "conditions": ["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"],
  "editions": ["UNLIMITED"],
  "languages": ["en", "fr", "zh"],
  "finishes": ["NORMAL", "FOIL"],
  "rarities": ["Common", "Uncommon", "Rare", "Epic", "Showcase"],
  "metadataFields": [
    {"key": "domain", "label": "Domain", "type": "string", "filterable": true,
     "options": ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"]},
    {"key": "energy", "label": "Energy", "type": "number", "filterable": true},
    {"key": "might", "label": "Might", "type": "number", "filterable": true},
    {"key": "type", "label": "Card type", "type": "string", "filterable": true,
     "options": ["Unit", "Spell", "Gear", "Champion", "Legend", "Battlefield", "Rune"]}
  ],
  "summaryFields": ["domain", "energy", "might"]
}
$json$::jsonb);
