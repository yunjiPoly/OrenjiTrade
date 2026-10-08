package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.wishlist.domain.WishlistMatcher;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
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
 *   <li>{@code ygo-p001a} (Azure-Eyes Sky Dragon AZR-EN001) at least LIGHTLY_PLAYED, up to 60 CAD:
 *       collector1 lists it publicly, so the seed runs the matcher for that item and collector2
 *       gets a WISHLIST_MATCH notification (through the normal pipeline, dedup-keyed);
 *   <li>{@code pkm-p002a}, any condition: collector1 keeps it in a private unfiled lot, so
 *       publishing it locally triggers a fresh match and notification;
 *   <li>the card of {@code mtg-p005b}, any printing, for trade: collector5 lists it (matched at
 *       once, without notification, like a wish created from the web).
 * </ul>
 *
 * Collectors 1, 2 and 5 are all in Americas (North) (db/seed/locations.json): matches never cross
 * platform regions (ADR 0017). The first run also makes collector2's wishlist visible on their
 * profile. Items are inserted once ({@code ON CONFLICT DO NOTHING}); later runs leave local edits
 * alone.
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
    private final WishlistMatcher matcher;
    private final TimeProvider timeProvider;

    public WishlistSeedContributor(
            JdbcClient jdbc, WishlistMatcher matcher, TimeProvider timeProvider) {
        this.jdbc = jdbc;
        this.matcher = matcher;
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
        Optional<Printing> azure = printing("ygo-p001a");
        if (azure.isPresent()) {
            inserted +=
                    insert(
                            WISH_AZURE,
                            azure.get(),
                            true,
                            "LIGHTLY_PLAYED",
                            new BigDecimal("60.00"),
                            "ANY",
                            "For my Azure-Eyes deck; happy to meet at a local game store.",
                            created);
        }
        Optional<Printing> promo = printing("pkm-p002a");
        if (promo.isPresent()) {
            inserted +=
                    insert(
                            WISH_PROMO,
                            promo.get(),
                            true,
                            null,
                            null,
                            "ANY",
                            "",
                            created.plus(Duration.ofMinutes(5)));
        }
        Optional<Printing> magic = printing("mtg-p005b");
        if (magic.isPresent()) {
            inserted +=
                    insert(
                            WISH_MAGIC,
                            magic.get(),
                            false,
                            null,
                            null,
                            "TRADE",
                            "Any printing is fine.",
                            created.plus(Duration.ofMinutes(10)));
        }
        if (inserted == 0) {
            return;
        }
        jdbc.sql(
                        "UPDATE privacy_settings SET wishlist_visible = true, updated_at = now()"
                                + " WHERE user_id = :id AND NOT wishlist_visible")
                .param("id", COLLECTOR2)
                .update();
        matcher.matchPublishedItem(COLLECTOR1_AZURE_ITEM);
        for (UUID wish : List.of(WISH_AZURE, WISH_PROMO, WISH_MAGIC)) {
            matcher.matchWishlistItem(wish);
        }
        log.info("Seeded {} wishlist items for collector2", inserted);
    }

    private int insert(
            UUID id,
            Printing printing,
            boolean exactPrinting,
            @Nullable String conditionMin,
            @Nullable BigDecimal maxPrice,
            String tradePreference,
            String notes,
            Instant at) {
        return jdbc.sql(
                        """
                        INSERT INTO wishlist_item (id, owner_id, game_slug, card_id, printing_id,
                               condition_min, max_price, currency, trade_preference,
                               notes, active, created_at, updated_at)
                        VALUES (:id, :owner, :game, :cardId, :printingId, :condition, :maxPrice,
                                'CAD', :trade, :notes, true, :at, :at)
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", id)
                .param("owner", COLLECTOR2)
                .param("game", printing.game())
                .param("cardId", printing.cardId())
                .param("printingId", exactPrinting ? printing.id() : null, java.sql.Types.OTHER)
                .param("condition", conditionMin, java.sql.Types.VARCHAR)
                .param("maxPrice", maxPrice, java.sql.Types.NUMERIC)
                .param("trade", tradePreference)
                .param("notes", notes)
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
