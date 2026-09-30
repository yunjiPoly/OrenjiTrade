-- V061: collector reports, moderator notes, the report moderation rules and the ban mark (Phase 7
-- contract "Collector reporting").
--
-- The only reportable subject is a collector. A reporter has at most one OPEN or UNDER_REVIEW
-- report per reported collector (409 REPORT_ALREADY_OPEN). Configurable rules (ADR 0014):
--   RATE_LIMIT       scope REPORT '5/86400': at most 5 reports per reporter per day (429);
--   REPORT_THRESHOLD scope REPORT '3/604800': 3 open reports from distinct reporters within 7 days
--                    raise a moderation flag on the reported account; action BLOCK additionally
--                    pauses their public listings pending review (never a ban).
--
-- PRIVACY: collector_report.details and moderator_note.body are visible to moderators and admins
-- only (the reporter sees the status of their own reports, never notes or actions).

-- ---------------------------------------------------------------------------------------------
-- collector_report
-- ---------------------------------------------------------------------------------------------
CREATE TABLE collector_report (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id       uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    reported_user_id  uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    reason            text        NOT NULL CHECK (reason IN ('SCAM', 'COUNTERFEIT', 'HARASSMENT', 'SPAM',
                                                             'INAPPROPRIATE_BEHAVIOR', 'MISLEADING_LISTINGS', 'OTHER')),
    details           text,
    context           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status            text        NOT NULL DEFAULT 'OPEN'
                                  CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'ACTIONED', 'DISMISSED')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    assigned_to       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    assigned_at       timestamptz,
    resolved_at       timestamptz,
    resolved_by       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    resolution_note   text,
    resolution_action text        CHECK (resolution_action IN ('NONE', 'WARNING', 'LISTINGS_PAUSED', 'SUSPENDED', 'BANNED')),
    CONSTRAINT ck_collector_report_not_self CHECK (reporter_id <> reported_user_id),
    CONSTRAINT ck_collector_report_details CHECK (details IS NULL OR char_length(details) <= 1000),
    CONSTRAINT ck_collector_report_context CHECK (jsonb_typeof(context) = 'object'),
    CONSTRAINT ck_collector_report_note CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 1000),
    CONSTRAINT ck_collector_report_resolved CHECK (
        (status IN ('ACTIONED', 'DISMISSED')) = (resolved_at IS NOT NULL AND resolution_action IS NOT NULL))
);

-- At most one open report per reporter and reported collector (409 REPORT_ALREADY_OPEN).
CREATE UNIQUE INDEX uq_collector_report_open_pair ON collector_report (reporter_id, reported_user_id)
    WHERE status IN ('OPEN', 'UNDER_REVIEW');
CREATE INDEX ix_collector_report_status_created ON collector_report (status, created_at DESC, id DESC);
CREATE INDEX ix_collector_report_reported_created ON collector_report (reported_user_id, created_at DESC);
CREATE INDEX ix_collector_report_reporter_created ON collector_report (reporter_id, created_at DESC);
CREATE INDEX ix_collector_report_assigned ON collector_report (assigned_to) WHERE status IN ('OPEN', 'UNDER_REVIEW');

COMMENT ON TABLE collector_report IS 'Reports against collectors (Phase 7): OPEN -> UNDER_REVIEW -> ACTIONED | DISMISSED; resolutions audited (report.resolve).';
COMMENT ON COLUMN collector_report.details IS 'PRIVATE: reporter''s free text (at most 1000 characters); moderators and admins only.';
COMMENT ON COLUMN collector_report.context IS 'Where the report was made: {source: PROFILE|CONVERSATION|POST|BINDER, conversationId?, postId?, binderId?}; a conversationId lets moderators read that conversation only.';

-- ---------------------------------------------------------------------------------------------
-- moderator_note: internal notes on a report.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE moderator_note (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id  uuid        NOT NULL REFERENCES collector_report (id) ON DELETE CASCADE,
    author_id  uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    body       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_moderator_note_body CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX ix_moderator_note_report ON moderator_note (report_id, created_at);

COMMENT ON TABLE moderator_note IS 'PRIVATE: moderators'' internal notes on a collector report; never shown to members.';

-- ---------------------------------------------------------------------------------------------
-- Moderation rules for reports (ADR 0014) and the report-threshold flag reason.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE moderation_rule DROP CONSTRAINT moderation_rule_kind_check;
ALTER TABLE moderation_rule ADD CONSTRAINT moderation_rule_kind_check
    CHECK (kind IN ('BANNED_TERM', 'RATE_LIMIT', 'THRESHOLD', 'REPORT_THRESHOLD'));
ALTER TABLE moderation_rule DROP CONSTRAINT moderation_rule_scope_check;
ALTER TABLE moderation_rule ADD CONSTRAINT moderation_rule_scope_check
    CHECK (scope IN ('MESSAGE', 'POST', 'TAG', 'PROFILE', 'REPORT'));
ALTER TABLE moderation_rule ADD CONSTRAINT ck_moderation_rule_report_scope
    CHECK ((scope <> 'REPORT' OR kind IN ('RATE_LIMIT', 'REPORT_THRESHOLD'))
       AND (kind <> 'REPORT_THRESHOLD' OR scope = 'REPORT'));

COMMENT ON COLUMN moderation_rule.kind IS 'BANNED_TERM | RATE_LIMIT | THRESHOLD (repeated content) | REPORT_THRESHOLD (open reports from distinct reporters per window; BLOCK also pauses listings).';

INSERT INTO moderation_rule (kind, pattern, action, scope) VALUES
    ('RATE_LIMIT',       '5/86400',  'BLOCK', 'REPORT'),
    ('REPORT_THRESHOLD', '3/604800', 'BLOCK', 'REPORT');

ALTER TABLE moderation_flag DROP CONSTRAINT moderation_flag_reason_check;
ALTER TABLE moderation_flag ADD CONSTRAINT moderation_flag_reason_check
    CHECK (reason IN ('BANNED_TERM', 'RATE_THRESHOLD', 'REPEATED_CONTENT', 'REPORT_THRESHOLD'));

-- ---------------------------------------------------------------------------------------------
-- The ban mark: a ban is a suspension without end plus this timestamp (cleared by unsuspend).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE user_account ADD COLUMN banned_at timestamptz;

COMMENT ON COLUMN user_account.banned_at IS 'Set when a moderator decision bans the account (status SUSPENDED without end); cleared when an admin lifts the suspension.';
