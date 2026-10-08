-- V104: the language of a consent (launch readiness, French legal pages, 2026-10-05).
--
-- The legal pages exist in English and in French (a translation of the same draft, Bill 96).
-- One legal_document row per (document_type, version) covers both languages: the version
-- identifies the content, and the consent records which translation was shown to the collector
-- when they accepted it. Existing rows were all given in English.
ALTER TABLE user_consent
    ADD COLUMN language text NOT NULL DEFAULT 'en'
        CONSTRAINT ck_user_consent_language CHECK (language IN ('en', 'fr'));

COMMENT ON COLUMN user_consent.language IS
    'Language of the legal text shown when the consent was given (en or fr); the version is the same for both.';
