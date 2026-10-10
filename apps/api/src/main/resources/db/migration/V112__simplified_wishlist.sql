-- V112: a much simpler wishlist and no matches feature (owner product change of 2026-10-08,
-- section 4; stage S2). There are no real users, so data of removed fields is dropped rather than
-- migrated: private notes are NOT copied into the new public note (they were private).

-- ---------------------------------------------------------------------------------------------
-- Matches: the table, its notifications and the plan-limit notices about them. Wishes now drive
-- live lists ("Who wants it", "Wanted by N") and a simple wishlist alert instead (no storage).
-- ---------------------------------------------------------------------------------------------
DROP TABLE wishlist_match;

DELETE FROM notification WHERE type = 'WISHLIST_MATCH';
DELETE FROM notification
 WHERE type = 'SYSTEM' AND data ->> 'kind' = 'LIMIT_REACHED'
   AND data ->> 'notificationType' = 'WISHLIST_MATCH';

-- The local analytics aggregate of the removed 'wishlist_matched' event (admin summary).
DELETE FROM analytics_daily_count WHERE event_type = 'wishlist_matched';

-- Transactional outbox (V002): a publication that is still incomplete (a crash between the commit
-- and the listener) is republished at the next start. The new code cannot read one of the removed
-- WishlistMatched class (a warning at every start) nor one of WishlistItemCreated in its old shape
-- (it lost hasMaxPrice / tradePreference and gained the primitive nearMintOnly / hasPriceTerm: the
-- first start fails on it and the row stays incomplete for ever). Every such row predates this
-- migration, so they are completed here (their listeners only fed analytics).
UPDATE event_publication
   SET completion_date = now(), status = 'COMPLETED'
 WHERE completion_date IS NULL
   AND event_type IN ('com.orenjitrade.api.wishlist.events.WishlistMatched',
                      'com.orenjitrade.api.wishlist.events.WishlistItemCreated');

-- ---------------------------------------------------------------------------------------------
-- wishlist_item: which copy (card, optional printing, optional rarity), a public note,
-- "Near Mint only" and at most one price term. Removed: minimum condition, edition, language,
-- maximum price and currency, trade/buy preference, private notes, the per-wish alert switch
-- (active) and the match timestamp.
-- ---------------------------------------------------------------------------------------------
-- A wish its owner had paused (active = false) was hidden from the public wishlist and from
-- matching. There is no paused wish any more, and a paused wish must not become public and
-- alerting behind its owner's back: paused wishes are deleted (lead decision of 2026-10-10; the
-- spec drops data rather than migrating it, and only fictional data exists).
DELETE FROM wishlist_item WHERE NOT active;

DROP INDEX IF EXISTS ix_wishlist_item_active_card;
DROP INDEX IF EXISTS ix_wishlist_item_active_printing;
DROP INDEX IF EXISTS ix_wishlist_item_updated;

ALTER TABLE wishlist_item
    DROP CONSTRAINT ck_wishlist_item_condition,
    DROP CONSTRAINT ck_wishlist_item_edition,
    DROP CONSTRAINT ck_wishlist_item_language,
    DROP CONSTRAINT ck_wishlist_item_price,
    DROP CONSTRAINT ck_wishlist_item_currency,
    DROP CONSTRAINT ck_wishlist_item_notes,
    DROP COLUMN condition_min,
    DROP COLUMN edition,
    DROP COLUMN language,
    DROP COLUMN max_price,
    DROP COLUMN currency,
    DROP COLUMN trade_preference,
    DROP COLUMN notes,
    DROP COLUMN active,
    DROP COLUMN last_matched_at;

-- Normalise the selection BEFORE collapsing duplicates, so that rows which only become equal
-- through the normalisation are collapsed too (the unique index below needs it):
-- 1. Rarity strings are trimmed (spaces, tabs, line breaks) and an empty one means "any rarity"
--    (the old API checked the rarity against the game's list; this only guards rows written by
--    hand).
UPDATE wishlist_item
   SET rarity = NULLIF(btrim(rarity, ' ' || chr(9) || chr(10) || chr(13)), '')
 WHERE rarity IS NOT NULL
   AND rarity IS DISTINCT FROM NULLIF(btrim(rarity, ' ' || chr(9) || chr(10) || chr(13)), '');

