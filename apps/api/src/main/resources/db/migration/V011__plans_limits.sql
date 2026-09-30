-- V011: plans, plan features, usage limits, usage counters and entitlements (ADR 0014, Phase 10
-- contract "Plans and limits", foundation only: subscription tables arrive with Phase 10).
--
-- Numbers live here and in the admin console, never in code. The API resolves a user's effective
-- rules as: plan of user_account.plan_code (FREE when unknown or inactive) overridden by active,
-- unexpired entitlements. Rules are cached in Redis <= 60 s and evicted on every admin write.
-- Counters are persisted in usage_counter (atomic conditional upsert) and mirrored in Redis.

-- ---------------------------------------------------------------------------------------------
-- plan
-- ---------------------------------------------------------------------------------------------
CREATE TABLE plan (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text          NOT NULL,
    name          text          NOT NULL,
    description   text          NOT NULL DEFAULT '',
    monthly_price numeric(12,2) NOT NULL DEFAULT 0,
    currency      char(3)       NOT NULL DEFAULT 'CAD',
    active        boolean       NOT NULL DEFAULT true,
    sort_order    integer       NOT NULL DEFAULT 0,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_by    uuid          REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_plan_code UNIQUE (code),
    CONSTRAINT ck_plan_code CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_plan_name CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT ck_plan_description CHECK (char_length(description) <= 1000),
    CONSTRAINT ck_plan_price CHECK (monthly_price >= 0),
    CONSTRAINT ck_plan_currency CHECK (currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE plan IS 'Subscription plans (FREE, PREMIUM, ...); edited through /admin/plans (audited).';
COMMENT ON COLUMN plan.monthly_price IS 'Display price; billing itself goes through the BillingProvider (Phase 10).';

INSERT INTO plan (code, name, description, monthly_price, currency, active, sort_order) VALUES
    ('FREE',    'Free',    'Everything you need to publish binders and find collectors nearby.', 0.00, 'CAD', true, 0),
    ('PREMIUM', 'Premium', 'Unlimited binder views and alerts, a wider map radius, advanced filters and no ads.', 4.99, 'CAD', true, 10);

-- user_account.plan_code (V003) becomes a reference to plan.code.
ALTER TABLE user_account
    ADD CONSTRAINT fk_user_account_plan FOREIGN KEY (plan_code) REFERENCES plan (code) ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- plan_feature: boolean capabilities per plan (optionally with a value).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE plan_feature (
    plan_id     uuid        NOT NULL REFERENCES plan (id) ON DELETE CASCADE,
    feature_key text        NOT NULL,
    enabled     boolean     NOT NULL DEFAULT false,
    value       text,
    updated_by  uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, feature_key),
    CONSTRAINT ck_plan_feature_key CHECK (feature_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
    CONSTRAINT ck_plan_feature_value CHECK (value IS NULL OR char_length(value) <= 200)
);

COMMENT ON TABLE plan_feature IS 'Feature switches per plan (filters.advanced, ads.enabled, ...); entitlements override them per user.';

INSERT INTO plan_feature (plan_id, feature_key, enabled)
SELECT p.id, f.feature_key, f.enabled
  FROM plan p
  JOIN (VALUES
        ('FREE',    'filters.advanced', false),
        ('FREE',    'ads.enabled',      true),
        ('PREMIUM', 'filters.advanced', true),
        ('PREMIUM', 'ads.enabled',      false)) AS f (plan_code, feature_key, enabled)
    ON f.plan_code = p.code;

-- ---------------------------------------------------------------------------------------------
-- usage_limit: numeric limits per plan. max_value NULL = unlimited.
--   kind COUNTER: consumption counted per limit_window (DAY, MONTH or TOTAL);
--   kind CAP:     an upper bound for a requested value (e.g. map radius), never counted.
-- The column is limit_window, not "window" (a reserved word in PostgreSQL); the API calls it window.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE usage_limit (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid        NOT NULL REFERENCES plan (id) ON DELETE CASCADE,
    limit_key    text        NOT NULL,
    kind         text        NOT NULL DEFAULT 'COUNTER' CHECK (kind IN ('COUNTER', 'CAP')),
    limit_window text        NOT NULL CHECK (limit_window IN ('DAY', 'MONTH', 'TOTAL')),
    max_value    integer,
    description  text        NOT NULL DEFAULT '',
    updated_by   uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_usage_limit_plan_key UNIQUE (plan_id, limit_key),
    CONSTRAINT ck_usage_limit_key CHECK (limit_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
    CONSTRAINT ck_usage_limit_max CHECK (max_value IS NULL OR max_value >= 0),
    CONSTRAINT ck_usage_limit_cap_window CHECK (kind = 'COUNTER' OR limit_window = 'TOTAL'),
    CONSTRAINT ck_usage_limit_description CHECK (char_length(description) <= 500)
);

CREATE INDEX ix_usage_limit_key ON usage_limit (limit_key);

COMMENT ON TABLE usage_limit IS 'Freemium limits per plan (ADR 0014); edited live through /admin/usage-limits (audited, cache evicted).';
COMMENT ON COLUMN usage_limit.max_value IS 'NULL means unlimited.';
COMMENT ON COLUMN usage_limit.limit_window IS 'DAY / MONTH windows start at 00:00 UTC (first of the month); TOTAL never resets.';

INSERT INTO usage_limit (plan_id, limit_key, kind, limit_window, max_value, description)
SELECT p.id, l.limit_key, l.kind, l.limit_window, l.max_value, l.description
  FROM plan p
  JOIN (VALUES
        ('FREE',    'binder.views.per_day',    'COUNTER', 'DAY',   30,   'Public binder views per day'),
        ('PREMIUM', 'binder.views.per_day',    'COUNTER', 'DAY',   NULL, 'Public binder views per day'),
        ('FREE',    'wishlist.alerts.per_day', 'COUNTER', 'DAY',   5,    'Wishlist match alerts per day'),
        ('PREMIUM', 'wishlist.alerts.per_day', 'COUNTER', 'DAY',   NULL, 'Wishlist match alerts per day'),
        ('FREE',    'wishlist.items.max',      'COUNTER', 'TOTAL', 20,   'Wishlist items'),
        ('PREMIUM', 'wishlist.items.max',      'COUNTER', 'TOTAL', 500,  'Wishlist items'),
        ('FREE',    'map.radius.max_km',       'CAP',     'TOTAL', 25,   'Maximum map search radius (km)'),
        ('PREMIUM', 'map.radius.max_km',       'CAP',     'TOTAL', 100,  'Maximum map search radius (km)'),
        ('FREE',    'binders.max',             'COUNTER', 'TOTAL', 5,    'Binders'),
        ('PREMIUM', 'binders.max',             'COUNTER', 'TOTAL', 50,   'Binders'),
        ('FREE',    'saved_searches.max',      'COUNTER', 'TOTAL', 0,    'Saved searches'),
        ('PREMIUM', 'saved_searches.max',      'COUNTER', 'TOTAL', 50,   'Saved searches'),
        ('FREE',    'offers.per_day',          'COUNTER', 'DAY',   20,   'Offers sent per day'),
        ('PREMIUM', 'offers.per_day',          'COUNTER', 'DAY',   100,  'Offers sent per day'))
        AS l (plan_code, limit_key, kind, limit_window, max_value, description)
    ON l.plan_code = p.code;

-- ---------------------------------------------------------------------------------------------
-- usage_counter: persisted consumption per user, limit and window start.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE usage_counter (
    user_id      uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    limit_key    text        NOT NULL,
    window_start timestamptz NOT NULL,
    count        integer     NOT NULL DEFAULT 0 CHECK (count >= 0),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_usage_counter PRIMARY KEY (user_id, limit_key, window_start)
);

CREATE INDEX ix_usage_counter_window_start ON usage_counter (window_start);

COMMENT ON TABLE usage_counter IS 'Consumption per (user, limit key, window start); TOTAL windows use 1970-01-01T00:00Z. Mirrored in Redis (fast path).';

-- ---------------------------------------------------------------------------------------------
-- entitlement: per-user overrides of plan features and limits (admin grants, promos, later
-- subscriptions and credit purchases). Active = not revoked and not expired.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE entitlement (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    feature_key text        NOT NULL,
    value       text,
    source      text        NOT NULL CHECK (source IN ('SUBSCRIPTION', 'ADMIN_GRANT', 'PROMO', 'CREDIT_PURCHASE')),
    expires_at  timestamptz,
    granted_by  uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz,
    revoked_by  uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    CONSTRAINT ck_entitlement_key CHECK (feature_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
    CONSTRAINT ck_entitlement_value CHECK (value IS NULL OR char_length(value) <= 200),
    CONSTRAINT ck_entitlement_note CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX ix_entitlement_user_active ON entitlement (user_id, feature_key) WHERE revoked_at IS NULL;

COMMENT ON TABLE entitlement IS 'Explicit per-user overrides that beat plan values (features: value true/false; limits: a number or NULL = unlimited).';
COMMENT ON COLUMN entitlement.note IS 'Admin note (support context); never shown to other users.';
