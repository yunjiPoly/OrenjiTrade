package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.wishlist.domain.WishlistAlertRules;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Wishlist alert SQL (stage S2): which collectors one newly public inventory item should alert, and
 * the sent-alert key ({@code wishlist_alert_sent}). An item fits a wish when it is the wished
 * printing, or any printing of the wished card (of the wished rarity, when one is set), and is Near
 * Mint or better when the wish asks for it ({@link WishlistAlertRules#NEAR_MINT_SQL}). The two
 * collectors must be in the <b>same platform region</b> (ADR 0017: the item owner discoverable with
 * a location, the wish owner with a location; no coordinates or distances exist), with no block in
 * either direction; the item must be effectively public right now ({@link
 * InventoryItemRepository#LISTED}) and fresh (ACTIVE or AGING); the wish owner must be active. One
 * row per wish owner: the most specific of their fitting wishes (one printing, then one rarity,
 * then any printing; oldest first).
 */
@Repository
public class WishlistAlertRepository {

    static final String CANDIDATES =
            """
            SELECT DISTINCT ON (w.owner_id)
                   w.id AS wishlist_item_id, w.owner_id AS wisher_id, w.card_id AS wish_card_id,
                   w.printing_id AS wish_printing_id, w.rarity AS wish_rarity,
                   i.id AS item_id, i.printing_id, i.owner_id AS item_owner_id,
                   c.name AS card_name, p.printing_code, p.rarity AS item_rarity, g.slug AS game,
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
                       ON w.owner_id <> i.owner_id
                      AND (w.printing_id = i.printing_id
                           OR (w.printing_id IS NULL AND w.card_id = p.card_id
                               AND (w.rarity IS NULL OR w.rarity = p.rarity)))
                     JOIN user_location ul ON ul.user_id = w.owner_id
                     JOIN country uc ON uc.code = ul.country_code
                     JOIN user_account wu ON wu.id = w.owner_id
                    WHERE\
                    """
                    + InventoryItemRepository.LISTED
                    + """
                    AND i.id = :itemId
                    AND i.freshness_state IN ('ACTIVE', 'AGING')
                    AND COALESCE(ps.discoverable, false)
                    AND oc.region_code = uc.region_code
                    AND (wu.status = 'ACTIVE' OR (wu.status = 'SUSPENDED'
                         AND wu.suspended_until IS NOT NULL AND wu.suspended_until <= :now))
                    AND\
                    """
                    + WishlistAlertRules.NEAR_MINT_SQL
                    + """
                       AND NOT EXISTS (SELECT 1 FROM user_block ub
                                        WHERE (ub.blocker_id = w.owner_id AND ub.blocked_id = i.owner_id)
                                           OR (ub.blocker_id = i.owner_id AND ub.blocked_id = w.owner_id))
                     ORDER BY w.owner_id, (w.printing_id IS NULL), (w.rarity IS NULL),
                              w.created_at, w.id
                    """;

    private final JdbcClient jdbc;

    public WishlistAlertRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The collectors one inventory item should alert right now (one row per collector). */
    public List<Candidate> candidatesForItem(UUID itemId, Instant now) {
        return jdbc.sql(CANDIDATES)
                .param("itemId", itemId)
                .param("now", Timestamp.from(now))
                .query(WishlistAlertRepository::mapCandidate)
                .list();
    }

    /**
     * Records that {@code userId} is alerted about {@code itemId}; {@code false} when that already
     * happened (the alert must not be sent again).
     */
    public boolean markSent(UUID userId, UUID itemId, Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO wishlist_alert_sent (user_id, inventory_item_id, sent_at)
                                VALUES (:userId, :itemId, :now)
                                ON CONFLICT (user_id, inventory_item_id) DO NOTHING
                                """)
                        .param("userId", userId)
                        .param("itemId", itemId)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    /** Forgets the sent alerts of a user (account deletion). */
    public int deleteSentOf(UUID userId) {
        return jdbc.sql("DELETE FROM wishlist_alert_sent WHERE user_id = :userId")
                .param("userId", userId)
                .update();
    }

    private static Candidate mapCandidate(ResultSet rs, int rowNum) throws SQLException {
        return new Candidate(
                rs.getObject("wishlist_item_id", UUID.class),
                rs.getObject("wisher_id", UUID.class),
                rs.getObject("wish_card_id", UUID.class),
                rs.getObject("wish_printing_id", UUID.class),
                rs.getString("wish_rarity"),
                rs.getObject("item_id", UUID.class),
                rs.getObject("printing_id", UUID.class),
                rs.getObject("item_owner_id", UUID.class),
                rs.getString("card_name"),
                rs.getString("printing_code"),
                rs.getString("item_rarity"),
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

    /**
     * A collector to alert about a newly public item, through their most specific fitting wish.
     *
     * @param wishlistItemId the fitting wish
     * @param wisherId owner of the wish (the recipient)
     * @param wishCardId card of the wish
     * @param wishPrintingId printing of the wish ({@code null} = any printing)
     * @param wishRarity rarity of the wish ({@code null} = any rarity)
     * @param itemId the inventory item
     * @param printingId printing of the item (its picture in the notification)
     * @param itemOwnerId owner of the item
     * @param cardName card name
     * @param printingCode printing code of the item
     * @param itemRarity rarity of the item's printing
     * @param game game slug
     * @param itemOwnerHandle handle of the item owner
     * @param itemOwnerPlace state/province and country of the item owner (never a city)
     */
    public record Candidate(
            UUID wishlistItemId,
            UUID wisherId,
            UUID wishCardId,
            @Nullable UUID wishPrintingId,
            @Nullable String wishRarity,
            UUID itemId,
            UUID printingId,
            UUID itemOwnerId,
            String cardName,
            @Nullable String printingCode,
            @Nullable String itemRarity,
            String game,
            String itemOwnerHandle,
            PublicPlace itemOwnerPlace) {}
}
