package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.wishlist.domain.WishlistAlerts;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds collector2's wishlist ({@code docs/development/seed-data.md} "Interactions"; fictional,
 * local/dev only, stable ids {@code 00000000-0000-4000-8f00-0000000002NN}):
 *
 * <ul>
 *   <li>{@code ygo-p001a} (Azure-Eyes Sky Dragon AZR-EN001), Near Mint only, "90% TCG", with a
 *       public note: collector1 lists it publicly (Near Mint), so the seed runs the wishlist alert
 *       for that item and collector2 gets a WISHLIST_ALERT notification (through the normal
 *       pipeline, sent-alert and dedup keyed);
 *   <li>{@code pkm-p002a}: collector1 keeps it in a private unfiled lot, so publishing it locally
 *       triggers a fresh alert;
 *   <li>the card of {@code mtg-p005b}, any printing, "100% TCG+": collector5 lists it (no alert at
 *       seed time; alerts are only sent for new publications).
 * </ul>
 *
 * Collectors 1, 2 and 5 are all in Americas (North) (db/seed/locations.json): alerts never cross
 * platform regions (ADR 0017). The first run also makes collector2's wishlist visible on their
 * profile. Items are inserted once ({@code ON CONFLICT DO NOTHING}); later runs leave local edits
 * alone.
 *
 * <p>A database seeded before stage S2 and migrated since (V112) already holds the three wishes,
 * with the migration's defaults (no note, no "Near Mint only", no price term) and no wishlist
 * alert. Such a wish gets its S2 seed values while it is still untouched (the three fields at their
 * defaults and {@code updated_at = created_at}: a wish edited locally is never changed), and the
 * sample alert is run until collector2 has been alerted about collector1's listing (the sent-alert
 * key makes that once).
 */
@Component
public class WishlistSeedContributor implements SeedContributor {

    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID COLLECTOR1_AZURE_ITEM =
            UUID.fromString("00000000-0000-4000-8c00-000000010101");
    static final UUID WISH_AZURE = UUID.fromString("00000000-0000-4000-8f00-000000000201");
    static final UUID WISH_PROMO = UUID.fromString("00000000-0000-4000-8f00-000000000202");
    static final UUID WISH_MAGIC = UUID.fromString("00000000-0000-4000-8f00-000000000203");

    private static final Logger log = LoggerFactory.getLogger(WishlistSeedContributor.class);

    private final JdbcClient jdbc;
    private final WishlistAlerts alerts;
    private final TimeProvider timeProvider;

    public WishlistSeedContributor(
            JdbcClient jdbc, WishlistAlerts alerts, TimeProvider timeProvider) {
        this.jdbc = jdbc;
        this.alerts = alerts;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "wishlist";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 20;
    }

    @Override
    @Transactional
    public void seed() {
        if (!isActive(COLLECTOR2)) {
            return;
        }
        Instant created =
                timeProvider.now().minus(Duration.ofDays(2)).truncatedTo(ChronoUnit.SECONDS);
        int inserted = 0;
        int upgraded = 0;
        Optional<Printing> azure = printing("ygo-p001a");
        if (azure.isPresent()) {
            String note = "Looking for a clean copy for my Azure-Eyes deck.";
            inserted += insert(WISH_AZURE, azure.get(), true, note, true, "90% TCG", created);
            upgraded += fillMigrated(WISH_AZURE, note, true, "90% TCG");
        }
        Optional<Printing> promo = printing("pkm-p002a");
        if (promo.isPresent()) {
            inserted +=
                    insert(
                            WISH_PROMO,
                            promo.get(),
                            true,
                            "",
                            false,
                            null,
                            created.plus(Duration.ofMinutes(5)));
        }
        Optional<Printing> magic = printing("mtg-p005b");
        if (magic.isPresent()) {
            String note = "Any printing is fine.";
            inserted +=
                    insert(
                            WISH_MAGIC,
                            magic.get(),
                            false,
                            note,
                            false,
                            "100% TCG+",
                            created.plus(Duration.ofMinutes(10)));
            upgraded += fillMigrated(WISH_MAGIC, note, false, "100% TCG+");
        }
        if (inserted > 0) {
            jdbc.sql(
                            "UPDATE privacy_settings SET wishlist_visible = true, updated_at ="
                                    + " now() WHERE user_id = :id AND NOT wishlist_visible")
                    .param("id", COLLECTOR2)
                    .update();
        }
        if (!alreadyAlerted()) {
            alerts.alertForPublishedItem(COLLECTOR1_AZURE_ITEM);
        }
        if (inserted > 0 || upgraded > 0) {
            log.info(
                    "Seeded {} wishlist items for collector2 ({} migrated ones filled in)",
                    inserted,
                    upgraded);
        }
    }

