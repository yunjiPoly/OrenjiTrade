-- V010: feature flags (ADR 0014). Rows are created by migrations only; admins toggle them through
-- PUT /api/v1/admin/feature-flags/{key} (SUPER_ADMIN, audited). The API caches the whole table in
-- Redis for at most 60 s and evicts it on every admin write.
--
-- Defaults are the production-safe values of docs/development/seed-data.md. The local/dev seed
-- (FeatureFlagSeedContributor) switches on protectedPayments, advertising and donations so every
-- flow can be exercised locally with the fake providers; mlScanning stays off (owner hold, Phase 11).

CREATE TABLE feature_flag (
    key             text        PRIMARY KEY,
    enabled         boolean     NOT NULL DEFAULT false,
    description     text        NOT NULL DEFAULT '',
    rollout_percent integer     NOT NULL DEFAULT 100,
    updated_by      uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_feature_flag_key CHECK (key ~ '^[a-z][a-zA-Z0-9]{1,63}$'),
    CONSTRAINT ck_feature_flag_rollout CHECK (rollout_percent BETWEEN 0 AND 100),
    CONSTRAINT ck_feature_flag_description CHECK (char_length(description) <= 500)
);

COMMENT ON TABLE feature_flag IS 'Runtime feature switches (ADR 0014); cached in Redis <= 60 s, evicted on admin writes.';
COMMENT ON COLUMN feature_flag.key IS 'lowerCamelCase flag name used by code and clients (e.g. mlScanning).';
COMMENT ON COLUMN feature_flag.rollout_percent IS 'Share of accounts (0-100) that see an enabled flag; bucket = hash(flag key, user id) mod 100. Anonymous callers only see flags rolled out to 100 %.';
COMMENT ON COLUMN feature_flag.updated_by IS 'Admin account of the last change; NULL for migration defaults and the local seed.';

INSERT INTO feature_flag (key, enabled, description) VALUES
    ('mlScanning',        false, 'Camera card scanning through the ML service (Phase 11, on hold by owner decision).'),
    ('protectedPayments', false, 'Protected payments, shipping and disputes through the PaymentProvider (Phase 9).'),
    ('publicChat',        true,  'Public community channels (Phase 5).'),
    ('premiumPlans',      true,  'Premium plan marketing, checkout and upgrade prompts (Phase 10).'),
    ('advertising',       false, 'Internal sponsored placements labelled "Sponsored" (Phase 10).'),
    ('credits',           true,  'OrenjiTrade credits ledger and spending (Phase 10).'),
    ('donations',         false, 'Voluntary donations through the DonationProvider (Phase 10).');
