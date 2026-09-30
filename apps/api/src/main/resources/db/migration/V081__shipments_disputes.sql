-- V081: shipping confirmation and disputes of protected trades (Phase 9 contract "Tables").
--
-- A seller ships a PAID trade (shipment row, dispute window starts); the buyer confirms receipt or
-- opens a dispute (PAID or SHIPPED, within the window). A dispute freezes the payout; the parties
-- add evidence (TEXT, IMAGE, DOCUMENT, TRACKING; VIDEO is reserved for a later migration) and
-- messages; admins add internal notes, freeze / unfreeze the case and resolve it for the buyer
-- (refund), the seller (payout) or with a split.
--
-- PRIVACY: nothing here stores a location. Evidence photos are re-encoded without metadata
-- (EXIF/GPS stripped) and every evidence file is served only to the two parties and admins
-- (GET /disputes/{id}/evidence/{evidenceId}/file), never through the public media route.

-- ---------------------------------------------------------------------------------------------
-- shipment: the seller's shipping confirmation of a protected trade.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE shipment (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id        uuid        NOT NULL REFERENCES trade (id) ON DELETE CASCADE,
    carrier         text,
    tracking_number text,
    notes           text,
    shipped_by      uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    shipped_at      timestamptz NOT NULL,
    delivered_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_shipment_trade UNIQUE (trade_id),
    CONSTRAINT ck_shipment_carrier CHECK (carrier IS NULL OR char_length(carrier) BETWEEN 1 AND 80),
    CONSTRAINT ck_shipment_tracking CHECK (tracking_number IS NULL OR char_length(tracking_number) BETWEEN 1 AND 100),
    CONSTRAINT ck_shipment_notes CHECK (notes IS NULL OR char_length(notes) <= 500)
);

COMMENT ON TABLE shipment IS 'Shipping confirmation of a protected trade (POST /trades/{id}/ship by the seller while PAID). delivered_at = receipt confirmed (by the buyer or the auto-release job).';
COMMENT ON COLUMN shipment.tracking_number IS 'Parcel tracking number given by the seller; shown to the two parties and admins only.';
COMMENT ON COLUMN shipment.notes IS 'Party free text (<= 500) of the seller; the two parties and admins only.';

-- ---------------------------------------------------------------------------------------------
-- dispute: at most one per trade.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE dispute (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id        uuid          NOT NULL REFERENCES trade (id) ON DELETE CASCADE,
    payment_id      uuid          NOT NULL REFERENCES payment (id) ON DELETE CASCADE,
    opened_by       uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    reason          text          NOT NULL CHECK (reason IN ('NOT_RECEIVED', 'NOT_AS_DESCRIBED', 'COUNTERFEIT', 'DAMAGED', 'OTHER')),
    description     text          NOT NULL,
    status          text          NOT NULL DEFAULT 'OPEN'
                                  CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'FROZEN', 'RESOLVED_BUYER', 'RESOLVED_SELLER',
                                                    'RESOLVED_SPLIT', 'CLOSED')),
    opened_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now(),
    frozen_at       timestamptz,
    frozen_by       uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    resolved_at     timestamptz,
    resolved_by     uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    resolution_note text,
    refund_amount   numeric(12,2),
    version         integer       NOT NULL DEFAULT 0,
    CONSTRAINT uq_dispute_trade UNIQUE (trade_id),
    CONSTRAINT ck_dispute_description CHECK (char_length(description) BETWEEN 1 AND 2000),
    CONSTRAINT ck_dispute_note CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 1000),
    CONSTRAINT ck_dispute_refund CHECK (refund_amount IS NULL OR refund_amount >= 0),
    CONSTRAINT ck_dispute_frozen CHECK (status <> 'FROZEN' OR frozen_at IS NOT NULL),
    CONSTRAINT ck_dispute_resolved CHECK ((status IN ('RESOLVED_BUYER', 'RESOLVED_SELLER', 'RESOLVED_SPLIT', 'CLOSED'))
                                          = (resolved_at IS NOT NULL)),
    CONSTRAINT ck_dispute_version CHECK (version >= 0)
);

CREATE INDEX ix_dispute_status ON dispute (status, opened_at DESC, id DESC);
CREATE INDEX ix_dispute_payment ON dispute (payment_id);
CREATE INDEX ix_dispute_opened_by ON dispute (opened_by) WHERE opened_by IS NOT NULL;

