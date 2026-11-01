-- V134 (stage R11 of the phone redesign, owner prompt 2026-10-20 "Messages › Community: one simple
-- room per game"; mockup v50 screens 32 and 33): the community becomes one public room per platform
-- region and game, 15 in all. Every other channel is archived (status ARCHIVED: nothing is deleted;
-- moderators and their authors' exports still read their posts). The publicChat flag is switched on
-- unless an admin already chose its value (it stays the kill switch). Posts gain up to 4 photos,
-- uploaded through POST /uploads/images with the new kind COMMUNITY (EXIF and GPS stripped by the
-- re-encoding). Places stay "state or province, country" (ADR 0017): a room is a platform region,
-- never a city, and no column here holds a place.

-- ---------------------------------------------------------------------------------------------
-- The rooms: slug "{region}-{game}", the game's name, "{game} collectors in {region}: trades and
-- sales by mail." (ADR 0018: deals ship by mail). Kind REGION with a game, like the old city
-- channels of V041. Sort order: regions in their order, games in theirs (the phone puts the
-- browsed game first). A slug that already exists (an admin's channel) becomes the room.
-- ---------------------------------------------------------------------------------------------
INSERT INTO community_channel (id, slug, name, kind, game_slug, region_label, description, sort_order) VALUES
    ('00000000-0000-4000-8e00-000000000021', 'americas-north-yugioh',    'Yu-Gi-Oh!',            'REGION', 'yugioh',    'americas-north', 'Yu-Gi-Oh! collectors in Americas (North): trades and sales by mail.', 210),
    ('00000000-0000-4000-8e00-000000000022', 'americas-north-pokemon',   'Pokémon',              'REGION', 'pokemon',   'americas-north', 'Pokémon collectors in Americas (North): trades and sales by mail.', 211),
    ('00000000-0000-4000-8e00-000000000023', 'americas-north-mtg',       'Magic: The Gathering', 'REGION', 'mtg',       'americas-north', 'Magic: The Gathering collectors in Americas (North): trades and sales by mail.', 212),
    ('00000000-0000-4000-8e00-000000000024', 'americas-north-onepiece',  'One Piece',            'REGION', 'onepiece',  'americas-north', 'One Piece collectors in Americas (North): trades and sales by mail.', 213),
    ('00000000-0000-4000-8e00-000000000025', 'americas-north-riftbound', 'Riftbound',            'REGION', 'riftbound', 'americas-north', 'Riftbound collectors in Americas (North): trades and sales by mail.', 214),
    ('00000000-0000-4000-8e00-000000000031', 'americas-south-yugioh',    'Yu-Gi-Oh!',            'REGION', 'yugioh',    'americas-south', 'Yu-Gi-Oh! collectors in Americas (South): trades and sales by mail.', 220),
    ('00000000-0000-4000-8e00-000000000032', 'americas-south-pokemon',   'Pokémon',              'REGION', 'pokemon',   'americas-south', 'Pokémon collectors in Americas (South): trades and sales by mail.', 221),
    ('00000000-0000-4000-8e00-000000000033', 'americas-south-mtg',       'Magic: The Gathering', 'REGION', 'mtg',       'americas-south', 'Magic: The Gathering collectors in Americas (South): trades and sales by mail.', 222),
    ('00000000-0000-4000-8e00-000000000034', 'americas-south-onepiece',  'One Piece',            'REGION', 'onepiece',  'americas-south', 'One Piece collectors in Americas (South): trades and sales by mail.', 223),
    ('00000000-0000-4000-8e00-000000000035', 'americas-south-riftbound', 'Riftbound',            'REGION', 'riftbound', 'americas-south', 'Riftbound collectors in Americas (South): trades and sales by mail.', 224),
    ('00000000-0000-4000-8e00-000000000041', 'europe-yugioh',            'Yu-Gi-Oh!',            'REGION', 'yugioh',    'europe',         'Yu-Gi-Oh! collectors in Europe: trades and sales by mail.', 230),
    ('00000000-0000-4000-8e00-000000000042', 'europe-pokemon',           'Pokémon',              'REGION', 'pokemon',   'europe',         'Pokémon collectors in Europe: trades and sales by mail.', 231),
    ('00000000-0000-4000-8e00-000000000043', 'europe-mtg',               'Magic: The Gathering', 'REGION', 'mtg',       'europe',         'Magic: The Gathering collectors in Europe: trades and sales by mail.', 232),
    ('00000000-0000-4000-8e00-000000000044', 'europe-onepiece',          'One Piece',            'REGION', 'onepiece',  'europe',         'One Piece collectors in Europe: trades and sales by mail.', 233),
    ('00000000-0000-4000-8e00-000000000045', 'europe-riftbound',         'Riftbound',            'REGION', 'riftbound', 'europe',         'Riftbound collectors in Europe: trades and sales by mail.', 234)
ON CONFLICT (slug) DO UPDATE
   SET status = 'ACTIVE', kind = 'REGION', game_slug = EXCLUDED.game_slug,
       region_label = EXCLUDED.region_label, updated_at = now();

-- Every other channel is archived: the three region channels of V110, the four topics of V041
-- (looking-for, new-listings, trades, general) and any channel an admin added. Archived channels
-- are hidden from members and read-only; their posts stay.
UPDATE community_channel
   SET status = 'ARCHIVED', updated_at = now()
 WHERE status = 'ACTIVE'
   AND slug NOT IN ('americas-north-yugioh', 'americas-north-pokemon', 'americas-north-mtg',
                    'americas-north-onepiece', 'americas-north-riftbound',
                    'americas-south-yugioh', 'americas-south-pokemon', 'americas-south-mtg',
                    'americas-south-onepiece', 'americas-south-riftbound',
                    'europe-yugioh', 'europe-pokemon', 'europe-mtg', 'europe-onepiece',
                    'europe-riftbound');

COMMENT ON COLUMN community_channel.region_label IS 'Platform region code of REGION channels (ADR 0017): since V134 the rooms, one per platform region and game; archived city channels keep their old city label. Never a coordinate.';

-- ---------------------------------------------------------------------------------------------
-- The community is on by default; the flag stays the kill switch. A value an admin chose
-- (updated_by set) is kept, as V105 did for the money flags.
-- ---------------------------------------------------------------------------------------------
INSERT INTO feature_flag (key, enabled, description)
VALUES ('publicChat', true, 'Public community rooms (Phase 5; one room per platform region and game since V134).')
ON CONFLICT (key) DO NOTHING;

UPDATE feature_flag
   SET enabled = true, rollout_percent = 100, updated_at = now()
 WHERE key = 'publicChat'
   AND updated_by IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Photos of posts: POST /uploads/images?kind=COMMUNITY (JPEG, PNG or WebP of at most 3 MB, sniffed
-- from the content, re-encoded as a JPEG of at most 1600 px without EXIF or GPS data), attached to
-- a post within an hour; at most 4 per post (API). Deleted with their files when the post is
-- deleted or removed, or its author's account is.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE image_upload DROP CONSTRAINT IF EXISTS image_upload_kind_check;
ALTER TABLE image_upload ADD CONSTRAINT ck_image_upload_kind
    CHECK (kind IN ('MESSAGE', 'INVENTORY', 'COMMUNITY'));

COMMENT ON TABLE image_upload IS 'PRIVATE: pending uploads of the owner (MESSAGE for a message, COMMUNITY for a community post); consumed within 1 h, deleted by the upload-cleanup job otherwise.';

CREATE TABLE community_post_photo (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     uuid        NOT NULL REFERENCES community_post (id) ON DELETE CASCADE,
    storage_key text        NOT NULL,
    width       integer     NOT NULL CHECK (width > 0),
    height      integer     NOT NULL CHECK (height > 0),
    bytes       integer     NOT NULL CHECK (bytes > 0),
    position    integer     NOT NULL CHECK (position >= 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_community_post_photo_storage_key UNIQUE (storage_key),
    CONSTRAINT uq_community_post_photo_position UNIQUE (post_id, position)
);

COMMENT ON TABLE community_post_photo IS 'Photos of a community post (stage R11): re-encoded JPEGs without EXIF or GPS data, at most 4 per post (API); public to members like the post; URLs derived from storage_key at read time.';
COMMENT ON COLUMN community_post_photo.storage_key IS 'ObjectStorage key (uploads/<owner id>/<random>.jpg, from image_upload); deleted with the post, its removal or its author''s account.';
COMMENT ON COLUMN community_post_photo.position IS 'Order of the photo in its post (0 first).';
