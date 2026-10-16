package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.wishlist.domain.WishlistAlertRules;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * "Available" on the caller's wishlist (owner spec 2026-10-14, sections 8 and 12; stage R5): which
 * of a collector's wishes at least one public holder of a platform region has right now, in <b>one
 * grouped query</b> for the whole wishlist (never one query per wish).
 *
 * <p>An item fits a wish exactly as for the wishlist alert ({@link WishlistAlertRules}): the wished
 * printing, or any printing of the wished card of the wished rarity when one is set, Near Mint or
 * better (or a condition the owner did not state) when the wish asks for Near Mint only. The item
 * is one buyers see ({@link InventoryItemRepository#SHOWN_PUBLICLY}: listed on its own, or a card
 * of a public deck core, which "Who has this card" shows in its "Also in a deck core" banner) and
 * fresh (ACTIVE or AGING); its owner is discoverable with a location in the region, is not the
 * wisher, and no block exists between the two in either direction. Reads the inventory, binders,
 * catalog, location and privacy tables read-only, like {@link WishlistAlertRepository}.
 */
@Repository
public class WishlistAvailabilityRepository {

    static final String AVAILABLE =
            """
            SELECT w.id
              FROM wishlist_item w
              JOIN card_printing p
                ON (w.printing_id = p.id
                    OR (w.printing_id IS NULL AND p.card_id = w.card_id
                        AND (w.rarity IS NULL OR w.rarity = p.rarity)))
              JOIN inventory_item i ON i.printing_id = p.id AND i.owner_id <> w.owner_id
              JOIN card c ON c.id = p.card_id
              JOIN game g ON g.id = c.game_id
              LEFT JOIN binder b ON b.id = i.binder_id
            """
                    + PublicVisibilityRules.ownerJoins("i.owner_id")
                    + """
                     CROSS JOIN LATERAL (
                         SELECT ARRAY(SELECT jsonb_array_elements_text(g.schema -> 'conditions'))
                                AS conditions) gc
                     JOIN user_location ol ON ol.user_id = i.owner_id
                     JOIN country oc ON oc.code = ol.country_code
                     JOIN subdivision osd ON osd.code = ol.subdivision_code
                    WHERE w.owner_id = :ownerId
                      AND w.id IN (:ids)
                      AND\
                    """
                    + InventoryItemRepository.SHOWN_PUBLICLY
                    + """
                      AND i.freshness_state IN ('ACTIVE', 'AGING')
                      AND COALESCE(ps.discoverable, false)
                      AND\
                    """
                    + PublicVisibilityRules.OWNER_LISTED
                    + """
                      AND oc.region_code = :region
                      AND\
                    """
                    + WishlistAlertRules.NEAR_MINT_SQL
                    + """
                       AND NOT EXISTS (SELECT 1 FROM user_block ub
                                        WHERE (ub.blocker_id = w.owner_id AND ub.blocked_id = i.owner_id)
                                           OR (ub.blocker_id = i.owner_id AND ub.blocked_id = w.owner_id))
                     GROUP BY w.id
                    """;

    private final JdbcClient jdbc;

    public WishlistAvailabilityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The wishes among {@code wishIds} (all of {@code ownerId}'s; others are ignored) that a public
     * holder of {@code regionCode} has right now.
     */
    public Set<UUID> availableAmong(
            UUID ownerId, Collection<UUID> wishIds, String regionCode, Instant now) {
        if (wishIds.isEmpty()) {
            return Set.of();
        }
        return new LinkedHashSet<>(
                jdbc.sql(AVAILABLE)
                        .param("ownerId", ownerId)
                        .param("ids", wishIds)
                        .param("region", regionCode)
                        .param("now", Timestamp.from(now))
                        .query(UUID.class)
                        .list());
    }
}
