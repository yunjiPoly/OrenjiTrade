package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.wishlist.domain.WishlistItemRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQL of the {@code wishlist_item} table; used only inside the wishlist module. */
@Repository
public class WishlistRepository {

    private static final String SELECT =
            "SELECT w.id, w.owner_id, w.game_slug, w.card_id, w.printing_id, w.rarity,"
                    + " w.public_note, w.near_mint_only, w.price_term, w.created_at, w.updated_at"
                    + " FROM wishlist_item w";

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

    /** Whether the owner already wishes exactly this selection (card, printing, rarity). */
    public boolean existsSameSelection(Values values, @Nullable UUID exceptId) {
        return jdbc.sql(
                                """
                                SELECT count(*) FROM wishlist_item
                                 WHERE owner_id = :ownerId AND card_id = :cardId
                                   AND printing_id IS NOT DISTINCT FROM :printingId
                                   AND rarity IS NOT DISTINCT FROM :rarity
                                   AND (CAST(:exceptId AS uuid) IS NULL OR id <> :exceptId)
                                """)
                        .param("ownerId", values.ownerId())
                        .param("cardId", values.cardId())
                        .param("printingId", values.printingId(), Types.OTHER)
                        .param("rarity", values.rarity(), Types.VARCHAR)
                        .param("exceptId", exceptId, Types.OTHER)
                        .query(Long.class)
                        .single()
                > 0;
    }

    public void insert(UUID id, Values values, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO wishlist_item (id, owner_id, game_slug, card_id, printing_id,
                               rarity, public_note, near_mint_only, price_term, created_at,
                               updated_at)
                        VALUES (:id, :ownerId, :gameSlug, :cardId, :printingId, :rarity,
                                :publicNote, :nearMintOnly, :priceTerm, :now, :now)
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
                               public_note = :publicNote, near_mint_only = :nearMintOnly,
                               price_term = :priceTerm, updated_at = :now
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

    public int deleteByOwner(UUID ownerId) {
        return jdbc.sql("DELETE FROM wishlist_item WHERE owner_id = :ownerId")
                .param("ownerId", ownerId)
                .update();
    }

    private static Map<String, Object> params(Values values) {
        Map<String, Object> params = new HashMap<>();
        params.put("ownerId", values.ownerId());
        params.put("gameSlug", values.gameSlug());
        params.put("cardId", values.cardId());
        params.put("printingId", values.printingId());
        params.put("rarity", values.rarity());
        params.put("publicNote", values.publicNote());
        params.put("nearMintOnly", values.nearMintOnly());
        params.put("priceTerm", values.priceTerm());
        return params;
    }

    private static WishlistItemRow map(ResultSet rs, int rowNum) throws SQLException {
        return new WishlistItemRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getString("game_slug"),
                rs.getObject("card_id", UUID.class),
                rs.getObject("printing_id", UUID.class),
                rs.getString("rarity"),
                rs.getString("public_note"),
                rs.getBoolean("near_mint_only"),
                rs.getString("price_term"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    /**
     * Column values of a wish.
     *
     * @param ownerId owner
     * @param gameSlug game
     * @param cardId card
     * @param printingId printing or {@code null}
     * @param rarity rarity of an "any printing" wish or {@code null}
     * @param publicNote public note ({@code ""} when none)
     * @param nearMintOnly Near Mint only
     * @param priceTerm price term label or {@code null}
     */
    public record Values(
            UUID ownerId,
            String gameSlug,
            UUID cardId,
            @Nullable UUID printingId,
            @Nullable String rarity,
            String publicNote,
            boolean nearMintOnly,
            @Nullable String priceTerm) {}
}
