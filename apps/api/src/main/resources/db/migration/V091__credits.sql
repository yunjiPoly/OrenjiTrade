-- V091: OriEnji credits (Phase 10 contract "OriEnji credits"): an append-only ledger with derived
-- balances, credit products (what credits unlock, ADR 0014: prices are data), referral codes and
-- redemptions, and the credits.* platform settings.
--
-- Credits are non-cash: they are never bought, withdrawn or transferred through the API; they are
-- earned (referrals, promotions, rewards), granted by admins and spent on time-boxed entitlements.

-- ---------------------------------------------------------------------------------------------
-- credit_ledger_entry: append-only. A trigger refuses UPDATE, DELETE and TRUNCATE; corrections are
-- new ADJUST / REVERSAL entries. Entries of one account are appended under a transaction-scoped
-- advisory lock, so balance_after is the running sum and never negative.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE credit_ledger_entry (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES user_account (id),
    amount          integer     NOT NULL,
    balance_after   integer     NOT NULL,
    type            text        NOT NULL CHECK (type IN ('EARN', 'SPEND', 'GRANT', 'EXPIRE', 'ADJUST', 'REVERSAL')),
    reason          text        NOT NULL,
    reference_type  text,
    reference_id    text,
    idempotency_key text        NOT NULL,
    details         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    note            text,
    created_by      uuid        REFERENCES user_account (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    seq             bigint      GENERATED ALWAYS AS IDENTITY,
    CONSTRAINT ck_credit_ledger_entry_amount CHECK (amount <> 0),
    CONSTRAINT ck_credit_ledger_entry_balance CHECK (balance_after >= 0),
    CONSTRAINT ck_credit_ledger_entry_sign CHECK (
        (type IN ('EARN', 'GRANT') AND amount > 0)
        OR (type IN ('SPEND', 'EXPIRE') AND amount < 0)
        OR type IN ('ADJUST', 'REVERSAL')),
    CONSTRAINT ck_credit_ledger_entry_reason CHECK (reason ~ '^[A-Z][A-Z_]{1,39}$'),
    CONSTRAINT ck_credit_ledger_entry_reference CHECK (
        (reference_type IS NULL OR reference_type ~ '^[A-Z][A-Z_]{1,39}$')
        AND (reference_id IS NULL OR char_length(reference_id) <= 100)),
    CONSTRAINT ck_credit_ledger_entry_key CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
    CONSTRAINT ck_credit_ledger_entry_details CHECK (jsonb_typeof(details) = 'object'),
    CONSTRAINT ck_credit_ledger_entry_note CHECK (note IS NULL OR char_length(note) <= 500),
    CONSTRAINT uq_credit_ledger_entry_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX ix_credit_ledger_entry_user ON credit_ledger_entry (user_id, created_at DESC, id DESC);
CREATE INDEX ix_credit_ledger_entry_user_seq ON credit_ledger_entry (user_id, seq DESC);
CREATE INDEX ix_credit_ledger_entry_reference ON credit_ledger_entry (reference_type, reference_id)
    WHERE reference_type IS NOT NULL;

COMMENT ON TABLE credit_ledger_entry IS 'Append-only OriEnji credit ledger (non-cash, non-transferable, non-withdrawable); balance = SUM(amount) per user.';
COMMENT ON COLUMN credit_ledger_entry.seq IS 'Insertion order; the entry with the highest seq of an account carries its current balance in balance_after.';
COMMENT ON COLUMN credit_ledger_entry.balance_after IS 'Running balance after this entry (the sum of the account''s entries up to it); never negative.';
COMMENT ON COLUMN credit_ledger_entry.idempotency_key IS 'Unique per business action (spend:<userId>:<client key>, referral:<redemptionId>:referrer, admin:<uuid>, seed:...); a retry returns the original entry.';
COMMENT ON COLUMN credit_ledger_entry.note IS 'Admin free text of grants and adjustments; admin views only, never returned to the account owner.';

CREATE FUNCTION credit_ledger_entry_append_only() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'credit_ledger_entry is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_credit_ledger_entry_append_only
    BEFORE UPDATE OR DELETE ON credit_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION credit_ledger_entry_append_only();

CREATE TRIGGER trg_credit_ledger_entry_no_truncate
    BEFORE TRUNCATE ON credit_ledger_entry
    FOR EACH STATEMENT EXECUTE FUNCTION credit_ledger_entry_append_only();

REVOKE UPDATE, DELETE, TRUNCATE ON credit_ledger_entry FROM PUBLIC;

-- Derived balances (the API reads the sum through a Redis cache that the credits-reconcile job
-- compares with this view).
CREATE VIEW credit_balance AS
SELECT user_id,
       SUM(amount)::bigint AS balance,
       count(*)            AS entries,
       max(created_at)     AS last_entry_at
  FROM credit_ledger_entry
 GROUP BY user_id;

COMMENT ON VIEW credit_balance IS 'Balance per account derived from credit_ledger_entry (SUM(amount)).';

-- ---------------------------------------------------------------------------------------------
-- credit_product: what credits unlock (a time-boxed entitlement of a plan feature or limit).
-- Edited through PUT /api/v1/admin/credits/products/{key} (SUPER_ADMIN, audited).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE credit_product (
    key            text        PRIMARY KEY,
    name           text        NOT NULL,
    description    text        NOT NULL DEFAULT '',
    feature_key    text        NOT NULL,
    feature_value  text,
    cost           integer     NOT NULL,
    duration_hours integer     NOT NULL,
    active         boolean     NOT NULL DEFAULT true,
    sort_order     integer     NOT NULL DEFAULT 0,
    updated_by     uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_credit_product_key CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT ck_credit_product_name CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT ck_credit_product_description CHECK (char_length(description) <= 500),
    CONSTRAINT ck_credit_product_feature CHECK (feature_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
    CONSTRAINT ck_credit_product_value CHECK (feature_value IS NULL OR char_length(feature_value) <= 200),
    CONSTRAINT ck_credit_product_cost CHECK (cost BETWEEN 1 AND 100000),
    CONSTRAINT ck_credit_product_duration CHECK (duration_hours BETWEEN 1 AND 720)
);

COMMENT ON TABLE credit_product IS 'Credit spends: cost in credits for an entitlement (feature_key = feature_value) lasting duration_hours; source CREDIT_PURCHASE.';

INSERT INTO credit_product (key, name, description, feature_key, feature_value, cost, duration_hours, sort_order) VALUES
    ('premium_search_day', 'Advanced search for a day',   'Advanced search filters for 24 hours.',          'filters.advanced',     'true',      50, 24, 10),
    ('binder_views_day',   'Unlimited binder views',      'Open as many public binders as you like for 24 hours.', 'binder.views.per_day', 'unlimited', 30, 24, 20),
    ('map_radius_day',     'Wider map for a day',         'Search up to 100 km around you for 24 hours.',   'map.radius.max_km',    '100',       30, 24, 30);

-- ---------------------------------------------------------------------------------------------
-- referral_code / referral_redemption
-- ---------------------------------------------------------------------------------------------
CREATE TABLE referral_code (
    user_id    uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    code       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_referral_code_code CHECK (code ~ '^[A-Z0-9]{6,16}$'),
    CONSTRAINT uq_referral_code_code UNIQUE (code)
);

COMMENT ON TABLE referral_code IS 'One shareable code per account (created on first request, deleted when the account is purged).';

CREATE TABLE referral_redemption (
    id              uuid        PRIMARY KEY,
    referrer_id     uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    referee_id      uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    code            text        NOT NULL,
    referrer_reward integer     NOT NULL,
    referee_reward  integer     NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_referral_redemption_self CHECK (referrer_id <> referee_id),
    CONSTRAINT ck_referral_redemption_rewards CHECK (referrer_reward >= 0 AND referee_reward >= 0),
    CONSTRAINT uq_referral_redemption_referee UNIQUE (referee_id)
);

CREATE INDEX ix_referral_redemption_referrer ON referral_redemption (referrer_id, created_at DESC);

COMMENT ON TABLE referral_redemption IS 'An account redeemed another account''s code (once per account); both received EARN entries (reason REFERRAL).';

-- ---------------------------------------------------------------------------------------------
-- credits.* platform settings (ADR 0014), edited through PUT /api/v1/admin/credits/settings.
-- ---------------------------------------------------------------------------------------------
INSERT INTO platform_settings (key, value, description) VALUES
    ('credits.referral_referrer_reward',      '100', 'Credits earned by the owner of a referral code when another account redeems it (0-10000).'),
    ('credits.referral_referee_reward',       '50',  'Credits earned by the account redeeming a referral code (0-10000).'),
    ('credits.referral_max_account_age_days', '30',  'A referral code can only be redeemed within this many days of the redeeming account''s creation (1-365).'),
    ('credits.referral_max_per_referrer',     '50',  'Maximum number of redemptions of one account''s code (1-10000).');
