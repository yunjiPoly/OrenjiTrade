-- V051: in-app notifications and push tokens (Phase 6 contract "Tables").
--
-- PRIVACY: notification titles, bodies and data never carry coordinates, message text or private
-- notes (only ids, names, distance buckets and deep links). Push tokens are device secrets: never
-- returned by the API, never logged.

CREATE TABLE notification (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    type          text        NOT NULL,
    title         text        NOT NULL,
    body          text        NOT NULL DEFAULT '',
    data          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    dedup_key     text        NOT NULL,
    in_app        boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    read_at       timestamptz,
    seen_at       timestamptz,
    channel_state jsonb       NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_notification_dedup_key UNIQUE (dedup_key),
    CONSTRAINT ck_notification_type CHECK (type ~ '^[A-Z][A-Z_]{1,39}$'),
    CONSTRAINT ck_notification_title CHECK (char_length(title) BETWEEN 1 AND 200),
    CONSTRAINT ck_notification_body CHECK (char_length(body) <= 1000),
    CONSTRAINT ck_notification_dedup_key CHECK (char_length(dedup_key) BETWEEN 1 AND 300),
    CONSTRAINT ck_notification_data CHECK (jsonb_typeof(data) = 'object'),
    CONSTRAINT ck_notification_channel_state CHECK (jsonb_typeof(channel_state) = 'object')
);

-- Notification centre (newest first, keyset) and the unread badge.
CREATE INDEX ix_notification_user_created ON notification (user_id, created_at DESC, id DESC) WHERE in_app;
CREATE INDEX ix_notification_user_unread ON notification (user_id, type) WHERE in_app AND read_at IS NULL;

COMMENT ON TABLE notification IS 'Notifications (Phase 6): in-app rows plus the delivery state of push and email. One row per dedup_key; the row exists even when only push or email was wanted (in_app = false, never listed).';
COMMENT ON COLUMN notification.type IS 'WISHLIST_MATCH, MESSAGE, OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_COUNTERED, OFFER_DECLINED, BINDER_EXPIRING, BINDER_STALE_WARNING, BINDER_HIDDEN, RATING_RECEIVED, TRADE_UPDATE, SHIPMENT_STATUS, PAYMENT_UPDATE, REPORT_DECISION or SYSTEM (checked by the API; the pattern keeps later types additive).';
COMMENT ON COLUMN notification.data IS 'JSON object: ids of the objects concerned and a deepLink path (e.g. /wishlist/<id>, /messages/<conversationId>); never coordinates, message text or private notes.';
COMMENT ON COLUMN notification.dedup_key IS 'Idempotency key, e.g. wishlist:<wishlistItemId>:<inventoryItemId>, message:<messageId>, limit:<userId>:<type>:<UTC day>; a repeated event never creates a second notification.';
COMMENT ON COLUMN notification.in_app IS 'Whether the row belongs to the in-app notification centre (the in-app channel was enabled for its category).';
COMMENT ON COLUMN notification.channel_state IS 'JSON {realtime, push, pushReason, email, emailReason, dispatchedAt}: PENDING until dispatched, then SENT | FAILED | SKIPPED (reasons DISABLED, QUIET_HOURS, NO_TOKENS, NO_EMAIL).';

CREATE TABLE push_token (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    platform     text        NOT NULL CHECK (platform IN ('IOS', 'ANDROID', 'WEB')),
    token        text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    invalid_at   timestamptz,
    CONSTRAINT uq_push_token_token UNIQUE (token),
    CONSTRAINT ck_push_token_token CHECK (char_length(token) BETWEEN 1 AND 4096)
);

CREATE INDEX ix_push_token_user ON push_token (user_id, last_seen_at DESC) WHERE invalid_at IS NULL;

COMMENT ON TABLE push_token IS 'Device push tokens (FCM / Expo). A token belongs to the account that registered it last; tokens the provider reports as unregistered get invalid_at and are no longer used.';
COMMENT ON COLUMN push_token.token IS 'SECRET-ish device token: never returned by the API, never logged.';