COMMENT ON TABLE dispute IS 'Dispute of a protected trade (Phase 9): OPEN -> UNDER_REVIEW (first admin note or unfreeze) -> FROZEN (admin hold: no new evidence or messages) -> RESOLVED_BUYER | RESOLVED_SELLER | RESOLVED_SPLIT (| CLOSED reserved). The payout stays frozen until a resolution.';
COMMENT ON COLUMN dispute.description IS 'Party free text (<= 2000) of the buyer; the two parties and admins only.';
COMMENT ON COLUMN dispute.resolution_note IS 'Admin note shown to both parties with the decision (<= 1000).';
COMMENT ON COLUMN dispute.refund_amount IS 'Amount refunded to the buyer by the resolution (the whole amount for BUYER, part of it for SPLIT, 0 for SELLER).';

-- ---------------------------------------------------------------------------------------------
-- dispute_evidence: typed, extensible evidence of the parties (at most 10 per party).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE dispute_evidence (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id   uuid        NOT NULL REFERENCES dispute (id) ON DELETE CASCADE,
    submitted_by uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    party_role   text        NOT NULL CHECK (party_role IN ('BUYER', 'SELLER')),
    -- VIDEO is reserved (unboxing videos are deferred, ADR 0011): a later migration extends this list.
    kind         text        NOT NULL CHECK (kind IN ('TEXT', 'IMAGE', 'DOCUMENT', 'TRACKING')),
    body         text,
    storage_key  text,
    url          text,
    content_type text,
    size_bytes   integer,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_dispute_evidence_body CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000),
    CONSTRAINT ck_dispute_evidence_url CHECK (url IS NULL OR (char_length(url) <= 500 AND url ~ '^https://')),
    CONSTRAINT ck_dispute_evidence_file CHECK ((kind IN ('IMAGE', 'DOCUMENT')) = (storage_key IS NOT NULL)),
    CONSTRAINT ck_dispute_evidence_text CHECK (kind NOT IN ('TEXT', 'TRACKING') OR body IS NOT NULL),
    CONSTRAINT ck_dispute_evidence_size CHECK (size_bytes IS NULL OR size_bytes > 0)
);

CREATE INDEX ix_dispute_evidence_dispute ON dispute_evidence (dispute_id, created_at);
CREATE INDEX ix_dispute_evidence_party ON dispute_evidence (dispute_id, party_role);

COMMENT ON TABLE dispute_evidence IS 'Evidence of the two parties (<= 10 each): TEXT (body), TRACKING (body + optional https url), IMAGE (re-encoded JPEG without metadata) or DOCUMENT (PDF) in the object storage under disputes/<disputeId>/. VIDEO reserved.';
COMMENT ON COLUMN dispute_evidence.storage_key IS 'Object key of IMAGE / DOCUMENT evidence; never returned (files are served by GET /disputes/{id}/evidence/{evidenceId}/file to the parties and admins).';
COMMENT ON COLUMN dispute_evidence.body IS 'Party free text (<= 2000); the two parties and admins only.';

-- ---------------------------------------------------------------------------------------------
-- dispute_event: timeline of a dispute (append-only).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE dispute_event (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id uuid        NOT NULL REFERENCES dispute (id) ON DELETE CASCADE,
    actor_id   uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    event      text        NOT NULL,
    details    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    seq        bigint      GENERATED ALWAYS AS IDENTITY,
    CONSTRAINT ck_dispute_event_event CHECK (event ~ '^[A-Z][A-Z_]{1,39}$'),
    CONSTRAINT ck_dispute_event_details CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX ix_dispute_event_dispute ON dispute_event (dispute_id, created_at, seq);

COMMENT ON TABLE dispute_event IS 'Dispute timeline: OPENED, EVIDENCE_ADDED, MESSAGE_POSTED, NOTE_ADDED, UNDER_REVIEW, FROZEN, UNFROZEN, RESOLVED (append-only; details carry statuses, kinds and amounts, never free text).';

-- ---------------------------------------------------------------------------------------------
-- dispute_message: thread between the parties and the admins.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE dispute_message (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id  uuid        NOT NULL REFERENCES dispute (id) ON DELETE CASCADE,
    author_id   uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    author_role text        NOT NULL CHECK (author_role IN ('BUYER', 'SELLER', 'ADMIN')),
    body        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_dispute_message_body CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX ix_dispute_message_dispute ON dispute_message (dispute_id, created_at);

COMMENT ON TABLE dispute_message IS 'Dispute thread (POST /disputes/{id}/messages): the two parties and admins; visible to all of them.';

-- ---------------------------------------------------------------------------------------------
-- dispute_note: internal admin notes (never shown to the parties).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE dispute_note (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id uuid        NOT NULL REFERENCES dispute (id) ON DELETE CASCADE,
    author_id  uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    body       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_dispute_note_body CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX ix_dispute_note_dispute ON dispute_note (dispute_id, created_at);

COMMENT ON TABLE dispute_note IS 'PRIVATE: admins'' internal notes on a dispute (POST /admin/disputes/{id}/notes); never shown to the parties.';
