-- V004: collector profiles, tags, moderation rules and privacy settings (Phase 1-B).
--
-- Privacy: no location data here (see V005). profile.display_name / bio are public by design;
-- avatar_key is an ObjectStorage key (never a filesystem path of the server); the public URL is
-- derived from it at read time so the media origin can change without a data migration.

-- ---------------------------------------------------------------------------------------------
-- profile: one row per account once the collector saved a profile, uploaded an avatar or set tags.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE profile (
    user_id       uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    display_name  text        NOT NULL,
    bio           text        NOT NULL DEFAULT '',
    avatar_key    text,
    games         text[]      NOT NULL DEFAULT '{}',
    languages     text[]      NOT NULL DEFAULT '{}',
    completed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    search_vector tsvector    GENERATED ALWAYS AS (
                      to_tsvector('simple', unaccent_immutable(display_name || ' ' || bio))
                  ) STORED,
    CONSTRAINT ck_profile_display_name CHECK (char_length(display_name) BETWEEN 1 AND 80),
    CONSTRAINT ck_profile_bio CHECK (char_length(bio) <= 500),
    CONSTRAINT ck_profile_games CHECK (cardinality(games) <= 16),
    CONSTRAINT ck_profile_languages CHECK (cardinality(languages) <= 10)
);

CREATE INDEX ix_profile_search_vector ON profile USING gin (search_vector);
CREATE INDEX ix_profile_display_name_trgm ON profile USING gin (lower(unaccent_immutable(display_name)) gin_trgm_ops);
CREATE INDEX ix_profile_games ON profile USING gin (games);

-- The handle lives in user_account (collector search on it uses this trigram index, Phase 4).
CREATE INDEX ix_user_account_handle_trgm ON user_account USING gin (handle gin_trgm_ops);

COMMENT ON TABLE profile IS 'Public collector profile; the handle stays in user_account.';
COMMENT ON COLUMN profile.avatar_key IS 'ObjectStorage key of the processed 512x512 avatar (never a server path); the URL is derived from it.';
COMMENT ON COLUMN profile.games IS 'Game slugs (yugioh, pokemon, mtg, riftbound) until the games module owns the catalogue.';
COMMENT ON COLUMN profile.languages IS 'ISO 639-1 codes.';
COMMENT ON COLUMN profile.completed_at IS 'First time the collector saved the profile through PUT /me/profile (onboarding flag).';
COMMENT ON COLUMN profile.search_vector IS 'Generated: display name + bio, accent-insensitive (collector search, Phase 4).';

-- ---------------------------------------------------------------------------------------------
-- tag: curated and custom profile tags.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE tag (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text        NOT NULL,
    label       text        NOT NULL,
    category    text        NOT NULL
                            CHECK (category IN ('GAME', 'ROLE', 'STYLE', 'LOGISTICS', 'LANGUAGE', 'CUSTOM')),
    status      text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'HIDDEN', 'BANNED')),
    usage_count integer     NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    created_by  uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_tag_slug UNIQUE (slug),
    CONSTRAINT ck_tag_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 48),
    CONSTRAINT ck_tag_label CHECK (char_length(label) BETWEEN 2 AND 24)
);

CREATE INDEX ix_tag_label_trgm ON tag USING gin (lower(unaccent_immutable(label)) gin_trgm_ops);
CREATE INDEX ix_tag_status_usage ON tag (status, usage_count DESC);
CREATE INDEX ix_tag_category ON tag (category);

COMMENT ON TABLE tag IS 'Profile tags; CUSTOM ones are created by collectors after the banned-term check.';
COMMENT ON COLUMN tag.status IS 'ACTIVE (searchable, shown), HIDDEN (kept on profiles, not shown or searchable), BANNED (moderation).';
COMMENT ON COLUMN tag.usage_count IS 'Number of profiles carrying the tag (recomputed by the profiles module on every change).';
COMMENT ON COLUMN tag.created_by IS 'Collector who created a CUSTOM tag; null for curated tags.';