-- 2. The card (and game) of a printing wish are the printing's: the old schema allowed a printing
--    wish without card_id, or with the card of another printing (the API always filled it right).
UPDATE wishlist_item w
   SET card_id = p.card_id, game_slug = g.slug
  FROM card_printing p
  JOIN card c ON c.id = p.card_id
  JOIN game g ON g.id = c.game_id
 WHERE p.id = w.printing_id
   AND (w.card_id IS DISTINCT FROM p.card_id OR w.game_slug <> g.slug);

-- 3. A printing fixes its rarity: a rarity is kept only on "any printing" wishes. The old form
--    allowed a rarity filter next to one printing, so (P, 'Ultra Rare') and (P, NULL) become the
--    same wish here.
UPDATE wishlist_item SET rarity = NULL WHERE printing_id IS NOT NULL AND rarity IS NOT NULL;

-- 4. "Any printing of a rarity" must name a rarity one of the card's printings has (the old API
--    only checked the game's rarity list, so "any Ghost Rare" of a card without one was accepted):
--    such a wish could never alert and could not be saved again. Its rarity is cleared, which
--    makes it a plain "any printing" wish.
UPDATE wishlist_item w SET rarity = NULL
 WHERE w.printing_id IS NULL AND w.rarity IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM card_printing p
                    WHERE p.card_id = w.card_id AND p.rarity = w.rarity);

-- 5. Wishes that differed only by a removed filter (or by the normalisation above) are now the
--    same wish: keep the oldest (ties on created_at: the smallest id).
DELETE FROM wishlist_item w
 USING wishlist_item older
 WHERE older.owner_id = w.owner_id
   AND older.card_id IS NOT DISTINCT FROM w.card_id
   AND older.printing_id IS NOT DISTINCT FROM w.printing_id
   AND older.rarity IS NOT DISTINCT FROM w.rarity
   AND (older.created_at, older.id) < (w.created_at, w.id);

-- card_id NOT NULL makes the old "card or printing" check redundant.
ALTER TABLE wishlist_item
    ALTER COLUMN card_id SET NOT NULL,
    DROP CONSTRAINT ck_wishlist_item_target,
    ADD COLUMN public_note    text    NOT NULL DEFAULT '',
    ADD COLUMN near_mint_only boolean NOT NULL DEFAULT false,
    ADD COLUMN price_term     text,
    ADD CONSTRAINT ck_wishlist_item_public_note CHECK (char_length(public_note) <= 280),
    ADD CONSTRAINT ck_wishlist_item_price_term
        CHECK (price_term IS NULL OR price_term ~ '^[1-9][0-9]{0,2}% TCG\+?$'),
    ADD CONSTRAINT ck_wishlist_item_rarity_any_printing
        CHECK (printing_id IS NULL OR rarity IS NULL);

-- One wish per selection (card, printing or any, rarity or any) and collector.
CREATE UNIQUE INDEX uq_wishlist_item_selection
    ON wishlist_item (owner_id, card_id, printing_id, rarity) NULLS NOT DISTINCT;
-- Alerts and "who wants it" look wishes up by printing or by card.
CREATE INDEX ix_wishlist_item_card ON wishlist_item (card_id);
CREATE INDEX ix_wishlist_item_printing ON wishlist_item (printing_id) WHERE printing_id IS NOT NULL;

COMMENT ON TABLE wishlist_item IS 'Cards a collector is looking for (stage S2 model): the card, one printing or any printing (printing_id NULL), an optional rarity for "any printing" wishes, a public note, "Near Mint only" and an optional price term. card_id is always set (the printing''s card for a printing wish).';
COMMENT ON COLUMN wishlist_item.rarity IS 'Rarity of "any printing" wishes (any printing of this rarity); NULL = any rarity. Always NULL when printing_id is set (the printing fixes it).';
COMMENT ON COLUMN wishlist_item.public_note IS 'PUBLIC note (plain text, at most 280 characters, moderated like profile text): shown wherever the wish is visible (the owner''s public wishlist, "Who wants it").';
COMMENT ON COLUMN wishlist_item.near_mint_only IS 'Only Near Mint (or Mint) copies fit this wish (wishlist alerts, "Who wants it").';
COMMENT ON COLUMN wishlist_item.price_term IS 'At most one display term relative to the TCG market price ("85% TCG", "100% TCG+"), one of platform_settings wishlist.price_terms when chosen; not a filter.';

