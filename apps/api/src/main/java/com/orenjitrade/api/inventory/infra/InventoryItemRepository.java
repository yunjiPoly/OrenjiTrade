package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.domain.InventoryChanges.OwnerQuery;
import com.orenjitrade.api.inventory.domain.InventoryChanges.PublicQuery;
import com.orenjitrade.api.inventory.domain.ItemRow;
import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code inventory_item} access (explicit SQL). Every read carries the live effective public
 * visibility ({@link #LISTED}); public lists filter on it and never on the materialised flag. Reads
 * join the catalog tables (card, game) and the owner's account and privacy rows read-only.
 *
 * <p>Locks (docs/database/schema.md "Locks of binders and inventory items"): the callers of the
 * writes here hold the owner lock of the collector, then binder rows are locked before item rows,
 * and item rows in ascending {@code id}. The trigger {@code trg_inventory_item_binder_count}
 * updates the binder of an item whose {@code binder_id} or {@code deleted_at} changes, so callers
 * of those writes hold the binder first ({@code InventoryService.lockForWrite}); every statement
 * here that locks several items takes them through an {@code ORDER BY id} locking clause.
 *
 * <p>Item rows are locked {@code FOR NO KEY UPDATE}, the lock an {@code UPDATE} of these columns
 * takes anyway: offers, trade lines, trades and sent wishlist alerts reference items, and the
 * key-share lock of their foreign key checks conflicts with {@code FOR UPDATE} only. A write here
 * and a transaction that inserts such references therefore never wait for each other. Only the
 * account purge ({@link #lockAllOf}) deletes item rows, and it takes them {@code FOR UPDATE}.
 */
@Repository
public class InventoryItemRepository {

    /** Joins of every item query: printing, card, set, game, binder, owner, privacy. */
    static final String FROM =
            """
             FROM inventory_item i
             JOIN card_printing p ON p.id = i.printing_id
             JOIN card c ON c.id = p.card_id
             JOIN card_set s ON s.id = p.set_id
             JOIN game g ON g.id = c.game_id
             LEFT JOIN binder b ON b.id = i.binder_id
            """
                    + PublicVisibilityRules.ownerJoins("i.owner_id");

    /** The item is effectively public right now (Phase 3 contract rule; needs {@link #FROM}). */
    public static final String LISTED =
            "(i.deleted_at IS NULL AND g.status = 'ACTIVE' AND i.freshness_state <> 'HIDDEN'"
                    + " AND (i.visibility = 'PUBLIC' OR (i.visibility = 'TEMPORARILY_PUBLIC'"
                    + " AND i.public_until > :now))"
                    + " AND (i.binder_id IS NULL OR "
                    + PublicVisibilityRules.binderListed("b")
                    + ") AND "
                    + PublicVisibilityRules.OWNER_LISTINGS_PUBLIC
                    + ")";

    /**
     * The item is a live card of an effectively public deck core (aliases of {@link #LISTED}): a
     * buyer sees it as one of the core's key cards whatever the card's own visibility, because the
     * cards of a deck core sell only together (owner spec 2026-10-14, section 7; stage R3 review).
     * It never lists the card alone: {@link #LISTED} still decides the card's own listings (who has
     * this card, public item lists and counts), so a private card filed in a deck core stays
     * private when it leaves the core, when the core is deleted, or when the switch is turned off.
     */
    public static final String IN_PUBLIC_CORE =
            "(i.deleted_at IS NULL AND g.status = 'ACTIVE' AND i.freshness_state <> 'HIDDEN'"
                    + " AND b.id IS NOT NULL AND b.sells_as_core AND "
                    + PublicVisibilityRules.binderListed("b")
                    + " AND "
                    + PublicVisibilityRules.OWNER_LISTINGS_PUBLIC
                    + ")";

    /**
     * Buyers see the item: listed on its own ({@link #LISTED}) or as a key card of a public deck
     * core ({@link #IN_PUBLIC_CORE}). For what a binder shows of its cards: key cards, games, card
     * pictures and the cards a binder search matches; never an item's own data.
     */
    public static final String SHOWN_PUBLICLY = "(" + LISTED + " OR " + IN_PUBLIC_CORE + ")";

    private static final String COLUMNS =
            """
            i.id, i.owner_id, i.binder_id, b.name AS binder_name, i.printing_id, c.id AS card_id,
            c.name AS card_name, g.slug AS game, i.quantity, i.condition, i.language, i.edition,
            i.finish, i.asking_price, i.asking_price_text, i.currency, i.availability,
            i.accepts_offers, i.notes,
            i.public_notes, i.visibility, i.public_until, i.freshness_state, i.confirmed_at,
            i.created_at, i.updated_at,
            """
                    + LISTED
                    + " AS effective_public";

    private static final String FRESHNESS_CASE =
            """
            CASE WHEN confirmed_at <= :hiddenCutoff THEN 'HIDDEN'
                 WHEN confirmed_at <= :staleCutoff THEN 'STALE'
                 WHEN confirmed_at <= :agingCutoff THEN 'AGING'
                 ELSE 'ACTIVE' END
            """;

    private final JdbcClient jdbc;

    public InventoryItemRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    public Optional<ItemRow> findOwned(UUID ownerId, UUID id, Instant now) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + " WHERE i.id = :id AND i.owner_id = :ownerId"
                                + " AND i.deleted_at IS NULL")
                .param("id", id)
                .param("ownerId", ownerId)
                .param("now", Timestamp.from(now))
                .query(InventoryItemRepository::map)
                .optional();
    }

    public List<ItemRow> findByIds(Collection<UUID> ids, Instant now) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT " + COLUMNS + FROM + " WHERE i.id IN (:ids)")
                .param("ids", ids)
                .param("now", Timestamp.from(now))
                .query(InventoryItemRepository::map)
                .list();
    }

    /**
     * The owners of the items among {@code ids}, deleted ones included (an owner never changes).
     */
    public List<UUID> ownersOf(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT DISTINCT owner_id FROM inventory_item WHERE id IN (:ids)")
                .param("ids", ids)
                .query(UUID.class)
                .list();
    }

    /**
     * Binders the live items among {@code ids} are filed in, read without a row lock: the binders
     * an item write locks before it locks the items. The caller holds the owner lock, so no other
     * write moves these items meanwhile.
     *
     * @param ownerId only this owner's items when given
     */
    public List<UUID> binderIdsOf(@Nullable UUID ownerId, Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                                "SELECT DISTINCT binder_id FROM inventory_item WHERE id IN (:ids)"
                                        + " AND binder_id IS NOT NULL AND deleted_at IS NULL"
                                        + (ownerId == null ? "" : " AND owner_id = :ownerId"))
                        .param("ids", ids);
        if (ownerId != null) {
            statement = statement.param("ownerId", ownerId);
        }
        return statement.query(UUID.class).list();
    }

    /**
     * Locks the live items among {@code ids} in ascending id order and returns them with the binder
     * they are filed in now (it cannot change while the lock is held). The id order is the second
     * line behind the owner lock, which already keeps the collector's other writes off these rows.
     * {@code FOR NO KEY UPDATE}: no item write changes the key or deletes the row, so it does not
     * conflict with the foreign key checks of rows that reference the items.
     *
     * @param ownerId only this owner's items when given
     */
    public List<LockedItem> lockAll(@Nullable UUID ownerId, Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                                "SELECT id, owner_id, binder_id FROM inventory_item"
                                        + " WHERE id IN (:ids) AND deleted_at IS NULL"
                                        + (ownerId == null ? "" : " AND owner_id = :ownerId")
                                        + " ORDER BY id FOR NO KEY UPDATE")
                        .param("ids", ids);
        if (ownerId != null) {
            statement = statement.param("ownerId", ownerId);
        }
        return statement
                .query(
                        (rs, rowNum) ->
                                new LockedItem(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("owner_id", UUID.class),
                                        rs.getObject("binder_id", UUID.class)))
                .list();
    }

    /** Locks the owner's non-deleted item row (writes that never reach a binder: photos). */
    public boolean lockOwned(UUID ownerId, UUID id) {
        return jdbc.sql(
                        "SELECT id FROM inventory_item WHERE id = :id AND owner_id = :ownerId"
                                + " AND deleted_at IS NULL FOR NO KEY UPDATE")
                .param("id", id)
                .param("ownerId", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    /** One page of the owner's items. */
    public Page ownerPage(UUID ownerId, OwnerQuery query, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("ownerId", ownerId);
        params.put("now", Timestamp.from(now));
        StringBuilder where =
                new StringBuilder(" WHERE i.owner_id = :ownerId AND i.deleted_at IS NULL");
        textFilter(query.query(), where, params);
        if (query.game() != null) {
            where.append(" AND g.slug = :game");
            params.put("game", query.game());
        }
        if (query.binderId() != null) {
            where.append(" AND i.binder_id = :binderId");
            params.put("binderId", query.binderId());
        }
        if (query.unfiled()) {
            where.append(" AND i.binder_id IS NULL");
        }
        if (query.visibility() != null) {
            where.append(" AND i.visibility = :visibility");
            params.put("visibility", query.visibility().name());
        }
        if (query.markedPublic()) {
            where.append(" AND i.visibility IN ('PUBLIC', 'TEMPORARILY_PUBLIC')");
        }
        if (query.availability() != null) {
            where.append(" AND i.availability = :availability");
            params.put("availability", query.availability().name());
        }
        if (query.condition() != null) {
            where.append(" AND i.condition = :condition");
            params.put("condition", query.condition());
        }
        if (query.freshness() != null) {
            where.append(" AND i.freshness_state = :freshness");
            params.put("freshness", query.freshness().name());
        }
        String direction = query.descending() ? " DESC" : " ASC";
        String order =
                switch (query.sort()) {
                    case UPDATED -> " ORDER BY i.updated_at" + direction + ", i.id";
                    case NAME ->
                            " ORDER BY c.normalized_name"
                                    + direction
                                    + ", s.code, p.collector_number, i.id";
                    // A price that is no plain amount ("85% TCG") has no asking_price: it sorts
                    // after every amount, before the cards without any price (stage R2).
                    case PRICE ->
                            " ORDER BY i.asking_price"
                                    + direction
                                    + " NULLS LAST, (i.asking_price_text IS NULL),"
                                    + " c.normalized_name, i.id";
                    case CREATED -> " ORDER BY i.created_at" + direction + ", i.id";
                };
        return page(where.toString(), order, params, query.page(), query.size());
    }

    /** One page of effectively public items of a binder or of an owner. */
    public Page publicPage(
            @Nullable UUID binderId, @Nullable UUID ownerId, PublicQuery query, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        StringBuilder where = new StringBuilder(" WHERE " + LISTED);
        if (binderId != null) {
            where.append(" AND i.binder_id = :binderId");
            params.put("binderId", binderId);
        }
        if (ownerId != null) {
            where.append(" AND i.owner_id = :ownerId");
            params.put("ownerId", ownerId);
        }
        textFilter(query.query(), where, params);
        if (query.game() != null) {
            where.append(" AND g.slug = :game");
            params.put("game", query.game());
        }
        if (query.availability() != null) {
            where.append(" AND i.availability = :availability");
            params.put("availability", query.availability().name());
        }
        return page(
                where.toString(),
                " ORDER BY c.normalized_name, s.code, p.collector_number, i.id",
                params,
                query.page(),
                query.size());
    }

    /**
     * Admin console (Phase 7): listings (items the owner made public or temporarily public, not
     * deleted), optionally by freshness state, game, owner and text, oldest confirmation first for
     * STALE/HIDDEN reviews, otherwise newest change first. Rows carry the owner's handle and the
     * warning time; never the owner's private notes (the caller drops them).
     */
    public AdminPage adminPage(
            @Nullable FreshnessState state,
            @Nullable String game,
            @Nullable UUID ownerId,
            @Nullable String text,
            boolean staleReview,
            int page,
            int size,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        StringBuilder where =
                new StringBuilder(
                        " WHERE i.deleted_at IS NULL AND i.visibility IN ('PUBLIC',"
                                + " 'TEMPORARILY_PUBLIC')");
        if (state != null) {
            where.append(" AND i.freshness_state = :state");
            params.put("state", state.name());
        } else if (staleReview) {
            where.append(" AND i.freshness_state IN ('STALE', 'HIDDEN')");
        }
        if (game != null) {
            where.append(" AND g.slug = :game");
            params.put("game", game);
        }
        if (ownerId != null) {
            where.append(" AND i.owner_id = :ownerId");
            params.put("ownerId", ownerId);
        }
        textFilter(text, where, params);
        String order =
                staleReview
                        ? " ORDER BY i.confirmed_at ASC, i.id"
                        : " ORDER BY i.updated_at DESC, i.id";
        JdbcClient.StatementSpec count = jdbc.sql("SELECT count(*)" + FROM + where);
        JdbcClient.StatementSpec select =
                jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", i.warned_at, u.handle AS owner_handle, p.printing_code"
                                + FROM
                                + where
                                + order
                                + " LIMIT :limit OFFSET :offset");
        for (Map.Entry<String, Object> param : params.entrySet()) {
            count = count.param(param.getKey(), param.getValue());
            select = select.param(param.getKey(), param.getValue());
        }
        long total = count.query(Long.class).single();
        List<AdminRow> rows =
                select.param("limit", size)
                        .param("offset", (long) page * size)
                        .query(InventoryItemRepository::adminRow)
                        .list();
        return new AdminPage(rows, total);
    }

    /** One admin row (by id) whatever its visibility; empty for unknown or deleted items. */
    public Optional<AdminRow> adminRow(UUID id, Instant now) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", i.warned_at, u.handle AS owner_handle, p.printing_code"
                                + FROM
                                + " WHERE i.id = :id AND i.deleted_at IS NULL")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .query(InventoryItemRepository::adminRow)
                .optional();
    }

    private static AdminRow adminRow(ResultSet rs, int rowNum) throws SQLException {
        Timestamp warnedAt = rs.getTimestamp("warned_at");
        return new AdminRow(
                map(rs, rowNum),
                rs.getString("owner_handle"),
                rs.getString("printing_code"),
                warnedAt == null ? null : warnedAt.toInstant());
    }

    private Page page(String where, String order, Map<String, Object> params, int page, int size) {
        JdbcClient.StatementSpec count = jdbc.sql("SELECT count(*)" + FROM + where);
        JdbcClient.StatementSpec select =
                jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + where
                                + order
                                + " LIMIT :limit OFFSET :offset");
        for (Map.Entry<String, Object> param : params.entrySet()) {
            count = count.param(param.getKey(), param.getValue());
            select = select.param(param.getKey(), param.getValue());
        }
        long total = count.query(Long.class).single();
        List<ItemRow> rows =
                select.param("limit", size)
                        .param("offset", (long) page * size)
                        .query(InventoryItemRepository::map)
                        .list();
        return new Page(rows, total);
    }

    private static void textFilter(
            @Nullable String text, StringBuilder where, Map<String, Object> params) {
        if (text == null || text.isBlank()) {
            return;
        }
        String normalised = CatalogText.normalise(text);
        String escaped = CatalogText.escapeLike(normalised);
        where.append(
                " AND (c.normalized_name LIKE :contains ESCAPE '\\'"
                        + " OR c.search_vector @@ websearch_to_tsquery('simple',"
                        + " unaccent_immutable(:q))"
                        + " OR p.printing_code LIKE :codePrefix ESCAPE '\\'"
                        + " OR s.code = :setCode"
                        + " OR lower(unaccent_immutable(s.name)) LIKE :contains ESCAPE '\\')");
        params.put("contains", "%" + escaped + "%");
        params.put("q", text.trim());
        params.put(
                "codePrefix", CatalogText.escapeLike(text.trim().toUpperCase(Locale.ROOT)) + "%");
        params.put("setCode", text.trim().toUpperCase(Locale.ROOT));
    }

    // ---------------------------------------------------------------------------------------
    // Statistics
    // ---------------------------------------------------------------------------------------

    /**
     * Counts and games per binder. The public count is the cards listed on their own; the public
     * games are those of the cards buyers see, a public deck core's cards included ({@link
     * #SHOWN_PUBLICLY}).
     */
    public List<BinderStatsRow> binderStats(Collection<UUID> binderIds, Instant now) {
        if (binderIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "SELECT i.binder_id, count(*) AS item_count,"
                                + " count(*) FILTER (WHERE "
                                + LISTED
                                + ") AS public_count,"
                                + " array_agg(DISTINCT g.slug) AS games,"
                                + " array_agg(DISTINCT g.slug) FILTER (WHERE "
                                + SHOWN_PUBLICLY
                                + ") AS public_games"
                                + FROM
                                + " WHERE i.binder_id IN (:ids) AND i.deleted_at IS NULL"
                                + " GROUP BY i.binder_id")
                .param("ids", binderIds)
                .param("now", Timestamp.from(now))
                .query(
                        (rs, rowNum) ->
                                new BinderStatsRow(
                                        rs.getObject("binder_id", UUID.class),
                                        rs.getLong("item_count"),
                                        rs.getLong("public_count"),
                                        strings(rs.getArray("games")),
                                        strings(rs.getArray("public_games"))))
                .list();
    }

    /** First item (and its first photo) per binder, optionally among public items only. */
    public List<CoverRow> binderCovers(
            Collection<UUID> binderIds, boolean publicOnly, Instant now) {
        if (binderIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "SELECT DISTINCT ON (i.binder_id) i.binder_id, i.printing_id,"
                                + " (SELECT im.storage_key FROM inventory_item_image im"
                                + " WHERE im.item_id = i.id ORDER BY im.sort_order, im.created_at"
                                + " LIMIT 1) AS image_key"
                                + FROM
                                + " WHERE i.binder_id IN (:ids) AND i.deleted_at IS NULL"
                                + (publicOnly ? " AND " + LISTED : "")
                                + " ORDER BY i.binder_id, i.created_at, i.id")
                .param("ids", binderIds)
                .param("now", Timestamp.from(now))
                .query(
                        (rs, rowNum) ->
                                new CoverRow(
                                        rs.getObject("binder_id", UUID.class),
                                        rs.getObject("printing_id", UUID.class),
                                        rs.getString("image_key")))
                .list();
    }

    /**
     * The first {@code max} printings per binder, one row each, in the order the items were added
     * (a binder's preview pictures, stage R3), optionally among the cards buyers see ({@link
     * #SHOWN_PUBLICLY}: catalog pictures only, never an item's own photo).
     */
    public List<PreviewRow> binderPreviews(
            Collection<UUID> binderIds, boolean publicOnly, int max, Instant now) {
        if (binderIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "SELECT binder_id, printing_id FROM (SELECT i.binder_id, i.printing_id,"
                                + " row_number() OVER (PARTITION BY i.binder_id ORDER BY"
                                + " min(i.created_at), i.printing_id) AS position"
                                + FROM
                                + " WHERE i.binder_id IN (:ids) AND i.deleted_at IS NULL"
                                + (publicOnly ? " AND " + SHOWN_PUBLICLY : "")
                                + " GROUP BY i.binder_id, i.printing_id) ranked"
                                + " WHERE position <= :max ORDER BY binder_id, position")
                .param("ids", binderIds)
                .param("max", max)
                .param("now", Timestamp.from(now))
                .query(
                        (rs, rowNum) ->
                                new PreviewRow(
                                        rs.getObject("binder_id", UUID.class),
                                        rs.getObject("printing_id", UUID.class)))
                .list();
    }

    /**
     * The cards of each binder with their copies (every printing of a card together), most copies
     * first, then by name, at most {@code max} per binder (a deck core's key cards, stage R3),
     * optionally among the cards buyers see ({@link #SHOWN_PUBLICLY}: every live card of a public
     * deck core, whatever its own visibility).
     */
    public List<KeyCardRow> binderKeyCards(
            Collection<UUID> binderIds, boolean publicOnly, int max, Instant now) {
        if (binderIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "SELECT binder_id, card_id, card_name, copies FROM (SELECT i.binder_id,"
                                + " c.id AS card_id, c.name AS card_name, sum(i.quantity) AS"
                                + " copies, row_number() OVER (PARTITION BY i.binder_id ORDER BY"
                                + " sum(i.quantity) DESC, c.name, c.id) AS position"
                                + FROM
                                + " WHERE i.binder_id IN (:ids) AND i.deleted_at IS NULL"
                                + (publicOnly ? " AND " + SHOWN_PUBLICLY : "")
                                + " GROUP BY i.binder_id, c.id, c.name) ranked"
                                + " WHERE position <= :max ORDER BY binder_id, position")
                .param("ids", binderIds)
                .param("max", max)
                .param("now", Timestamp.from(now))
                .query(
                        (rs, rowNum) ->
                                new KeyCardRow(
                                        rs.getObject("binder_id", UUID.class),
                                        rs.getObject("card_id", UUID.class),
                                        rs.getString("card_name"),
                                        rs.getLong("copies")))
                .list();
    }

    /** The owner's summary counters. */
    public SummaryRow summary(UUID ownerId, Instant now) {
        return jdbc.sql(
                        "SELECT count(*) AS total_items, COALESCE(sum(i.quantity), 0) AS"
                            + " total_quantity, count(*) FILTER (WHERE i.visibility = 'PRIVATE') AS"
                            + " private_count, count(*) FILTER (WHERE i.visibility = 'PUBLIC') AS"
                            + " public_count, count(*) FILTER (WHERE i.visibility ="
                            + " 'TEMPORARILY_PUBLIC') AS temporary_count, count(*) FILTER (WHERE"
                            + " i.freshness_state = 'AGING') AS aging, count(*) FILTER (WHERE"
                            + " i.freshness_state = 'STALE') AS stale, count(*) FILTER (WHERE"
                            + " i.freshness_state = 'HIDDEN') AS hidden, count(*) FILTER (WHERE "
                                + LISTED
                                + ") AS effective_public,"
                                + " min(i.public_until) FILTER (WHERE i.visibility ="
                                + " 'TEMPORARILY_PUBLIC' AND i.public_until > :now) AS next_expiry"
                                + FROM
                                + " WHERE i.owner_id = :ownerId AND i.deleted_at IS NULL")
                .param("ownerId", ownerId)
                .param("now", Timestamp.from(now))
                .query(
                        (rs, rowNum) -> {
                            Timestamp expiry = rs.getTimestamp("next_expiry");
                            return new SummaryRow(
                                    rs.getLong("total_items"),
                                    rs.getLong("total_quantity"),
                                    rs.getLong("private_count"),
                                    rs.getLong("public_count"),
                                    rs.getLong("temporary_count"),
                                    rs.getLong("aging"),
                                    rs.getLong("stale"),
                                    rs.getLong("hidden"),
                                    rs.getLong("effective_public"),
                                    expiry == null ? null : expiry.toInstant());
                        })
                .single();
    }

    /** Items per game slug of the owner. */
    public Map<String, Long> countByGame(UUID ownerId) {
        Map<String, Long> result = new LinkedHashMap<>();
        jdbc.sql(
                        """
                        SELECT g.slug, count(*) AS items
                          FROM inventory_item i
                          JOIN card_printing p ON p.id = i.printing_id
                          JOIN card c ON c.id = p.card_id
                          JOIN game g ON g.id = c.game_id
                         WHERE i.owner_id = :ownerId AND i.deleted_at IS NULL
                         GROUP BY g.slug, g.sort_order
                         ORDER BY g.sort_order, g.slug
                        """)
                .param("ownerId", ownerId)
                .query(
                        rs -> {
                            result.put(rs.getString("slug"), rs.getLong("items"));
                        });
        return result;
    }

    /** Non-deleted items of the owner (the usage of {@code inventory.items.max}). */
    public long countLive(UUID ownerId) {
        return jdbc.sql(
                        "SELECT count(*) FROM inventory_item WHERE owner_id = :ownerId AND"
                                + " deleted_at IS NULL")
                .param("ownerId", ownerId)
                .query(Long.class)
                .single();
    }

    /**
     * The owner's live items of the given printings, read without a row lock. The private ones
     * ({@link MergeCandidate#privateItem}) are the items an import can raise instead of adding an
     * equal one, the oldest first; an item the owner shows is never raised by an import (an
     * imported copy never becomes public by being merged) and is only listed so a preview can say
     * that it exists. A caller that writes holds the owner lock.
     */
    public List<MergeCandidate> mergeCandidates(UUID ownerId, Collection<UUID> printingIds) {
        List<MergeCandidate> result = new ArrayList<>();
        List<UUID> distinct = printingIds.stream().distinct().toList();
        for (int from = 0; from < distinct.size(); from += 1000) {
            jdbc.sql(
                            """
                            SELECT id, printing_id, condition, language, edition, quantity,
                                   (visibility = 'PRIVATE') AS private_item
                              FROM inventory_item
                             WHERE owner_id = :ownerId AND deleted_at IS NULL
                               AND printing_id IN (:printingIds)
                             ORDER BY (visibility = 'PRIVATE') DESC, created_at, id
                            """)
                    .param("ownerId", ownerId)
                    .param(
                            "printingIds",
                            distinct.subList(from, Math.min(distinct.size(), from + 1000)))
                    .query(
                            rs -> {
                                result.add(
                                        new MergeCandidate(
                                                rs.getObject("id", UUID.class),
                                                rs.getObject("printing_id", UUID.class),
                                                rs.getString("condition"),
                                                rs.getString("language"),
                                                rs.getString("edition"),
                                                rs.getInt("quantity"),
                                                rs.getBoolean("private_item")));
                            });
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    public void insert(Values values, UUID id, UUID ownerId, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO inventory_item (id, owner_id, binder_id, printing_id, quantity,
                            condition, language, edition, finish, asking_price, asking_price_text,
                            currency, availability, accepts_offers, notes, public_notes,
                            visibility, public_until, freshness_state, created_at, updated_at,
                            confirmed_at, last_owner_activity_at)
                        VALUES (:id, :ownerId, :binderId, :printingId, :quantity, :condition,
                            :language, :edition, :finish, :askingPrice, :askingPriceText,
                            :currency, :availability, :acceptsOffers, :notes, :publicNotes,
                            :visibility, :publicUntil, 'ACTIVE', :now, :now, :now, :now)
                        """)
                .param("id", id)
                .param("ownerId", ownerId)
                .params(values.params())
                .param("now", Timestamp.from(now))
                .update();
    }

    public void update(UUID id, Values values, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item
                           SET binder_id = :binderId, printing_id = :printingId,
                               quantity = :quantity, condition = :condition, language = :language,
                               edition = :edition, finish = :finish, asking_price = :askingPrice,
                               asking_price_text = :askingPriceText,
                               currency = :currency, availability = :availability,
                               accepts_offers = :acceptsOffers, notes = :notes,
                               public_notes = :publicNotes, visibility = :visibility,
                               public_until = :publicUntil, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .params(values.params())
                .param("now", Timestamp.from(now))
                .update();
    }

    public void setVisibility(
            UUID id, ListingVisibility visibility, @Nullable Instant publicUntil, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET visibility = :visibility,
                               public_until = :publicUntil, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("visibility", visibility.name())
                .param("publicUntil", timestamp(publicUntil), Types.TIMESTAMP)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void moveToBinder(
            UUID id,
            @Nullable UUID binderId,
            ListingVisibility visibility,
            @Nullable Instant publicUntil,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET binder_id = :binderId, visibility = :visibility,
                               public_until = :publicUntil, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("binderId", binderId, Types.OTHER)
                .param("visibility", visibility.name())
                .param("publicUntil", timestamp(publicUntil), Types.TIMESTAMP)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void setAvailability(UUID id, Availability availability, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET availability = :availability, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("availability", availability.name())
                .param("now", Timestamp.from(now))
                .update();
    }

    public void softDelete(UUID id, Instant now) {
        softDelete(id, null, now);
    }

    /**
     * Soft-deletes a live item; {@code restorableUntil} set (an owner's own delete, stage R2) keeps
     * it restorable, and its photos, until then.
     */
    public void softDelete(UUID id, @Nullable Instant restorableUntil, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET deleted_at = :now, updated_at = :now,
                               last_owner_activity_at = :now, restorable_until = :restorableUntil
                         WHERE id = :id AND deleted_at IS NULL
                        """)
                .param("id", id)
                .param("restorableUntil", timestamp(restorableUntil), Types.TIMESTAMP)
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * The binder an item of the owner is filed in, read without a lock, whether the item is live or
     * deleted (the restore of a deleted item locks that binder first). The caller holds the owner
     * lock. Empty for unknown and other owners' items; an empty optional inside for an unfiled one.
     */
    public Optional<Optional<UUID>> binderOfAnyState(UUID ownerId, UUID id) {
        return jdbc.sql(
                        "SELECT binder_id FROM inventory_item WHERE id = :id AND owner_id ="
                                + " :ownerId")
                .param("id", id)
                .param("ownerId", ownerId)
                .query((rs, rowNum) -> Optional.ofNullable(rs.getObject("binder_id", UUID.class)))
                .optional();
    }

    /**
     * Locks one item of the owner, live or deleted, and returns its delete state (restore). {@code
     * FOR NO KEY UPDATE}, like every item write.
     */
    public Optional<DeleteState> lockDeleteState(UUID ownerId, UUID id) {
        return jdbc.sql(
                        "SELECT id, binder_id, deleted_at, restorable_until FROM inventory_item"
                                + " WHERE id = :id AND owner_id = :ownerId FOR NO KEY UPDATE")
                .param("id", id)
                .param("ownerId", ownerId)
                .query(
                        (rs, rowNum) -> {
                            Timestamp deletedAt = rs.getTimestamp("deleted_at");
                            Timestamp until = rs.getTimestamp("restorable_until");
                            return new DeleteState(
                                    rs.getObject("id", UUID.class),
                                    rs.getObject("binder_id", UUID.class),
                                    deletedAt == null ? null : deletedAt.toInstant(),
                                    until == null ? null : until.toInstant());
                        })
                .optional();
    }

    /** Brings a soft-deleted item back (restore); the binder count trigger counts it again. */
    public void restore(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET deleted_at = NULL, restorable_until = NULL,
                               updated_at = :now, last_owner_activity_at = :now
                         WHERE id = :id AND deleted_at IS NOT NULL
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    // ---------------------------------------------------------------------------------------
    // Sales and chat subjects (stage R4)
    // ---------------------------------------------------------------------------------------

    /**
     * Holds an item, live or deleted, {@code FOR KEY SHARE} until the transaction ends, before a
     * row of another module references it (a chat's subject): the lock its foreign key check takes
     * anyway, taken before that row is written, so a binder delete or an account purge holding the
     * item never waits for that row in turn. It conflicts with no write of the owner ({@code FOR NO
     * KEY UPDATE}).
     *
     * @return whether the item exists
     */
    public boolean lockKeyShare(UUID id) {
        return jdbc.sql("SELECT id FROM inventory_item WHERE id = :id FOR KEY SHARE")
                .param("id", id)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    /** The soft-deleted items among {@code ids}. */
    public Set<UUID> deletedAmong(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(
                jdbc.sql(
                                "SELECT id FROM inventory_item WHERE id IN (:ids) AND deleted_at"
                                        + " IS NOT NULL")
                        .param("ids", ids)
                        .query(UUID.class)
                        .list());
    }

    /**
     * Soft-deletes every live item of a binder, keeping them restorable (and their photos) until
     * {@code restorableUntil}: a deck core sold with its cards (stage R4), which an undo brings
     * back. Rows in ascending id, {@code FOR NO KEY UPDATE}; the caller holds the owner lock and
     * the binder. Returns their ids.
     */
    public List<UUID> softDeleteInBinderRestorable(
            UUID ownerId, UUID binderId, Instant restorableUntil, Instant now) {
        return jdbc.sql(
                        """
                        WITH sold AS MATERIALIZED (
                            SELECT id FROM inventory_item
                             WHERE owner_id = :ownerId AND binder_id = :binderId
                               AND deleted_at IS NULL
                             ORDER BY id FOR NO KEY UPDATE)
                        UPDATE inventory_item i SET deleted_at = :now, updated_at = :now,
                               last_owner_activity_at = :now, restorable_until = :until
                          FROM sold s
                         WHERE i.id = s.id
                        RETURNING i.id
                        """)
                .param("ownerId", ownerId)
                .param("binderId", binderId)
                .param("until", Timestamp.from(restorableUntil))
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .list();
    }

    /**
     * Brings back the items among {@code ids} that a deck core sale soft-deleted: still deleted,
     * still in the binder and still restorable at {@code now} (the undo of the sale, stage R4).
     * Rows in ascending id, {@code FOR NO KEY UPDATE}; the caller holds the owner lock and the
     * binder. Returns their ids.
     */
    public List<UUID> restoreInBinder(
            UUID ownerId, UUID binderId, Collection<UUID> ids, Instant now) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        """
                        WITH back AS MATERIALIZED (
                            SELECT id FROM inventory_item
                             WHERE id IN (:ids) AND owner_id = :ownerId AND binder_id = :binderId
                               AND deleted_at IS NOT NULL AND restorable_until > :now
                             ORDER BY id FOR NO KEY UPDATE)
                        UPDATE inventory_item i SET deleted_at = NULL, restorable_until = NULL,
                               updated_at = :now, last_owner_activity_at = :now
                          FROM back b
                         WHERE i.id = b.id
                        RETURNING i.id
                        """)
                .param("ids", ids)
                .param("ownerId", ownerId)
                .param("binderId", binderId)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .list();
    }

    /**
     * Puts sold copies back on an item the transaction holds, live or deleted since (the undo of a
     * sale that left copies: a later restore of the item then brings them all), at most 9 999.
     */
    public void addCopiesBack(UUID id, int by, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET quantity = LEAST(quantity + :by, 9999),
                               updated_at = :now, last_owner_activity_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("by", by)
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * Closes the restore windows that have passed (at most {@code limit} items, skipping the rows
     * another transaction holds, like every job statement) and returns the items: the caller
     * deletes their photos.
     */
    public List<UUID> closeRestoreWindows(Instant now, int limit) {
        return jdbc.sql(
                        """
                        WITH due AS MATERIALIZED (
                            SELECT id FROM inventory_item
                             WHERE restorable_until IS NOT NULL AND restorable_until <= :now
                             ORDER BY id
                             LIMIT :limit
                               FOR NO KEY UPDATE SKIP LOCKED)
                        UPDATE inventory_item i SET restorable_until = NULL
                          FROM due d
                         WHERE i.id = d.id
                        RETURNING i.id
                        """)
                .param("now", Timestamp.from(now))
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }

    /**
     * Ends the restore windows of the owner's deleted items filed in a binder that is being deleted
     * (its row goes, so such an item could no longer come back where it was) and returns them: the
     * caller deletes their photos. The caller holds the owner lock and the binder.
     */
    public List<UUID> endRestoreWindowsInBinder(UUID ownerId, UUID binderId) {
        return jdbc.sql(
                        """
                        WITH ended AS MATERIALIZED (
                            SELECT id FROM inventory_item
                             WHERE owner_id = :ownerId AND binder_id = :binderId
                               AND restorable_until IS NOT NULL
                             ORDER BY id FOR NO KEY UPDATE)
                        UPDATE inventory_item i SET restorable_until = NULL
                          FROM ended e
                         WHERE i.id = e.id
                        RETURNING i.id
                        """)
                .param("ownerId", ownerId)
                .param("binderId", binderId)
                .query(UUID.class)
                .list();
    }

    /** Soft-deletes every item of a binder; returns their ids. */
    public List<UUID> softDeleteInBinder(UUID ownerId, UUID binderId, Instant now) {
        return jdbc.sql(
                        """
                        WITH doomed AS MATERIALIZED (
                            SELECT id FROM inventory_item
                             WHERE owner_id = :ownerId AND binder_id = :binderId
                               AND deleted_at IS NULL
                             ORDER BY id FOR NO KEY UPDATE)
                        UPDATE inventory_item i SET deleted_at = :now, updated_at = :now,
                               last_owner_activity_at = :now
                          FROM doomed d
                         WHERE i.id = d.id
                        RETURNING i.id
                        """)
                .param("ownerId", ownerId)
                .param("binderId", binderId)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .list();
    }

    /**
     * Unfiles every item of a binder (binder deletion); items become PRIVATE unless {@code
     * keepVisibility}. Returns their ids.
     */
    public List<UUID> unfileBinder(
            UUID ownerId, UUID binderId, boolean keepVisibility, Instant now) {
        String visibility = keepVisibility ? "" : ", visibility = 'PRIVATE', public_until = NULL";
        return jdbc.sql(
                        "WITH unfiled AS MATERIALIZED (SELECT id FROM inventory_item"
                                + " WHERE owner_id = :ownerId AND binder_id = :binderId"
                                + " ORDER BY id FOR NO KEY UPDATE)"
                                + " UPDATE inventory_item i SET binder_id = NULL, updated_at = :now"
                                + visibility
                                + " FROM unfiled u WHERE i.id = u.id"
                                + " RETURNING i.id")
                .param("ownerId", ownerId)
                .param("binderId", binderId)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .list();
    }

    /**
     * Owner confirmation of items (by id, or every item of a binder): {@code confirmed_at} and
     * activity set to {@code now}, warning reset, freshness back to ACTIVE.
     */
    public List<Confirmed> confirm(
            UUID ownerId, @Nullable Collection<UUID> ids, @Nullable UUID binderId, Instant now) {
        String scope = ids != null ? "id IN (:ids)" : "binder_id = :binderId";
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                                "WITH previous AS (SELECT id, freshness_state FROM inventory_item"
                                        + " WHERE owner_id = :ownerId AND deleted_at IS NULL AND "
                                        + scope
                                        + " ORDER BY id FOR NO KEY UPDATE)"
                                        + " UPDATE inventory_item i SET confirmed_at = :now,"
                                        + " last_owner_activity_at = :now, warned_at = NULL,"
                                        + " freshness_state = 'ACTIVE', hidden_reason = NULL"
                                        + " FROM previous p WHERE i.id = p.id"
                                        + " RETURNING i.id, i.owner_id, i.binder_id,"
                                        + " p.freshness_state AS old_state")
                        .param("ownerId", ownerId)
                        .param("now", Timestamp.from(now));
        if (ids != null) {
            if (ids.isEmpty()) {
                return List.of();
            }
            statement = statement.param("ids", ids);
        } else {
            statement = statement.param("binderId", binderId);
        }
        return statement
                .query(
                        (rs, rowNum) ->
                                new Confirmed(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("owner_id", UUID.class),
                                        rs.getObject("binder_id", UUID.class),
                                        FreshnessState.valueOf(rs.getString("old_state"))))
                .list();
    }

    /**
     * Locks the owner's non-deleted item and returns its quantity (Phase 8 trade transfers); empty
     * for unknown, deleted or other owners' items.
     */
    public Optional<Integer> lockQuantity(UUID ownerId, UUID id) {
        return jdbc.sql(
                        "SELECT quantity FROM inventory_item WHERE id = :id AND owner_id ="
                                + " :ownerId AND deleted_at IS NULL FOR NO KEY UPDATE")
                .param("id", id)
                .param("ownerId", ownerId)
                .query(Integer.class)
                .optional();
    }

    /** Lowers the quantity of an item by {@code by} copies (callers keep at least one). */
    public void decrementQuantity(UUID id, int by, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET quantity = quantity - :by, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id AND deleted_at IS NULL AND quantity > :by
                        """)
                .param("id", id)
                .param("by", by)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Adds {@code by} copies to an item the transaction holds (the caller keeps it ≤ 9 999). */
    public void addQuantity(UUID id, int by, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_item SET quantity = quantity + :by, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id AND deleted_at IS NULL
                        """)
                .param("id", id)
                .param("by", by)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void touch(UUID id, Instant now) {
        jdbc.sql(
                        "UPDATE inventory_item SET updated_at = :now, last_owner_activity_at = :now"
                                + " WHERE id = :id")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    // ---------------------------------------------------------------------------------------
    // Freshness job
    // ---------------------------------------------------------------------------------------

    /**
     * Expired temporary publications become PRIVATE; returns the number of items changed. Like
     * every statement of the job, it skips the items another transaction holds ({@code SKIP
     * LOCKED}): the job never waits for a row, and its next run handles them.
     *
     * <p>Deleted items are left as they are (nothing reads the visibility of a deleted item). The
     * job may still have to clear a listed flag on a deleted item ({@link #reconcile}); written
     * here as well, that row would be written twice in one run, and the second update re-runs the
     * foreign key check of {@code binder_id}: a key-share lock on the binder. A deleted item keeps
     * its binder, and a binder deleted together with its items reaches it only through its {@code
     * DELETE} ({@code ON DELETE SET NULL}), with the full row lock of the binder in hand: the
     * delete would wait for the job at the item and the job for the delete at the binder.
     */
    public int normaliseExpired(Instant now) {
        return jdbc.sql(
                        """
                        WITH expired AS MATERIALIZED (
                            SELECT id FROM inventory_item
                             WHERE visibility = 'TEMPORARILY_PUBLIC' AND public_until <= :now
                               AND deleted_at IS NULL
                             ORDER BY id FOR NO KEY UPDATE SKIP LOCKED)
                        UPDATE inventory_item i SET visibility = 'PRIVATE', public_until = NULL
                          FROM expired e
                         WHERE i.id = e.id
                        """)
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * Re-derives the freshness of every non-deleted item; returns the changes. The state is
     * computed in the locking clause, so it is the state of the row as locked.
     */
    public List<StateChange> recomputeFreshness(FreshnessPolicy policy, Instant now) {
        return jdbc.sql(
                        "WITH computed AS MATERIALIZED (SELECT id, freshness_state AS old_state, "
                                + FRESHNESS_CASE
                                + " AS new_state FROM inventory_item WHERE deleted_at IS NULL"
                                + " AND freshness_state <> "
                                + FRESHNESS_CASE
                                + " ORDER BY id FOR NO KEY UPDATE SKIP LOCKED)"
                                + " UPDATE inventory_item i SET freshness_state = c.new_state,"
                                + " hidden_reason = CASE WHEN c.new_state = 'HIDDEN'"
                                + " THEN 'STALE_UNCONFIRMED' ELSE NULL END"
                                + " FROM computed c"
                                + " WHERE i.id = c.id"
                                + " RETURNING i.id, i.owner_id, i.binder_id, i.publicly_listed,"
                                + " c.old_state, c.new_state")
                .param("hiddenCutoff", Timestamp.from(policy.hiddenCutoff(now)))
                .param("staleCutoff", Timestamp.from(policy.staleCutoff(now)))
                .param("agingCutoff", Timestamp.from(policy.agingCutoff(now)))
                .query(
                        (rs, rowNum) ->
                                new StateChange(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("owner_id", UUID.class),
                                        rs.getObject("binder_id", UUID.class),
                                        rs.getBoolean("publicly_listed"),
                                        FreshnessState.valueOf(rs.getString("old_state")),
                                        FreshnessState.valueOf(rs.getString("new_state"))))
                .list();
    }

    /** Marks publicly listed items entering the warning window; returns them. */
    public List<Warned> warn(FreshnessPolicy policy, Instant now) {
        return jdbc.sql(
                        """
                        WITH due AS MATERIALIZED (
                            SELECT id FROM inventory_item
                             WHERE deleted_at IS NULL AND warned_at IS NULL AND publicly_listed
                               AND freshness_state <> 'HIDDEN'
                               AND confirmed_at <= :warnCutoff AND confirmed_at > :hiddenCutoff
                             ORDER BY id FOR NO KEY UPDATE SKIP LOCKED)
                        UPDATE inventory_item i SET warned_at = :now
                          FROM due d
                         WHERE i.id = d.id
                        RETURNING i.id, i.owner_id, i.binder_id, i.confirmed_at
                        """)
                .param("now", Timestamp.from(now))
                .param("warnCutoff", Timestamp.from(policy.warnCutoff(now)))
                .param("hiddenCutoff", Timestamp.from(policy.hiddenCutoff(now)))
                .query(
                        (rs, rowNum) ->
                                new Warned(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("owner_id", UUID.class),
                                        rs.getObject("binder_id", UUID.class),
                                        rs.getTimestamp("confirmed_at").toInstant()))
                .list();
    }

    /**
     * Stores the effective public visibility of the items matching {@code scopeSql} (a condition on
     * alias {@code i}) and returns those whose value flipped. The flipped rows are locked in
     * ascending id order before they are written.
     *
     * @param skipLocked leave the items another transaction holds to a later call instead of
     *     waiting for them (the freshness job, which reconciles every item)
     */
    public List<ListingChange> reconcile(
            String scopeSql, Map<String, ?> params, boolean skipLocked, Instant now) {
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                                "WITH computed AS (SELECT i.id, "
                                        + LISTED
                                        + " AS listed, c.id AS card_id, g.slug AS game"
                                        + FROM
                                        + " WHERE "
                                        + scopeSql
                                        + "), flipped AS MATERIALIZED (SELECT t.id, c.listed,"
                                        + " c.card_id, c.game"
                                        + " FROM inventory_item t JOIN computed c ON c.id = t.id"
                                        + " WHERE t.publicly_listed <> c.listed"
                                        + " ORDER BY t.id FOR NO KEY UPDATE OF t"
                                        + (skipLocked ? " SKIP LOCKED" : "")
                                        + ")"
                                        + " UPDATE inventory_item t SET publicly_listed ="
                                        + " f.listed, listing_changed_at = :now"
                                        + " FROM flipped f"
                                        + " WHERE t.id = f.id"
                                        + " RETURNING t.id, t.owner_id, t.printing_id, f.card_id,"
                                        + " f.game, f.listed, t.availability, t.asking_price,"
                                        + " t.currency")
                        .param("now", Timestamp.from(now));
        for (Map.Entry<String, ?> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement
                .query(
                        (rs, rowNum) ->
                                new ListingChange(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("owner_id", UUID.class),
                                        rs.getObject("printing_id", UUID.class),
                                        rs.getObject("card_id", UUID.class),
                                        rs.getString("game"),
                                        rs.getBoolean("listed"),
                                        Availability.valueOf(rs.getString("availability")),
                                        rs.getBigDecimal("asking_price"),
                                        rs.getString("currency").trim()))
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // Account deletion
    // ---------------------------------------------------------------------------------------

    /**
     * Every item of an owner, deleted or not, locked in ascending id order (purge: the delete that
     * follows takes the rows in no particular order). {@code FOR UPDATE}, the lock of the delete,
     * so the delete never has to strengthen a lock it holds.
     */
    public List<UUID> lockAllOf(UUID ownerId) {
        return jdbc.sql(
                        "SELECT id FROM inventory_item WHERE owner_id = :ownerId ORDER BY id FOR"
                                + " UPDATE")
                .param("ownerId", ownerId)
                .query(UUID.class)
                .list();
    }

    public int deleteAllOf(UUID ownerId) {
        return jdbc.sql("DELETE FROM inventory_item WHERE owner_id = :ownerId")
                .param("ownerId", ownerId)
                .update();
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    private static @Nullable Timestamp timestamp(@Nullable Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
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
        result.sort(null);
        return List.copyOf(result);
    }

    static ItemRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp publicUntil = rs.getTimestamp("public_until");
        return new ItemRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getObject("binder_id", UUID.class),
                rs.getString("binder_name"),
                rs.getObject("printing_id", UUID.class),
                rs.getObject("card_id", UUID.class),
                rs.getString("card_name"),
                rs.getString("game"),
                rs.getInt("quantity"),
                rs.getString("condition"),
                rs.getString("language"),
                rs.getString("edition"),
                rs.getString("finish"),
                rs.getBigDecimal("asking_price"),
                rs.getString("asking_price_text"),
                rs.getString("currency").trim(),
                Availability.valueOf(rs.getString("availability")),
                rs.getBoolean("accepts_offers"),
                rs.getString("notes"),
                rs.getString("public_notes"),
                ListingVisibility.valueOf(rs.getString("visibility")),
                publicUntil == null ? null : publicUntil.toInstant(),
                FreshnessState.valueOf(rs.getString("freshness_state")),
                rs.getTimestamp("confirmed_at").toInstant(),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getBoolean("effective_public"));
    }

    /**
     * Column values of an insert or a full update.
     *
     * @param binderId binder
     * @param printingId printing
     * @param quantity copies
     * @param condition condition code, {@code null} when not stated
     * @param language ISO 639-1
     * @param edition edition code
     * @param finish finish code
     * @param askingPrice price
     * @param askingPriceText the price as typed
     * @param currency ISO 4217
     * @param availability availability
     * @param acceptsOffers offers welcome
     * @param notes private notes
     * @param publicNotes public notes
     * @param visibility visibility
     * @param publicUntil end of a temporary publication
     */
    public record Values(
            @Nullable UUID binderId,
            UUID printingId,
            int quantity,
            @Nullable String condition,
            String language,
            String edition,
            String finish,
            @Nullable BigDecimal askingPrice,
            @Nullable String askingPriceText,
            String currency,
            Availability availability,
            boolean acceptsOffers,
            String notes,
            String publicNotes,
            ListingVisibility visibility,
            @Nullable Instant publicUntil) {

        /** An item without the stage R2 fields (no price text). */
        public Values(
                @Nullable UUID binderId,
                UUID printingId,
                int quantity,
                @Nullable String condition,
                String language,
                String edition,
                String finish,
                @Nullable BigDecimal askingPrice,
                String currency,
                Availability availability,
                boolean acceptsOffers,
                String notes,
                String publicNotes,
                ListingVisibility visibility,
                @Nullable Instant publicUntil) {
            this(
                    binderId,
                    printingId,
                    quantity,
                    condition,
                    language,
                    edition,
                    finish,
                    askingPrice,
                    null,
                    currency,
                    availability,
                    acceptsOffers,
                    notes,
                    publicNotes,
                    visibility,
                    publicUntil);
        }

        Map<String, Object> params() {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("binderId", new SqlParameterValue(Types.OTHER, binderId));
            params.put("printingId", printingId);
            params.put("quantity", quantity);
            params.put("condition", new SqlParameterValue(Types.VARCHAR, condition));
            params.put("language", language);
            params.put("edition", edition);
            params.put("finish", finish);
            params.put("askingPrice", new SqlParameterValue(Types.NUMERIC, askingPrice));
            params.put("askingPriceText", new SqlParameterValue(Types.VARCHAR, askingPriceText));
            params.put("currency", currency);
            params.put("availability", availability.name());
            params.put("acceptsOffers", acceptsOffers);
            params.put("notes", notes);
            params.put("publicNotes", publicNotes);
            params.put("visibility", visibility.name());
            params.put(
                    "publicUntil", new SqlParameterValue(Types.TIMESTAMP, timestamp(publicUntil)));
            return params;
        }
    }

    /**
     * An item whose row the transaction holds.
     *
     * @param id item
     * @param ownerId owner
     * @param binderId binder, {@code null} when unfiled
     */
    public record LockedItem(UUID id, UUID ownerId, @Nullable UUID binderId) {}

    /**
     * A live item of the owner that is equal to a line of an import.
     *
     * @param id item
     * @param printingId printing
     * @param condition condition code
     * @param language language of the copy
     * @param edition edition of the copy
     * @param quantity copies it holds
     * @param privateItem whether its visibility is PRIVATE: only such an item is raised by an
     *     import
     */
    public record MergeCandidate(
            UUID id,
            UUID printingId,
            String condition,
            String language,
            String edition,
            int quantity,
            boolean privateItem) {}

    /** A page of rows and the total. */
    public record Page(List<ItemRow> rows, long total) {}

    /**
     * The delete state of an item (restore).
     *
     * @param id item
     * @param binderId binder, {@code null} when unfiled
     * @param deletedAt soft delete, {@code null} for a live item
     * @param restorableUntil end of the restore window, {@code null} when it cannot be restored
     */
    public record DeleteState(
            UUID id,
            @Nullable UUID binderId,
            @Nullable Instant deletedAt,
            @Nullable Instant restorableUntil) {}

    /** An admin row: the item, its owner's handle, printing code and warning time. */
    public record AdminRow(
            ItemRow item,
            String ownerHandle,
            @Nullable String printingCode,
            @Nullable Instant warnedAt) {}

    /** One admin page with the total count. */
    public record AdminPage(List<AdminRow> rows, long total) {}

    /** Counts per binder. */
    public record BinderStatsRow(
            UUID binderId,
            long itemCount,
            long publicCount,
            List<String> games,
            List<String> publicGames) {}

    /** First item of a binder. */
    public record CoverRow(UUID binderId, UUID printingId, @Nullable String imageKey) {}

    /** A printing among the first items of a binder (its preview pictures). */
    public record PreviewRow(UUID binderId, UUID printingId) {}

    /** A card of a binder with its copies (a deck core's key card). */
    public record KeyCardRow(UUID binderId, UUID cardId, String cardName, long copies) {}

    /** Summary counters of an owner. */
    public record SummaryRow(
            long totalItems,
            long totalQuantity,
            long privateCount,
            long publicCount,
            long temporaryCount,
            long aging,
            long stale,
            long hidden,
            long effectivePublic,
            @Nullable Instant nextExpiry) {}

    /** A confirmed item with its previous freshness. */
    public record Confirmed(
            UUID itemId, UUID ownerId, @Nullable UUID binderId, FreshnessState previous) {}

    /**
     * A freshness change of an item.
     *
     * @param itemId item
     * @param ownerId owner
     * @param binderId binder, {@code null} when unfiled
     * @param publiclyListed whether the item was publicly listed before the change
     * @param previous state before
     * @param current state after
     */
    public record StateChange(
            UUID itemId,
            UUID ownerId,
            @Nullable UUID binderId,
            boolean publiclyListed,
            FreshnessState previous,
            FreshnessState current) {}

    /** An item that entered its warning window. */
    public record Warned(UUID itemId, UUID ownerId, @Nullable UUID binderId, Instant confirmedAt) {}

    /** A flip of an item's materialised effective visibility. */
    public record ListingChange(
            UUID itemId,
            UUID ownerId,
            UUID printingId,
            UUID cardId,
            String game,
            boolean listed,
            Availability availability,
            @Nullable BigDecimal askingPrice,
            String currency) {}
}
