-- V090: subscriptions, their history and billing provider webhooks (Phase 10 contract "Plans and
-- limits": subscription table and BillingProvider). Plans, features, limits, counters and
-- entitlements exist since V011.
--
-- A subscription starts PENDING when the member opens a checkout at the BillingProvider (the fake
-- provider locally, Stripe Billing only by configuration) and becomes ACTIVE through a verified
-- provider webhook, which also sets user_account.plan_code and the PREMIUM_USER role. The platform
-- stores provider references only, never card data.

-- ---------------------------------------------------------------------------------------------
-- subscription
-- ---------------------------------------------------------------------------------------------
CREATE TABLE subscription (
    id                   uuid          PRIMARY KEY,
    user_id              uuid          NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    plan_id              uuid          NOT NULL REFERENCES plan (id),
    status               text          NOT NULL
                                       CHECK (status IN ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED')),
    provider             text          NOT NULL,
    provider_ref         text,
    checkout_ref         text,
    checkout_url         text,
    amount               numeric(12,2) NOT NULL,
    currency             char(3)       NOT NULL,
    current_period_start timestamptz,
    current_period_end   timestamptz,
    cancel_at_period_end boolean       NOT NULL DEFAULT false,
    cancel_requested_at  timestamptz,
    activated_at         timestamptz,
    ended_at             timestamptz,
    failure_code         text,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    updated_at           timestamptz   NOT NULL DEFAULT now(),
    version              integer       NOT NULL DEFAULT 0,
    CONSTRAINT ck_subscription_provider CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
    CONSTRAINT ck_subscription_amount CHECK (amount >= 0),
    CONSTRAINT ck_subscription_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_subscription_refs CHECK (
        (provider_ref IS NULL OR char_length(provider_ref) <= 255)
        AND (checkout_ref IS NULL OR char_length(checkout_ref) <= 255)
        AND (checkout_url IS NULL OR char_length(checkout_url) <= 1000)
        AND (failure_code IS NULL OR char_length(failure_code) <= 100)),
    CONSTRAINT ck_subscription_period CHECK (
        status NOT IN ('TRIAL', 'ACTIVE', 'PAST_DUE') OR current_period_end IS NOT NULL),
    CONSTRAINT ck_subscription_ended CHECK (
        status NOT IN ('CANCELLED', 'EXPIRED') OR ended_at IS NOT NULL),
    CONSTRAINT uq_subscription_provider_ref UNIQUE (provider, provider_ref),
    CONSTRAINT uq_subscription_checkout_ref UNIQUE (provider, checkout_ref)
);

-- One live subscription (checkout in progress or entitling) per account.
CREATE UNIQUE INDEX uq_subscription_live_user ON subscription (user_id)
    WHERE status IN ('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE');
CREATE INDEX ix_subscription_user ON subscription (user_id, created_at DESC);
CREATE INDEX ix_subscription_status ON subscription (status, updated_at DESC, id DESC);
CREATE INDEX ix_subscription_period_due ON subscription (current_period_end)
    WHERE status IN ('TRIAL', 'ACTIVE', 'PAST_DUE');

COMMENT ON TABLE subscription IS 'Paid plan subscriptions through the BillingProvider (fake locally, Stripe Billing by configuration); ACTIVE/TRIAL/PAST_DUE set user_account.plan_code and PREMIUM_USER.';
COMMENT ON COLUMN subscription.provider_ref IS 'CONFIDENTIAL: subscription id at the provider (fake_sub_..., sub_...); never returned to members.';
COMMENT ON COLUMN subscription.checkout_ref IS 'Checkout reference (fake_cs_..., cs_...); the member''s own fake checkout path carries it.';
COMMENT ON COLUMN subscription.amount IS 'Price per period when the checkout started (plan.monthly_price).';
COMMENT ON COLUMN subscription.cancel_at_period_end IS 'The member cancelled: the plan stays until current_period_end, then the subscriptions-period job ends it.';

-- ---------------------------------------------------------------------------------------------
-- subscription_event: history of a subscription (member, provider, job and admin actions).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE subscription_event (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   uuid        NOT NULL REFERENCES subscription (id) ON DELETE CASCADE,
    event             text        NOT NULL,
    provider_event_id text,
    actor_id          uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    details           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    seq               bigint      GENERATED ALWAYS AS IDENTITY,
    CONSTRAINT ck_subscription_event_event CHECK (event ~ '^[A-Z][A-Z_]{1,39}$'),
    CONSTRAINT ck_subscription_event_details CHECK (jsonb_typeof(details) = 'object'),
    CONSTRAINT uq_subscription_event_provider UNIQUE (subscription_id, event, provider_event_id)
);

CREATE INDEX ix_subscription_event_subscription ON subscription_event (subscription_id, created_at, seq);

COMMENT ON TABLE subscription_event IS 'Timeline of a subscription: CHECKOUT_STARTED, CHECKOUT_FAILED, CHECKOUT_ABANDONED, ACTIVATED, RENEWED, RENEWAL_REQUESTED, PAYMENT_FAILED, CANCEL_REQUESTED, CANCELLED, EXPIRED; details never carry card data.';

-- ---------------------------------------------------------------------------------------------
-- billing_webhook_event: every webhook of the billing provider as received (idempotency by the
-- provider's event id, like payment_webhook_event).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE billing_webhook_event (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider          text        NOT NULL,
    provider_event_id text,
    type              text        NOT NULL,
    signature_valid   boolean     NOT NULL,
    status            text        NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
    subscription_id   uuid        REFERENCES subscription (id) ON DELETE SET NULL,
    payload           jsonb       NOT NULL,
    error             text,
    received_at       timestamptz NOT NULL DEFAULT now(),
    processed_at      timestamptz,
    CONSTRAINT ck_billing_webhook_event_type CHECK (char_length(type) <= 100),
    CONSTRAINT ck_billing_webhook_event_error CHECK (error IS NULL OR char_length(error) <= 500),
    CONSTRAINT ck_billing_webhook_event_verified CHECK (
        signature_valid OR (status = 'IGNORED' AND provider_event_id IS NULL))
);

CREATE UNIQUE INDEX uq_billing_webhook_event_provider_event
    ON billing_webhook_event (provider, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX ix_billing_webhook_event_status ON billing_webhook_event (status, received_at DESC, id DESC);
CREATE INDEX ix_billing_webhook_event_subscription ON billing_webhook_event (subscription_id);

COMMENT ON TABLE billing_webhook_event IS 'Billing provider webhooks as received; verified events are applied after commit (BillingWebhookReceived).';
COMMENT ON COLUMN billing_webhook_event.payload IS 'CONFIDENTIAL: the body as received; admin subscription detail only, never logged.';
