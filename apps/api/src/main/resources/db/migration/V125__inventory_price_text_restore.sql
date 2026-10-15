-- V125 (stage R2 of the phone redesign, "Inventory and adding cards"; owner spec 2026-10-14,
-- section 12 "Inventory"): the asking price as the collector typed it, a condition that is not
-- stated, and the undo of a delete. Additive only: the paused web keeps every column it reads.
-- Written as V117 and renumbered after stage F1's V120-V123 (Flyway refuses an out-of-order
-- version; V124 is kept for another branch).

-- The asking price as typed on the phone ("85% TCG", "Trade only", "$12.50"), at most 40
-- characters, trimmed by the API. A plain amount ("12.50", "$12.50", "12,50 $") also fills
-- asking_price (and keeps currency), which the price sort uses; any other text leaves it NULL.
ALTER TABLE inventory_item ADD COLUMN asking_price_text varchar(40);
ALTER TABLE inventory_item ADD CONSTRAINT ck_inventory_item_asking_price_text CHECK (
    asking_price_text IS NULL
    OR (asking_price_text = btrim(asking_price_text) AND asking_price_text <> ''));

COMMENT ON COLUMN inventory_item.asking_price_text IS 'Asking price as the owner typed it (<= 40 characters, trimmed; e.g. 85% TCG). A plain amount also fills asking_price; NULL = no text (a web edit of asking_price clears it).';

-- Cards added on the phone state no condition: the collector writes it in the public note.
ALTER TABLE inventory_item ALTER COLUMN condition DROP NOT NULL;

COMMENT ON COLUMN inventory_item.condition IS 'Condition code from the game''s GameSchema.conditions (e.g. NEAR_MINT); NULL = not stated (cards added on the phone since stage R2). A Near Mint only wish treats NULL as a possible match.';

-- The undo of a delete: an owner's own delete keeps the row (deleted_at) and its photos until
-- restorable_until (10 minutes later); POST /inventory/items/{id}/restore brings it back before
-- then. The hourly housekeeping deletes the photos of the rows whose window has passed and clears
-- the column, so the partial index stays small. Other soft deletes (a trade, a binder deleted with
-- its cards) leave it NULL and remove the photos at once, as before.
ALTER TABLE inventory_item ADD COLUMN restorable_until timestamptz;
ALTER TABLE inventory_item ADD CONSTRAINT ck_inventory_item_restorable_until CHECK (
    restorable_until IS NULL OR deleted_at IS NOT NULL);

CREATE INDEX ix_inventory_item_restorable ON inventory_item (restorable_until)
    WHERE restorable_until IS NOT NULL;

COMMENT ON COLUMN inventory_item.restorable_until IS 'Set by an owner''s delete (deleted_at + 10 minutes): until then the owner may restore the item and its photos are kept; NULL for live items, other deletes and windows the housekeeping has closed (photos deleted).';
