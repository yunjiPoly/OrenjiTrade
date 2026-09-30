-- V070: public offers (Phase 8 contract "Tables"): offers with their counter chain, the buyer's
-- trade items, the full event history, the seller's offer preferences and the de-duplication key of
-- the SYSTEM messages the offers module posts into the pair conversation.
--
-- Counter chain: every proposal is one offer row. The first proposal (the buyer's) is the chain
-- root (parent_offer_id NULL, root_offer_id = id) and starts OPEN with current_turn SELLER. A
-- counter-offer is a new row (status COUNTERED, parent_offer_id = the proposal it answers,
-- root_offer_id = the chain root, current_turn = the other party) and the answered proposal becomes
-- COUNTERED with superseded_by = the new row. The live proposal of a chain is the row without
-- superseded_by; only a live OPEN or COUNTERED row can be accepted, declined, countered, cancelled
-- (OPEN, buyer) or expired. Every transition appends an offer_event with a full snapshot.
--
-- PRIVACY: offers never carry a location. item_snapshot / offer_trade_item.item_snapshot hold the
-- PUBLIC form of the items at offer time (never inventory_item.notes). offer.message and
-- offer_event.reason are free text of the two parties, returned to them only.

-- ---------------------------------------------------------------------------------------------
-- offer
-- ---------------------------------------------------------------------------------------------
CREATE TABLE offer (
    id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    root_offer_id        uuid          NOT NULL,
    parent_offer_id      uuid,
    superseded_by        uuid,
    item_id              uuid          REFERENCES inventory_item (id) ON DELETE SET NULL,
    seller_id            uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    buyer_id             uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    kind                 text          NOT NULL CHECK (kind IN ('CASH', 'TRADE', 'MIXED')),
    cash_amount          numeric(12,2),
    currency             char(3),
    status               text          NOT NULL DEFAULT 'OPEN'
                                       CHECK (status IN ('OPEN', 'COUNTERED', 'ACCEPTED', 'DECLINED',
                                                         'CANCELLED', 'EXPIRED')),
    current_turn         text          NOT NULL CHECK (current_turn IN ('SELLER', 'BUYER')),
    message              text,
    protection_requested boolean       NOT NULL DEFAULT false,
    item_snapshot        jsonb         NOT NULL DEFAULT '{}'::jsonb,
    expires_at           timestamptz   NOT NULL,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    updated_at           timestamptz   NOT NULL DEFAULT now(),
    closed_at            timestamptz,
    version              integer       NOT NULL DEFAULT 0,
    CONSTRAINT fk_offer_root FOREIGN KEY (root_offer_id) REFERENCES offer (id) ON DELETE CASCADE,
    CONSTRAINT fk_offer_parent FOREIGN KEY (parent_offer_id) REFERENCES offer (id) ON DELETE CASCADE,
    -- Deferred: a counter marks the answered proposal before the new row exists.
    CONSTRAINT fk_offer_superseded_by FOREIGN KEY (superseded_by) REFERENCES offer (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT ck_offer_parties CHECK (seller_id <> buyer_id),
    CONSTRAINT ck_offer_chain CHECK ((parent_offer_id IS NULL) = (root_offer_id = id)),
    CONSTRAINT ck_offer_cash CHECK ((kind = 'TRADE') = (cash_amount IS NULL)),
    CONSTRAINT ck_offer_cash_positive CHECK (cash_amount IS NULL OR cash_amount > 0),
    CONSTRAINT ck_offer_currency CHECK ((cash_amount IS NULL) = (currency IS NULL)
                                        AND (currency IS NULL OR currency ~ '^[A-Z]{3}$')),
    CONSTRAINT ck_offer_protection CHECK (NOT protection_requested OR kind <> 'TRADE'),
    CONSTRAINT ck_offer_message CHECK (message IS NULL OR char_length(message) <= 500),
    CONSTRAINT ck_offer_superseded CHECK (superseded_by IS NULL OR status = 'COUNTERED'),
    CONSTRAINT ck_offer_closed CHECK ((closed_at IS NULL) = (status IN ('OPEN', 'COUNTERED') AND superseded_by IS NULL)),
    CONSTRAINT ck_offer_version CHECK (version >= 0),
    CONSTRAINT ck_offer_item_snapshot CHECK (jsonb_typeof(item_snapshot) = 'object')
);

-- One live negotiation per buyer and item (409 OFFER_ALREADY_OPEN; inserts rely on it under races).
CREATE UNIQUE INDEX uq_offer_live_buyer_item ON offer (buyer_id, item_id)
    WHERE status IN ('OPEN', 'COUNTERED') AND superseded_by IS NULL;
-- GET /offers?role=buyer|seller: the live (latest) row of each chain, most recent activity first.
CREATE INDEX ix_offer_buyer_latest ON offer (buyer_id, updated_at DESC, id DESC) WHERE superseded_by IS NULL;
CREATE INDEX ix_offer_seller_latest ON offer (seller_id, updated_at DESC, id DESC) WHERE superseded_by IS NULL;
-- Hourly expiry job.
CREATE INDEX ix_offer_expiry ON offer (expires_at)
    WHERE status IN ('OPEN', 'COUNTERED') AND superseded_by IS NULL;
-- Counter chains and item look-ups.
CREATE INDEX ix_offer_root ON offer (root_offer_id, created_at);
CREATE INDEX ix_offer_parent ON offer (parent_offer_id) WHERE parent_offer_id IS NOT NULL;
CREATE INDEX ix_offer_superseded_by ON offer (superseded_by) WHERE superseded_by IS NOT NULL;
CREATE INDEX ix_offer_item ON offer (item_id) WHERE item_id IS NOT NULL;

COMMENT ON TABLE offer IS 'Offers on public inventory items (Phase 8): one row per proposal of a counter chain. OPEN -> COUNTERED -> (COUNTERED)* -> ACCEPTED | DECLINED | EXPIRED; OPEN -> CANCELLED (buyer) | DECLINED (seller) | EXPIRED. Only current_turn may act; optimistic version (409 STALE_OFFER).';
COMMENT ON COLUMN offer.root_offer_id IS 'First proposal of the chain (= id for the root); history and chain look-ups.';
COMMENT ON COLUMN offer.parent_offer_id IS 'The proposal this counter-offer answers (counterOf); NULL for the chain root.';
COMMENT ON COLUMN offer.superseded_by IS 'The counter-offer that replaced this proposal (status COUNTERED); NULL for the live proposal of the chain.';
COMMENT ON COLUMN offer.item_id IS 'Target inventory item (the seller''s). SET NULL only when the owner''s account is purged; item_snapshot keeps its public form.';
COMMENT ON COLUMN offer.cash_amount IS 'Cash part (numeric(12,2)) in currency; NULL for TRADE offers.';
COMMENT ON COLUMN offer.current_turn IS 'Party expected to answer: SELLER for the buyer''s proposals, BUYER for the seller''s counters.';
COMMENT ON COLUMN offer.message IS 'Free text of the proposing party (<= 500), shown to both parties only; erased when its author''s account is purged.';
COMMENT ON COLUMN offer.protection_requested IS 'The buyer asked for payment protection; the trade starts AWAITING_PAYMENT when the protectedPayments flag is on at acceptance (Phase 9).';
COMMENT ON COLUMN offer.item_snapshot IS 'PUBLIC form of the target item at offer time (PublicInventoryItem JSON, never private notes).';
COMMENT ON COLUMN offer.closed_at IS 'When the proposal left the live states (superseded, accepted, declined, cancelled or expired).';
COMMENT ON COLUMN offer.version IS 'Optimistic lock: incremented by every transition; clients may send the version they saw (409 STALE_OFFER on mismatch).';

-- ---------------------------------------------------------------------------------------------
-- offer_trade_item: the buyer's cards offered in a TRADE or MIXED proposal.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE offer_trade_item (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id          uuid        NOT NULL REFERENCES offer (id) ON DELETE CASCADE,
    inventory_item_id uuid        REFERENCES inventory_item (id) ON DELETE SET NULL,
    quantity          integer     NOT NULL DEFAULT 1,
    position          smallint    NOT NULL,
    item_snapshot     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_offer_trade_item_position UNIQUE (offer_id, position),
    CONSTRAINT uq_offer_trade_item_item UNIQUE (offer_id, inventory_item_id),
    CONSTRAINT ck_offer_trade_item_quantity CHECK (quantity BETWEEN 1 AND 9999),
    CONSTRAINT ck_offer_trade_item_position CHECK (position BETWEEN 0 AND 9),
    CONSTRAINT ck_offer_trade_item_snapshot CHECK (jsonb_typeof(item_snapshot) = 'object')
);

CREATE INDEX ix_offer_trade_item_item ON offer_trade_item (inventory_item_id) WHERE inventory_item_id IS NOT NULL;

COMMENT ON TABLE offer_trade_item IS 'Cards of the buyer offered in trade (TRADE / MIXED proposals): the buyer''s own non-deleted items at offer time (effective public visibility not required).';
COMMENT ON COLUMN offer_trade_item.item_snapshot IS 'PUBLIC form of the offered item at offer time (never private notes).';

-- ---------------------------------------------------------------------------------------------
-- offer_event: full audit history of a chain.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE offer_event (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id      uuid        NOT NULL REFERENCES offer (id) ON DELETE CASCADE,
    root_offer_id uuid        NOT NULL REFERENCES offer (id) ON DELETE CASCADE,
    actor_id      uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    event         text        NOT NULL CHECK (event IN ('CREATED', 'COUNTERED', 'ACCEPTED', 'DECLINED',
                                                        'CANCELLED', 'EXPIRED', 'VIEWED')),
    snapshot      jsonb       NOT NULL,
    reason        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    seq           bigint      GENERATED ALWAYS AS IDENTITY,
    CONSTRAINT ck_offer_event_snapshot CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT ck_offer_event_reason CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX ix_offer_event_root ON offer_event (root_offer_id, created_at, seq);
CREATE INDEX ix_offer_event_offer ON offer_event (offer_id, created_at);
CREATE INDEX ix_offer_event_actor ON offer_event (actor_id) WHERE actor_id IS NOT NULL;
-- The first view of a proposal by the party who has to answer it is recorded once.
CREATE UNIQUE INDEX uq_offer_event_viewed ON offer_event (offer_id, actor_id) WHERE event = 'VIEWED';

COMMENT ON TABLE offer_event IS 'Every offer transition (CREATED, COUNTERED, ACCEPTED, DECLINED, CANCELLED, EXPIRED) and the first VIEWED by the answering party, with a full snapshot of the proposal after the event. Append-only.';
COMMENT ON COLUMN offer_event.actor_id IS 'Acting party; NULL for the expiry job.';
COMMENT ON COLUMN offer_event.snapshot IS 'Proposal after the event: {id, status, kind, cashAmount, currency, tradeItems[{inventoryItemId, quantity, cardName, printingCode}], message, currentTurn, expiresAt, version, protectionRequested, itemId, sellerId, buyerId}. No private notes, no location.';
COMMENT ON COLUMN offer_event.seq IS 'Insertion order: orders events of the same instant (history is ordered by created_at, seq).';
COMMENT ON COLUMN offer_event.reason IS 'Optional decline / cancel reason of the acting party (<= 500), shown to both parties only.';

-- ---------------------------------------------------------------------------------------------
-- offer_preferences: the seller's offer settings (GET/PUT /me/settings/offers).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE offer_preferences (
    user_id       uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    accepts_mixed boolean     NOT NULL DEFAULT true,
    updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE offer_preferences IS 'Offer settings of a collector; no row = defaults (accepts_mixed true).';
COMMENT ON COLUMN offer_preferences.accepts_mixed IS 'Whether MIXED (cash + cards) offers are welcome on the collector''s TRADE_OR_SALE items (422 OFFERS_NOT_ACCEPTED otherwise).';

-- ---------------------------------------------------------------------------------------------
-- message: SYSTEM messages posted by the platform (offer and trade updates) carry a de-duplication
-- key in payload.systemKey so a redelivered event never posts twice.
-- ---------------------------------------------------------------------------------------------
CREATE UNIQUE INDEX uq_message_system_key ON message ((payload ->> 'systemKey'))
    WHERE (payload ->> 'systemKey') IS NOT NULL;
