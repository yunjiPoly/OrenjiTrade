-- V101: real Yu-Gi-Oh! catalog support (YGOPRODeck import, ADR 0015).
--
-- 1. A card code can exist in several rarities (LOB-EN001 Ultra Rare and Quarter Century Secret
--    Rare are different printings), so the variant key of a printing now includes its rarity.
-- 2. The yugioh GameSchema gains the metadata fields the importer fills (rank, link rating and
--    arrows, pendulum scale, spell/trap property, archetype, frame), the complete monster type
--    vocabulary and the common rarities. Admin edits are kept: fields and rarities are only added
--    when missing; the monsterType options are replaced by the complete list.

-- ---------------------------------------------------------------------------------------------
-- 1. Printing variant key includes the rarity
-- ---------------------------------------------------------------------------------------------
ALTER TABLE card_printing DROP CONSTRAINT uq_card_printing_variant;
CREATE UNIQUE INDEX uq_card_printing_variant
    ON card_printing (set_id, collector_number, edition, language, finish, (coalesce(rarity, '')));

COMMENT ON INDEX uq_card_printing_variant IS 'A printing is a set + collector number + edition + language + finish + rarity (Yu-Gi-Oh! reprints a code in several rarities).';

-- ---------------------------------------------------------------------------------------------
-- 2. yugioh GameSchema
-- ---------------------------------------------------------------------------------------------
WITH ygo_schema AS (
    SELECT schema FROM game WHERE slug = 'yugioh'
),
monster_types AS (
    SELECT '["Dragon", "Spellcaster", "Warrior", "Beast", "Fiend", "Machine", "Aqua", "Fairy",
             "Insect", "Winged Beast", "Beast-Warrior", "Cyberse", "Dinosaur", "Divine-Beast",
             "Fish", "Illusion", "Plant", "Psychic", "Pyro", "Reptile", "Rock", "Sea Serpent",
             "Thunder", "Wyrm", "Zombie", "Creator God"]'::jsonb AS options
),
existing_fields AS (
    SELECT coalesce(
               jsonb_agg(
                   CASE WHEN f ->> 'key' = 'monsterType'
                        THEN jsonb_set(f, '{options}', (SELECT options FROM monster_types))
                        ELSE f END
                   ORDER BY ord),
               '[]'::jsonb) AS fields
      FROM ygo_schema,
           jsonb_array_elements(coalesce(ygo_schema.schema -> 'metadataFields', '[]'::jsonb))
               WITH ORDINALITY AS e(f, ord)
),
added_fields AS (
    SELECT coalesce(jsonb_agg(a ORDER BY ord), '[]'::jsonb) AS fields
      FROM ygo_schema,
           jsonb_array_elements($json$[
             {"key": "rank", "label": "Rank", "type": "number", "filterable": true},
             {"key": "linkRating", "label": "Link rating", "type": "number", "filterable": true},
             {"key": "linkMarkers", "label": "Link arrows", "type": "string_list", "filterable": false},
             {"key": "pendulumScale", "label": "Pendulum scale", "type": "number", "filterable": true},
             {"key": "property", "label": "Property", "type": "string", "filterable": true,
              "options": ["Normal", "Continuous", "Quick-Play", "Field", "Equip", "Counter", "Ritual"]},
             {"key": "archetype", "label": "Archetype", "type": "string", "filterable": true},
             {"key": "frameType", "label": "Frame", "type": "string", "filterable": true,
              "options": ["normal", "effect", "ritual", "fusion", "synchro", "xyz", "link",
                          "normal_pendulum", "effect_pendulum", "ritual_pendulum", "fusion_pendulum",
                          "synchro_pendulum", "xyz_pendulum", "spell", "trap", "token", "skill"]}
           ]$json$::jsonb) WITH ORDINALITY AS n(a, ord)
     WHERE NOT EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(coalesce(ygo_schema.schema -> 'metadataFields', '[]'::jsonb)) f
                WHERE f ->> 'key' = a ->> 'key')
),
existing_rarities AS (
    SELECT coalesce(ygo_schema.schema -> 'rarities', '[]'::jsonb) AS rarities FROM ygo_schema
),
added_rarities AS (
    SELECT coalesce(jsonb_agg(r ORDER BY ord), '[]'::jsonb) AS rarities
      FROM existing_rarities,
           jsonb_array_elements($json$[
             "Short Print", "Super Short Print", "Collector's Rare", "Quarter Century Secret Rare",
             "Platinum Secret Rare", "Prismatic Secret Rare", "Starfoil Rare", "Shatterfoil Rare",
             "Mosaic Rare", "Gold Rare", "Premium Gold Rare", "Gold Secret Rare", "Ghost Rare",
             "Ghost/Gold Rare", "Platinum Rare", "Ultra Parallel Rare", "Super Parallel Rare",
             "Normal Parallel Rare", "Ultra Secret Rare", "Extra Secret Rare", "Grand Master Rare",
             "Duel Terminal Normal Parallel Rare", "Duel Terminal Rare Parallel Rare",
             "Duel Terminal Super Parallel Rare", "Duel Terminal Ultra Parallel Rare"
           ]$json$::jsonb) WITH ORDINALITY AS n(r, ord)
     WHERE NOT existing_rarities.rarities @> jsonb_build_array(r)
),
summary AS (
    SELECT coalesce(ygo_schema.schema -> 'summaryFields', '[]'::jsonb) AS fields FROM ygo_schema
)
UPDATE game g
   SET schema = jsonb_set(
                    jsonb_set(
                        jsonb_set(g.schema, '{metadataFields}', existing_fields.fields || added_fields.fields),
                        '{rarities}',
                        CASE WHEN jsonb_array_length(existing_rarities.rarities || added_rarities.rarities) <= 40
                             THEN existing_rarities.rarities || added_rarities.rarities
                             ELSE existing_rarities.rarities END),
                    '{summaryFields}',
                    CASE WHEN jsonb_array_length(summary.fields) <= 8
                         THEN summary.fields
                              || (SELECT coalesce(jsonb_agg(k), '[]'::jsonb)
                                    FROM jsonb_array_elements('["rank", "linkRating"]'::jsonb) k
                                   WHERE NOT summary.fields @> jsonb_build_array(k))
                         ELSE summary.fields END),
       updated_at = now()
  FROM existing_fields, added_fields, existing_rarities, added_rarities, summary
 WHERE g.slug = 'yugioh';
