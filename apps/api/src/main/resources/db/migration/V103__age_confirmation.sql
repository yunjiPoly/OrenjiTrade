-- V103: the 18+ rule (launch readiness, 2026-10-05).
--
-- Collectors must confirm that they are 18 years of age or older. The confirmation is recorded
-- with the existing consent mechanism (user_consent: version, timestamp, salted IP hash, user
-- agent, audit row) as a new legal document type AGE_CONFIRMATION. It is NOT required at
-- registration on purpose: the terms filter (428 TERMS_ACCEPTANCE_REQUIRED on every route) must
-- not block admin and staff paths, and existing accounts confirm through the onboarding flow.
-- The service layer refuses discoverability, messaging, community posts and offers with
-- 403 AGE_CONFIRMATION_REQUIRED until the confirmation exists.
--
-- Self-declaration only: no identity or document verification is stored.

-- The inline CHECK of V003 was not named explicitly (Postgres auto-named it
-- legal_document_document_type_check); look it up instead of relying on the generated name.
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname
      INTO constraint_name
      FROM pg_constraint
     WHERE conrelid = 'legal_document'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%document_type%';
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE legal_document DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE legal_document
    ADD CONSTRAINT ck_legal_document_type
    CHECK (document_type IN ('TERMS', 'PRIVACY', 'COMMUNITY_GUIDELINES', 'MARKETPLACE_POLICY',
                             'PAYMENT_PROTECTION', 'REFUND_DISPUTE', 'COOKIES', 'ACCEPTABLE_USE',
                             'AGE_CONFIRMATION'));

-- The statement the collector confirms lives in the Terms of Service (eligibility). The url is
-- deliberately not a /legal/<slug> page: it is an attestation, not a document to read, and the
-- clients map /legal/<slug> urls to their in-app legal texts.
INSERT INTO legal_document (document_type, version, title, url, required_at_registration, published_at, current) VALUES
    ('AGE_CONFIRMATION', '2026-10-05', 'Age confirmation (18 years or older)', '/legal#age-confirmation', false, '2026-10-05T00:00:00Z', true);

COMMENT ON TABLE legal_document IS
    'Versioned legal texts served by the web app under /legal/<slug>; AGE_CONFIRMATION is the 18+ attestation collected at sign-up / onboarding.';
