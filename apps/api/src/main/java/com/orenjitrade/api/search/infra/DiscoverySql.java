package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.SearchCentre;
import java.util.Map;

/**
 * SQL fragments of the discovery queries (ADR 0004, ADR 0012). Every geographic predicate and
 * distance uses {@code user_location.public_point} only; the trading-area centre and the home point
 * are never selected. Public listings reuse the live rules of the binders and inventory modules
 * ({@link PublicVisibilityRules}, {@link InventoryItemRepository#LISTED}).
 */
final class DiscoverySql {

    /** The snapped search centre as a geography ({@code :centreLat}, {@code :centreLng}). */
    static final String CENTRE =
            "ST_SetSRID(ST_MakePoint(:centreLng, :centreLat), 4326)::geography";

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
     * The collector is on the map: a public point, discoverable, listed (ACTIVE account, profile
     * not PRIVATE). Needs {@code ul}, {@code u}, {@code ps}.
     */
    static final String ON_THE_MAP =
            "ul.public_point IS NOT NULL AND ps.discoverable AND "
                    + PublicVisibilityRules.OWNER_LISTED;

    private DiscoverySql() {}

    /** {@code ST_Distance} from the centre to the public point, or NULL without a centre. */
    static String distance(boolean withCentre) {
        return withCentre ? "ST_Distance(ul.public_point, " + CENTRE + ")" : "CAST(NULL AS float8)";
    }

    /**
     * Rank of the distance bucket of {@code distanceSql} (same bounds as {@link DistanceBucket}).
     */
    static String bucketRank(String distanceSql) {
        StringBuilder sql = new StringBuilder("CASE");
        DistanceBucket[] buckets = DistanceBucket.values();
        for (int index = 0; index < buckets.length - 1; index++) {
            sql.append(" WHEN ")
                    .append(distanceSql)
                    .append(" < ")
                    .append((long) (buckets[index].upperKm() * 1000))
                    .append(" THEN ")
                    .append(index);
        }
        return sql.append(" ELSE ").append(buckets.length - 1).append(" END").toString();
    }

    /** Adds the centre parameters. */
    static void centre(SearchCentre centre, Map<String, Object> params) {
        params.put("centreLat", centre.lat());
        params.put("centreLng", centre.lng());
    }
}