    /**
     * Gives a wish that predates stage S2 its seed values: only while it still holds V112's
     * defaults and was never edited.
     */
    private int fillMigrated(UUID id, String note, boolean nearMintOnly, String priceTerm) {
        return jdbc.sql(
                        """
                        UPDATE wishlist_item
                           SET public_note = :note, near_mint_only = :nearMintOnly,
                               price_term = :priceTerm
                         WHERE id = :id AND owner_id = :owner
                           AND public_note = '' AND NOT near_mint_only AND price_term IS NULL
                           AND updated_at = created_at
                        """)
                .param("id", id)
                .param("owner", COLLECTOR2)
                .param("note", note)
                .param("nearMintOnly", nearMintOnly)
                .param("priceTerm", priceTerm)
                .update();
    }

    /** Whether collector2 was already alerted (or deliberately not) about collector1's listing. */
    private boolean alreadyAlerted() {
        return jdbc.sql(
                                "SELECT count(*) FROM wishlist_alert_sent WHERE user_id = :user"
                                        + " AND inventory_item_id = :item")
                        .param("user", COLLECTOR2)
                        .param("item", COLLECTOR1_AZURE_ITEM)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private int insert(
            UUID id,
            Printing printing,
            boolean exactPrinting,
            String note,
            boolean nearMintOnly,
            @Nullable String priceTerm,
            Instant at) {
        return jdbc.sql(
                        """
                        INSERT INTO wishlist_item (id, owner_id, game_slug, card_id, printing_id,
                               public_note, near_mint_only, price_term, created_at, updated_at)
                        VALUES (:id, :owner, :game, :cardId, :printingId, :note, :nearMintOnly,
                                :priceTerm, :at, :at)
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", id)
                .param("owner", COLLECTOR2)
                .param("game", printing.game())
                .param("cardId", printing.cardId())
                .param("printingId", exactPrinting ? printing.id() : null, java.sql.Types.OTHER)
                .param("note", note)
                .param("nearMintOnly", nearMintOnly)
                .param("priceTerm", priceTerm, java.sql.Types.VARCHAR)
                .param("at", Timestamp.from(at))
                .update();
    }

    private Optional<Printing> printing(String ref) {
        return jdbc.sql(
                        """
                        SELECT p.id, p.card_id, g.slug AS game FROM card_printing p
                          JOIN card c ON c.id = p.card_id JOIN game g ON g.id = c.game_id
                         WHERE p.external_ref ->> 'provider' = 'mock' AND p.external_ref ->> 'id' = :ref
                        """)
                .param("ref", ref)
                .query(
                        (rs, rowNum) ->
                                new Printing(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("card_id", UUID.class),
                                        rs.getString("game")))
                .optional();
    }

    private boolean isActive(UUID userId) {
        return jdbc.sql(
                                "SELECT count(*) FROM user_account WHERE id = :id AND status ="
                                        + " 'ACTIVE'")
                        .param("id", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private record Printing(UUID id, UUID cardId, String game) {}
}
