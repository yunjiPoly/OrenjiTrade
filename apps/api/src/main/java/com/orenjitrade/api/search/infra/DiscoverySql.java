package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;

/**
 * SQL fragments of the discovery queries (ADR 0012, ADR 0017). Geography is the collector's
 * self-declared country and subdivision only: there is no coordinate and no distance. Public
 * listings reuse the live rules of the binders and inventory modules ({@link
 * PublicVisibilityRules}, {@link InventoryItemRepository#LISTED}).
 */
final class DiscoverySql {

    /**
     * Joins of an item query with the aliases {@link InventoryItemRepository#LISTED} expects
     * ({@code i}, {@code p}, {@code c}, {@code g}, {@code b}); the owner aliases {@code u} and
     * {@code ps} come from the enclosing query or {@link PublicVisibilityRules#ownerJoins}.
     */
    static final String ITEM_JOINS =
            """
             FROM inventory_item i
             JOIN card_printing p ON p.id = i.printing_id
             JOIN card c ON c.id = p.card_id
             JOIN game g ON g.id = c.game_id
             LEFT JOIN binder b ON b.id = i.binder_id
            """;

    /** The item is effectively public right now (needs {@link #ITEM_JOINS} and the owner). */
    static final String LISTED = InventoryItemRepository.LISTED;

    /** Freshness rank of an item: 0 ACTIVE, 1 AGING, 2 STALE. */
    static final String FRESHNESS_RANK =
            "CASE i.freshness_state WHEN 'ACTIVE' THEN 0 WHEN 'AGING' THEN 1 ELSE 2 END";

    /**
     * The location of the user aliased {@code ownerColumn} ({@code ul}), its country ({@code co})
     * and subdivision ({@code sd}). An inner join: collectors without a location never appear.
     */
    static String locationJoins(String ownerColumn) {
        return " JOIN user_location ul ON ul.user_id = "
                + ownerColumn
                + " JOIN country co ON co.code = ul.country_code"
                + " JOIN subdivision sd ON sd.code = ul.subdivision_code";
    }

    /** The place columns of {@link #locationJoins} for {@code CollectorSearchRepository}. */
    static final String PLACE_COLUMNS =
            "co.region_code, ul.country_code, co.name AS country_name, ul.subdivision_code,"
                    + " sd.name AS subdivision_name, sd.whole_country";

    /**
     * The collector is discoverable: opted in, listed (ACTIVE account, profile not PRIVATE) and,
     * with {@link #locationJoins}, located. Needs {@code u} and {@code ps}.
     */
    static final String DISCOVERABLE =
            "COALESCE(ps.discoverable, false) AND " + PublicVisibilityRules.OWNER_LISTED;

    /** The collector's country is in the platform region {@code :region}. */
    static final String IN_REGION = "co.region_code = :region";

    private DiscoverySql() {}
}
