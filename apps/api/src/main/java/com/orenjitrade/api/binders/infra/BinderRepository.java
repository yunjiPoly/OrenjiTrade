package com.orenjitrade.api.binders.infra;

import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code binder} access (explicit SQL). {@code item_count} is maintained by a database trigger and
 * never written here. Reads carry the live effective public visibility ({@link
 * PublicVisibilityRules}).
 */
@Repository
public class BinderRepository {

    private static final String COLUMNS =
            """
            b.id, b.owner_id, b.name, b.description, b.kind, b.visibility, b.public_until,
            b.sort_order, b.cover_printing_id, b.item_count, b.freshness_state, b.confirmed_at,
            b.created_at, b.updated_at, b.last_owner_activity_at,
            """
                    + PublicVisibilityRules.binderEffectivelyPublic("b")
                    + " AS effective_public";

    private static final String FROM =
            " FROM binder b" + PublicVisibilityRules.ownerJoins("b.owner_id");

    private static final String FRESHNESS_CASE =
            """
            CASE WHEN confirmed_at <= :hiddenCutoff THEN 'HIDDEN'
                 WHEN confirmed_at <= :staleCutoff THEN 'STALE'
                 WHEN confirmed_at <= :agingCutoff THEN 'AGING'
                 ELSE 'ACTIVE' END
            """;

    private final JdbcClient jdbc;

