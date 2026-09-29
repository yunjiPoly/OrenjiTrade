-- V007: account deletion requests (Phase 1-B).
-- request (PENDING, grace period) -> job (PROCESSING -> COMPLETED: account anonymised, module
-- data purged, consents and audit kept) | CANCELLED by the owner during the grace period.

CREATE TABLE account_deletion_request (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    status           text        NOT NULL DEFAULT 'PENDING'
                                 CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
    reason           text,
    export_requested boolean     NOT NULL DEFAULT false,
    requested_at     timestamptz NOT NULL DEFAULT now(),
    scheduled_for    timestamptz NOT NULL,
    cancelled_at     timestamptz,
    completed_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_account_deletion_request_reason CHECK (reason IS NULL OR char_length(reason) <= 1000)
);

-- One active request per account.
CREATE UNIQUE INDEX uq_account_deletion_request_active
    ON account_deletion_request (user_id) WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX ix_account_deletion_request_due ON account_deletion_request (scheduled_for) WHERE status = 'PENDING';
CREATE INDEX ix_account_deletion_request_user ON account_deletion_request (user_id, requested_at DESC);

COMMENT ON TABLE account_deletion_request IS 'Owner-initiated account deletion; processed by the account-deletion job after the grace period.';
COMMENT ON COLUMN account_deletion_request.reason IS 'Free text given by the owner; never copied into the audit log and cleared when the deletion completes.';
COMMENT ON COLUMN account_deletion_request.export_requested IS 'The owner asked to download their export first (GET /me/export stays available while the deletion is pending).';
