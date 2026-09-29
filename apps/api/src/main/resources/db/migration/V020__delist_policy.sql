-- V020: auto-delist / freshness policy (ADR 0014, Phase 3 contract "Jobs", Phase 7 "Auto-delisting").
--
-- Thresholds are data, never code: the freshness job derives ACTIVE / AGING / STALE / HIDDEN from
-- confirmed_at and the single active row below. Admins edit it through /admin/delist-policies
-- (audited); the API caches the active row in Redis for at most 60 s and evicts it on every write.
-- Nothing is ever deleted by the policy: HIDDEN listings stay in the owner's inventory until they
-- confirm them again.

CREATE TABLE delist_policy (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text        NOT NULL,
    active                  boolean     NOT NULL DEFAULT false,
    aging_after_days        integer     NOT NULL,
    stale_after_days        integer     NOT NULL,
    hidden_after_days       integer     NOT NULL,
    warn_before_hidden_days integer     NOT NULL,
    max_strikes             integer     NOT NULL DEFAULT 3,
    updated_by              uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_delist_policy_name CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT ck_delist_policy_order CHECK (
        aging_after_days >= 1
        AND aging_after_days < stale_after_days
        AND stale_after_days < hidden_after_days
        AND hidden_after_days <= 3650),
    CONSTRAINT ck_delist_policy_warn CHECK (
        warn_before_hidden_days >= 0 AND warn_before_hidden_days < hidden_after_days),
    CONSTRAINT ck_delist_policy_strikes CHECK (max_strikes BETWEEN 1 AND 100)
);

-- Exactly one active policy (the application refuses to run the job without one).
CREATE UNIQUE INDEX uq_delist_policy_active ON delist_policy ((true)) WHERE active;

COMMENT ON TABLE delist_policy IS 'Freshness thresholds (days since confirmed_at): ACTIVE < aging_after_days <= AGING < stale_after_days <= STALE < hidden_after_days <= HIDDEN. Exactly one row is active.';
COMMENT ON COLUMN delist_policy.warn_before_hidden_days IS 'A WARNED freshness event (and a BinderFreshnessWarning domain event) is emitted this many days before a public listing is hidden.';
COMMENT ON COLUMN delist_policy.max_strikes IS 'Unresponsiveness strikes before the delist job pauses public listings (strike tracking arrives with Phase 5/7; the job no-ops until then).';

-- Contract seed: ACTIVE 0-14, AGING 15-30, STALE 31-45, HIDDEN 46+ days; warn 5 days before hiding.
INSERT INTO delist_policy (name, active, aging_after_days, stale_after_days, hidden_after_days,
                           warn_before_hidden_days, max_strikes)
VALUES ('Default', true, 15, 31, 46, 5, 3);