-- ---------------------------------------------------------------------------------------------
-- Wishlist alerts: one notification per collector and public item at most. This is a sent-alert
-- key, not a matches list: nothing reads it back except the de-duplication.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE wishlist_alert_sent (
    user_id           uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    inventory_item_id uuid        NOT NULL REFERENCES inventory_item (id) ON DELETE CASCADE,
    sent_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, inventory_item_id)
);

CREATE INDEX ix_wishlist_alert_sent_item ON wishlist_alert_sent (inventory_item_id);

COMMENT ON TABLE wishlist_alert_sent IS 'De-duplication key of wishlist alerts: a collector is alerted at most once about one inventory item, whichever of their wishes it fits and however often it is republished.';

-- ---------------------------------------------------------------------------------------------
-- The price terms a wish may carry (admin-configurable, ADR 0014; comma-separated labels
-- "<percent>% TCG" with an optional "+" for "or more").
-- ---------------------------------------------------------------------------------------------
INSERT INTO platform_settings (key, value, description) VALUES
    ('wishlist.price_terms', '"80% TCG,85% TCG,90% TCG,100% TCG,100% TCG+"',
     'Price terms a wish may show, relative to the TCG market price, comma-separated: "<percent>% TCG" with an optional "+" (1 to 10 terms, percent 1-200). Display terms for sellers, not a filter.');

-- ---------------------------------------------------------------------------------------------
-- Notification settings: one on/off switch for wishlist alerts (replaces the per-wish switch and
-- the WISHLIST_MATCH category of the channel matrix).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE notification_preferences ADD COLUMN wishlist_alerts boolean NOT NULL DEFAULT true;
-- An opt-out is carried over: a collector who had switched the old WISHLIST_MATCH category off on
-- both channels the new alert uses (in-app and push) starts with wishlist alerts off. With either
-- of the two still on, alerts stay on (email never carried wishlist alerts in the new model).
UPDATE notification_preferences SET wishlist_alerts = false
 WHERE categories #>> '{WISHLIST_MATCH,inApp}' = 'false'
   AND categories #>> '{WISHLIST_MATCH,push}' = 'false';
UPDATE notification_preferences SET categories = categories - 'WISHLIST_MATCH'
 WHERE categories ? 'WISHLIST_MATCH';

COMMENT ON COLUMN notification_preferences.wishlist_alerts IS 'Wishlist alerts on or off (one switch; in-app and push follow the master switches and quiet hours, never email).';
COMMENT ON COLUMN notification_preferences.categories IS 'JSON map {CATEGORY: {push, email, inApp}} keyed by MESSAGE, OFFER, RATING, TRADE, BINDER_FRESHNESS, REPORT_DECISION, MARKETING; missing keys mean the defaults. Wishlist alerts have their own switch (wishlist_alerts).';
COMMENT ON COLUMN notification.type IS 'WISHLIST_ALERT, MESSAGE, OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_COUNTERED, OFFER_DECLINED, OFFER_CANCELLED, OFFER_EXPIRED, BINDER_EXPIRING, BINDER_STALE_WARNING, BINDER_HIDDEN, RATING_RECEIVED, TRADE_UPDATE, SHIPMENT_STATUS, PAYMENT_UPDATE, DISPUTE_UPDATE, REPORT_DECISION or SYSTEM (checked by the API; the pattern keeps later types additive).';
COMMENT ON COLUMN notification.dedup_key IS 'Idempotency key, e.g. wishlist-alert:<userId>:<inventoryItemId>, message:<messageId>, limit:<userId>:<type>:<UTC day>; a repeated event never creates a second notification.';

UPDATE usage_limit SET description = 'Wishlist alerts per day'
 WHERE limit_key = 'wishlist.alerts.per_day' AND description = 'Wishlist match alerts per day';
