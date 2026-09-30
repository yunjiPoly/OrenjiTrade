package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.wishlist.domain.TradePreference;
import com.orenjitrade.api.wishlist.domain.WishlistItemRow;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQL of the {@code wishlist_item} table; used only inside the wishlist module. */
@Repository
public class WishlistRepository {

    /**
     * Undismissed matches whose inventory item is publicly listed right now and whose owner is not
     * blocked with the wishlist owner (either direction).
     */
    static final String MATCH_COUNT =
            """
            (SELECT count(*) FROM wishlist_match m
               JOIN inventory_item i ON i.id = m.inventory_item_id
              WHERE m.wishlist_item_id = w.id AND NOT m.dismissed
                AND i.publicly_listed AND i.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM user_block ub
                                 WHERE (ub.blocker_id = w.owner_id AND ub.blocked_id = i.owner_id)
                                    OR (ub.blocker_id = i.owner_id AND ub.blocked_id = w.owner_id)))
            """;

    private static final String SELECT =
            "SELECT w.id, w.owner_id, w.game_slug, w.card_id, w.printing_id, w.rarity,"
                    + " w.condition_min, w.edition, w.language, w.max_price, w.currency,"
                    + " w.radius_km, w.trade_preference, w.notes, w.active, w.created_at,"
                    + " w.updated_at, w.last_matched_at, "
                    + MATCH_COUNT
                    + " AS match_count FROM wishlist_item w";

    private final JdbcClient jdbc;

    public WishlistRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The owner's items, newest first. */
    public List<WishlistItemRow> findByOwner(UUID ownerId) {
        return jdbc.sql(SELECT + " WHERE w.owner_id = :ownerId ORDER BY w.created_at DESC, w.id")
                .param("ownerId", ownerId)
                .query(WishlistRepository::map)
                .list();
    }

    /** The owner's active items (public summary), newest first. */
    public List<WishlistItemRow> findActiveByOwner(UUID ownerId) {
        return jdbc.sql(
                        SELECT
                                + " WHERE w.owner_id = :ownerId AND w.active"
                                + " ORDER BY w.created_at DESC, w.id")
                .param("ownerId", ownerId)
                .query(WishlistRepository::map)
                .list();
    }

