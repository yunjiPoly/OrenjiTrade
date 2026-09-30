package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.search.domain.GeoScope;
import com.orenjitrade.api.search.domain.HolderSort;
import com.orenjitrade.api.search.domain.ItemFilter;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * "Who near me has this card" (Phase 4 contract, {@code GET /search/card-holders}): effectively
 * public, discoverable (ACTIVE or AGING) items of collectors on the map, within the radius of the
 * snapped centre, filtered and sorted in SQL, one page at a time. Distances use the public point
 * only and never leave the server.
 */
@Repository
public class CardHolderRepository {

    private final JdbcClient jdbc;

    public CardHolderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** One page of matching items (ids and owners in order) and the total count. */
    public HolderPage page(
            ItemFilter filter,
            GeoScope scope,
            HolderSort sort,
            @Nullable UUID excludedOwnerId,
            int page,
            int size,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        StringBuilder from =
                new StringBuilder(DiscoverySql.ITEM_JOINS)
                        .append(PublicVisibilityRules.ownerJoins("i.owner_id"))
                        .append(" JOIN user_location ul ON ul.user_id = i.owner_id")
                        .append(" WHERE ")
                        .append(DiscoverySql.LISTED)
                        .append(" AND ")
                        .append(ItemFilter.DISCOVERABLE)
                        .append(" AND ul.public_point IS NOT NULL AND COALESCE(ps.discoverable,")
                        .append(" false)");
        if (excludedOwnerId != null) {
            from.append(" AND i.owner_id <> :excludedOwnerId");
            params.put("excludedOwnerId", excludedOwnerId);
        }
        if (scope.centre() != null) {
            DiscoverySql.centre(scope.centre(), params);
            from.append(" AND ST_DWithin(ul.public_point, ")
                    .append(DiscoverySql.CENTRE)
                    .append(", :radiusM)");
            params.put("radiusM", scope.radiusMetres());
        }
        from.append(filter.sql(params));

        long total = statement("SELECT count(*)" + from, params).query(Long.class).single();
        if (total == 0) {
            return new HolderPage(List.of(), 0);
        }
        String distance = DiscoverySql.distance(scope.centre() != null);
        String order =
                switch (sort) {
                    case DISTANCE ->
                            " ORDER BY distance_m NULLS LAST, "
                                    + DiscoverySql.FRESHNESS_RANK
                                    + ", i.asking_price NULLS LAST, i.id";
                    case PRICE ->
                            " ORDER BY i.asking_price NULLS LAST, distance_m NULLS LAST, i.id";
                    case FRESHNESS ->
                            " ORDER BY "
                                    + DiscoverySql.FRESHNESS_RANK
                                    + ", i.confirmed_at DESC, distance_m NULLS LAST, i.id";
                };
        Map<String, Object> pageParams = new LinkedHashMap<>(params);
        pageParams.put("limit", size);
        pageParams.put("offset", (long) page * size);
        List<Holder> holders =
                statement(
                                "SELECT i.id AS item_id, i.owner_id, "
                                        + distance
                                        + " AS distance_m"
                                        + from
                                        + order
                                        + " LIMIT :limit OFFSET :offset",
                                pageParams)
                        .query(
                                (rs, rowNum) ->
                                        new Holder(
                                                rs.getObject("item_id", UUID.class),
                                                rs.getObject("owner_id", UUID.class)))
                        .list();
        return new HolderPage(holders, total);
    }

    private JdbcClient.StatementSpec statement(String sql, Map<String, Object> params) {
        JdbcClient.StatementSpec statement = jdbc.sql(sql);
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement;
    }

    /**
     * An item and its owner.
     *
     * @param itemId item
     * @param ownerId owner
     */
    public record Holder(UUID itemId, UUID ownerId) {}

    /**
     * A page of holders.
     *
     * @param holders items in order
     * @param total matching items
     */
    public record HolderPage(List<Holder> holders, long total) {}
}
