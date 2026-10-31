-- V121: voluntary donations ("Support OrenjiTrade") leave OrenjiTrade (stage F1 "free for all",
-- owner decision of 2026-10-14; ADR 0019). The donation and donation_webhook_event tables of V093,
-- the donations.* platform settings and the donations feature flag go with the code that used
-- them. The code is kept on the branch archive/paid-features; bringing donations back means that
-- code plus a new migration recreating these tables and settings (V093 is their definition).
--
-- Foreign keys checked: donation_webhook_event references donation; donation references
-- user_account (ON DELETE SET NULL); nothing else references either table. No analytics event,
-- notification or job belongs to donations. Audit rows of the old admin actions (donation.refund,
-- donations.settings.update) stay in audit_log as history.

DROP TABLE donation_webhook_event;
DROP TABLE donation;

DELETE FROM platform_settings WHERE key LIKE 'donations.%';

DELETE FROM feature_flag WHERE key = 'donations';

-- Transactional outbox (V002): an incomplete publication is republished at the next start, and
-- the class of a DonationWebhookReceived no longer exists. Such rows predate this migration and
-- their only listener applied the webhook to the dropped donation table: they are completed here,
-- as V112 did for the removed wishlist events.
UPDATE event_publication
   SET completion_date = now(), status = 'COMPLETED'
 WHERE completion_date IS NULL
   AND event_type = 'com.orenjitrade.api.donations.events.DonationWebhookReceived';
