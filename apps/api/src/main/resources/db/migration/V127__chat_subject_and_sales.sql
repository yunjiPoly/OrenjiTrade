-- V127 (stage R4 of the phone redesign, "Messages and Mark as sold"; owner spec 2026-10-14,
-- sections 10 and 12 "Messaging and sales"; ADR 0018, part 2): the card or deck core a chat is
-- about, and the sales collectors mark from the chat. Additive only: the paused web keeps every
-- column it reads. V124 is kept for another branch; R2 is V125 and R3 V126.
--
-- PRIVACY: a sale links two collectors and one card or deck core; tracking_number is seen by the two
-- collectors only (and by moderators acting on a report, as messages are). Nothing here stores a
-- place, an address or a payment detail: addresses and e-Transfer emails stay inside the messages
-- the collectors write (ADR 0017, spec section 13).

-- ---------------------------------------------------------------------------------------------
-- The chat's subject ("pinned card"): one chat per pair of collectors, and the latest card or deck
-- core opened from a listing, or the card its owner shared, becomes its subject (spec section 16,
-- default 8). At most one of the two is set. A card deleted from the inventory stays the subject
-- (soft delete: "No longer listed"); a binder deleted for good, or an account purged, leaves the
-- chat without one.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE conversation ADD COLUMN subject_item_id uuid
    REFERENCES inventory_item (id) ON DELETE SET NULL;
ALTER TABLE conversation ADD COLUMN subject_binder_id uuid
    REFERENCES binder (id) ON DELETE SET NULL;
ALTER TABLE conversation ADD COLUMN subject_set_at timestamptz;
ALTER TABLE conversation ADD COLUMN subject_set_by uuid
    REFERENCES user_account (id) ON DELETE SET NULL;
ALTER TABLE conversation ADD CONSTRAINT ck_conversation_one_subject CHECK (
    subject_item_id IS NULL OR subject_binder_id IS NULL);

-- The foreign keys' ON DELETE SET NULL (an account purge deletes items, a binder delete its row).
CREATE INDEX ix_conversation_subject_item ON conversation (subject_item_id)
    WHERE subject_item_id IS NOT NULL;
CREATE INDEX ix_conversation_subject_binder ON conversation (subject_binder_id)
    WHERE subject_binder_id IS NOT NULL;

COMMENT ON COLUMN conversation.subject_item_id IS 'The card (inventory item) the chat is about (stage R4): pinned from a listing by a buyer (it was public then) or shared by its owner; the latest pin wins.';
COMMENT ON COLUMN conversation.subject_binder_id IS 'The deck core (binder sold as one bundle) the chat is about (stage R4); at most one of subject_item_id and subject_binder_id is set.';
COMMENT ON COLUMN conversation.subject_set_at IS 'When the current subject was pinned; a sale counts for the subject pinned at or before it.';
COMMENT ON COLUMN conversation.subject_set_by IS 'Who pinned the current subject: its owner (shared it, so the other collector sees it even while private) or the buyer (it was public then).';

-- ---------------------------------------------------------------------------------------------
-- sale: "Mark as sold" (stage R4, the deals module). The seller of the chat's card or deck core
-- marks it sold to the other collector, with the copies sold and an optional tracking number. The
-- copies leave the inventory (the card at 0 copies, a deck core with its cards); the seller can undo
-- it for 10 minutes, before anyone has rated it (spec section 16, default 4). OrenjiTrade never
-- handles the money: a sale records that two collectors agreed, nothing more (ADR 0018).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE sale (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   uuid        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    seller_id         uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    buyer_id          uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    kind              text        NOT NULL,
    inventory_item_id uuid        REFERENCES inventory_item (id) ON DELETE SET NULL,
    binder_id         uuid        REFERENCES binder (id) ON DELETE SET NULL,
    name              text        NOT NULL,
    quantity          integer     NOT NULL,
    tracking_number   varchar(64),
    item_removed      boolean     NOT NULL DEFAULT false,
    removed_item_ids  uuid[]      NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    undone_at         timestamptz,
    CONSTRAINT ck_sale_kind CHECK (kind IN ('CARD', 'DECK_CORE')),
    CONSTRAINT ck_sale_parties CHECK (seller_id <> buyer_id),
    CONSTRAINT ck_sale_subject CHECK (inventory_item_id IS NULL OR binder_id IS NULL),
    CONSTRAINT ck_sale_name CHECK (char_length(name) BETWEEN 1 AND 200),
    CONSTRAINT ck_sale_quantity CHECK (quantity BETWEEN 1 AND 9999),
    CONSTRAINT ck_sale_tracking_number CHECK (
        tracking_number IS NULL
        OR (tracking_number = btrim(tracking_number) AND tracking_number <> ''))
);

CREATE INDEX ix_sale_conversation ON sale (conversation_id, created_at DESC);
CREATE INDEX ix_sale_seller ON sale (seller_id, created_at DESC);
CREATE INDEX ix_sale_buyer ON sale (buyer_id, created_at DESC);
CREATE INDEX ix_sale_item ON sale (inventory_item_id) WHERE inventory_item_id IS NOT NULL;
CREATE INDEX ix_sale_binder ON sale (binder_id) WHERE binder_id IS NOT NULL;

COMMENT ON TABLE sale IS 'A card or deck core one collector marked sold to another from their chat (stage R4, ADR 0018). Payment happens outside OrenjiTrade; this records the agreement only.';
COMMENT ON COLUMN sale.kind IS 'CARD (inventory_item_id) or DECK_CORE (binder_id): what was sold.';
COMMENT ON COLUMN sale.name IS 'The card or deck core name at the time of the sale (the sale message keeps it when the listing is gone).';
COMMENT ON COLUMN sale.quantity IS 'Copies sold (1 for a deck core).';
COMMENT ON COLUMN sale.tracking_number IS 'PRIVATE to the two collectors: the optional tracking number of the shipment (<= 64, trimmed). Never in logs or analytics.';
COMMENT ON COLUMN sale.item_removed IS 'The sale took the card''s last copy, so the card left the inventory (soft delete, restorable for the undo window).';
COMMENT ON COLUMN sale.removed_item_ids IS 'Deck core sales: the cards the sale soft-deleted with the core (restored by an undo).';
COMMENT ON COLUMN sale.undone_at IS 'When the seller undid the sale (within 10 minutes, before anyone rated it); the copies came back.';

-- ---------------------------------------------------------------------------------------------
-- A sale makes the two collectors eligible to rate each other at once (InteractionKind SALE,
-- subject_type SALE; ADR 0018, part 3). An undo removes it while nobody has rated it.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE interaction DROP CONSTRAINT IF EXISTS interaction_kind_check;
ALTER TABLE interaction ADD CONSTRAINT ck_interaction_kind CHECK (
    kind IN ('TRADE', 'OFFER_ACCEPTED', 'CONVERSATION_QUALIFIED', 'SALE'));
ALTER TABLE interaction DROP CONSTRAINT IF EXISTS interaction_subject_type_check;
ALTER TABLE interaction ADD CONSTRAINT ck_interaction_subject_type CHECK (
    subject_type IN ('TRADE', 'OFFER', 'CONVERSATION', 'SALE'));

COMMENT ON COLUMN interaction.kind IS 'TRADE, OFFER_ACCEPTED, CONVERSATION_QUALIFIED or SALE (a card or deck core marked sold from the chat, stage R4).';
