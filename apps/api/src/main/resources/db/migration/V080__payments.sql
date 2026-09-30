-- V080: payment protection (Phase 9 contract "Tables", ADR 0011): platform settings of the payment
-- flow, seller payout accounts, protected payments with their event history, refunds and the
-- provider webhook inbox.
--
-- The platform never stores card numbers, CVV or bank credentials: only provider references
-- (payment, transfer, refund and connected-account ids). Money is numeric(12,2) + ISO currency. The
-- user-facing wording is "payment protection", never "escrow".
--
-- Flow: POST /trades/{id}/pay creates the payment (REQUIRES_ACTION) through the PaymentProvider; the
-- provider's webhook secures it (SECURED, trade PAID); the seller ships (dispute window starts); the
-- buyer confirms receipt or the hourly auto-release job treats the window's end as receipt; the
-- payout is released to the seller (PAID_OUT, trade COMPLETED). A dispute freezes the payout until
-- an admin resolves it (refund to the buyer, payout to the seller, or a split).

-- ---------------------------------------------------------------------------------------------
-- platform_settings: configurable business rules of the platform (ADR 0014). Phase 9 adds the
-- payments.* rows; edited through PUT /api/v1/admin/payments/settings (SUPER_ADMIN, audited) and
-- cached in Redis for at most 60 s.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE platform_settings (
    key         text        PRIMARY KEY,
    value       jsonb       NOT NULL,
    description text        NOT NULL DEFAULT '',
    updated_by  uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_platform_settings_key CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT ck_platform_settings_value CHECK (jsonb_typeof(value) IN ('number', 'boolean', 'string')),
    CONSTRAINT ck_platform_settings_description CHECK (char_length(description) <= 500)
);

COMMENT ON TABLE platform_settings IS 'Configurable platform rules (ADR 0014) as typed JSON scalars; each key is validated by the owning module (payments.*: PaymentSettings). Cached in Redis <= 60 s, evicted on admin writes.';
COMMENT ON COLUMN platform_settings.value IS 'JSON scalar (number, boolean or string); the owning module checks type and bounds on read and write.';
COMMENT ON COLUMN platform_settings.updated_by IS 'Admin account of the last change; NULL for migration defaults.';

INSERT INTO platform_settings (key, value, description) VALUES
    ('payments.dispute_window_days',    '7',     'Days after shipment during which the buyer may open a dispute; afterwards the payout is released automatically (1-60).'),
    ('payments.platform_fee_percent',   '5.00',  'Platform fee kept from protected payments, percent of the amount (0-30, two decimals).'),
    ('payments.auto_release_enabled',   'true',  'Whether the hourly payments-auto-release job releases payouts once the dispute window has passed.'),
    ('payments.release_reminder_hours', '48',    'The buyer is reminded this many hours before the automatic release (1-168).'),
    ('payments.admin_refunds_enabled',  'false', 'Whether ADMIN (not only SUPER_ADMIN) may issue refunds through POST /admin/payments/{id}/refund.');

-- ---------------------------------------------------------------------------------------------
-- seller_account: a collector's payout account at the payment provider (Stripe Connect Express;
-- the fake provider locally). Only the provider's account id is stored.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE seller_account (
    user_id             uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    provider            text        NOT NULL,
    provider_account_id text,
    status              text        NOT NULL DEFAULT 'NOT_STARTED'
                                    CHECK (status IN ('NOT_STARTED', 'PENDING', 'ACTIVE', 'RESTRICTED')),
    payouts_enabled     boolean     NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_seller_account_provider CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
    CONSTRAINT ck_seller_account_ref CHECK (provider_account_id IS NULL OR char_length(provider_account_id) <= 255),
    CONSTRAINT ck_seller_account_active CHECK (status <> 'ACTIVE' OR provider_account_id IS NOT NULL)
);

CREATE UNIQUE INDEX uq_seller_account_provider_account ON seller_account (provider, provider_account_id)
    WHERE provider_account_id IS NOT NULL;

