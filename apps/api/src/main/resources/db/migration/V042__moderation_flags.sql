-- V042: moderation flags and the Phase 5 moderation rules (contract "Auto-moderation hooks", ADR
-- 0014: thresholds are rows edited by admins, never constants).
--
-- ModerationService.check(scope, text, authorId) applies, per scope:
--   RATE_LIMIT  pattern '<count>/<seconds>': more than <count> writes of the author per window
--               -> BLOCK = 429 RATE_LIMITED, FLAG = one open flag on the author (subject USER);
--   BANNED_TERM case-insensitive regular expression on accent-stripped text
--               -> BLOCK = 422 MESSAGE_BLOCKED / POST_BLOCKED, FLAG = the content is stored FLAGGED;
--   THRESHOLD   pattern '<count>/<seconds>': the same normalised text more than <count> times per
--               window by one author (repeated content) -> BLOCK = 422, FLAG = flag on the content.
-- No automatic ban: thresholds only create flags for human review.

ALTER TABLE moderation_rule
    ADD CONSTRAINT ck_moderation_rule_rate_pattern
        CHECK (kind = 'BANNED_TERM' OR pattern ~ '^[1-9][0-9]{0,5}/[1-9][0-9]{0,6}$');

COMMENT ON COLUMN moderation_rule.pattern IS 'BANNED_TERM: regular expression; RATE_LIMIT and THRESHOLD: <count>/<window seconds>.';

-- Placeholder banned terms (invented neutral tokens, as in V004) for messages and posts, the
-- contract rate limit of private messages (30 per minute), an overall posting rate for posts and
-- replies, and repeated-content thresholds.
INSERT INTO moderation_rule (kind, pattern, action, scope) VALUES
    ('BANNED_TERM', 'zorblax',    'BLOCK', 'MESSAGE'),
    ('BANNED_TERM', 'quuxspam',   'BLOCK', 'MESSAGE'),
    ('BANNED_TERM', 'blorpscam',  'BLOCK', 'MESSAGE'),
    ('BANNED_TERM', 'fnordpromo', 'FLAG',  'MESSAGE'),
    ('BANNED_TERM', 'zorblax',    'BLOCK', 'POST'),
    ('BANNED_TERM', 'quuxspam',   'BLOCK', 'POST'),
    ('BANNED_TERM', 'blorpscam',  'BLOCK', 'POST'),
    ('BANNED_TERM', 'fnordpromo', 'FLAG',  'POST'),
    ('RATE_LIMIT',  '30/60',      'BLOCK', 'MESSAGE'),
    ('RATE_LIMIT',  '60/3600',    'BLOCK', 'POST'),
    ('THRESHOLD',   '5/600',      'FLAG',  'MESSAGE'),
    ('THRESHOLD',   '3/3600',     'FLAG',  'POST');

-- ---------------------------------------------------------------------------------------------
-- moderation_flag: content or accounts waiting for a moderator (GET /admin/moderation/flags).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE moderation_flag (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type    text        NOT NULL CHECK (subject_type IN ('MESSAGE', 'COMMUNITY_POST', 'COMMUNITY_REPLY', 'USER')),
    subject_id      uuid        NOT NULL,
    rule_id         uuid        REFERENCES moderation_rule (id) ON DELETE SET NULL,
    reason          text        NOT NULL CHECK (reason IN ('BANNED_TERM', 'RATE_THRESHOLD', 'REPEATED_CONTENT')),
    author_id       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    resolved_by     uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    resolution_note text,
    CONSTRAINT ck_moderation_flag_note CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500),
    CONSTRAINT ck_moderation_flag_resolved CHECK (resolved_at IS NOT NULL OR resolved_by IS NULL)
);

-- At most one open flag per subject and reason (repeated triggers do not pile up).
CREATE UNIQUE INDEX uq_moderation_flag_open ON moderation_flag (subject_type, subject_id, reason) WHERE resolved_at IS NULL;
CREATE INDEX ix_moderation_flag_open_created ON moderation_flag (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX ix_moderation_flag_created ON moderation_flag (created_at DESC);
CREATE INDEX ix_moderation_flag_author ON moderation_flag (author_id);

COMMENT ON TABLE moderation_flag IS 'Automatic moderation flags for review; never shown to the flagged member; resolution audited.';
COMMENT ON COLUMN moderation_flag.subject_id IS 'Id of the message, post, reply or (RATE_THRESHOLD) account; no content is copied here.';
