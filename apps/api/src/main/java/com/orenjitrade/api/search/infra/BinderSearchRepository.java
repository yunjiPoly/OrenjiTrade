package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.cards.domain.CatalogText;
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
 * B) plus an accent-insensitive name substring, the owner's handle and a deck core's card names
 * (stage R3), restricted to effectively public binders holding at least one public item or sold as
 * a deck core ({@link PublicVisibilityRules}) whose owner is discoverable with a location in the
 * requested platform region (ADR 0017).
 */
@Repository
public class BinderSearchRepository {

    private final JdbcClient jdbc;

    public BinderSearchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ids of matching binders of {@code region}, best text match first, then by name. A signed-in
     * viewer's list leaves out, before the limit, the binders of collectors blocked with them.
     *
     * <p>The text matches a binder's name and description, its owner's handle and, for a deck core,
     * the names of its public cards (stage R3). A deck core shows without cards; with a {@code
     * game}, a binder (a deck core too) needs a public card of that game.
     *
     * @param deckCore {@code true} deck cores only, {@code false} other binders only, {@code null}
     *     both
     */
    public List<UUID> search(
            String query,
            @Nullable String game,
            String region,
            @Nullable UUID viewerId,
            @Nullable Boolean deckCore,
            int limit,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        DiscoverySql.binderTextParams(query, params);
        String escaped = CatalogText.escapeLike(CatalogText.normalise(query));
        params.put("prefix", escaped + "%");
        params.put("limit", limit);
        params.put("region", region);
        StringBuilder sql =
                new StringBuilder("SELECT bn.id FROM binder bn")
                        .append(PublicVisibilityRules.ownerJoins("bn.owner_id"));
        sql.append(DiscoverySql.locationJoins("bn.owner_id"))
                .append(" WHERE ")
                .append(DiscoverySql.DISCOVERABLE)
                .append(" AND ")
                .append(DiscoverySql.IN_REGION)
                .append(" AND ")
                .append(PublicVisibilityRules.binderEffectivelyPublic("bn"))
                .append(" AND ")
                .append(DiscoverySql.binderText("bn"));
        if (game != null) {
            sql.append(" AND EXISTS (SELECT 1")
                    .append(DiscoverySql.ITEM_JOINS)
                    .append(" WHERE i.binder_id = bn.id AND ")
                    .append(DiscoverySql.SHOWN)
                    .append(" AND g.slug = :game)");
            params.put("game", game);
        } else {
            sql.append(" AND ").append(DiscoverySql.binderShown("bn"));
        }
        if (deckCore != null) {
            sql.append(" AND bn.sells_as_core = :deckCore");
            params.put("deckCore", deckCore);
        }
        if (viewerId != null) {
            sql.append(DiscoverySql.notBlocked("bn.owner_id"));
            params.put("viewer", viewerId);
        }
        sql.append(" ORDER BY CASE WHEN lower(unaccent_immutable(bn.name)) LIKE :prefix")
                .append(" ESCAPE '\\' THEN 0 ELSE 1 END, ts_rank_cd(bn.search_vector, ")
                .append("websearch_to_tsquery('simple', unaccent_immutable(:q))")
                .append(") DESC, bn.name, bn.id LIMIT :limit");
        JdbcClient.StatementSpec statement = jdbc.sql(sql.toString());
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement.query(UUID.class).list();
    }

    /**
     * Effectively public binders (with a public item, or deck cores) of discoverable collectors of
     * {@code region} whose name starts with or contains the text; for a signed-in viewer, without
     * the binders of collectors blocked with them (left out before the limit).
     */
    public List<BinderName> suggest(
            String query, String region, @Nullable UUID viewerId, int limit, Instant now) {
        String normalised = CatalogText.normalise(query);
        String escaped = CatalogText.escapeLike(normalised);
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                        "SELECT bn.id, bn.name, bn.owner_id FROM binder bn"
                                + PublicVisibilityRules.ownerJoins("bn.owner_id")
                                + DiscoverySql.locationJoins("bn.owner_id")
                                + " WHERE "
                                + DiscoverySql.DISCOVERABLE
                                + " AND "
                                + DiscoverySql.IN_REGION
                                + " AND "
                                + PublicVisibilityRules.binderEffectivelyPublic("bn")
                                + " AND lower(unaccent_immutable(bn.name)) LIKE :contains ESCAPE"
                                + " '\\' AND "
                                + DiscoverySql.binderShown("bn")
                                + (viewerId == null ? "" : DiscoverySql.notBlocked("bn.owner_id"))
                                + " ORDER BY CASE WHEN lower(unaccent_immutable(bn.name)) LIKE"
                                + " :prefix ESCAPE '\\' THEN 0 ELSE 1 END, bn.name, bn.id"
                                + " LIMIT :limit");
        if (viewerId != null) {
            statement = statement.param("viewer", viewerId);
        }
        return statement
                .param("now", Timestamp.from(now))
                .param("contains", "%" + escaped + "%")
                .param("prefix", escaped + "%")
                .param("limit", limit)
                .param("region", region)
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
