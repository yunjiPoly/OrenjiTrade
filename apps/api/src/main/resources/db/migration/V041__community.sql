-- V041: public community chat (Phase 5 contract "Community chat"): channels, posts and replies.
-- Channels are reference data present in every environment (the eight launch channels below);
-- region channels are added automatically per public_label city as collectors appear, and admins
-- and moderators add or archive channels through /admin/community/channels (audited).
--
-- Posts and replies are public to signed-in members while the publicChat feature flag is on. They
-- never carry a location; authors are shown with handle, display name and avatar only.

-- ---------------------------------------------------------------------------------------------
-- community_channel
-- ---------------------------------------------------------------------------------------------
CREATE TABLE community_channel (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                     text        NOT NULL,
    name                     text        NOT NULL,
    kind                     text        NOT NULL
                                         CHECK (kind IN ('GAME', 'REGION', 'LOOKING_FOR', 'NEW_LISTINGS', 'TRADES', 'GENERAL')),
    game_slug                text        REFERENCES game (slug) ON UPDATE CASCADE ON DELETE SET NULL,
    region_label             text,
    description              text        NOT NULL DEFAULT '',
    status                   text        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    post_rate_limit_per_hour integer     NOT NULL DEFAULT 10,
    sort_order               integer     NOT NULL DEFAULT 0,
    created_by               uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    updated_by               uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_community_channel_slug UNIQUE (slug),
    CONSTRAINT ck_community_channel_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 64),
    CONSTRAINT ck_community_channel_name CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT ck_community_channel_region CHECK (region_label IS NULL OR char_length(region_label) BETWEEN 1 AND 120),
    CONSTRAINT ck_community_channel_description CHECK (char_length(description) <= 500),
    CONSTRAINT ck_community_channel_rate CHECK (post_rate_limit_per_hour BETWEEN 1 AND 1000)
);

CREATE INDEX ix_community_channel_status_sort ON community_channel (status, sort_order, name);
CREATE INDEX ix_community_channel_region ON community_channel (lower(unaccent_immutable(region_label))) WHERE region_label IS NOT NULL;

COMMENT ON TABLE community_channel IS 'Public community channels (Phase 5); edited through /admin/community/channels (audited).';
COMMENT ON COLUMN community_channel.post_rate_limit_per_hour IS 'Posts per member per hour in this channel (ADR 0014: data, not code); 429 RATE_LIMITED beyond.';
COMMENT ON COLUMN community_channel.region_label IS 'City label of region channels (from the public_label of user_location, never a coordinate).';

INSERT INTO community_channel (id, slug, name, kind, game_slug, region_label, description, sort_order) VALUES
    ('00000000-0000-4000-8e00-000000000001', 'montreal-yugioh',    'Montréal / Yu-Gi-Oh!', 'REGION',       'yugioh',    'Montréal', 'Yu-Gi-Oh! collectors and players around Montréal: trades, meetups, locals.', 10),
    ('00000000-0000-4000-8e00-000000000002', 'montreal-pokemon',   'Montréal / Pokémon',   'REGION',       'pokemon',   'Montréal', 'Pokémon TCG collectors and players around Montréal.', 20),
    ('00000000-0000-4000-8e00-000000000003', 'montreal-magic',     'Montréal / Magic',     'REGION',       'mtg',       'Montréal', 'Magic: The Gathering players and collectors around Montréal.', 30),
    ('00000000-0000-4000-8e00-000000000004', 'montreal-riftbound', 'Montréal / Riftbound', 'REGION',       'riftbound', 'Montréal', 'Riftbound collectors and players around Montréal.', 40),
    ('00000000-0000-4000-8e00-000000000005', 'looking-for',        'Looking For',          'LOOKING_FOR',  NULL,        NULL,       'Post the cards you are hunting for; collectors nearby answer.', 50),
    ('00000000-0000-4000-8e00-000000000006', 'new-listings',       'New Listings',         'NEW_LISTINGS', NULL,        NULL,       'Share binders and cards you just listed.', 60),
    ('00000000-0000-4000-8e00-000000000007', 'trades',             'Trades',               'TRADES',       NULL,        NULL,       'Trade proposals and trade reports.', 70),
    ('00000000-0000-4000-8e00-000000000008', 'general',            'General',              'GENERAL',      NULL,        NULL,       'Everything else about trading cards. Be kind.', 80);

-- ---------------------------------------------------------------------------------------------
-- community_post
-- ---------------------------------------------------------------------------------------------
CREATE TABLE community_post (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id       uuid        NOT NULL REFERENCES community_channel (id) ON DELETE CASCADE,
    author_id        uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    body             text        NOT NULL,
    body_hash        text        NOT NULL,
    payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    edited_at        timestamptz,
    deleted_at       timestamptz,
    deleted_by       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    moderation_state text        NOT NULL DEFAULT 'OK' CHECK (moderation_state IN ('OK', 'FLAGGED', 'REMOVED')),
    removed_reason   text,
    removed_by       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    removed_at       timestamptz,
    reply_count      integer     NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
    last_reply_at    timestamptz,
    CONSTRAINT ck_community_post_body CHECK (char_length(body) BETWEEN 1 AND 2000),
    CONSTRAINT ck_community_post_hash CHECK (body_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_community_post_payload CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_community_post_removed_reason CHECK (removed_reason IS NULL OR char_length(removed_reason) <= 500)
);

CREATE INDEX ix_community_post_channel_created ON community_post (channel_id, created_at DESC, id DESC);
CREATE INDEX ix_community_post_author_hash ON community_post (author_id, body_hash, created_at DESC);
CREATE INDEX ix_community_post_recent ON community_post (created_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN community_post.body_hash IS 'SHA-256 of the normalised body (lower case, accents and extra spaces removed): duplicate detection within 24 h (409 DUPLICATE_POST).';
COMMENT ON COLUMN community_post.payload IS 'Link references and snapshots {card:{printingId,cardId,name,printingCode}, binder:{binderId,name,ownerHandle}}.';
COMMENT ON COLUMN community_post.removed_reason IS 'Moderator note of a removal (audited); never shown to other members.';

-- ---------------------------------------------------------------------------------------------
-- community_reply
-- ---------------------------------------------------------------------------------------------
CREATE TABLE community_reply (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          uuid        NOT NULL REFERENCES community_post (id) ON DELETE CASCADE,
    author_id        uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    body             text        NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    deleted_by       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    moderation_state text        NOT NULL DEFAULT 'OK' CHECK (moderation_state IN ('OK', 'FLAGGED', 'REMOVED')),
    removed_reason   text,
    removed_by       uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    removed_at       timestamptz,
    CONSTRAINT ck_community_reply_body CHECK (char_length(body) BETWEEN 1 AND 1000),
    CONSTRAINT ck_community_reply_removed_reason CHECK (removed_reason IS NULL OR char_length(removed_reason) <= 500)
);

CREATE INDEX ix_community_reply_post_created ON community_reply (post_id, created_at, id);
CREATE INDEX ix_community_reply_author ON community_reply (author_id);
