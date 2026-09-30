-- V062: unresponsiveness strikes and listing pauses (Phase 7 contract "Auto-delisting").
--
-- user_responsiveness holds, per collector, the nightly strike count and the pause of their public
-- listings. A pause never deletes anything: while it is in force (paused_at set and paused_until
-- unset or in the future) no binder or item of the collector is effectively public
-- (PublicVisibilityRules / ListingPauseRules), the collector stays on the map. Sources:
--   UNRESPONSIVE      the delist job: strikes reached delist_policy.max_strikes; the owner resumes
--                     by confirming (POST /me/listings/resume);
--   REPORT_THRESHOLD  open reports from distinct reporters crossed the REPORT_THRESHOLD rule;
--                     pending moderator review;
--   MODERATION        a moderator resolved a report with LISTINGS_PAUSED;
--   ADMIN             POST /admin/users/{id}/pause-listings.
-- Moderation and admin pauses are lifted by moderators or admins only (audited).

CREATE TABLE user_responsiveness (
    user_id                      uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    unanswered_conversations_30d integer     NOT NULL DEFAULT 0 CHECK (unanswered_conversations_30d >= 0),
    strikes                      integer     NOT NULL DEFAULT 0 CHECK (strikes >= 0),
    strikes_reset_at             timestamptz,
    evaluated_at                 timestamptz,
    paused_at                    timestamptz,
    paused_until                 timestamptz,
    pause_source                 text        CHECK (pause_source IN ('UNRESPONSIVE', 'REPORT_THRESHOLD', 'MODERATION', 'ADMIN')),
    pause_reason                 text,
    paused_by                    uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_user_responsiveness_pause CHECK ((paused_at IS NULL) = (pause_source IS NULL)),
    CONSTRAINT ck_user_responsiveness_pause_until CHECK (paused_until IS NULL OR paused_at IS NOT NULL),
    CONSTRAINT ck_user_responsiveness_reason CHECK (pause_reason IS NULL OR char_length(pause_reason) <= 500)
);

CREATE INDEX ix_user_responsiveness_paused ON user_responsiveness (paused_at) WHERE paused_at IS NOT NULL;
CREATE INDEX ix_user_responsiveness_strikes ON user_responsiveness (strikes DESC) WHERE strikes > 0;

COMMENT ON TABLE user_responsiveness IS 'Nightly unresponsiveness strikes (unanswered conversations of the last 30 days) and the pause of a collector''s public listings; nothing is ever deleted.';
COMMENT ON COLUMN user_responsiveness.strikes IS 'Unanswered conversations waiting since after strikes_reset_at (the owner''s last resume); the delist job pauses listings at delist_policy.max_strikes.';
COMMENT ON COLUMN user_responsiveness.paused_until IS 'Optional end of a pause (admin pauses); NULL while paused means until resumed.';
COMMENT ON COLUMN user_responsiveness.pause_reason IS 'Moderator/admin reason (never shown to other members).';

-- A conversation counts as unanswered once the other participant''s last message has waited this
-- long (ADR 0014: a rule, not a constant).
ALTER TABLE delist_policy
    ADD COLUMN unanswered_after_hours integer NOT NULL DEFAULT 72,
    ADD CONSTRAINT ck_delist_policy_unanswered CHECK (unanswered_after_hours BETWEEN 1 AND 720);

COMMENT ON COLUMN delist_policy.unanswered_after_hours IS 'A conversation whose last message came from the other participant and waited at least this long counts as unanswered (strikes).';
COMMENT ON COLUMN delist_policy.max_strikes IS 'Unanswered conversations (strikes) before the nightly delist job pauses the owner''s public listings (resumed by the owner confirming).';