COMMENT ON TABLE seller_account IS 'Payout account of a seller at the payment provider (Phase 9): NOT_STARTED -> PENDING -> ACTIVE | RESTRICTED. A buyer can pay a protected trade only when the seller is ACTIVE with payouts enabled.';
COMMENT ON COLUMN seller_account.provider_account_id IS 'CONFIDENTIAL: connected-account id at the provider (acct_...; fake_acct_... locally). Never returned to other members.';

-- ---------------------------------------------------------------------------------------------
-- payment: one protected payment per trade.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payment (
    id                     uuid          PRIMARY KEY,
    trade_id               uuid          NOT NULL REFERENCES trade (id) ON DELETE CASCADE,
    buyer_id               uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    seller_id              uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    provider               text          NOT NULL,
    provider_ref           text          NOT NULL,
    status                 text          NOT NULL DEFAULT 'REQUIRES_ACTION'
                                         CHECK (status IN ('REQUIRES_ACTION', 'SECURED', 'PAYOUT_PENDING', 'PAID_OUT',
                                                           'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED', 'CANCELLED')),
    amount                 numeric(12,2) NOT NULL,
    currency               char(3)       NOT NULL,
    fee_percent            numeric(5,2)  NOT NULL,
    platform_fee           numeric(12,2) NOT NULL,
    seller_amount          numeric(12,2) NOT NULL,
    refunded_amount        numeric(12,2) NOT NULL DEFAULT 0,
    payout_amount          numeric(12,2),
    payout_ref             text,
    payout_frozen          boolean       NOT NULL DEFAULT false,
    checkout_url           text,
    failure_code           text,
    secured_at             timestamptz,
    payout_released_at     timestamptz,
    refunded_at            timestamptz,
    dispute_window_ends_at timestamptz,
    release_reminded_at    timestamptz,
    created_at             timestamptz   NOT NULL DEFAULT now(),
    updated_at             timestamptz   NOT NULL DEFAULT now(),
    version                integer       NOT NULL DEFAULT 0,
    CONSTRAINT uq_payment_trade UNIQUE (trade_id),
    CONSTRAINT uq_payment_provider_ref UNIQUE (provider, provider_ref),
    CONSTRAINT ck_payment_parties CHECK (buyer_id <> seller_id),
    CONSTRAINT ck_payment_provider CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
    CONSTRAINT ck_payment_ref CHECK (char_length(provider_ref) BETWEEN 1 AND 255),
    CONSTRAINT ck_payment_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_payment_amount CHECK (amount > 0),
    CONSTRAINT ck_payment_fee_percent CHECK (fee_percent BETWEEN 0 AND 100),
    CONSTRAINT ck_payment_split CHECK (platform_fee >= 0 AND seller_amount >= 0 AND platform_fee + seller_amount = amount),
    CONSTRAINT ck_payment_refunded CHECK (refunded_amount >= 0 AND refunded_amount <= amount),
    CONSTRAINT ck_payment_payout CHECK (payout_amount IS NULL OR (payout_amount >= 0 AND payout_amount <= amount)),
    CONSTRAINT ck_payment_secured CHECK (status IN ('REQUIRES_ACTION', 'FAILED', 'CANCELLED') OR secured_at IS NOT NULL),
    CONSTRAINT ck_payment_paid_out CHECK (status <> 'PAID_OUT' OR payout_released_at IS NOT NULL),
    CONSTRAINT ck_payment_checkout_url CHECK (checkout_url IS NULL OR char_length(checkout_url) <= 2000),
    CONSTRAINT ck_payment_failure_code CHECK (failure_code IS NULL OR char_length(failure_code) <= 100),
    CONSTRAINT ck_payment_version CHECK (version >= 0)
);

CREATE INDEX ix_payment_status ON payment (status, updated_at DESC, id DESC);
CREATE INDEX ix_payment_buyer ON payment (buyer_id, created_at DESC);
CREATE INDEX ix_payment_seller ON payment (seller_id, created_at DESC);
-- Hourly auto-release job and its reminders: secured payments whose dispute window runs out.
CREATE INDEX ix_payment_release_due ON payment (dispute_window_ends_at)
    WHERE status = 'SECURED' AND dispute_window_ends_at IS NOT NULL;