INSERT INTO tag (slug, label, category) VALUES
    ('yu-gi-oh',      'Yu-Gi-Oh',      'GAME'),
    ('pokemon',       'Pokémon',       'GAME'),
    ('magic',         'Magic',         'GAME'),
    ('riftbound',     'Riftbound',     'GAME'),
    ('collector',     'Collector',     'ROLE'),
    ('player',        'Player',        'ROLE'),
    ('trader',        'Trader',        'ROLE'),
    ('seller',        'Seller',        'ROLE'),
    ('buyer',         'Buyer',         'ROLE'),
    ('high-end',      'High-End',      'STYLE'),
    ('vintage',       'Vintage',       'STYLE'),
    ('competitive',   'Competitive',   'STYLE'),
    ('casual',        'Casual',        'STYLE'),
    ('sealed',        'Sealed',        'STYLE'),
    ('graded',        'Graded',        'STYLE'),
    ('bulk',          'Bulk',          'STYLE'),
    ('local-meetups', 'Local Meetups', 'LOGISTICS'),
    ('shipping',      'Shipping',      'LOGISTICS'),
    ('english',       'English',       'LANGUAGE'),
    ('french',        'French',        'LANGUAGE'),
    ('japanese',      'Japanese',      'LANGUAGE'),
    ('spanish',       'Spanish',       'LANGUAGE');

-- ---------------------------------------------------------------------------------------------
-- profile_tag: which tags a profile carries (max 12, enforced by the service).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE profile_tag (
    profile_user_id uuid        NOT NULL REFERENCES profile (user_id) ON DELETE CASCADE,
    tag_id          uuid        NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_user_id, tag_id)
);

CREATE INDEX ix_profile_tag_tag_id ON profile_tag (tag_id);

-- ---------------------------------------------------------------------------------------------
-- moderation_rule: configurable text rules (ADR 0014) evaluated by TextModerationService.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE moderation_rule (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind       text        NOT NULL CHECK (kind IN ('BANNED_TERM', 'RATE_LIMIT', 'THRESHOLD')),
    pattern    text        NOT NULL CHECK (char_length(pattern) BETWEEN 1 AND 200),
    action     text        NOT NULL CHECK (action IN ('FLAG', 'BLOCK')),
    scope      text        NOT NULL CHECK (scope IN ('MESSAGE', 'POST', 'TAG', 'PROFILE')),
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_moderation_rule_scope_active ON moderation_rule (scope, active);

COMMENT ON TABLE moderation_rule IS 'Admin-editable moderation rules; BANNED_TERM patterns are case-insensitive regular expressions matched against accent-stripped text.';

-- Placeholder banned terms: invented, neutral tokens that exercise the rule engine locally.
-- Real word lists are managed through the admin console, never hard-coded.
INSERT INTO moderation_rule (kind, pattern, action, scope) VALUES
    ('BANNED_TERM', 'zorblax',      'BLOCK', 'TAG'),
    ('BANNED_TERM', 'quuxspam',     'BLOCK', 'TAG'),
    ('BANNED_TERM', 'blorpscam',    'BLOCK', 'TAG'),
    ('BANNED_TERM', 'zorblax',      'BLOCK', 'PROFILE'),
    ('BANNED_TERM', 'quuxspam',     'BLOCK', 'PROFILE'),
    ('BANNED_TERM', 'blorpscam',    'BLOCK', 'PROFILE'),
    ('BANNED_TERM', 'fnordpromo',   'FLAG',  'PROFILE');

-- ---------------------------------------------------------------------------------------------
-- privacy_settings: per-user privacy switches. A missing row means the safe defaults below.
-- Defaults favour safety: not discoverable, online status hidden, profile visible to members
-- only, messages from members with a profile, wishlist hidden.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE privacy_settings (
    user_id              uuid        PRIMARY KEY REFERENCES user_account (id) ON DELETE CASCADE,
    discoverable         boolean     NOT NULL DEFAULT false,
    show_distance        boolean     NOT NULL DEFAULT true,
    show_online_status   boolean     NOT NULL DEFAULT false,
    show_last_active     boolean     NOT NULL DEFAULT true,
    profile_visibility   text        NOT NULL DEFAULT 'MEMBERS'
                                     CHECK (profile_visibility IN ('PUBLIC', 'MEMBERS', 'PRIVATE')),
    messaging_permission text        NOT NULL DEFAULT 'MEMBERS_WITH_PROFILE'
                                     CHECK (messaging_permission IN ('EVERYONE', 'MEMBERS_WITH_PROFILE', 'NOBODY')),
    wishlist_visible     boolean     NOT NULL DEFAULT false,
    search_discoverable  boolean     NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_privacy_settings_discoverable ON privacy_settings (user_id) WHERE discoverable;

COMMENT ON TABLE privacy_settings IS 'Per-user privacy switches; a missing row means the safe defaults.';
COMMENT ON COLUMN privacy_settings.discoverable IS 'Opt-in to the map / nearby searches. While false, user_location.public_point is NULL (ADR 0004).';
COMMENT ON COLUMN privacy_settings.show_distance IS 'Whether other collectors see a bucketed distance to this collector.';
COMMENT ON COLUMN privacy_settings.search_discoverable IS 'Whether the collector appears in collector name search (Phase 4).';
