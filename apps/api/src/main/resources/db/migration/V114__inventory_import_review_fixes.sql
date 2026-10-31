-- V114: two corrections of the inventory import after its review (stage S5, review fix 1).
--
-- 1. The commit of an import reserves the room of the chunks it has not written yet.
--
-- An import of more than 500 items is written in chunks, one transaction each, and the collector's
-- other writes run between two chunks. The limit inventory.items.max was checked once, for the
-- whole import, in the first chunk: until the last chunk was written, the items still to come were
-- counted nowhere, so a card added by hand or a second import took their room and the inventory
-- ended above its limit. From here on the commit records, when it starts, how many new items each
-- chunk will create, and the usage of inventory.items.max is the live items plus the new items of
-- the chunks not yet written of the collector's COMMITTING imports.

ALTER TABLE inventory_import ADD COLUMN chunk_new_items integer[];

ALTER TABLE inventory_import ADD CONSTRAINT ck_inventory_import_chunk_new_items
    CHECK (chunk_new_items IS NULL
           OR (total_chunks IS NOT NULL
               AND cardinality(chunk_new_items) = total_chunks
               AND 0 <= ALL (chunk_new_items)));

-- The usage of the limit is read by every item create and by GET /me/plan: the commits in
-- progress of one collector, almost always none.
CREATE INDEX ix_inventory_import_committing ON inventory_import (owner_id) WHERE status = 'COMMITTING';

COMMENT ON COLUMN inventory_import.chunk_new_items IS 'New inventory items each chunk was planned to create when the commit started (element n = chunk n). Those of the chunks after chunks_done count in the usage of inventory.items.max while the import is COMMITTING, so no other write takes their room. NULL: no plan limit applied to the collector when the commit started (nothing reserved), or the commit started before V114.';

-- 2. "Use the most recent printing" where the most recent set holds a card in several editions or
-- finishes (a 1st Edition and an Unlimited copy of one set): the release date decides nothing
-- between them. The plain copy is taken and the row says so (MOST_RECENT_ASSUMED), instead of the
-- copy the alphabet put first, which was the 1st Edition or the foil one.
ALTER TABLE inventory_import_row DROP CONSTRAINT ck_inventory_import_row_choice;
ALTER TABLE inventory_import_row ADD CONSTRAINT ck_inventory_import_row_choice
    CHECK (printing_choice IS NULL
           OR printing_choice IN ('AUTO', 'MANUAL', 'MOST_RECENT', 'MOST_RECENT_ASSUMED'));

COMMENT ON COLUMN inventory_import_row.printing_id IS 'The printing chosen: by the import when the row fits exactly one (AUTO), by the collector (MANUAL) or by "use the most recent printing" (MOST_RECENT; MOST_RECENT_ASSUMED when the most recent set holds the card in several editions or finishes and the plain copy was taken); NULL = to choose.';
