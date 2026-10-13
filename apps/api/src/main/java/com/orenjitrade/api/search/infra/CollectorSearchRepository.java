package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.profiles.domain.MessagingPermission;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import com.orenjitrade.api.search.domain.DiscoveryCriteria;
import com.orenjitrade.api.search.domain.DiscoveryPage;
import com.orenjitrade.api.search.domain.ItemFilter;
import com.orenjitrade.api.search.domain.MarkerRow;
import com.orenjitrade.api.search.domain.MatchingItem;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Collector discovery queries (ADR 0017): discoverable collectors (opted in, ACTIVE account,
 * profile not PRIVATE) with a location in the requested platform region, joined to their country
 * and subdivision, with per-collector statistics over the effectively public inventory and EXISTS
 * filters on discoverable items. Reads the tables of the location, profiles, users, binders and
 * inventory modules read-only; never selects the city.
 */
@Repository
public class CollectorSearchRepository {

    private static final String SELECT =
            """
            SELECT u.id, u.handle,
                   COALESCE(pr.display_name, NULLIF(u.display_name, ''), u.handle) AS display_name,
                   pr.avatar_key, u.last_active_at,
                   ps.show_online_status, ps.show_last_active,
                   ps.profile_visibility, ps.messaging_permission, ps.search_discoverable,
                   %s,
                   COALESCE(pr.games, '{}') AS profile_games,
                   ARRAY(SELECT t.slug FROM profile_tag pt JOIN tag t ON t.id = pt.tag_id
                          WHERE pt.profile_user_id = u.id AND t.status = 'ACTIVE'
                          ORDER BY t.slug) AS tag_slugs,
                   st.public_item_count, st.public_binder_count, st.best_freshness, st.item_games,
                   count(*) OVER () AS total
              FROM user_account u
              JOIN privacy_settings ps ON ps.user_id = u.id
              %s
              LEFT JOIN profile pr ON pr.user_id = u.id
              CROSS JOIN LATERAL (
                  SELECT count(*) AS public_item_count,
                         count(DISTINCT i.binder_id) AS public_binder_count,
                         min(%s) AS best_freshness,
                         array_agg(DISTINCT g.slug) AS item_games
                  %s
                   WHERE i.owner_id = u.id AND %s
              ) st
            """;

    private final JdbcClient jdbc;

    public CollectorSearchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Collectors of {@code criteria.region()} matching {@code criteria}, ranked (freshness, handle;
     * the rating is applied by the caller), at most {@code criteria.limit() + 1} rows, with the
     * total count. Collectors whose public listings are all STALE never appear; collectors without
     * public listings do.
     */
    public DiscoveryPage discover(DiscoveryCriteria criteria, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("region", criteria.region());
        StringBuilder where =
                new StringBuilder(" WHERE ")
                        .append(DiscoverySql.DISCOVERABLE)
                        .append(" AND ")
                        .append(DiscoverySql.IN_REGION);
        where.append(" AND (st.best_freshness IS NULL OR st.best_freshness < 2)");
        if (criteria.freshness() != null) {
            where.append(" AND st.best_freshness = :freshnessRank");
            params.put("freshnessRank", criteria.freshness() == FreshnessState.ACTIVE ? 0 : 1);
        }
        if (criteria.listsMatchingItems()) {
            where.append(" AND EXISTS (SELECT 1")
                    .append(DiscoverySql.ITEM_JOINS)
                    .append(" WHERE i.owner_id = u.id AND ")
                    .append(DiscoverySql.LISTED)
                    .append(" AND ")
                    .append(ItemFilter.DISCOVERABLE)
                    .append(criteria.itemFilter().sql(params))
                    .append(")");
        } else if (criteria.game() != null) {
            where.append(" AND (:game = ANY(COALESCE(pr.games, '{}')) OR EXISTS (SELECT 1")
                    .append(DiscoverySql.ITEM_JOINS)
                    .append(" WHERE i.owner_id = u.id AND ")
                    .append(DiscoverySql.LISTED)
                    .append(" AND ")
                    .append(ItemFilter.DISCOVERABLE)
                    .append(" AND g.slug = :game))");
            params.put("game", criteria.game());
        }
        if (!criteria.tags().isEmpty()) {
            where.append(
                    " AND EXISTS (SELECT 1 FROM profile_tag pt JOIN tag t ON t.id = pt.tag_id"
                            + " WHERE pt.profile_user_id = u.id AND t.status = 'ACTIVE'"
                            + " AND t.slug IN (:tags))");
            params.put("tags", criteria.tags());
        }
        if (criteria.query() != null) {
            where.append(" AND ").append(nameMatch(criteria.query(), params));
        }
        String order = " ORDER BY COALESCE(st.best_freshness, 2), u.handle LIMIT :limit";
        params.put("limit", criteria.limit() + 1);
        List<Row> rows = query(select() + where + order, params);
        long total = rows.isEmpty() ? 0 : rows.get(0).total();
        List<MarkerRow> markers = rows.stream().map(Row::marker).toList();
        return new DiscoveryPage(markers, total);
    }

