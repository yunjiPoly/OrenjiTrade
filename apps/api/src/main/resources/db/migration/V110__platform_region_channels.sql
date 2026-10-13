-- V110: one community channel per platform region (ADR 0017). Region channels are no longer
-- created from collectors' city labels; the city channels of the old model are archived, never
-- deleted (their posts stay readable to moderators and their authors' exports).

UPDATE community_channel
   SET status = 'ARCHIVED', updated_at = now()
 WHERE kind = 'REGION' AND status = 'ACTIVE';

INSERT INTO community_channel (id, slug, name, kind, game_slug, region_label, description, sort_order) VALUES
    ('00000000-0000-4000-8e00-000000000011', 'americas-north', 'Americas (North)', 'REGION', NULL, 'americas-north',
     'Canada, the United States, Mexico, Central America and the Caribbean: trades, meetups, locals.', 5),
    ('00000000-0000-4000-8e00-000000000012', 'americas-south', 'Americas (South)', 'REGION', NULL, 'americas-south',
     'South American collectors and players: trades, meetups, locals.', 6),
    ('00000000-0000-4000-8e00-000000000013', 'europe', 'Europe', 'REGION', NULL, 'europe',
     'European collectors and players: trades, meetups, locals.', 7)
ON CONFLICT (slug) DO NOTHING;

UPDATE community_channel
   SET description = 'Post the cards you are hunting for; collectors in your region answer.', updated_at = now()
 WHERE slug = 'looking-for' AND description = 'Post the cards you are hunting for; collectors nearby answer.';

COMMENT ON COLUMN community_channel.region_label IS 'Platform region code of REGION channels (ADR 0017); archived city channels keep their old city label. Never a coordinate.';
