package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.search.domain.FeedCursor;
import com.orenjitrade.api.search.domain.FeedPostKind;
import com.orenjitrade.api.search.domain.ItemFilter;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The SQL of Home's feed ({@code GET /api/v1/feed}, stage R7 of the phone redesign; owner prompt of
 * 2026-10-19, section 5): what became public in one platform region, for one game, since the start
 * of the window, newest first, as one keyset-paged list of posts of three kinds:
 *
 * <ul>
 *   <li>{@code NEW_CARDS}: one collector's public, fresh (ACTIVE or AGING) cards that became public
 *       within the same hour ({@code inventory_item.listing_changed_at}, the time the materialised
 *       {@code publicly_listed} flipped to true); the cards filed in a deck core are left out, the
 *       deck core post covers them (as {@code excludeDeckCoreItems} does for card holders);
 *   <li>{@code WANTED}: the wishes of collectors who show their wishlist, from the time they were
 *       made;
 *   <li>{@code DECK_CORE}: public, unsold deck cores, from the later of the time the binder became
 *       public and the time it became a deck core ({@code binder.core_since}, V133).
 * </ul>
 *
 * Only discoverable collectors located in the region ({@link DiscoverySql#DISCOVERABLE}, {@link
 * DiscoverySql#IN_REGION}), never the viewer, and never a collector in a block relation with the
 * viewer in either direction ({@link DiscoverySql#notBlocked}): all in the SQL, before the limit.
 * The live public rules decide ({@link DiscoverySql#LISTED}, {@link
 * PublicVisibilityRules#binderEffectivelyPublic}); the materialised flag only dates a post. No
 * place beyond the declared country and subdivision exists here (ADR 0017).
 *
 * <p>A new-card post is dated by its newest card, a date that moves when a card joins its hour. The
 * pages after the first count only the cards listed until the first page was read ({@link
 * Scope#asOf}), so a card listed in between cannot lift a post not seen yet above the cursor and
 * out of every page (R7 review F2); the post shows its new card after a refresh, at the top.
 */
@Repository
public class FeedRepository {

    /** The hour of a card (whole hours since the epoch): {@code FeedRules.hourOf}. */
    static final String HOUR = "floor(extract(epoch FROM i.listing_changed_at) / 3600)::bigint";

    /** When a deck core became public as a deck core. */
    static final String CORE_AT =
            "GREATEST(COALESCE(bn.listing_changed_at, bn.created_at),"
                    + " COALESCE(bn.core_since, bn.created_at))";

    private final JdbcClient jdbc;

    public FeedRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The FROM and WHERE of the cards that make new-card posts (aliases of {@link
     * DiscoverySql#ITEM_JOINS}); the game when {@code withGame}; only the cards listed until {@code
     * :asOf} when {@code asOf} (the pages after the first).
     */
    private static String cardsFrom(boolean withGame, boolean asOf, boolean signedIn) {
        return DiscoverySql.ITEM_JOINS
                + PublicVisibilityRules.ownerJoins("i.owner_id")
                + DiscoverySql.locationJoins("i.owner_id")
                + " WHERE "
                + DiscoverySql.LISTED
                + " AND "
                + ItemFilter.DISCOVERABLE
                + " AND "
                + DiscoverySql.DISCOVERABLE
                + " AND "
                + DiscoverySql.IN_REGION
                + " AND i.publicly_listed AND i.listing_changed_at > :since"
                + (asOf ? " AND i.listing_changed_at <= :asOf" : "")
                + " AND (i.binder_id IS NULL OR NOT b.sells_as_core)"
                + (withGame ? " AND g.slug = :game" : "")
                + notViewer("i.owner_id", signedIn);
    }

    /** The FROM and WHERE of the public wishes. */
    private static String wishesFrom(boolean withGame, boolean signedIn) {
        return " FROM wishlist_item w"
                + " JOIN card wc ON wc.id = w.card_id"
                + " JOIN game wg ON wg.id = wc.game_id"
                + PublicVisibilityRules.ownerJoins("w.owner_id")
                + DiscoverySql.locationJoins("w.owner_id")
                + " WHERE wg.status = 'ACTIVE' AND COALESCE(ps.wishlist_visible, false) AND "
                + DiscoverySql.DISCOVERABLE
                + " AND "
                + DiscoverySql.IN_REGION
                + " AND w.created_at > :since"
                + (withGame ? " AND wg.slug = :game" : "")
                + notViewer("w.owner_id", signedIn);
    }

    /**
     * The FROM and WHERE of the public, unsold deck cores; of the game when {@code withGame}, as
     * Search lists them (a binder that also holds another game's card, or whose cover is one, is no
     * deck core of the game: {@link RegionBinderRepository#OF_GAME}).
     */
    private static String coresFrom(boolean withGame, boolean signedIn) {
        return " FROM binder bn"
                + PublicVisibilityRules.ownerJoins("bn.owner_id")
                + DiscoverySql.locationJoins("bn.owner_id")
                + " WHERE "
                + DiscoverySql.DISCOVERABLE
                + " AND "
                + PublicVisibilityRules.binderEffectivelyPublic("bn")
                + " AND bn.sells_as_core AND bn.publicly_listed AND "
                + DiscoverySql.IN_REGION
                + " AND "
                + CORE_AT
                + " > :since"
                + (withGame ? RegionBinderRepository.OF_GAME : "")
                + notViewer("bn.owner_id", signedIn);
    }

    /**
     * " AND not the viewer, and no block in either direction with them" for a signed-in viewer
     * ({@code :viewer}); nothing for a signed-out visitor (stage R15: guests read Home), who has
     * neither posts of their own nor blocks.
     */
    private static String notViewer(String ownerColumn, boolean signedIn) {
        return signedIn
                ? " AND " + ownerColumn + " <> :viewer" + DiscoverySql.notBlocked(ownerColumn)
                : "";
    }

    /**
     * Up to {@code limit} posts of {@code kinds}, newest first ({@code at} then {@code id}, both
     * descending), after {@code after} when given.
     */
    public List<PostRef> page(
            Scope scope, Set<FeedPostKind> kinds, @Nullable FeedCursor after, int limit) {
        Map<String, Object> params = scope.params();
        params.put("limit", limit);
        List<String> branches = new ArrayList<>();
        StringBuilder sql = new StringBuilder();
        if (kinds.contains(FeedPostKind.NEW_CARDS)) {
            sql.append("WITH card_groups AS (SELECT i.owner_id, ")
                    .append(HOUR)
                    .append(" AS hour, max(i.listing_changed_at) AS at")
                    .append(cardsFrom(true, scope.asOf() != null, scope.signedIn()))
                    .append(" GROUP BY i.owner_id, ")
                    .append(HOUR)
                    .append(") ");
            branches.add(
                    "SELECT 'NEW_CARDS' AS kind, md5('NEW_CARDS:' || owner_id::text || ':' ||"
                            + " hour::text)::uuid AS id, at, owner_id, hour FROM card_groups");
        }
        if (kinds.contains(FeedPostKind.WANTED)) {
            branches.add(
                    "SELECT 'WANTED' AS kind, w.id, w.created_at AS at, w.owner_id,"
                            + " NULL::bigint AS hour"
                            + wishesFrom(true, scope.signedIn()));
        }
        if (kinds.contains(FeedPostKind.DECK_CORE)) {
            branches.add(
                    "SELECT 'DECK_CORE' AS kind, bn.id, "
                            + CORE_AT
                            + " AS at, bn.owner_id, NULL::bigint AS hour"
                            + coresFrom(true, scope.signedIn()));
        }
        if (branches.isEmpty()) {
            return List.of();
        }
        sql.append("SELECT kind, id, at, owner_id, hour FROM (")
                .append(String.join(" UNION ALL ", branches))
                .append(") posts");
        if (after != null) {
            sql.append(" WHERE (at, id) < (:afterAt, :afterId)");
            params.put("afterAt", Timestamp.from(after.at()));
            params.put("afterId", after.id());
        }
        sql.append(" ORDER BY at DESC, id DESC LIMIT :limit");
        return statement(sql.toString(), params)
                .query(
                        (rs, rowNum) -> {
                            long hour = rs.getLong("hour");
                            return new PostRef(
                                    FeedPostKind.valueOf(rs.getString("kind")),
                                    rs.getObject("id", UUID.class),
                                    rs.getTimestamp("at").toInstant(),
                                    rs.getObject("owner_id", UUID.class),
                                    rs.wasNull() ? null : hour);
                        })
                .list();
    }

    /**
     * Whether any post of any kind exists in the window: of {@code scope}'s game, or of any game
     * when {@code anyGame} (the empty state says which is quiet: the game or the whole region).
     */
    public boolean any(Scope scope, boolean anyGame) {
        boolean withGame = !anyGame;
        String sql =
                "SELECT EXISTS (SELECT 1"
                        + cardsFrom(withGame, false, scope.signedIn())
                        + ") OR EXISTS (SELECT 1"
                        + wishesFrom(withGame, scope.signedIn())
                        + ") OR EXISTS (SELECT 1"
                        + coresFrom(withGame, scope.signedIn())
                        + ")";
        Map<String, Object> params = scope.params();
        if (anyGame) {
            params.remove("game");
        }
        return Boolean.TRUE.equals(statement(sql, params).query(Boolean.class).single());
    }

    /**
     * The cards of the new-card posts {@code groups}: per group, its number of cards and the ids of
     * the newest {@code previews} of them, newest first. The same rules as {@link #page}, so the
     * number is the number of cards the post stands for.
     */
    public Map<GroupKey, CardGroup> cardGroups(
            Scope scope, Collection<GroupKey> groups, int previews) {
        if (groups.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> params = scope.params();
        Set<UUID> owners = new LinkedHashSet<>();
        Set<Long> hours = new LinkedHashSet<>();
        Set<String> keys = new LinkedHashSet<>();
        for (GroupKey group : groups) {
            owners.add(group.ownerId());
            hours.add(group.hour());
            keys.add(group.ownerId() + ":" + group.hour());
        }
        params.put("owners", owners);
        params.put("hours", hours);
        params.put("keys", keys);
        params.put("previews", previews);
        String sql =
                "SELECT item_id, owner_id, hour, total FROM (SELECT i.id AS item_id, i.owner_id, "
                        + HOUR
                        + " AS hour, count(*) OVER (PARTITION BY i.owner_id, "
                        + HOUR
                        + ") AS total, row_number() OVER (PARTITION BY i.owner_id, "
                        + HOUR
                        + " ORDER BY i.listing_changed_at DESC, i.id DESC) AS rn"
                        + cardsFrom(true, scope.asOf() != null, scope.signedIn())
                        + " AND i.owner_id IN (:owners) AND "
                        + HOUR
                        + " IN (:hours)) grouped"
                        + " WHERE rn <= :previews AND (owner_id::text || ':' || hour::text) IN"
                        + " (:keys) ORDER BY owner_id, hour, rn";
        Map<GroupKey, CardGroup> result = new LinkedHashMap<>();
        statement(sql, params)
                .query(
                        rs -> {
                            GroupKey key =
                                    new GroupKey(
                                            rs.getObject("owner_id", UUID.class),
                                            rs.getLong("hour"));
                            long total = rs.getLong("total");
                            CardGroup group =
                                    result.computeIfAbsent(
                                            key,
                                            ignored -> new CardGroup(total, new ArrayList<>()));
                            group.itemIds().add(rs.getObject("item_id", UUID.class));
                        });
        return result;
    }

    private JdbcClient.StatementSpec statement(String sql, Map<String, Object> params) {
        JdbcClient.StatementSpec statement = jdbc.sql(sql);
        for (Map.Entry<String, Object> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement;
    }

    /**
     * What one page of the feed is read for.
     *
     * @param region platform region code
     * @param game game slug
     * @param viewerId the signed-in viewer (left out, and so is everyone in a block with them);
     *     {@code null} for a signed-out visitor (stage R15)
     * @param since the start of the window (exclusive)
     * @param now the time of the public rules
     * @param asOf on the pages after the first, the time the first page was read ({@link
     *     FeedCursor#asOf}): new-card posts count only the cards listed until then; {@code null} on
     *     the first page
     */
    public record Scope(
            String region,
            String game,
            @Nullable UUID viewerId,
            Instant since,
            Instant now,
            @Nullable Instant asOf) {

        Map<String, Object> params() {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("now", Timestamp.from(now));
            if (asOf != null) {
                params.put("asOf", Timestamp.from(asOf));
            }
            params.put("since", Timestamp.from(since));
            params.put("region", region);
            params.put("game", game);
            if (viewerId != null) {
                params.put("viewer", viewerId);
            }
            return params;
        }

        /** Whether a member reads the feed (a signed-out visitor has no posts and no blocks). */
        boolean signedIn() {
            return viewerId != null;
        }
    }

    /**
     * A post of a page.
     *
     * @param kind kind
     * @param id stable id: the wish or the binder, or {@code FeedRules.cardsPostId} of the group
     * @param at when it became public (the newest card of a group, of those listed until {@link
     *     Scope#asOf})
     * @param ownerId the collector
     * @param hour the hour of a new-card post, {@code null} for the other kinds
     */
    public record PostRef(
            FeedPostKind kind, UUID id, Instant at, UUID ownerId, @Nullable Long hour) {}

    /**
     * A new-card post: one collector, one hour.
     *
     * @param ownerId collector
     * @param hour {@code FeedRules.hourOf}
     */
    public record GroupKey(UUID ownerId, long hour) {}

    /**
     * The cards of a new-card post.
     *
     * @param total how many cards the post stands for
     * @param itemIds the newest of them, newest first
     */
    public record CardGroup(long total, List<UUID> itemIds) {}
}
