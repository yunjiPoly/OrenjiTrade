-- V116 (stage R1 of the phone redesign, ADR 0018 "Deals happen in the chat"): the region channel
-- descriptions of V041 and V110 promised "trades, meetups, locals". Collectors don't meet: deals
-- ship by mail. A description is rewritten only while it still holds the text of its migration,
-- so an edit made through /admin/community/channels is kept (V110 did the same for looking-for).

UPDATE community_channel
   SET description = 'Canada, the United States, Mexico, Central America and the Caribbean: trades and sales by mail.',
       updated_at = now()
 WHERE slug = 'americas-north'
   AND description = 'Canada, the United States, Mexico, Central America and the Caribbean: trades, meetups, locals.';

UPDATE community_channel
   SET description = 'South American collectors and players: trades and sales by mail.', updated_at = now()
 WHERE slug = 'americas-south'
   AND description = 'South American collectors and players: trades, meetups, locals.';

UPDATE community_channel
   SET description = 'European collectors and players: trades and sales by mail.', updated_at = now()
 WHERE slug = 'europe'
   AND description = 'European collectors and players: trades, meetups, locals.';

-- The archived city channel of V041 (still readable by moderators and its authors' exports).
UPDATE community_channel
   SET description = 'Yu-Gi-Oh! collectors and players around Montréal: trades and sales by mail.',
       updated_at = now()
 WHERE slug = 'montreal-yugioh'
   AND description = 'Yu-Gi-Oh! collectors and players around Montréal: trades, meetups, locals.';