    /**
     * The markers of the given collectors (in no particular order) while they are discoverable with
     * a location, whatever their region and freshness.
     */
    public List<MarkerRow> markersByIds(Collection<UUID> ids, Instant now) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("ids", ids);
        String sql = select() + " WHERE u.id IN (:ids) AND " + DiscoverySql.DISCOVERABLE;
        return query(sql, params).stream().map(Row::marker).toList();
    }

    /**
     * Up to {@code perCollector} discoverable (ACTIVE or AGING) public items per collector matching
     * {@code filter}, freshest and cheapest first.
     */
    public Map<UUID, List<MatchingItem>> matchingItems(
            Collection<UUID> ownerIds, ItemFilter filter, int perCollector, Instant now) {
        Map<UUID, List<MatchingItem>> result = new HashMap<>();
        if (ownerIds.isEmpty() || perCollector <= 0) {
            return result;
        }
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("ownerIds", ownerIds);
        params.put("perCollector", perCollector);
        String sql =
                "SELECT x.* FROM (SELECT i.id, i.owner_id, i.printing_id, p.printing_code,"
                        + " c.id AS card_id, c.name AS card_name, g.slug AS game, i.availability,"
                        + " i.asking_price, i.currency, i.condition, i.language, i.edition,"
                        + " i.accepts_offers, i.freshness_state, row_number() OVER (PARTITION BY"
                        + " i.owner_id ORDER BY "
                        + DiscoverySql.FRESHNESS_RANK
                        + ", i.asking_price NULLS LAST, c.normalized_name, i.id) AS rn"
                        + DiscoverySql.ITEM_JOINS
                        + PublicVisibilityRules.ownerJoins("i.owner_id")
                        + " WHERE i.owner_id IN (:ownerIds) AND "
                        + DiscoverySql.LISTED
                        + " AND "
                        + ItemFilter.DISCOVERABLE
                        + filter.sql(params)
                        + ") x WHERE x.rn <= :perCollector ORDER BY x.owner_id, x.rn";
        JdbcClient.StatementSpec statement = jdbc.sql(sql);
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        statement.query(
                rs -> {
                    UUID ownerId = rs.getObject("owner_id", UUID.class);
                    result.computeIfAbsent(ownerId, id -> new ArrayList<>())
                            .add(
                                    new MatchingItem(
                                            rs.getObject("id", UUID.class),
                                            rs.getObject("printing_id", UUID.class),
                                            rs.getString("printing_code"),
                                            rs.getObject("card_id", UUID.class),
                                            rs.getString("card_name"),
                                            rs.getString("game"),
                                            Availability.valueOf(rs.getString("availability")),
                                            rs.getBigDecimal("asking_price"),
                                            rs.getString("currency").trim(),
                                            rs.getString("condition"),
                                            rs.getString("language"),
                                            rs.getString("edition"),
                                            rs.getBoolean("accepts_offers"),
                                            FreshnessState.valueOf(
                                                    rs.getString("freshness_state"))));
                });
        return result;
    }

    /**
     * Discoverable collectors of {@code region} who allow name search, matching {@code query} by
     * handle or display name (prefix first, then trigram similarity).
     */
    public List<CollectorHit> suggest(String query, String region, int limit, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        params.put("region", region);
        String normalised = CatalogText.normalise(query);
        String escaped = CatalogText.escapeLike(normalised);
        params.put("qn", normalised);
        params.put("qContains", "%" + escaped + "%");
        params.put("qPrefix", escaped + "%");
        params.put("limit", limit);
        String display = "lower(unaccent_immutable(COALESCE(pr.display_name, u.display_name, '')))";
        String sql =
                "SELECT u.id, u.handle, COALESCE(pr.display_name, NULLIF(u.display_name, ''),"
                        + " u.handle) AS display_name, pr.avatar_key, "
                        + DiscoverySql.PLACE_COLUMNS
                        + " FROM user_account u JOIN privacy_settings ps ON ps.user_id = u.id"
                        + DiscoverySql.locationJoins("u.id")
                        + " LEFT JOIN profile pr ON pr.user_id = u.id"
                        + " WHERE "
                        + DiscoverySql.DISCOVERABLE
                        + " AND "
                        + DiscoverySql.IN_REGION
                        + " AND ps.search_discoverable AND (u.handle LIKE :qContains ESCAPE '\\'"
                        + " OR "
                        + display
                        + " LIKE :qContains ESCAPE '\\' OR u.handle % :qn OR "
                        + display
                        + " % :qn)"
                        + " ORDER BY CASE WHEN u.handle LIKE :qPrefix ESCAPE '\\' OR "
                        + display
                        + " LIKE :qPrefix ESCAPE '\\' THEN 0 ELSE 1 END,"
                        + " greatest(similarity(u.handle, :qn), similarity("
                        + display
                        + ", :qn)) DESC, u.handle LIMIT :limit";
        JdbcClient.StatementSpec statement = jdbc.sql(sql);
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement
                .query(
                        (rs, rowNum) ->
                                new CollectorHit(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("handle"),
                                        rs.getString("display_name"),
                                        rs.getString("avatar_key"),
                                        place(rs)))
                .list();
    }

    /**
     * A collector found by name.
     *
     * @param id account id
     * @param handle handle
     * @param displayName display name
     * @param avatarKey avatar storage key
     * @param place state/province and country
     */
    public record CollectorHit(
            UUID id,
            String handle,
            String displayName,
            @Nullable String avatarKey,
            PublicPlace place) {}

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private static String select() {
        return String.format(
                SELECT,
                DiscoverySql.PLACE_COLUMNS,
                DiscoverySql.locationJoins("u.id"),
                DiscoverySql.FRESHNESS_RANK,
                DiscoverySql.ITEM_JOINS,
                DiscoverySql.LISTED);
    }

    /** Handle, display name or active tag text of a collector who allows name search. */
    private static String nameMatch(String query, Map<String, Object> params) {
        String normalised = CatalogText.normalise(query);
        String escaped = CatalogText.escapeLike(normalised);
        params.put("qContains", "%" + escaped + "%");
        params.put("qSlug", "%" + CatalogText.escapeLike(normalised.replace(' ', '-')) + "%");
        String display = "lower(unaccent_immutable(COALESCE(pr.display_name, u.display_name, '')))";
        // Substring matches only (accent- and case-insensitive): trigram similarity between
        // generated handles and display names (which share prefixes) would return unrelated
        // collectors; fuzzy matching stays in the autocomplete.
        return "(ps.search_discoverable AND (u.handle LIKE :qContains ESCAPE '\\' OR "
                + display
                + " LIKE :qContains ESCAPE '\\'"
                + " OR EXISTS (SELECT 1 FROM profile_tag pt JOIN tag t ON t.id = pt.tag_id"
                + " WHERE pt.profile_user_id = u.id AND t.status = 'ACTIVE' AND"
                + " (lower(unaccent_immutable(t.label)) LIKE :qContains ESCAPE '\\'"
                + " OR t.slug LIKE :qSlug ESCAPE '\\'))))";
    }

    private List<Row> query(String sql, Map<String, Object> params) {
        JdbcClient.StatementSpec statement = jdbc.sql(sql);
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement.query(CollectorSearchRepository::map).list();
    }

    static PublicPlace place(ResultSet rs) throws SQLException {
        return new PublicPlace(
                rs.getString("region_code"),
                rs.getString("country_code"),
                rs.getString("country_name"),
                rs.getString("subdivision_code"),
                rs.getString("subdivision_name"),
                rs.getBoolean("whole_country"));
    }

    private static Row map(ResultSet rs, int rowNum) throws SQLException {
        int bestFreshness = rs.getInt("best_freshness");
        @Nullable Integer freshnessRank = rs.wasNull() ? null : bestFreshness;
        Timestamp lastActive = rs.getTimestamp("last_active_at");
        MarkerRow marker =
                new MarkerRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("handle"),
                        rs.getString("display_name"),
                        rs.getString("avatar_key"),
                        place(rs),
                        rs.getBoolean("show_online_status"),
                        rs.getBoolean("show_last_active"),
                        ProfileVisibility.valueOf(rs.getString("profile_visibility")),
                        MessagingPermission.valueOf(rs.getString("messaging_permission")),
                        rs.getBoolean("search_discoverable"),
                        lastActive == null ? null : lastActive.toInstant(),
                        strings(rs.getArray("tag_slugs")),
                        strings(rs.getArray("profile_games")),
                        strings(rs.getArray("item_games")),
                        freshnessRank,
                        rs.getInt("public_binder_count"),
                        rs.getLong("public_item_count"),
                        List.of());
        return new Row(marker, rs.getLong("total"));
    }

    private static List<String> strings(@Nullable Array array) throws SQLException {
        if (array == null) {
            return List.of();
        }
        Object[] values = (Object[]) array.getArray();
        List<String> result = new ArrayList<>();
        for (Object value : values) {
            if (value != null) {
                result.add(value.toString());
            }
        }
        return List.copyOf(result);
    }

    private record Row(MarkerRow marker, long total) {}
}
