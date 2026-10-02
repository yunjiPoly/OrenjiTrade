package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.cards.events.CatalogImportedEvent;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.common.seed.SeedProperties;
import com.orenjitrade.api.inventory.domain.ListingReconciler;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Local/dev demo (ADR 0015): once the real Yu-Gi-Oh! catalog was imported from YGOPRODeck, a few
 * iconic real printings (Blue-Eyes White Dragon LOB-EN001, Dark Magician LOB-EN005, Red-Eyes Black
 * Dragon LOB-EN070 and the five Exodia pieces) are added to collector1's public "Yu-Gi-Oh! trade
 * binder", so real card images show in the demo. Runs with the seed (when the real catalog is
 * already there) and right after every YGOPRODeck metadata import (before its {@code REFERENCED}
 * image fill). Idempotent (stable item ids, {@code ON CONFLICT DO NOTHING}); silently does nothing
 * without the real catalog, without the seeded binder or when the seed is disabled. The collector
 * is fictional; the cards are the provider's real catalog entries.
 */
@Component
public class RealCatalogDemoSeedContributor implements SeedContributor {

    static final String PROVIDER = "ygoprodeck";
    static final String GAME = "yugioh";
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID BINDER = UUID.fromString("00000000-0000-4000-8b00-000000000101");

    /** Demo printings with stable inventory item ids. */
    static final List<DemoItem> ITEMS =
            List.of(
                    new DemoItem("00000000-0000-4000-8c00-0000000101a1", "LOB-EN001"),
                    new DemoItem("00000000-0000-4000-8c00-0000000101a2", "LOB-EN005"),
                    new DemoItem("00000000-0000-4000-8c00-0000000101a3", "LOB-EN070"),
                    new DemoItem("00000000-0000-4000-8c00-0000000101a4", "LOB-EN124"),
                    new DemoItem("00000000-0000-4000-8c00-0000000101a5", "LOB-EN120"),
                    new DemoItem("00000000-0000-4000-8c00-0000000101a6", "LOB-EN121"),
                    new DemoItem("00000000-0000-4000-8c00-0000000101a7", "LOB-EN122"),
                    new DemoItem("00000000-0000-4000-8c00-0000000101a8", "LOB-EN123"));

    private static final Logger log = LoggerFactory.getLogger(RealCatalogDemoSeedContributor.class);

    private final JdbcClient jdbc;
    private final ListingReconciler reconciler;
    private final TimeProvider timeProvider;
    private final SeedProperties seedProperties;
    private final TransactionTemplate tx;

    public RealCatalogDemoSeedContributor(
            JdbcClient jdbc,
            ListingReconciler reconciler,
            TimeProvider timeProvider,
            SeedProperties seedProperties,
            PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.reconciler = reconciler;
        this.timeProvider = timeProvider;
        this.seedProperties = seedProperties;
        this.tx = new TransactionTemplate(transactionManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Override
    public String name() {
        return "real-catalog-demo";
    }

    @Override
    public int order() {
        return ORDER_INVENTORY + 50;
    }

    @Override
    public void seed() {
        tx.executeWithoutResult(status -> addDemoItems());
    }

    /** After a YGOPRODeck metadata import (local/dev seed environments only). */
    @EventListener
    void onCatalogImported(CatalogImportedEvent event) {
        if (!seedProperties.enabled()
                || !PROVIDER.equals(event.provider())
                || !GAME.equals(event.gameSlug())) {
            return;
        }
        tx.executeWithoutResult(status -> addDemoItems());
    }

    int addDemoItems() {
        if (!binderExists()) {
            return 0;
        }
        Instant now = timeProvider.now();
        int inserted = 0;
        for (DemoItem item : ITEMS) {
            Optional<UUID> printing = printing(item.printingCode());
            if (printing.isEmpty()) {
                continue;
            }
            inserted +=
                    jdbc.sql(
                                    """
                                    INSERT INTO inventory_item (id, owner_id, binder_id, printing_id,
                                        quantity, condition, language, edition, finish, currency,
                                        availability, accepts_offers, notes, public_notes,
                                        visibility, freshness_state, created_at, updated_at,
                                        confirmed_at, last_owner_activity_at)
                                    SELECT :id, :owner, :binder, p.id, 1, 'NEAR_MINT', p.language,
                                           p.edition, p.finish, 'CAD', 'TRADE', true, '',
                                           'Demo card from the real catalog.', 'PUBLIC', 'ACTIVE',
                                           :now, :now, :now, :now
                                      FROM card_printing p
                                     WHERE p.id = :printing
                                    ON CONFLICT (id) DO NOTHING
                                    """)
                            .param("id", UUID.fromString(item.id()))
                            .param("owner", OWNER)
                            .param("binder", BINDER)
                            .param("printing", printing.get())
                            .param("now", Timestamp.from(now))
                            .update();
        }
        if (inserted > 0) {
            reconciler.owner(OWNER, false);
            log.info("Real catalog demo: {} printing(s) added to collector1's binder", inserted);
        }
        return inserted;
    }

    private boolean binderExists() {
        return jdbc.sql(
                                """
                                SELECT count(*) FROM binder b JOIN user_account u ON u.id = b.owner_id
                                 WHERE b.id = :binder AND b.owner_id = :owner
                                   AND u.status NOT IN ('DELETED', 'DELETION_REQUESTED')
                                """)
                        .param("binder", BINDER)
                        .param("owner", OWNER)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private Optional<UUID> printing(String code) {
        return jdbc.sql(
                        """
                        SELECT p.id FROM card_printing p
                          JOIN card c ON c.id = p.card_id
                          JOIN game g ON g.id = c.game_id
                         WHERE g.slug = :game AND p.printing_code = :code
                           AND p.external_ref ->> 'provider' = :provider
                         ORDER BY CASE WHEN p.rarity = 'Ultra Rare' THEN 0 ELSE 1 END, p.id
                         LIMIT 1
                        """)
                .param("game", GAME)
                .param("code", code)
                .param("provider", PROVIDER)
                .query(UUID.class)
                .optional();
    }

    /** A demo inventory item. */
    record DemoItem(String id, String printingCode) {}
}
