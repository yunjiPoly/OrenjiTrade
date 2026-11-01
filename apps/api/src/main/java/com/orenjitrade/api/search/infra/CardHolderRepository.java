package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
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
 * "Who has this card in my region" ({@code GET /search/card-holders}): effectively public,
 * discoverable (ACTIVE or AGING) items of discoverable collectors whose country is in the requested
 * platform region (ADR 0017), filtered and sorted in SQL, one page at a time. No distance exists. A
 * signed-in viewer never sees, nor counts, the items of collectors blocked with them in either
 * direction.
 */
@Repository
public class CardHolderRepository {

    private final JdbcClient jdbc;

    public CardHolderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * One page of matching items (ids and owners in order) and the total count, as {@code viewerId}
     * sees them: without their own items and without the items of collectors in a block relation
     * with them, in either direction. Both are left out in SQL, of the count and of the page alike,
     * so the total is the number of rows the pages hold. With {@code excludeDeckCoreItems} the
     * cards filed in a deck core are left out too (stage R3).
     */
    public HolderPage page(
            ItemFilter filter,
            String region,
            HolderSort sort,
            @Nullable UUID viewerId,
            boolean excludeDeckCoreItems,
            int page,
            int size,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("region", region);
        StringBuilder from =
                new StringBuilder(DiscoverySql.ITEM_JOINS)
                        .append(PublicVisibilityRules.ownerJoins("i.owner_id"))
                        .append(DiscoverySql.locationJoins("i.owner_id"))
                        .append(" WHERE ")
                        .append(DiscoverySql.LISTED)
                        .append(" AND ")
                        .append(ItemFilter.DISCOVERABLE)
                        .append(" AND ")
                        .append(DiscoverySql.DISCOVERABLE)
                        .append(" AND ")
                        .append(DiscoverySql.IN_REGION);
        if (viewerId != null) {
            from.append(" AND i.owner_id <> :viewer").append(DiscoverySql.notBlocked("i.owner_id"));
            params.put("viewer", viewerId);
        }
        from.append(filter.sql(params));
        if (excludeDeckCoreItems) {
            // The cards of a deck core sell only with it (owner spec 2026-10-14, section 7): the
            // card page shows the core instead. Cards of a binder that is not public are not
            // listed anyway, so every deck core's cards can be left out.
            from.append(" AND (i.binder_id IS NULL OR NOT b.sells_as_core)");
        }

        long total = statement("SELECT count(*)" + from, params).query(Long.class).single();
        if (total == 0) {
            return new HolderPage(List.of(), 0);
        }
        String order =
                switch (sort) {
                    case PRICE ->
                            " ORDER BY i.asking_price NULLS LAST, "
                                    + DiscoverySql.FRESHNESS_RANK
                                    + ", i.confirmed_at DESC, i.id";
                    case FRESHNESS ->
                            " ORDER BY "
                                    + DiscoverySql.FRESHNESS_RANK
                                    + ", i.confirmed_at DESC, i.asking_price NULLS LAST, i.id";
                    case PROVINCE ->
                            " ORDER BY "
                                    + provinceTier(viewerId)
                                    + "lower(co.name), lower(sd.name), ul.subdivision_code, "
                                    + DiscoverySql.FRESHNESS_RANK
                                    + ", i.confirmed_at DESC, i.asking_price NULLS LAST, i.id";
                };
        Map<String, Object> pageParams = new LinkedHashMap<>(params);
        pageParams.put("limit", size);
        pageParams.put("offset", (long) page * size);
        List<Holder> holders =
                statement(
                                "SELECT i.id AS item_id, i.owner_id"
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

    /**
     * The first key of the province order, with its comma: the group tier of the holder ({@code
     * ProvinceOrder.tier}): 0 in the viewer's own state or province, 1 elsewhere in the viewer's
     * country, 2 anywhere else (also for a viewer without a location). Nothing for a viewer signed
     * out: every holder is in the last tier (a constant key would be read as a column number). The
     * viewer's own declared codes only, never a position.
     */
    static String provinceTier(@Nullable UUID viewerId) {
        if (viewerId == null) {
            return "";
        }
        return "CASE WHEN ul.subdivision_code = (SELECT vl.subdivision_code FROM user_location vl"
                + " WHERE vl.user_id = :viewer) THEN 0 WHEN ul.country_code = (SELECT"
                + " vl.country_code FROM user_location vl WHERE vl.user_id = :viewer) THEN 1"
                + " ELSE 2 END, ";
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
