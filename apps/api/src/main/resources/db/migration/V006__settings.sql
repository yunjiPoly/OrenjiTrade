-- V006: notification preferences (Phase 1-B). Privacy settings live in V004 with the profiles.

CREATE TABLE notification_preferences (
    user_id        uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    push_enabled   boolean     NOT NULL DEFAULT true,
    email_enabled  boolean     NOT NULL DEFAULT false,
    in_app_enabled boolean     NOT NULL DEFAULT true,
    categories     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    quiet_hours    jsonb       NOT NULL DEFAULT '{"enabled": false, "start": "22:00", "end": "08:00", "timezone": "America/Toronto"}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_notification_preferences_categories CHECK (jsonb_typeof(categories) = 'object'),
    CONSTRAINT ck_notification_preferences_quiet_hours CHECK (jsonb_typeof(quiet_hours) = 'object')
);

COMMENT ON TABLE notification_preferences IS 'Per-user notification channels; a missing row means the defaults.';
COMMENT ON COLUMN notification_preferences.categories IS 'JSON map {CATEGORY: {push, email, inApp}} keyed by WISHLIST_MATCH, MESSAGE, OFFER, RATING, TRADE, BINDER_FRESHNESS, REPORT_DECISION, MARKETING; missing keys mean the defaults.';
COMMENT ON COLUMN notification_preferences.quiet_hours IS 'JSON {enabled, start "HH:mm", end "HH:mm", timezone (IANA)}.';