COMMENT ON TABLE payment IS 'Protected payment of a trade (Phase 9): REQUIRES_ACTION -> SECURED (provider webhook) -> PAYOUT_PENDING -> PAID_OUT; REFUNDED / PARTIALLY_REFUNDED after refunds; FAILED / CANCELLED before securing. Provider references only, never card data.';
COMMENT ON COLUMN payment.provider_ref IS 'CONFIDENTIAL: payment reference at the provider (payment intent id; fake_pi_... locally). The fake checkout page is /checkout/fake/<provider_ref>.';
COMMENT ON COLUMN payment.fee_percent IS 'platform_settings payments.platform_fee_percent when the payment was created.';
COMMENT ON COLUMN payment.platform_fee IS 'Fee kept by the platform (amount x fee_percent, rounded half-up to the cent).';
COMMENT ON COLUMN payment.seller_amount IS 'amount - platform_fee: what the seller receives when the payout is released in full.';
COMMENT ON COLUMN payment.refunded_amount IS 'Sum of the successful refunds to the buyer.';
COMMENT ON COLUMN payment.payout_amount IS 'Amount transferred to the seller when the payout was released (seller_amount, or less after a split dispute resolution).';
COMMENT ON COLUMN payment.payout_ref IS 'CONFIDENTIAL: transfer reference at the provider.';
COMMENT ON COLUMN payment.payout_frozen IS 'An open dispute holds the payout: neither receipt confirmation nor the auto-release job can release it until an admin resolves the dispute.';
COMMENT ON COLUMN payment.checkout_url IS 'Where the buyer completes the payment (relative /checkout/fake/<ref> locally, the provider-hosted page otherwise); never a client secret.';
COMMENT ON COLUMN payment.dispute_window_ends_at IS 'Shipment time + payments.dispute_window_days; after it the auto-release job treats the card as received.';
COMMENT ON COLUMN payment.release_reminded_at IS 'When the buyer was reminded of the automatic release (payments.release_reminder_hours before the window ends).';
COMMENT ON COLUMN payment.version IS 'Optimistic lock: +1 per change; rows are also locked FOR UPDATE (after the trade row) by every transition.';

