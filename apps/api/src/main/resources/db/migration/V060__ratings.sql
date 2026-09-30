-- V060: ratings and references (Phase 7 contract "Ratings and references").
--
-- An interaction is what makes two collectors eligible to rate each other: a completed trade, an
-- accepted offer (Phase 8 records both through InteractionService.record) or a qualified
-- conversation (at least 3 messages from each side, recorded by the ratings module from the
-- messaging module's MessageSent events). Each rater rates each interaction at most once; a rating
-- stays editable by its author for 14 days. rating_summary is maintained by the ratings module on
-- every write and feeds collector profiles, map previews and the nearby ranking.
--
-- PRIVACY: no location data. Comments and references are public on the collector's profile unless
-- a moderator hides them (moderation_state HIDDEN, audited).

-- ---------------------------------------------------------------------------------------------
-- interaction: one row per trade / accepted offer / qualified conversation between two accounts.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE interaction (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         text        NOT NULL CHECK (kind IN ('TRADE', 'OFFER_ACCEPTED', 'CONVERSATION_QUALIFIED')),
    user_a       uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    user_b       uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    subject_type text        NOT NULL CHECK (subject_type IN ('TRADE', 'OFFER', 'CONVERSATION')),
    subject_id   uuid        NOT NULL,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_interaction_kind_subject UNIQUE (kind, subject_id),
    CONSTRAINT ck_interaction_pair_order CHECK (user_a < user_b)
);

CREATE INDEX ix_interaction_pair ON interaction (user_a, user_b, occurred_at DESC);
CREATE INDEX ix_interaction_user_b ON interaction (user_b, occurred_at DESC);

COMMENT ON TABLE interaction IS 'Rating eligibility: TRADE, OFFER_ACCEPTED or CONVERSATION_QUALIFIED between user_a < user_b (uuid order); unique per kind and subject.';
COMMENT ON COLUMN interaction.subject_id IS 'Id of the trade, offer or conversation (no foreign key: those tables belong to other modules and phases).';

-- ---------------------------------------------------------------------------------------------
-- rating: a rater's rating of the other party of an interaction.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE rating (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id     uuid        NOT NULL REFERENCES interaction (id) ON DELETE CASCADE,
    rater_id           uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    ratee_id           uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    overall            smallint    NOT NULL CHECK (overall BETWEEN 1 AND 5),
    communication      smallint    CHECK (communication BETWEEN 1 AND 5),
    condition_accuracy smallint    CHECK (condition_accuracy BETWEEN 1 AND 5),
    shipping           smallint    CHECK (shipping BETWEEN 1 AND 5),
    meetup_reliability smallint    CHECK (meetup_reliability BETWEEN 1 AND 5),
    comment            text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    moderation_state   text        NOT NULL DEFAULT 'OK' CHECK (moderation_state IN ('OK', 'HIDDEN')),
    hidden_reason      text,
    hidden_by          uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    hidden_at          timestamptz,
    CONSTRAINT uq_rating_interaction_rater UNIQUE (interaction_id, rater_id),
    CONSTRAINT ck_rating_not_self CHECK (rater_id <> ratee_id),
    CONSTRAINT ck_rating_comment CHECK (comment IS NULL OR char_length(comment) <= 600),
    CONSTRAINT ck_rating_hidden_reason CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 500)
);

CREATE INDEX ix_rating_ratee_created ON rating (ratee_id, created_at DESC, id DESC);
CREATE INDEX ix_rating_rater ON rating (rater_id, created_at DESC);
CREATE INDEX ix_rating_hidden ON rating (hidden_at DESC) WHERE moderation_state = 'HIDDEN';

COMMENT ON TABLE rating IS 'Ratings between collectors who interacted (Phase 7); editable by the rater for 14 days; HIDDEN ratings are excluded from public lists and summaries.';
COMMENT ON COLUMN rating.comment IS 'Public on the ratee''s profile (at most 600 characters) unless hidden by a moderator.';
COMMENT ON COLUMN rating.hidden_reason IS 'Moderator reason of a hide (audited); never shown to members.';

-- ---------------------------------------------------------------------------------------------
-- rating_summary: averages of the visible (OK) ratings of a collector.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE rating_summary (
    user_id                uuid         PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    average                numeric(3,2),
    count                  integer      NOT NULL DEFAULT 0 CHECK (count >= 0),
    communication_avg      numeric(3,2),
    condition_accuracy_avg numeric(3,2),
    shipping_avg           numeric(3,2),
    meetup_reliability_avg numeric(3,2),
    updated_at             timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX ix_rating_summary_average ON rating_summary (average DESC NULLS LAST, count DESC);

COMMENT ON TABLE rating_summary IS 'Maintained by the ratings module on every rating write, hide and unhide (OK ratings only); feeds profiles, previews and the nearby ranking.';

-- ---------------------------------------------------------------------------------------------
-- reference: a short public testimonial, one per author and subject (needs an interaction).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE reference (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id        uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    subject_id       uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    body             text        NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    moderation_state text        NOT NULL DEFAULT 'OK' CHECK (moderation_state IN ('OK', 'HIDDEN')),
    hidden_reason    text,
    hidden_by        uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    hidden_at        timestamptz,
    CONSTRAINT uq_reference_author_subject UNIQUE (author_id, subject_id),
    CONSTRAINT ck_reference_not_self CHECK (author_id <> subject_id),
    CONSTRAINT ck_reference_body CHECK (char_length(body) BETWEEN 1 AND 400),
    CONSTRAINT ck_reference_hidden_reason CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 500)
);

CREATE INDEX ix_reference_subject_created ON reference (subject_id, created_at DESC, id DESC);
CREATE INDEX ix_reference_author ON reference (author_id);

COMMENT ON TABLE reference IS 'Public references (at most 400 characters), one per author and subject, written after at least one interaction.';
