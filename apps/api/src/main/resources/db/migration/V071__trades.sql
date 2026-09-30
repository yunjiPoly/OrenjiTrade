-- V071: trades (Phase 8 contract "Tables"): one trade per accepted offer and its event timeline.
--
-- A trade starts AGREED, or AWAITING_PAYMENT when the buyer asked for payment protection and the
-- protectedPayments flag was on at acceptance. Phase 8 moves AGREED trades to COMPLETED once both
-- parties confirmed (inventory quantities transferred, interaction TRADE recorded) or to CANCELLED
-- before any payment; marking an in-person meetup by both parties drops payment protection.
-- PAID / SHIPPED / RECEIVED / DISPUTED belong to Phase 9 (payment protection, shipping, disputes).
--
-- PRIVACY: trades never carry a location; cancel_reason is free text of a party, returned to the two
-- parties only. Money is numeric(12,2) + ISO currency.

CREATE TABLE trade (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id            uuid          NOT NULL REFERENCES offer (id) ON DELETE CASCADE,
    item_id             uuid          REFERENCES inventory_item (id) ON DELETE SET NULL,
    seller_id           uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    buyer_id            uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    kind                text          NOT NULL CHECK (kind IN ('CASH', 'TRADE', 'MIXED')),
    cash_amount         numeric(12,2),
    currency            char(3),
    status              text          NOT NULL
                                      CHECK (status IN ('AGREED', 'AWAITING_PAYMENT', 'PAID', 'SHIPPED',
                                                        'RECEIVED', 'COMPLETED', 'CANCELLED', 'DISPUTED')),
    protection_enabled  boolean       NOT NULL DEFAULT false,
    meetup              boolean       NOT NULL DEFAULT false,
    buyer_meetup_at     timestamptz,
    seller_meetup_at    timestamptz,
    buyer_confirmed_at  timestamptz,
    seller_confirmed_at timestamptz,
    cancelled_by        uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    cancel_reason       text,
    cancelled_at        timestamptz,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    completed_at        timestamptz,
    version             integer       NOT NULL DEFAULT 0,
    CONSTRAINT uq_trade_offer UNIQUE (offer_id),
    CONSTRAINT ck_trade_parties CHECK (seller_id <> buyer_id),
    CONSTRAINT ck_trade_cash CHECK ((kind = 'TRADE') = (cash_amount IS NULL)),
    CONSTRAINT ck_trade_currency CHECK ((cash_amount IS NULL) = (currency IS NULL)
                                        AND (currency IS NULL OR currency ~ '^[A-Z]{3}$')),
    CONSTRAINT ck_trade_protection CHECK (NOT protection_enabled OR cash_amount IS NOT NULL),
    CONSTRAINT ck_trade_meetup CHECK (NOT meetup OR (buyer_meetup_at IS NOT NULL AND seller_meetup_at IS NOT NULL)),
    CONSTRAINT ck_trade_completed CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
    CONSTRAINT ck_trade_cancelled CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
    CONSTRAINT ck_trade_cancel_reason CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500),
    CONSTRAINT ck_trade_version CHECK (version >= 0)
);

CREATE INDEX ix_trade_buyer ON trade (buyer_id, updated_at DESC, id DESC);
CREATE INDEX ix_trade_seller ON trade (seller_id, updated_at DESC, id DESC);
-- Copies of an item already promised in open trades (acceptance checks the item quantity).
CREATE INDEX ix_trade_item_open ON trade (item_id) WHERE status NOT IN ('COMPLETED', 'CANCELLED');
CREATE INDEX ix_trade_status ON trade (status, updated_at DESC);

COMMENT ON TABLE trade IS 'Trades created from accepted offers (Phase 8): AGREED | AWAITING_PAYMENT -> (Phase 9 PAID -> SHIPPED -> RECEIVED | DISPUTED) -> COMPLETED; CANCELLED before payment.';
COMMENT ON COLUMN trade.item_id IS 'Target inventory item of the accepted offer (the seller''s); SET NULL when the owner''s account is purged.';
COMMENT ON COLUMN trade.protection_enabled IS 'Payment protection through the PaymentProvider (Phase 9); false for in-person meetups.';
COMMENT ON COLUMN trade.meetup IS 'Both parties marked the trade as an in-person meetup (buyer_meetup_at and seller_meetup_at).';
COMMENT ON COLUMN trade.buyer_confirmed_at IS 'The buyer confirmed the exchange (POST /trades/{id}/complete); both confirmations complete the trade.';
COMMENT ON COLUMN trade.cancel_reason IS 'Free text of the cancelling party (<= 500), shown to both parties only.';

CREATE TABLE trade_event (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id   uuid        NOT NULL REFERENCES trade (id) ON DELETE CASCADE,
    actor_id   uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    event      text        NOT NULL,
    details    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    seq        bigint      GENERATED ALWAYS AS IDENTITY,
    CONSTRAINT ck_trade_event_event CHECK (event ~ '^[A-Z][A-Z_]{1,39}$'),
    CONSTRAINT ck_trade_event_details CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX ix_trade_event_trade ON trade_event (trade_id, created_at, seq);
CREATE INDEX ix_trade_event_actor ON trade_event (actor_id) WHERE actor_id IS NOT NULL;

COMMENT ON TABLE trade_event IS 'Trade timeline (append-only): CREATED, MEETUP_PROPOSED, MEETUP_AGREED, PROTECTION_REMOVED, COMPLETION_CONFIRMED, COMPLETED, CANCELLED (Phase 9 adds payment, shipping and dispute events).';
COMMENT ON COLUMN trade_event.actor_id IS 'Acting party; NULL for the platform (jobs, webhooks).';
COMMENT ON COLUMN trade_event.seq IS 'Insertion order: orders events of the same instant (timeline ordered by created_at, seq).';
COMMENT ON COLUMN trade_event.details IS 'Event data: ids, statuses and quantities only (never card numbers, payment data or free text other than the cancel reason).';
