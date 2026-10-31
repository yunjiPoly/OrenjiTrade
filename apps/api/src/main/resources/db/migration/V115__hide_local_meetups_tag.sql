-- V115 (stage R1 of the phone redesign, ADR 0018 "Deals happen in the chat"): collectors don't
-- meet, cards ship by mail. The curated "Local Meetups" tag is hidden: it is no longer offered,
-- searched or shown on a profile (tag.status HIDDEN, V004). Profiles that carry it keep the link
-- until their owner next saves their tags; its slug stays taken, so no custom tag can bring it
-- back. A tag an admin already hid or banned is left alone. Seed profiles use "Shipping" instead.

UPDATE tag
   SET status = 'HIDDEN', updated_at = now()
 WHERE slug = 'local-meetups' AND category = 'LOGISTICS' AND status = 'ACTIVE';