-- ---------------------------------------------------------------------------------------------
-- payment_event: full history of a payment (append-only).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payment_event (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id        uuid        NOT NULL REFERENCES payment (id) ON DELETE CASCADE,
    event             text        NOT NULL,
    provider_event_id text,
    actor_id          uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    details           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    seq               bigint      GENERATED ALWAYS AS IDENTITY,
    CONSTRAINT ck_payment_event_event CHECK (event ~ '^[A-Z][A-Z_]{1,39}$'),
    CONSTRAINT ck_payment_event_details CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX ix_payment_event_payment ON payment_event (payment_id, created_at, seq);
-- A provider event changes a payment at most once per kind of change (second idempotency layer).
CREATE UNIQUE INDEX uq_payment_event_provider_event ON payment_event (payment_id, event, provider_event_id)
    WHERE provider_event_id IS NOT NULL;

COMMENT ON TABLE payment_event IS 'Payment history: CREATED, CHECKOUT_RESTARTED, SECURED, FAILED, CANCELLED, SHIPPED, PAYOUT_FROZEN, PAYOUT_UNFROZEN, PAYOUT_RELEASED, REFUNDED, REFUND_FAILED, AUTO_REFUNDED (append-only).';
COMMENT ON COLUMN payment_event.provider_event_id IS 'The webhook event that caused the change, if any.';
COMMENT ON COLUMN payment_event.details IS 'Amounts, statuses and provider references only (never card data, never free text of the parties).';

-- ---------------------------------------------------------------------------------------------
-- payment_refund: refunds to the buyer (admin refunds, dispute resolutions, automatic refunds).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payment_refund (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id         uuid          NOT NULL REFERENCES payment (id) ON DELETE CASCADE,
    provider_refund_id text,
    amount             numeric(12,2) NOT NULL,
    currency           char(3)       NOT NULL,
    reason             text          NOT NULL,
    source             text          NOT NULL CHECK (source IN ('ADMIN', 'DISPUTE', 'SYSTEM')),
    status             text          NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
    requested_by       uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    completed_at       timestamptz,
    CONSTRAINT ck_payment_refund_amount CHECK (amount > 0),
    CONSTRAINT ck_payment_refund_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_payment_refund_reason CHECK (char_length(reason) BETWEEN 1 AND 500)
);

CREATE INDEX ix_payment_refund_payment ON payment_refund (payment_id, created_at);
CREATE UNIQUE INDEX uq_payment_refund_provider ON payment_refund (provider_refund_id)
    WHERE provider_refund_id IS NOT NULL;

COMMENT ON TABLE payment_refund IS 'Refunds of protected payments: ADMIN (POST /admin/payments/{id}/refund, SUPER_ADMIN or ADMIN when payments.admin_refunds_enabled), DISPUTE (resolution BUYER or SPLIT) or SYSTEM (payment secured after the trade was cancelled).';
COMMENT ON COLUMN payment_refund.reason IS 'Staff text (<= 500); admin console only.';

-- ---------------------------------------------------------------------------------------------
-- payment_webhook_event: every webhook the provider sent, verified or not (idempotency by the
-- provider's event id; retries are answered 200 without a second state change).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payment_webhook_event (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider          text        NOT NULL,
    provider_event_id text,
    type              text        NOT NULL,
    signature_valid   boolean     NOT NULL,
    status            text        NOT NULL DEFAULT 'RECEIVED'
                                  CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
    payment_id        uuid        REFERENCES payment (id) ON DELETE SET NULL,
    payload           jsonb       NOT NULL,
    error             text,
    received_at       timestamptz NOT NULL DEFAULT now(),
    processed_at      timestamptz,
    CONSTRAINT ck_payment_webhook_event_provider CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
    CONSTRAINT ck_payment_webhook_event_type CHECK (char_length(type) BETWEEN 1 AND 100),
    CONSTRAINT ck_payment_webhook_event_id CHECK (provider_event_id IS NULL OR char_length(provider_event_id) <= 255),
    CONSTRAINT ck_payment_webhook_event_verified CHECK (signature_valid OR (status = 'IGNORED' AND provider_event_id IS NULL)),
    CONSTRAINT ck_payment_webhook_event_error CHECK (error IS NULL OR char_length(error) <= 500)
);

-- Idempotency: one row per provider event (rows with an invalid signature carry no event id).
CREATE UNIQUE INDEX uq_payment_webhook_event_provider_event ON payment_webhook_event (provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;
CREATE INDEX ix_payment_webhook_event_status ON payment_webhook_event (status, received_at DESC, id DESC);
CREATE INDEX ix_payment_webhook_event_received ON payment_webhook_event (received_at DESC, id DESC);
CREATE INDEX ix_payment_webhook_event_payment ON payment_webhook_event (payment_id) WHERE payment_id IS NOT NULL;

COMMENT ON TABLE payment_webhook_event IS 'Provider webhook inbox (Phase 9): stored before the 200 answer, processed after commit through the PaymentWebhookReceived domain event. RECEIVED -> PROCESSED | IGNORED (unknown type or payment, already applied) | FAILED; invalid signatures are stored IGNORED with signature_valid false and answered 400.';
COMMENT ON COLUMN payment_webhook_event.provider_event_id IS 'Event id at the provider (evt_...); NULL when the signature was invalid (the claimed id stays in the payload).';
COMMENT ON COLUMN payment_webhook_event.payload IS 'CONFIDENTIAL: the event as received (JSON; {"unparsable": true, ...} when the body was not JSON). Admin webhook browser only.';
COMMENT ON COLUMN payment_webhook_event.error IS 'Why processing failed or the event was ignored (codes such as INVALID_SIGNATURE, UNKNOWN_PAYMENT; never stack traces).';
