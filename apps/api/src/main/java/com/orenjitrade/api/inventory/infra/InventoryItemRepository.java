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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code inventory_item} access (explicit SQL). Every read carries the live effective public
 * visibility ({@link #LISTED}); public lists filter on it and never on the materialised flag. Reads
 * join the catalog tables (card, game) and the owner's account and privacy rows read-only.
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

    private static final String COLUMNS =
            """
            i.id, i.owner_id, i.binder_id, b.name AS binder_name, i.printing_id, c.id AS card_id,
            c.name AS card_name, g.slug AS game, i.quantity, i.condition, i.language, i.edition,
            i.finish, i.asking_price, i.currency, i.availability, i.accepts_offers, i.notes,
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

    /** Locks the owner's non-deleted item row. */
    public boolean lockOwned(UUID ownerId, UUID id) {
        return jdbc.sql(
                        "SELECT id FROM inventory_item WHERE id = :id AND owner_id = :ownerId"
                                + " AND deleted_at IS NULL FOR UPDATE")
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
                    case PRICE ->
                            " ORDER BY i.asking_price"
                                    + direction
                                    + " NULLS LAST, c.normalized_name, i.id";
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

    /** The owner of a live item, locking it; empty for unknown or deleted items. */
    public Optional<UUID> lockOwnerOf(UUID id) {
        return jdbc.sql(
                        "SELECT owner_id FROM inventory_item WHERE id = :id AND deleted_at IS NULL"
                                + " FOR UPDATE")
                .param("id", id)
                .query(UUID.class)
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

    /** Counts and games per binder. */
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
                                + LISTED
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

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    public void insert(Values values, UUID id, UUID ownerId, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO inventory_item (id, owner_id, binder_id, printing_id, quantity,
                            condition, language, edition, finish, asking_price, currency,
                            availability, accepts_offers, notes, public_notes, visibility,
                            public_until, freshness_state, created_at, updated_at, confirmed_at,
                            last_owner_activity_at)
                        VALUES (:id, :ownerId, :binderId, :printingId, :quantity, :condition,
                            :language, :edition, :finish, :askingPrice, :currency, :availability,
                            :acceptsOffers, :notes, :publicNotes, :visibility, :publicUntil,
                            'ACTIVE', :now, :now, :now, :now)
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
        jdbc.sql(
                        """
                        UPDATE inventory_item SET deleted_at = :now, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id AND deleted_at IS NULL
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Soft-deletes every item of a binder; returns their ids. */
    public List<UUID> softDeleteInBinder(UUID ownerId, UUID binderId, Instant now) {
        return jdbc.sql(
                        """
                        UPDATE inventory_item SET deleted_at = :now, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE owner_id = :ownerId AND binder_id = :binderId AND deleted_at IS NULL
                        RETURNING id
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
                        "UPDATE inventory_item SET binder_id = NULL, updated_at = :now"
                                + visibility
                                + " WHERE owner_id = :ownerId AND binder_id = :binderId"
                                + " RETURNING id")
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
                                        + " FOR UPDATE)"
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

    /** Expired temporary publications become PRIVATE; returns the number of items changed. */
    public int normaliseExpired(Instant now) {
        return jdbc.sql(
                        """
                        UPDATE inventory_item SET visibility = 'PRIVATE', public_until = NULL
                         WHERE visibility = 'TEMPORARILY_PUBLIC' AND public_until <= :now
                        """)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Re-derives the freshness of every non-deleted item; returns the changes. */
    public List<StateChange> recomputeFreshness(FreshnessPolicy policy, Instant now) {
        return jdbc.sql(
                        "WITH computed AS (SELECT id, freshness_state AS old_state, "
                                + FRESHNESS_CASE
                                + " AS new_state FROM inventory_item WHERE deleted_at IS NULL)"
                                + " UPDATE inventory_item i SET freshness_state = c.new_state,"
                                + " hidden_reason = CASE WHEN c.new_state = 'HIDDEN'"
                                + " THEN 'STALE_UNCONFIRMED' ELSE NULL END"
                                + " FROM computed c"
                                + " WHERE i.id = c.id AND c.old_state <> c.new_state"
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
                        UPDATE inventory_item SET warned_at = :now
                         WHERE deleted_at IS NULL AND warned_at IS NULL AND publicly_listed
                           AND freshness_state <> 'HIDDEN'
                           AND confirmed_at <= :warnCutoff AND confirmed_at > :hiddenCutoff
                        RETURNING id, owner_id, binder_id, confirmed_at
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
     * alias {@code i}) and returns those whose value flipped.
     */
    public List<ListingChange> reconcile(String scopeSql, Map<String, ?> params, Instant now) {
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                                "WITH computed AS (SELECT i.id, "
                                        + LISTED
                                        + " AS listed, c.id AS card_id, g.slug AS game"
                                        + FROM
                                        + " WHERE "
                                        + scopeSql
                                        + ")"
                                        + " UPDATE inventory_item t SET publicly_listed ="
                                        + " c.listed, listing_changed_at = :now"
                                        + " FROM computed c"
                                        + " WHERE t.id = c.id AND t.publicly_listed <> c.listed"
                                        + " RETURNING t.id, t.owner_id, t.printing_id, c.card_id,"
                                        + " c.game, c.listed, t.availability, t.asking_price,"
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

    /** Every item of an owner, deleted or not (purge). */
    public List<UUID> idsOf(UUID ownerId) {
        return jdbc.sql("SELECT id FROM inventory_item WHERE owner_id = :ownerId")
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
     * @param condition condition code
     * @param language ISO 639-1
     * @param edition edition code
     * @param finish finish code
     * @param askingPrice price
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
            String condition,
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

        Map<String, Object> params() {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("binderId", new SqlParameterValue(Types.OTHER, binderId));
            params.put("printingId", printingId);
            params.put("quantity", quantity);
            params.put("condition", condition);
            params.put("language", language);
            params.put("edition", edition);
            params.put("finish", finish);
            params.put("askingPrice", new SqlParameterValue(Types.NUMERIC, askingPrice));
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

    /** A page of rows and the total. */
    public record Page(List<ItemRow> rows, long total) {}

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
