-- V093: voluntary donations (Phase 10 contract "Donations", feature flag donations) through the
-- DonationProvider (the fake provider locally), their provider webhooks and the donations.*
-- platform settings. A donation is voluntary support: it never affects ratings, ranking or trust.

-- ---------------------------------------------------------------------------------------------
-- donation
-- ---------------------------------------------------------------------------------------------
CREATE TABLE donation (
    id            uuid          PRIMARY KEY,
    user_id       uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    amount        numeric(12,2) NOT NULL,
    currency      char(3)       NOT NULL,
    provider      text          NOT NULL,
    provider_ref  text,
    checkout_url  text,
    status        text          NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')),
    message       text,
    public_thanks boolean       NOT NULL DEFAULT false,
    failure_code  text,
    succeeded_at  timestamptz,
    refunded_at   timestamptz,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT ck_donation_amount CHECK (amount > 0),
    CONSTRAINT ck_donation_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_donation_provider CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
    CONSTRAINT ck_donation_refs CHECK (
        (provider_ref IS NULL OR char_length(provider_ref) <= 255)
        AND (checkout_url IS NULL OR char_length(checkout_url) <= 1000)
        AND (failure_code IS NULL OR char_length(failure_code) <= 100)),
    CONSTRAINT ck_donation_message CHECK (message IS NULL OR char_length(message) <= 280),
    CONSTRAINT ck_donation_succeeded CHECK (status NOT IN ('SUCCEEDED', 'REFUNDED') OR succeeded_at IS NOT NULL),
    CONSTRAINT uq_donation_provider_ref UNIQUE (provider, provider_ref)
);

CREATE INDEX ix_donation_user ON donation (user_id, created_at DESC);
CREATE INDEX ix_donation_status ON donation (status, created_at DESC, id DESC);
CREATE INDEX ix_donation_supporters ON donation (succeeded_at DESC) WHERE status = 'SUCCEEDED' AND public_thanks;

COMMENT ON TABLE donation IS 'Voluntary donations ("voluntary support"); never read by ratings, ranking or trust.';
COMMENT ON COLUMN donation.provider_ref IS 'Checkout reference at the provider (fake_dn_..., cs_...); the donor''s own fake checkout path carries it.';
COMMENT ON COLUMN donation.message IS 'Optional note of the donor to the team; admin views and the donor''s export only, never public.';
COMMENT ON COLUMN donation.public_thanks IS 'Opt-in: the donor''s display name may appear in GET /public/donations/supporters (names only, never amounts).';

-- ---------------------------------------------------------------------------------------------
-- donation_webhook_event: every webhook of the donation provider as received.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE donation_webhook_event (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider          text        NOT NULL,
    provider_event_id text,
    type              text        NOT NULL,
    signature_valid   boolean     NOT NULL,
    status            text        NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
    donation_id       uuid        REFERENCES donation (id) ON DELETE SET NULL,
    payload           jsonb       NOT NULL,
    error             text,
    received_at       timestamptz NOT NULL DEFAULT now(),
    processed_at      timestamptz,
    CONSTRAINT ck_donation_webhook_event_type CHECK (char_length(type) <= 100),
    CONSTRAINT ck_donation_webhook_event_error CHECK (error IS NULL OR char_length(error) <= 500),
    CONSTRAINT ck_donation_webhook_event_verified CHECK (
        signature_valid OR (status = 'IGNORED' AND provider_event_id IS NULL))
);

CREATE UNIQUE INDEX uq_donation_webhook_event_provider_event
    ON donation_webhook_event (provider, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX ix_donation_webhook_event_status ON donation_webhook_event (status, received_at DESC, id DESC);
CREATE INDEX ix_donation_webhook_event_donation ON donation_webhook_event (donation_id);

COMMENT ON COLUMN donation_webhook_event.payload IS 'CONFIDENTIAL: the body as received; admin donation detail only, never logged.';

-- ---------------------------------------------------------------------------------------------
-- donations.* platform settings (ADR 0014), edited through PUT /api/v1/admin/donations/settings.
-- ---------------------------------------------------------------------------------------------
INSERT INTO platform_settings (key, value, description) VALUES
    ('donations.min_amount', '2.00',   'Smallest accepted donation (0.50-1000.00).'),
    ('donations.max_amount', '500.00', 'Largest accepted donation (1.00-10000.00).'),
    ('donations.currencies', '"CAD,USD"', 'Accepted ISO 4217 currencies, comma-separated.');
