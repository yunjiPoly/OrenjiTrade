-- V003: user accounts, roles, legal documents and consents, audit log, job runs (Phase 1-A).
--
-- Privacy: this migration stores no location data. Exact collector coordinates live in
-- user_location (later migration) and are never joined into these tables.

-- ---------------------------------------------------------------------------------------------
-- user_account: one row per identity-provider user, provisioned on the first authenticated call.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_account (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_uid       text        NOT NULL,
    email              text,
    email_verified     boolean     NOT NULL DEFAULT false,
    handle             text        NOT NULL,
    display_name       text,
    status             text        NOT NULL DEFAULT 'ACTIVE'
                                   CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED', 'DELETED')),
    suspended_until    timestamptz,
    suspension_reason  text,
    plan_code          text        NOT NULL DEFAULT 'FREE',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    last_active_at     timestamptz,
    deleted_at         timestamptz,
    CONSTRAINT uq_user_account_provider_uid UNIQUE (provider_uid),
    CONSTRAINT ck_user_account_handle CHECK (handle ~ '^[a-z0-9_]{3,24}$')
);

-- Handles are unique case-insensitively (citext-like without the extension).
CREATE UNIQUE INDEX uq_user_account_handle_lower ON user_account (lower(handle));
CREATE INDEX ix_user_account_email_lower ON user_account (lower(email));
CREATE INDEX ix_user_account_status ON user_account (status);
CREATE INDEX ix_user_account_created_at ON user_account (created_at DESC);

COMMENT ON TABLE user_account IS 'Identity-provider backed account; roles live in user_role.';
COMMENT ON COLUMN user_account.provider_uid IS 'Firebase Authentication uid (never exposed to other users).';
COMMENT ON COLUMN user_account.email IS 'PII: visible to the owner and admins only.';
COMMENT ON COLUMN user_account.plan_code IS 'FREE | PREMIUM (plans become a table in Phase 10).';

-- ---------------------------------------------------------------------------------------------
-- user_role: RBAC. Every account keeps USER; the others are granted by admins.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_role (
    user_id    uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    role       text        NOT NULL
                           CHECK (role IN ('USER', 'PREMIUM_USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by uuid,
    PRIMARY KEY (user_id, role)
);

CREATE INDEX ix_user_role_role ON user_role (role);

-- ---------------------------------------------------------------------------------------------
-- legal_document: versioned legal texts served by the web app under /legal/<slug>.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE legal_document (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type            text        NOT NULL
                                         CHECK (document_type IN ('TERMS', 'PRIVACY', 'COMMUNITY_GUIDELINES',
                                                                  'MARKETPLACE_POLICY', 'PAYMENT_PROTECTION',
                                                                  'REFUND_DISPUTE', 'COOKIES', 'ACCEPTABLE_USE')),
    version                  text        NOT NULL,
    title                    text        NOT NULL,
    url                      text        NOT NULL,
    required_at_registration boolean     NOT NULL DEFAULT false,
    published_at             timestamptz NOT NULL DEFAULT now(),
    current                  boolean     NOT NULL DEFAULT false,
    CONSTRAINT uq_legal_document_type_version UNIQUE (document_type, version)
);

-- At most one current version per document type.
CREATE UNIQUE INDEX uq_legal_document_current ON legal_document (document_type) WHERE current;

INSERT INTO legal_document (document_type, version, title, url, required_at_registration, published_at, current) VALUES
    ('TERMS',                '2026-09-01', 'Terms of Service',          '/legal/terms',                true,  '2026-09-01T00:00:00Z', true),
    ('PRIVACY',              '2026-09-01', 'Privacy Policy',            '/legal/privacy',              true,  '2026-09-01T00:00:00Z', true),
    ('COMMUNITY_GUIDELINES', '2026-09-01', 'Community Guidelines',      '/legal/community-guidelines', true,  '2026-09-01T00:00:00Z', true),
    ('MARKETPLACE_POLICY',   '2026-09-01', 'Marketplace Policy',        '/legal/marketplace-policy',   false, '2026-09-01T00:00:00Z', true),
    ('PAYMENT_PROTECTION',   '2026-09-01', 'Payment Protection Policy', '/legal/payment-protection',   false, '2026-09-01T00:00:00Z', true),
    ('REFUND_DISPUTE',       '2026-09-01', 'Refund and Dispute Policy', '/legal/refund-dispute',       false, '2026-09-01T00:00:00Z', true),
    ('COOKIES',              '2026-09-01', 'Cookie Policy',             '/legal/cookies',              false, '2026-09-01T00:00:00Z', true),
    ('ACCEPTABLE_USE',       '2026-09-01', 'Acceptable Use Policy',     '/legal/acceptable-use',       true,  '2026-09-01T00:00:00Z', true);

-- ---------------------------------------------------------------------------------------------
-- user_consent: which document version a user accepted, when, and from where (hashed).
-- Kept after account deletion (legal evidence); the account row is anonymised instead.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_consent (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    document_type text        NOT NULL,
    version       text        NOT NULL,
    accepted_at   timestamptz NOT NULL DEFAULT now(),
    ip_hash       text,
    user_agent    text,
    CONSTRAINT uq_user_consent_user_document_version UNIQUE (user_id, document_type, version),
    CONSTRAINT fk_user_consent_document FOREIGN KEY (document_type, version)
        REFERENCES legal_document (document_type, version)
);

CREATE INDEX ix_user_consent_user_id ON user_consent (user_id);

COMMENT ON COLUMN user_consent.ip_hash IS 'SHA-256 of server salt + client IP; the raw address is never stored.';

-- ---------------------------------------------------------------------------------------------
-- audit_log: append-only record of administrative, moderation and system actions.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE audit_log (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    actor_user_id uuid,
    actor_type    text        NOT NULL CHECK (actor_type IN ('USER', 'ADMIN', 'SYSTEM')),
    action        text        NOT NULL,
    target_type   text        NOT NULL,
    target_id     text,
    details       jsonb,
    request_id    text
);

CREATE INDEX ix_audit_log_target ON audit_log (target_type, target_id);
CREATE INDEX ix_audit_log_actor ON audit_log (actor_user_id);
CREATE INDEX ix_audit_log_occurred_at ON audit_log (occurred_at DESC);
CREATE INDEX ix_audit_log_action ON audit_log (action);

COMMENT ON TABLE audit_log IS 'Append-only; rows are never updated or deleted by the application.';

-- ---------------------------------------------------------------------------------------------
-- job_run: execution record of internal jobs (/internal/jobs/*, scheduled tasks).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE job_run (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    status      text        NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    details     jsonb
);

CREATE INDEX ix_job_run_name_started_at ON job_run (name, started_at DESC);