    public BinderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    public List<BinderView> findByOwner(UUID ownerId, Instant now) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + " WHERE b.owner_id = :ownerId"
                                + " ORDER BY b.sort_order, b.created_at, b.id")
                .param("ownerId", ownerId)
                .param("now", Timestamp.from(now))
                .query(BinderRepository::map)
                .list();
    }

    public Optional<BinderView> findById(UUID id, Instant now) {
        return jdbc.sql("SELECT " + COLUMNS + FROM + " WHERE b.id = :id")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .query(BinderRepository::map)
                .optional();
    }

    public List<BinderView> findByIds(Collection<UUID> ids, Instant now) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT " + COLUMNS + FROM + " WHERE b.id IN (:ids)")
                .param("ids", ids)
                .param("now", Timestamp.from(now))
                .query(BinderRepository::map)
                .list();
    }

    /**
     * Admin console "Binders" (Phase 7): every binder, optionally by owner, visibility and name
     * (case- and accent-insensitive substring), newest change first, with the owner's handle.
     */
    public AdminPage adminPage(
            @Nullable String query,
            @Nullable UUID ownerId,
            @Nullable ListingVisibility visibility,
            int page,
            int size,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        StringBuilder where = new StringBuilder(" WHERE true");
        if (query != null && !query.isBlank()) {
            where.append(
                    " AND lower(unaccent_immutable(b.name)) LIKE lower(unaccent_immutable(:q))");
            params.put(
                    "q",
                    "%"
                            + query.trim()
                                    .replace("\\", "\\\\")
                                    .replace("%", "\\%")
                                    .replace("_", "\\_")
                            + "%");
        }
        if (ownerId != null) {
            where.append(" AND b.owner_id = :ownerId");
            params.put("ownerId", ownerId);
        }
        if (visibility != null) {
            where.append(" AND b.visibility = :visibility");
            params.put("visibility", visibility.name());
        }
        long total =
                jdbc.sql("SELECT count(*)" + FROM + where)
                        .params(params)
                        .query(Long.class)
                        .single();
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<AdminRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + COLUMNS
                                        + ", u.handle AS owner_handle"
                                        + FROM
                                        + where
                                        + " ORDER BY b.updated_at DESC, b.id LIMIT :limit OFFSET"
                                        + " :offset")
                        .params(params)
                        .query(
                                (rs, rowNum) ->
                                        new AdminRow(map(rs, rowNum), rs.getString("owner_handle")))
                        .list();
        return new AdminPage(rows, total);
    }

    /** A binder with its owner's handle (admin console). */
    public record AdminRow(BinderView binder, String ownerHandle) {}

    /** One admin page with the total count. */
    public record AdminPage(List<AdminRow> rows, long total) {}

    /** The owner's effectively public binders, in the owner's order. */
    public List<BinderView> findEffectivelyPublicByOwner(UUID ownerId, Instant now) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + " WHERE b.owner_id = :ownerId AND "
                                + PublicVisibilityRules.binderEffectivelyPublic("b")
                                + " ORDER BY b.sort_order, b.created_at, b.id")
                .param("ownerId", ownerId)
                .param("now", Timestamp.from(now))
                .query(BinderRepository::map)
                .list();
    }

    /** Locks the owner's binder row (writes). */
    public boolean lockOwned(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT id FROM binder WHERE id = :id AND owner_id = :ownerId FOR UPDATE")
                .param("id", id)
                .param("ownerId", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    /** Ids among {@code ids} that the owner does not own (or that do not exist). */
    public List<UUID> notOwned(UUID ownerId, Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        List<UUID> owned =
                jdbc.sql("SELECT id FROM binder WHERE owner_id = :ownerId AND id IN (:ids)")
                        .param("ownerId", ownerId)
                        .param("ids", ids)
                        .query(UUID.class)
                        .list();
        return ids.stream().filter(id -> !owned.contains(id)).toList();
    }

    public long countByOwner(UUID ownerId) {
        return jdbc.sql("SELECT count(*) FROM binder WHERE owner_id = :ownerId")
                .param("ownerId", ownerId)
                .query(Long.class)
                .single();
    }

    /** Earliest future end of the owner's temporary binder publications. */
    public Optional<Instant> nextExpiry(UUID ownerId, Instant now) {
        return jdbc
                .sql(
                        """
                        SELECT min(public_until) FROM binder
                         WHERE owner_id = :ownerId AND visibility = 'TEMPORARILY_PUBLIC'
                           AND public_until > :now
                        """)
                .param("ownerId", ownerId)
                .param("now", Timestamp.from(now))
                .query(Timestamp.class)
                .list()
                .stream()
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .map(Timestamp::toInstant);
    }

    /** Serialises binder creation per owner (limit check + insert) until the transaction ends. */
    public void lockOwnerForCreation(UUID ownerId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended('binder-create:' || :ownerId, 0))")
                .param("ownerId", ownerId.toString())
                .query()
                .singleRow();
    }

    public int nextSortOrder(UUID ownerId) {
        Integer max =
                jdbc
                        .sql("SELECT max(sort_order) FROM binder WHERE owner_id = :ownerId")
                        .param("ownerId", ownerId)
                        .query(Integer.class)
                        .list()
                        .stream()
                        .filter(java.util.Objects::nonNull)
                        .findFirst()
                        .orElse(null);
        return max == null ? 0 : max + 1;
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    public void insert(
            UUID id,
            UUID ownerId,
            String name,
            String description,
            BinderKind kind,
            ListingVisibility visibility,
            @Nullable Instant publicUntil,
            int sortOrder,
            @Nullable UUID coverPrintingId,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO binder (id, owner_id, name, description, kind, visibility,
                            public_until, sort_order, cover_printing_id, freshness_state, created_at,
                            updated_at, confirmed_at, last_owner_activity_at)
                        VALUES (:id, :ownerId, :name, :description, :kind, :visibility,
                            :publicUntil, :sortOrder, :cover, 'ACTIVE', :now, :now, :now, :now)
                        """)
                .param("id", id)
                .param("ownerId", ownerId)
                .param("name", name)
                .param("description", description)
                .param("kind", kind.name())
                .param("visibility", visibility.name())
                .param("publicUntil", timestamp(publicUntil), Types.TIMESTAMP)
                .param("sortOrder", sortOrder)
                .param("cover", coverPrintingId, Types.OTHER)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void update(
            UUID id,
            String name,
            String description,
            BinderKind kind,
            ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID coverPrintingId,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE binder SET name = :name, description = :description, kind = :kind,
                               visibility = :visibility, public_until = :publicUntil,
                               cover_printing_id = :cover, updated_at = :now,
                               last_owner_activity_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("name", name)
                .param("description", description)
                .param("kind", kind.name())
                .param("visibility", visibility.name())
                .param("publicUntil", timestamp(publicUntil), Types.TIMESTAMP)
                .param("cover", coverPrintingId, Types.OTHER)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void setVisibility(
            UUID id, ListingVisibility visibility, @Nullable Instant publicUntil, Instant now) {
        jdbc.sql(
                        """
                        UPDATE binder SET visibility = :visibility, public_until = :publicUntil,
                               updated_at = :now, last_owner_activity_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("visibility", visibility.name())
                .param("publicUntil", timestamp(publicUntil), Types.TIMESTAMP)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void setSortOrder(UUID id, int sortOrder) {
        jdbc.sql("UPDATE binder SET sort_order = :sortOrder WHERE id = :id")
                .param("id", id)
                .param("sortOrder", sortOrder)
                .update();
    }

    public void delete(UUID id) {
        jdbc.sql("DELETE FROM binder WHERE id = :id").param("id", id).update();
    }

    /** Deletes every binder of an owner (account purge); returns their ids. */
    public List<UUID> deleteAllOf(UUID ownerId) {
        return jdbc.sql("DELETE FROM binder WHERE owner_id = :ownerId RETURNING id")
                .param("ownerId", ownerId)
                .query(UUID.class)
                .list();
    }

    /**
     * Owner confirmation: {@code confirmed_at} and activity set to {@code now}, warning reset,
     * freshness back to ACTIVE.
     *
     * @return the previous freshness state of every confirmed binder
     */
    public List<StateChange> confirm(UUID ownerId, Collection<UUID> ids, Instant now) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        """
                        WITH previous AS (
                            SELECT id, freshness_state FROM binder
                             WHERE owner_id = :ownerId AND id IN (:ids) FOR UPDATE)
                        UPDATE binder b SET confirmed_at = :now, last_owner_activity_at = :now,
                               warned_at = NULL, freshness_state = 'ACTIVE'
                          FROM previous p
                         WHERE b.id = p.id
                        RETURNING b.id, b.owner_id, p.freshness_state AS old_state,
                                  b.freshness_state AS new_state
                        """)
                .param("ownerId", ownerId)
                .param("ids", ids)
                .param("now", Timestamp.from(now))
                .query(BinderRepository::mapStateChange)
                .list();
    }

    /** Re-derives the freshness of every binder from the policy; returns the changes. */
    public List<StateChange> recomputeFreshness(FreshnessPolicy policy, Instant now) {
        return jdbc.sql(
                        "WITH computed AS (SELECT id, freshness_state AS old_state, "
                                + FRESHNESS_CASE
                                + " AS new_state FROM binder)"
                                + " UPDATE binder b SET freshness_state = c.new_state"
                                + " FROM computed c"
                                + " WHERE b.id = c.id AND c.old_state <> c.new_state"
                                + " RETURNING b.id, b.owner_id, c.old_state, c.new_state")
                .param("hiddenCutoff", Timestamp.from(policy.hiddenCutoff(now)))
                .param("staleCutoff", Timestamp.from(policy.staleCutoff(now)))
                .param("agingCutoff", Timestamp.from(policy.agingCutoff(now)))
                .query(BinderRepository::mapStateChange)
                .list();
    }

    /** Marks publicly listed binders entering the warning window; returns them. */
    public List<Warned> warn(FreshnessPolicy policy, Instant now) {
        return jdbc.sql(
                        """
                        UPDATE binder SET warned_at = :now
                         WHERE warned_at IS NULL AND publicly_listed AND freshness_state <> 'HIDDEN'
                           AND confirmed_at <= :warnCutoff AND confirmed_at > :hiddenCutoff
                        RETURNING id, owner_id, confirmed_at
                        """)
                .param("now", Timestamp.from(now))
                .param("warnCutoff", Timestamp.from(policy.warnCutoff(now)))
                .param("hiddenCutoff", Timestamp.from(policy.hiddenCutoff(now)))
                .query(
                        (rs, rowNum) ->
                                new Warned(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("owner_id", UUID.class),
                                        rs.getTimestamp("confirmed_at").toInstant()))
                .list();
    }

    /** Expired temporary publications become PRIVATE; returns the number of binders changed. */
    public int normaliseExpired(Instant now) {
        return jdbc.sql(
                        """
                        UPDATE binder SET visibility = 'PRIVATE', public_until = NULL
                         WHERE visibility = 'TEMPORARILY_PUBLIC' AND public_until <= :now
                        """)
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * Stores the effective public visibility of the binders matching {@code scopeSql} (a condition
     * on alias {@code b}) and returns those whose value flipped.
     */
    public List<ListingChange> reconcile(
            String scopeSql, java.util.Map<String, ?> params, Instant now) {
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                                "WITH computed AS (SELECT b.id, "
                                        + PublicVisibilityRules.binderEffectivelyPublic("b")
                                        + " AS listed"
                                        + FROM
                                        + " WHERE "
                                        + scopeSql
                                        + ")"
                                        + " UPDATE binder t SET publicly_listed = c.listed,"
                                        + " listing_changed_at = :now"
                                        + " FROM computed c"
                                        + " WHERE t.id = c.id AND t.publicly_listed <> c.listed"
                                        + " RETURNING t.id, t.owner_id, c.listed")
                        .param("now", Timestamp.from(now));
        for (java.util.Map.Entry<String, ?> param : params.entrySet()) {
            statement = statement.param(param.getKey(), param.getValue());
        }
        return statement
                .query(
                        (rs, rowNum) ->
                                new ListingChange(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("owner_id", UUID.class),
                                        rs.getBoolean("listed")))
                .list();
    }

    /** Whether the binder is materialised as publicly listed (before its deletion). */
    public boolean isPubliclyListed(UUID id) {
        return jdbc.sql("SELECT publicly_listed FROM binder WHERE id = :id")
                .param("id", id)
                .query(Boolean.class)
                .optional()
                .orElse(false);
    }

    /** Cover printing ids that exist (validation). */
    public boolean printingExists(UUID printingId) {
        return jdbc.sql("SELECT count(*) FROM card_printing WHERE id = :id")
                        .param("id", printingId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private static @Nullable Timestamp timestamp(@Nullable Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static BinderView map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp publicUntil = rs.getTimestamp("public_until");
        return new BinderView(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getString("name"),
                rs.getString("description"),
                BinderKind.valueOf(rs.getString("kind")),
                ListingVisibility.valueOf(rs.getString("visibility")),
                publicUntil == null ? null : publicUntil.toInstant(),
                rs.getInt("sort_order"),
                rs.getObject("cover_printing_id", UUID.class),
                rs.getInt("item_count"),
                FreshnessState.valueOf(rs.getString("freshness_state")),
                rs.getTimestamp("confirmed_at").toInstant(),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getTimestamp("last_owner_activity_at").toInstant(),
                rs.getBoolean("effective_public"));
    }

    private static StateChange mapStateChange(ResultSet rs, int rowNum) throws SQLException {
        return new StateChange(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                FreshnessState.valueOf(rs.getString("old_state")),
                FreshnessState.valueOf(rs.getString("new_state")));
    }

    /** A freshness state change of a binder. */
    public record StateChange(
            UUID binderId, UUID ownerId, FreshnessState previous, FreshnessState current) {}

    /** A binder that entered its warning window. */
    public record Warned(UUID binderId, UUID ownerId, Instant confirmedAt) {}

    /** A flip of the materialised effective visibility. */
    public record ListingChange(UUID binderId, UUID ownerId, boolean listed) {}
}
