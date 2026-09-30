package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.search.domain.GeoScope;
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
 * Public binder search (ADR 0012): full text on {@code binder.search_vector} (name A, description
 * B) plus an accent-insensitive name substring, restricted to effectively public binders holding at
 * least one public item ({@link PublicVisibilityRules}); with a search centre, to binders whose
 * owner is on the map within the radius (public point only).
 */
@Repository
public class BinderSearchRepository {

    private static final String TSQUERY = "websearch_to_tsquery('simple', unaccent_immutable(:q))";

    private final JdbcClient jdbc;

    public BinderSearchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Ids of matching binders, best text match first, then closest, then by name. */
    public List<UUID> search(
            String query, @Nullable String game, GeoScope scope, int limit, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        String normalised = CatalogText.normalise(query);
        String escaped = CatalogText.escapeLike(normalised);
        params.put("q", query.trim());
        params.put("contains", "%" + escaped + "%");
        params.put("prefix", escaped + "%");
        params.put("limit", limit);
        StringBuilder sql =
                new StringBuilder("SELECT bn.id FROM binder bn")
                        .append(PublicVisibilityRules.ownerJoins("bn.owner_id"));
        if (scope.centre() != null) {
            sql.append(" JOIN user_location ul ON ul.user_id = bn.owner_id");
        }
        sql.append(" WHERE ")
                .append(PublicVisibilityRules.binderEffectivelyPublic("bn"))
                .append(" AND (bn.search_vector @@ ")
                .append(TSQUERY)
                .append(" OR lower(unaccent_immutable(bn.name)) LIKE :contains ESCAPE '\\')")
                .append(" AND EXISTS (SELECT 1")
                .append(DiscoverySql.ITEM_JOINS)
                .append(" WHERE i.binder_id = bn.id AND ")
                .append(DiscoverySql.LISTED);
        if (game != null) {
            sql.append(" AND g.slug = :game");
            params.put("game", game);
        }
        sql.append(")");
        if (scope.centre() != null) {
            DiscoverySql.centre(scope.centre(), params);
            sql.append(" AND ul.public_point IS NOT NULL AND COALESCE(ps.discoverable, false)")
                    .append(" AND ST_DWithin(ul.public_point, ")
                    .append(DiscoverySql.CENTRE)
                    .append(", :radiusM)");
            params.put("radiusM", scope.radiusMetres());
        }
        sql.append(" ORDER BY CASE WHEN lower(unaccent_immutable(bn.name)) LIKE :prefix")
                .append(" ESCAPE '\\' THEN 0 ELSE 1 END, ts_rank_cd(bn.search_vector, ")
                .append(TSQUERY)
                .append(") DESC, ")
                .append(DiscoverySql.distance(scope.centre() != null))
                .append(" NULLS LAST, bn.name, bn.id LIMIT :limit");
        JdbcClient.StatementSpec statement = jdbc.sql(sql.toString());
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement.query(UUID.class).list();
    }

    /** Effectively public binders (with a public item) whose name starts with or contains text. */
    public List<BinderName> suggest(String query, int limit, Instant now) {
        String normalised = CatalogText.normalise(query);
        String escaped = CatalogText.escapeLike(normalised);
        return jdbc.sql(
                        "SELECT bn.id, bn.name, bn.owner_id FROM binder bn"
                                + PublicVisibilityRules.ownerJoins("bn.owner_id")
                                + " WHERE "
                                + PublicVisibilityRules.binderEffectivelyPublic("bn")
                                + " AND lower(unaccent_immutable(bn.name)) LIKE :contains ESCAPE"
                                + " '\\' AND EXISTS (SELECT 1"
                                + DiscoverySql.ITEM_JOINS
                                + " WHERE i.binder_id = bn.id AND "
                                + DiscoverySql.LISTED
                                + ") ORDER BY CASE WHEN lower(unaccent_immutable(bn.name)) LIKE"
                                + " :prefix ESCAPE '\\' THEN 0 ELSE 1 END, bn.name, bn.id"
                                + " LIMIT :limit")
                .param("now", Timestamp.from(now))
                .param("contains", "%" + escaped + "%")
                .param("prefix", escaped + "%")
                .param("limit", limit)
                .query(
                        (rs, rowNum) ->
                                new BinderName(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("name"),
                                        rs.getObject("owner_id", UUID.class)))
                .list();
    }

    /**
     * A binder found by name.
     *
     * @param id binder
     * @param name name
     * @param ownerId owner
     */
    public record BinderName(UUID id, String name, UUID ownerId) {}
}
