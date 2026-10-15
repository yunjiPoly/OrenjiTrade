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
 * The map's binder queries (ADR 0017): effectively public binders holding at least one public item,
 * or sold as a deck core, which needs no cards (stage R3) ({@link PublicVisibilityRules}), whose
 * owner is discoverable (opted in, ACTIVE account, profile not PRIVATE, listings not paused) with a
 * location, counted per subdivision of a platform region or listed for one subdivision or the whole
 * region. A signed-in viewer never sees binders of collectors blocked with them in either
 * direction. No coordinates exist: the subdivision is the collector's own declaration.
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
                    + " AND "
                    + DiscoverySql.binderShown("bn");

    private static final String NOT_BLOCKED = DiscoverySql.notBlocked("bn.owner_id");

    private final JdbcClient jdbc;

    public RegionBinderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Public binders per subdivision of {@code region}, with the deck cores among them
     * (subdivisions without any are absent).
     */
    public Map<String, Counts> countsBySubdivision(
            String region, @Nullable UUID viewerId, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("region", region);
        StringBuilder sql =
                new StringBuilder(
                                "SELECT ul.subdivision_code, count(*) AS binders, count(*) FILTER"
                                        + " (WHERE bn.sells_as_core) AS cores")
                        .append(FROM)
                        .append(" AND ")
                        .append(DiscoverySql.IN_REGION);
        if (viewerId != null) {
            sql.append(NOT_BLOCKED);
            params.put("viewer", viewerId);
        }
        sql.append(" GROUP BY ul.subdivision_code ORDER BY ul.subdivision_code");
        Map<String, Counts> counts = new LinkedHashMap<>();
        statement(sql.toString(), params)
                .query(
                        rs -> {
                            counts.put(
                                    rs.getString("subdivision_code"),
                                    new Counts(rs.getLong("binders"), rs.getLong("cores")));
                        });
        return counts;
    }

    /**
     * Up to {@code limit} public binders of collectors located in {@code subdivisionCode} (or
     * anywhere in {@code region} when it is {@code null}), most recently updated first, after
     * {@code after} (keyset cursor on the binder's update time).
     *
     * @param deckCore {@code true} deck cores only, {@code false} other binders only, {@code null}
     *     both
     * @param text matches the binder's name and description, its owner's handle and a deck core's
     *     card names ({@link DiscoverySql#binderText}); {@code null} for every binder
     */
    public List<BinderRef> binders(
            String region,
            @Nullable String subdivisionCode,
            @Nullable UUID viewerId,
            @Nullable Boolean deckCore,
            @Nullable String text,
            @Nullable TimeCursor after,
            int limit,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("limit", limit);
        StringBuilder sql = new StringBuilder("SELECT bn.id, bn.updated_at").append(FROM);
        if (subdivisionCode != null) {
            sql.append(" AND ul.subdivision_code = :subdivision");
            params.put("subdivision", subdivisionCode);
        } else {
            sql.append(" AND ").append(DiscoverySql.IN_REGION);
            params.put("region", region);
        }
        if (deckCore != null) {
            sql.append(" AND bn.sells_as_core = :deckCore");
            params.put("deckCore", deckCore);
        }
        if (text != null) {
            sql.append(" AND ").append(DiscoverySql.binderText("bn"));
            DiscoverySql.binderTextParams(text, params);
        }
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

    /**
     * Up to {@code limit} public deck cores of discoverable collectors of {@code region} that hold
     * a public card of {@code cardId} (any printing), most recently updated first: "Also in a deck
     * core" on the card page (stage R5). The viewer's own and those of collectors blocked with them
     * are left out.
     */
    public List<UUID> deckCoresWithCard(
            UUID cardId, String region, @Nullable UUID viewerId, int limit, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("region", region);
        params.put("cardId", cardId);
        params.put("limit", limit);
        StringBuilder sql =
                new StringBuilder("SELECT bn.id")
                        .append(FROM)
                        .append(" AND ")
                        .append(DiscoverySql.IN_REGION)
                        .append(" AND bn.sells_as_core AND EXISTS (SELECT 1")
                        .append(DiscoverySql.ITEM_JOINS)
                        .append(" WHERE i.binder_id = bn.id AND ")
                        .append(DiscoverySql.LISTED)
                        .append(" AND c.id = :cardId)");
        if (viewerId != null) {
            sql.append(" AND bn.owner_id <> :viewer").append(NOT_BLOCKED);
            params.put("viewer", viewerId);
        }
        sql.append(" ORDER BY bn.updated_at DESC, bn.id DESC LIMIT :limit");
        return statement(sql.toString(), params).query(UUID.class).list();
    }

    private JdbcClient.StatementSpec statement(String sql, Map<String, Object> params) {
        JdbcClient.StatementSpec statement = jdbc.sql(sql);
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement;
    }

    /**
     * Public binders of one subdivision.
     *
     * @param binders every public binder (deck cores included)
     * @param deckCores the deck cores among them
     */
    public record Counts(long binders, long deckCores) {}

    /**
     * A binder of a state list and its position.
     *
     * @param id binder
     * @param updatedAt last update (the list order and cursor)
     */
    public record BinderRef(UUID id, Instant updatedAt) {}
}
