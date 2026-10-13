package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.common.TimeCursor;
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
 * The map's binder queries (ADR 0017): effectively public binders holding at least one public item
 * ({@link PublicVisibilityRules}) whose owner is discoverable (opted in, ACTIVE account, profile
 * not PRIVATE, listings not paused) with a location, counted per subdivision of a platform region
 * or listed for one subdivision. A signed-in viewer never sees binders of collectors blocked with
 * them in either direction. No coordinates exist: the subdivision is the collector's own
 * declaration.
 */
@Repository
public class RegionBinderRepository {

    private static final String FROM =
            " FROM binder bn"
                    + PublicVisibilityRules.ownerJoins("bn.owner_id")
                    + DiscoverySql.locationJoins("bn.owner_id")
                    + " WHERE "
                    + DiscoverySql.DISCOVERABLE
                    + " AND "
                    + PublicVisibilityRules.binderEffectivelyPublic("bn")
                    + " AND EXISTS (SELECT 1"
                    + DiscoverySql.ITEM_JOINS
                    + " WHERE i.binder_id = bn.id AND "
                    + DiscoverySql.LISTED
                    + ")";

    private static final String NOT_BLOCKED =
            " AND NOT EXISTS (SELECT 1 FROM user_block ub WHERE (ub.blocker_id = :viewer AND"
                    + " ub.blocked_id = bn.owner_id) OR (ub.blocker_id = bn.owner_id AND"
                    + " ub.blocked_id = :viewer))";

    private final JdbcClient jdbc;

    public RegionBinderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Public binders per subdivision of {@code region} (subdivisions without any are absent). */
    public Map<String, Long> countsBySubdivision(
            String region, @Nullable UUID viewerId, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("region", region);
        StringBuilder sql =
                new StringBuilder("SELECT ul.subdivision_code, count(*) AS binders")
                        .append(FROM)
                        .append(" AND ")
                        .append(DiscoverySql.IN_REGION);
        if (viewerId != null) {
            sql.append(NOT_BLOCKED);
            params.put("viewer", viewerId);
        }
        sql.append(" GROUP BY ul.subdivision_code ORDER BY ul.subdivision_code");
        Map<String, Long> counts = new LinkedHashMap<>();
        statement(sql.toString(), params)
                .query(
                        rs -> {
                            counts.put(rs.getString("subdivision_code"), rs.getLong("binders"));
                        });
        return counts;
    }

    /**
     * Up to {@code limit} public binders of collectors located in {@code subdivisionCode}, most
     * recently updated first, after {@code after} (keyset cursor on the binder's update time).
     */
    public List<BinderRef> binders(
            String subdivisionCode,
            @Nullable UUID viewerId,
            @Nullable TimeCursor after,
            int limit,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("subdivision", subdivisionCode);
        params.put("limit", limit);
        StringBuilder sql =
                new StringBuilder("SELECT bn.id, bn.updated_at")
                        .append(FROM)
                        .append(" AND ul.subdivision_code = :subdivision");
        if (viewerId != null) {
            sql.append(NOT_BLOCKED);
            params.put("viewer", viewerId);
        }
        if (after != null) {
            sql.append(" AND (bn.updated_at, bn.id) < (:afterAt, :afterId)");
            params.put("afterAt", Timestamp.from(after.at()));
            params.put("afterId", after.id());
        }
        sql.append(" ORDER BY bn.updated_at DESC, bn.id DESC LIMIT :limit");
        return statement(sql.toString(), params)
                .query(
                        (rs, rowNum) ->
                                new BinderRef(
                                        rs.getObject("id", UUID.class),
                                        rs.getTimestamp("updated_at").toInstant()))
                .list();
    }

    private JdbcClient.StatementSpec statement(String sql, Map<String, Object> params) {
        JdbcClient.StatementSpec statement = jdbc.sql(sql);
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement;
    }

    /**
     * A binder of a state list and its position.
     *
     * @param id binder
     * @param updatedAt last update (the list order and cursor)
     */
    public record BinderRef(UUID id, Instant updatedAt) {}
}