    public Optional<WishlistItemRow> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE w.id = :id")
                .param("id", id)
                .query(WishlistRepository::map)
                .optional();
    }

    public long countByOwner(UUID ownerId) {
        return jdbc.sql("SELECT count(*) FROM wishlist_item WHERE owner_id = :ownerId")
                .param("ownerId", ownerId)
                .query(Long.class)
                .single();
    }

    /** Whether the owner already wishes exactly this target with the same filters. */
    public boolean existsSameWish(Values values, @Nullable UUID exceptId) {
        return jdbc.sql(
                                """
                                SELECT count(*) FROM wishlist_item
                                 WHERE owner_id = :ownerId AND card_id = :cardId
                                   AND printing_id IS NOT DISTINCT FROM :printingId
                                   AND rarity IS NOT DISTINCT FROM :rarity
                                   AND condition_min IS NOT DISTINCT FROM :conditionMin
                                   AND edition IS NOT DISTINCT FROM :edition
                                   AND language IS NOT DISTINCT FROM :language
                                   AND (CAST(:exceptId AS uuid) IS NULL OR id <> :exceptId)
                                """)
                        .param("ownerId", values.ownerId())
                        .param("cardId", values.cardId())
                        .param("printingId", values.printingId(), Types.OTHER)
                        .param("rarity", values.rarity(), Types.VARCHAR)
                        .param("conditionMin", values.conditionMin(), Types.VARCHAR)
                        .param("edition", values.edition(), Types.VARCHAR)
                        .param("language", values.language(), Types.VARCHAR)
                        .param("exceptId", exceptId, Types.OTHER)
                        .query(Long.class)
                        .single()
                > 0;
    }

    public void insert(UUID id, Values values, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO wishlist_item (id, owner_id, game_slug, card_id, printing_id,
                               rarity, condition_min, edition, language, max_price, currency,
                               radius_km, trade_preference, notes, active, created_at, updated_at)
                        VALUES (:id, :ownerId, :gameSlug, :cardId, :printingId, :rarity,
                                :conditionMin, :edition, :language, :maxPrice, :currency,
                                :radiusKm, :tradePreference, :notes, :active, :now, :now)
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .params(params(values))
                .update();
    }

    public void update(UUID id, Values values, Instant now) {
        jdbc.sql(
                        """
                        UPDATE wishlist_item
                           SET printing_id = :printingId, rarity = :rarity,
                               condition_min = :conditionMin, edition = :edition,
                               language = :language, max_price = :maxPrice, currency = :currency,
                               radius_km = :radiusKm, trade_preference = :tradePreference,
                               notes = :notes, active = :active, updated_at = :now
                         WHERE id = :id AND owner_id = :ownerId
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .params(params(values))
                .update();
    }

    public int delete(UUID ownerId, UUID id) {
        return jdbc.sql("DELETE FROM wishlist_item WHERE id = :id AND owner_id = :ownerId")
                .param("id", id)
                .param("ownerId", ownerId)
                .update();
    }

    public void touchMatched(UUID id, Instant now) {
        jdbc.sql("UPDATE wishlist_item SET last_matched_at = :now WHERE id = :id")
                .param("now", Timestamp.from(now))
                .param("id", id)
                .update();
    }

    /** Active items edited since {@code since} (nightly rematch). */
    public List<UUID> activeUpdatedSince(Instant since, int limit) {
        return jdbc.sql(
                        "SELECT id FROM wishlist_item WHERE active AND updated_at >= :since"
                                + " ORDER BY updated_at LIMIT :limit")
                .param("since", Timestamp.from(since))
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }

    public int deleteByOwner(UUID ownerId) {
        return jdbc.sql("DELETE FROM wishlist_item WHERE owner_id = :ownerId")
                .param("ownerId", ownerId)
                .update();
    }

    private static java.util.Map<String, Object> params(Values values) {
        java.util.Map<String, Object> params = new java.util.HashMap<>();
        params.put("ownerId", values.ownerId());
        params.put("gameSlug", values.gameSlug());
        params.put("cardId", values.cardId());
        params.put("printingId", values.printingId());
        params.put("rarity", values.rarity());
        params.put("conditionMin", values.conditionMin());
        params.put("edition", values.edition());
        params.put("language", values.language());
        params.put("maxPrice", values.maxPrice());
        params.put("currency", values.currency());
        params.put("radiusKm", values.radiusKm());
        params.put("tradePreference", values.tradePreference().name());
        params.put("notes", values.notes());
        params.put("active", values.active());
        return params;
    }

    private static WishlistItemRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp lastMatched = rs.getTimestamp("last_matched_at");
        return new WishlistItemRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getString("game_slug"),
                rs.getObject("card_id", UUID.class),
                rs.getObject("printing_id", UUID.class),
                rs.getString("rarity"),
                rs.getString("condition_min"),
                rs.getString("edition"),
                rs.getString("language"),
                rs.getBigDecimal("max_price"),
                rs.getString("currency").trim(),
                rs.getInt("radius_km"),
                TradePreference.valueOf(rs.getString("trade_preference")),
                rs.getString("notes"),
                rs.getBoolean("active"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                lastMatched == null ? null : lastMatched.toInstant(),
                rs.getLong("match_count"));
    }

    /**
     * Column values of an item.
     *
     * @param ownerId owner
     * @param gameSlug game
     * @param cardId card
     * @param printingId printing or {@code null}
     * @param rarity rarity or {@code null}
     * @param conditionMin minimum condition or {@code null}
     * @param edition edition or {@code null}
     * @param language language or {@code null}
     * @param maxPrice maximum price or {@code null}
     * @param currency currency
     * @param radiusKm radius
     * @param tradePreference trade preference
     * @param notes private notes
     * @param active active
     */
    public record Values(
            UUID ownerId,
            String gameSlug,
            UUID cardId,
            @Nullable UUID printingId,
            @Nullable String rarity,
            @Nullable String conditionMin,
            @Nullable String edition,
            @Nullable String language,
            @Nullable BigDecimal maxPrice,
            String currency,
            int radiusKm,
            TradePreference tradePreference,
            String notes,
            boolean active) {}
}
