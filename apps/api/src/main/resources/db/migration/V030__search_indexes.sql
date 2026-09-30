-- V030: indexes for Phase 4 map discovery and unified search (ADR 0004, ADR 0012).
--
-- No new table: discovery reads user_location.public_point (GiST index from V005), privacy
-- settings, profiles, tags, binders and inventory items read-only. These indexes support the
-- per-collector statistics and EXISTS filters over public items, collector name search and public
-- binder name search. Nothing here touches a private location column.

-- Per-owner scans of candidate public items (marker statistics, hasPrintingId / hasCardId /
-- availability EXISTS filters): the effectively public rule needs visibility and freshness.
CREATE INDEX ix_inventory_item_owner_discovery
    ON inventory_item (owner_id, freshness_state, availability)
    WHERE deleted_at IS NULL AND visibility <> 'PRIVATE';

-- Card-holder search by card: printings of the card, then their candidate public items.
CREATE INDEX ix_inventory_item_printing_discovery
    ON inventory_item (printing_id, freshness_state, asking_price)
    WHERE deleted_at IS NULL AND visibility <> 'PRIVATE';

-- Collectors on the map (discoverable, profile not PRIVATE): the join partner of the GiST scan.
CREATE INDEX ix_privacy_settings_map
    ON privacy_settings (user_id)
    WHERE discoverable AND profile_visibility <> 'PRIVATE';

-- Accent-insensitive substring and prefix match on public binder names (search and suggest).
CREATE INDEX ix_binder_name_trgm
    ON binder USING gin (lower(unaccent_immutable(name)) gin_trgm_ops);

COMMENT ON INDEX ix_inventory_item_owner_discovery IS 'Phase 4: per-collector public item statistics and discovery EXISTS filters.';
COMMENT ON INDEX ix_inventory_item_printing_discovery IS 'Phase 4: card-holder search (printing, freshness, price sort).';
COMMENT ON INDEX ix_privacy_settings_map IS 'Phase 4: collectors that may appear on the map.';
COMMENT ON INDEX ix_binder_name_trgm IS 'Phase 4: public binder name search and autocomplete.';
