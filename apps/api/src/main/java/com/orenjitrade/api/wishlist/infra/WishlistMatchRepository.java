package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.wishlist.domain.WishlistRules;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Wishlist matching SQL (Phase 6 contract "Matching pipeline") and the {@code wishlist_match}
 * table. The candidate query is the contract's: active wishlist items of other collectors for the
 * printing (or the card when no printing is wished), condition rank, edition, language, rarity,
 * price, trade preference, the two collectors in the <b>same platform region</b> (ADR 0017: the
 * item owner discoverable with a location, the wishlist owner with a location; no coordinates or
 * distances exist), and no block in either direction. The item must be effectively public right now
 * ({@link InventoryItemRepository#LISTED}, the live Phase 3 rule) and fresh (ACTIVE or AGING); the
 * wishlist owner must be active.
 */
@Repository
public class WishlistMatchRepository {

    static final String CANDIDATES =
            """
            SELECT w.id AS wishlist_item_id, w.owner_id AS wisher_id, i.id AS item_id,
                   i.printing_id, i.owner_id AS item_owner_id, c.name AS card_name,
                   p.printing_code,
                   i.asking_price, i.currency, g.slug AS game,
                   u.handle AS item_owner_handle, oc.region_code,
                   osd.code AS subdivision_code, osd.name AS subdivision_name,
                   osd.whole_country, oc.name AS country_name
              FROM inventory_item i
              JOIN card_printing p ON p.id = i.printing_id
              JOIN card c ON c.id = p.card_id
              JOIN game g ON g.id = c.game_id
              LEFT JOIN binder b ON b.id = i.binder_id
            """
                    + PublicVisibilityRules.ownerJoins("i.owner_id")
                    + """
                     CROSS JOIN LATERAL (
                         SELECT ARRAY(SELECT jsonb_array_elements_text(g.schema -> 'conditions'))
                                AS conditions) gc
                     JOIN user_location ol ON ol.user_id = i.owner_id
                     JOIN country oc ON oc.code = ol.country_code
                     JOIN subdivision osd ON osd.code = ol.subdivision_code
                     JOIN wishlist_item w
                       ON w.active AND w.owner_id <> i.owner_id
                      AND (w.printing_id = i.printing_id
                           OR (w.printing_id IS NULL AND w.card_id = p.card_id))
                     JOIN user_location ul ON ul.user_id = w.owner_id
                     JOIN country uc ON uc.code = ul.country_code
                     JOIN user_account wu ON wu.id = w.owner_id
                    WHERE\
                    """
                    + InventoryItemRepository.LISTED
                    + """
                    AND i.freshness_state IN ('ACTIVE', 'AGING')
                    AND COALESCE(ps.discoverable, false)
                    AND oc.region_code = uc.region_code
                    AND (wu.status = 'ACTIVE' OR (wu.status = 'SUSPENDED'
                         AND wu.suspended_until IS NOT NULL AND wu.suspended_until <= :now))
                    AND\
                    """
                    + WishlistRules.CONDITION_SQL
                    + """
                    AND (w.edition IS NULL OR w.edition = i.edition)
                    AND (w.language IS NULL OR w.language = i.language)
                    AND (w.rarity IS NULL OR w.rarity = p.rarity)
                    AND\
                    """
                    + WishlistRules.PRICE_SQL
                    + " AND "
                    + WishlistRules.TRADE_SQL
                    + """
                       AND NOT EXISTS (SELECT 1 FROM user_block ub
                                        WHERE (ub.blocker_id = w.owner_id AND ub.blocked_id = i.owner_id)
                                           OR (ub.blocker_id = i.owner_id AND ub.blocked_id = w.owner_id))
                    """;

    /** Matches served to the wishlist owner: the item is publicly listed, no block. */
    private static final String SERVED =
            """
             FROM wishlist_match m
             JOIN wishlist_item w ON w.id = m.wishlist_item_id
             JOIN inventory_item i ON i.id = m.inventory_item_id
            WHERE i.publicly_listed AND i.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM user_block ub
                               WHERE (ub.blocker_id = w.owner_id AND ub.blocked_id = i.owner_id)
                                  OR (ub.blocker_id = i.owner_id AND ub.blocked_id = w.owner_id))
            """;

    /** Safety bound of one wishlist-side matching run. */
    static final int MAX_CANDIDATES = 500;

    private final JdbcClient jdbc;

    public WishlistMatchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Wishlist items matching one inventory item right now. */
    public List<Candidate> candidatesForItem(UUID itemId, Instant now) {
        return jdbc.sql(CANDIDATES + " AND i.id = :itemId ORDER BY w.created_at, w.id")
                .param("itemId", itemId)
                .param("now", Timestamp.from(now))
                .query(WishlistMatchRepository::mapCandidate)
                .list();
    }

    /** Public inventory items matching one wishlist item right now (freshest first, bounded). */
    public List<Candidate> candidatesForWishlistItem(UUID wishlistItemId, Instant now) {
        return jdbc.sql(
                        CANDIDATES
                                + " AND w.id = :wishlistItemId ORDER BY i.confirmed_at DESC, i.id"
                                + " LIMIT "
                                + MAX_CANDIDATES)
                .param("wishlistItemId", wishlistItemId)
                .param("now", Timestamp.from(now))
                .query(WishlistMatchRepository::mapCandidate)
                .list();
    }

    /** Inserts a match unless the pair exists (idempotent); the new id, or empty. */
    public Optional<UUID> insert(Candidate candidate, Instant now) {
        return jdbc.sql(
                        """
                        INSERT INTO wishlist_match (id, wishlist_item_id, inventory_item_id,
                                                    matched_at)
                        VALUES (gen_random_uuid(), :wishlistItemId, :itemId, :now)
                        ON CONFLICT (wishlist_item_id, inventory_item_id) DO NOTHING
                        RETURNING id
                        """)
                .param("wishlistItemId", candidate.wishlistItemId())
                .param("itemId", candidate.itemId())
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .optional();
    }

    public void markNotified(UUID matchId) {
        jdbc.sql("UPDATE wishlist_match SET notified = true WHERE id = :id")
                .param("id", matchId)
                .update();
    }

    /**
     * Removes the undismissed matches of a wishlist item whose inventory item is not in {@code
     * keep} (the item's criteria changed); dismissed matches stay dismissed.
     */
    public int deleteUndismissedExcept(UUID wishlistItemId, Collection<UUID> keep) {
        if (keep.isEmpty()) {
            return jdbc.sql(
                            "DELETE FROM wishlist_match WHERE wishlist_item_id = :id AND NOT"
                                    + " dismissed")
                    .param("id", wishlistItemId)
                    .update();
        }
        return jdbc.sql(
                        "DELETE FROM wishlist_match WHERE wishlist_item_id = :id AND NOT dismissed"
                                + " AND inventory_item_id NOT IN (:keep)")
                .param("id", wishlistItemId)
                .param("keep", keep)
                .update();
    }

    /** One slice of the served matches of a wishlist item, newest first. */
    public List<MatchRow> page(
            UUID wishlistItemId, boolean includeDismissed, @Nullable TimeCursor cursor, int limit) {
        StringBuilder sql =
                new StringBuilder(
                                "SELECT m.id, m.wishlist_item_id, m.inventory_item_id,"
                                        + " i.owner_id AS item_owner_id, m.matched_at,"
                                        + " m.dismissed, m.notified")
                        .append(SERVED)
                        .append(" AND m.wishlist_item_id = :wishlistItemId");
        if (!includeDismissed) {
            sql.append(" AND NOT m.dismissed");
        }
        if (cursor != null) {
            sql.append(" AND (m.matched_at, m.id) < (:cursorAt, :cursorId)");
        }
        sql.append(" ORDER BY m.matched_at DESC, m.id DESC LIMIT :limit");
        JdbcClient.StatementSpec statement =
                jdbc.sql(sql.toString())
                        .param("wishlistItemId", wishlistItemId)
                        .param("limit", limit);
        if (cursor != null) {
            statement =
                    statement
                            .param("cursorAt", Timestamp.from(cursor.at()))
                            .param("cursorId", cursor.id());
        }
        return statement.query(WishlistMatchRepository::mapMatch).list();
    }

    /** Owner of the wishlist item of a match. */
    public Optional<UUID> ownerOfMatch(UUID matchId) {
        return jdbc.sql(
                        "SELECT w.owner_id FROM wishlist_match m JOIN wishlist_item w ON w.id ="
                                + " m.wishlist_item_id WHERE m.id = :id")
                .param("id", matchId)
                .query(UUID.class)
                .optional();
    }

    public void dismiss(UUID matchId) {
        jdbc.sql("UPDATE wishlist_match SET dismissed = true WHERE id = :id")
                .param("id", matchId)
                .update();
    }

    /** Publicly listed items whose publication changed since {@code since} (nightly rematch). */
    public List<UUID> itemsPublishedSince(Instant since, int limit) {
        return jdbc.sql(
                        "SELECT id FROM inventory_item WHERE publicly_listed AND deleted_at IS NULL"
                                + " AND listing_changed_at >= :since ORDER BY listing_changed_at"
                                + " LIMIT :limit")
                .param("since", Timestamp.from(since))
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }

    private static Candidate mapCandidate(ResultSet rs, int rowNum) throws SQLException {
        return new Candidate(
                rs.getObject("wishlist_item_id", UUID.class),
                rs.getObject("wisher_id", UUID.class),
                rs.getObject("item_id", UUID.class),
                rs.getObject("printing_id", UUID.class),
                rs.getObject("item_owner_id", UUID.class),
                rs.getString("card_name"),
                rs.getString("printing_code"),
                rs.getBigDecimal("asking_price"),
                rs.getString("currency").trim(),
                rs.getString("game"),
                rs.getString("item_owner_handle"),
                new PublicPlace(
                        rs.getString("region_code"),
                        rs.getString("subdivision_code").substring(0, 2),
                        rs.getString("country_name"),
                        rs.getString("subdivision_code"),
                        rs.getString("subdivision_name"),
                        rs.getBoolean("whole_country")));
    }

    private static MatchRow mapMatch(ResultSet rs, int rowNum) throws SQLException {
        return new MatchRow(
                rs.getObject("id", UUID.class),
                rs.getObject("wishlist_item_id", UUID.class),
                rs.getObject("inventory_item_id", UUID.class),
                rs.getObject("item_owner_id", UUID.class),
                rs.getTimestamp("matched_at").toInstant(),
                rs.getBoolean("dismissed"),
                rs.getBoolean("notified"));
    }

    /**
     * A wishlist item and a public inventory item that match (same platform region; ADR 0017).
     *
     * @param wishlistItemId wishlist item
     * @param wisherId owner of the wishlist item
     * @param itemId inventory item
     * @param printingId printing of the inventory item (its picture in the notification)
     * @param itemOwnerId owner of the inventory item
     * @param cardName card name
     * @param printingCode printing code
     * @param askingPrice asking price
     * @param currency currency of the price
     * @param game game slug
     * @param itemOwnerHandle handle of the item owner
     * @param itemOwnerPlace state/province and country of the item owner (never a city)
     */
    public record Candidate(
            UUID wishlistItemId,
            UUID wisherId,
            UUID itemId,
            UUID printingId,
            UUID itemOwnerId,
            String cardName,
            @Nullable String printingCode,
            @Nullable BigDecimal askingPrice,
            String currency,
            String game,
            String itemOwnerHandle,
            PublicPlace itemOwnerPlace) {}

    /**
     * A stored match.
     *
     * @param id match id
     * @param wishlistItemId wishlist item
     * @param inventoryItemId inventory item
     * @param itemOwnerId owner of the inventory item
     * @param matchedAt when it matched
     * @param dismissed dismissed by the wishlist owner
     * @param notified whether a notification was created
     */
    public record MatchRow(
            UUID id,
            UUID wishlistItemId,
            UUID inventoryItemId,
            UUID itemOwnerId,
            Instant matchedAt,
            boolean dismissed,
            boolean notified) {}
}
