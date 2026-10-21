package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.common.AskingPriceText;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.delisting.domain.DelistPolicyService;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.domain.ListingReconciler;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Seeds binders and inventory items of the fictional collectors ({@code db/seed/inventory.json},
 * see {@code docs/development/seed-data.md}) from the seeded catalog printings (looked up by their
 * mock provider id): fresh public binders for collectors 1, 2, 5 and 8, a STALE binder (40 days)
 * for collector3, a HIDDEN one (50 days) for collector6, a binder public for 24 h for collector4
 * and private-only inventory for collector7. Prices in CAD, several items accept offers.
 *
 * <p>Dates are relative to the first seed run; rows are inserted once (stable ids, {@code ON
 * CONFLICT DO NOTHING}) and never overwritten, so local edits survive restarts. One exception, for
 * Home's feed (stage R7): at every start the seed dates when its public binders and cards became
 * public, relative to now (a row's {@code listedMinutesAgo}, else 45 days ago, outside the feed's
 * window), and keeps the rows the feed shows confirmed no earlier than that, so the feed shows the
 * same posts today, this week and this month a month from now (collectors 1, 2 and 5 in Americas
 * (North): groups of 1, 3, 5 and 12 Yu-Gi-Oh! cards and two deck cores, one "Trade only").
 * Freshness states come from the active delist policy and the materialised visibility is reconciled
 * without publication events (seed data is not "newly published"). Skips deleted accounts and
 * printings that do not exist (catalog seed not active).
 */
@Component
public class InventorySeedContributor implements SeedContributor {

    static final String RESOURCE = "db/seed/inventory.json";
    static final String SEED_ID_PREFIX = "00000000-0000-4000-8000-0000000000";

    private static final Logger log = LoggerFactory.getLogger(InventorySeedContributor.class);

    private final JdbcClient jdbc;
    private final TimeProvider timeProvider;
    private final DelistPolicyService policies;
    private final BinderService binderService;
    private final ListingReconciler reconciler;
    private final SeedFile seed;

    public InventorySeedContributor(
            JdbcClient jdbc,
            TimeProvider timeProvider,
            DelistPolicyService policies,
            BinderService binderService,
            ListingReconciler reconciler,
            JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.timeProvider = timeProvider;
        this.policies = policies;
        this.binderService = binderService;
        this.reconciler = reconciler;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            this.seed = jsonMapper.readValue(in, SeedFile.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + RESOURCE, e);
        }
    }

    @Override
    public String name() {
        return "inventory";
    }

    @Override
    public int order() {
        return ORDER_INVENTORY;
    }

    @Override
    @Transactional
    public void seed() {
        // Like every write to binders and items: the owner locks first, all in one call.
        binderService.lockOwners(seedOwners());
        Instant now = timeProvider.now();
        FreshnessPolicy policy = policies.active();
        Set<UUID> owners = new LinkedHashSet<>();
        int binders = 0;
        int items = 0;
        for (SeedBinder binder : seed.binders()) {
            UUID ownerId = UUID.fromString(SEED_ID_PREFIX + binder.owner());
            if (!isActiveAccount(ownerId)) {
                continue;
            }
            owners.add(ownerId);
            Instant confirmedAt = now.minus(Duration.ofDays(binder.confirmedDaysAgo()));
            @Nullable Instant publicUntil =
                    binder.publicForHours() == null
                            ? null
                            : now.plus(Duration.ofHours(binder.publicForHours()));
            binders +=
                    jdbc.sql(
                                    """
                                    INSERT INTO binder (id, owner_id, name, description, kind,
                                        visibility, public_until, sort_order, freshness_state,
                                        created_at, updated_at, confirmed_at, last_owner_activity_at,
                                        sells_as_core, asking_price_text, asking_price, game_id,
                                        game_follows_cards)
                                    VALUES (:id, :ownerId, :name, :description, :kind, :visibility,
                                        :publicUntil, :sortOrder, :state, :at, :at, :at, :at,
                                        :sellsAsCore, :priceText, :price,
                                        (SELECT id FROM game WHERE slug = :game), false)
                                    ON CONFLICT (id) DO NOTHING
                                    """)
                            .param("id", UUID.fromString(binder.id()))
                            .param("ownerId", ownerId)
                            .param("name", binder.name())
                            .param("description", binder.description())
                            .param("kind", binder.kind())
                            .param("visibility", binder.visibility())
                            .param(
                                    "publicUntil",
                                    publicUntil == null ? null : Timestamp.from(publicUntil),
                                    Types.TIMESTAMP)
                            .param("sortOrder", binder.sortOrder())
                            .param("game", binder.game())
                            .param("sellsAsCore", Boolean.TRUE.equals(binder.sellsAsCore()))
                            .param("priceText", binder.askingPriceText(), Types.VARCHAR)
                            .param(
                                    "price",
                                    AskingPriceText.amountOf(binder.askingPriceText()).orElse(null),
                                    Types.NUMERIC)
                            .param("state", policy.stateAt(confirmedAt, now).name())
                            .param("at", Timestamp.from(confirmedAt))
                            .update();
            for (SeedItem item : binder.items()) {
                items +=
                        insertItem(
                                item,
                                ownerId,
                                UUID.fromString(binder.id()),
                                item.confirmedDaysAgo() != null
                                        ? item.confirmedDaysAgo()
                                        : binder.confirmedDaysAgo(),
                                policy,
                                now);
            }
        }
        for (SeedItem item : seed.unfiled()) {
            if (item.owner() == null) {
                continue;
            }
            UUID ownerId = UUID.fromString(SEED_ID_PREFIX + item.owner());
            if (!isActiveAccount(ownerId)) {
                continue;
            }
            owners.add(ownerId);
            items +=
                    insertItem(
                            item,
                            ownerId,
                            null,
                            item.confirmedDaysAgo() != null ? item.confirmedDaysAgo() : 0,
                            policy,
                            now);
        }
        Listings listings = listings(now);
        keepFeedRowsFresh(listings, policy, now);
        for (UUID owner : owners) {
            reconciler.owner(owner, false);
        }
        dateListings(listings);
        log.info("Inventory seed: {} binder(s) and {} item(s) inserted", binders, items);
    }

    // ---------------------------------------------------------------------------------------
    // Home's feed (stage R7): listing times relative to now, at every start
    // ---------------------------------------------------------------------------------------

    /**
     * How long ago the seed's other public cards and binders became public: outside Home's 30-day
     * window, so the feed shows exactly the posts the seed file dates ({@code listedMinutesAgo}).
     */
    static final Duration NOT_NEW = Duration.ofDays(45);

    /**
     * When each seed binder and item became public, relative to {@code now}: its {@code
     * listedMinutesAgo} (an item without one takes its binder's), else {@link #NOT_NEW}.
     *
     * @param binders every seed binder's listing time
     * @param items every seed item's listing time
     * @param fresh the rows the feed shows (those with {@code listedMinutesAgo})
     */
    record Listings(Map<UUID, Instant> binders, Map<UUID, Instant> items, Set<UUID> fresh) {}

    private Listings listings(Instant now) {
        Instant old = now.minus(NOT_NEW);
        Map<UUID, Instant> binders = new LinkedHashMap<>();
        Map<UUID, Instant> items = new LinkedHashMap<>();
        Set<UUID> fresh = new LinkedHashSet<>();
        for (SeedBinder binder : seed.binders()) {
            UUID binderId = UUID.fromString(binder.id());
            binders.put(binderId, listedAt(binder.listedMinutesAgo(), old, now));
            if (binder.listedMinutesAgo() != null) {
                fresh.add(binderId);
            }
            for (SeedItem item : binder.items()) {
                Integer minutes =
                        item.listedMinutesAgo() != null
                                ? item.listedMinutesAgo()
                                : binder.listedMinutesAgo();
                UUID itemId = UUID.fromString(item.id());
                items.put(itemId, listedAt(minutes, old, now));
                if (minutes != null) {
                    fresh.add(itemId);
                }
            }
        }
        for (SeedItem item : seed.unfiled()) {
            UUID itemId = UUID.fromString(item.id());
            items.put(itemId, listedAt(item.listedMinutesAgo(), old, now));
            if (item.listedMinutesAgo() != null) {
                fresh.add(itemId);
            }
        }
        return new Listings(binders, items, fresh);
    }

    private static Instant listedAt(@Nullable Integer minutesAgo, Instant old, Instant now) {
        return minutesAgo == null ? old : now.minus(Duration.ofMinutes(minutesAgo));
    }

    /**
     * The binders and items the feed shows stay fresh a month from now: each is confirmed no
     * earlier than it became public (as its owner would have), its freshness state following. Run
     * before the reconciliation, so a row the freshness job had hidden comes back. Binder rows are
     * locked before item rows, each in ascending id (the owners are locked already).
     */
    private void keepFeedRowsFresh(Listings listings, FreshnessPolicy policy, Instant now) {
        List<UUID> binderIds =
                listings.binders().keySet().stream().filter(listings.fresh()::contains).toList();
        List<UUID> itemIds =
                listings.items().keySet().stream().filter(listings.fresh()::contains).toList();
        lockRows("binder", binderIds);
        lockRows("inventory_item", itemIds);
        for (UUID id : binderIds) {
            refreshConfirmation("binder", id, listings.binders().get(id), policy, now);
        }
        for (UUID id : itemIds) {
            refreshConfirmation("inventory_item", id, listings.items().get(id), policy, now);
        }
    }

    private void lockRows(String table, List<UUID> ids) {
        if (ids.isEmpty()) {
            return;
        }
        jdbc.sql("SELECT id FROM " + table + " WHERE id IN (:ids) ORDER BY id FOR NO KEY UPDATE")
                .param("ids", ids)
                .query(UUID.class)
                .list();
    }

    private void refreshConfirmation(
            String table, UUID id, Instant listedAt, FreshnessPolicy policy, Instant now) {
        String hiddenReason = "inventory_item".equals(table) ? ", hidden_reason = NULL" : "";
        jdbc.sql(
                        "UPDATE "
                                + table
                                + " SET confirmed_at = :at, freshness_state = :state,"
                                + " warned_at = NULL"
                                + hiddenReason
                                + " WHERE id = :id AND confirmed_at < :at")
                .param("id", id)
                .param("at", Timestamp.from(listedAt))
                .param("state", policy.stateAt(listedAt, now).name())
                .update();
    }

    /**
     * Dates the seed's public binders and cards: when each became public (and a deck core became
     * one), so Home's feed shows the seed's posts today, this week and this month whenever the API
     * starts. Only the listing times are written, after the reconciliation (which stamps a flip
     * with the present); a row that is not public is left alone.
     */
    private void dateListings(Listings listings) {
        List<UUID> binderIds = List.copyOf(listings.binders().keySet());
        List<UUID> itemIds = List.copyOf(listings.items().keySet());
        lockRows("binder", binderIds);
        lockRows("inventory_item", itemIds);
        for (Map.Entry<UUID, Instant> binder : listings.binders().entrySet()) {
            jdbc.sql(
                            """
                            UPDATE binder SET listing_changed_at = :at,
                                   core_since = CASE WHEN sells_as_core THEN CAST(:at AS timestamptz) END
                             WHERE id = :id AND publicly_listed
                            """)
                    .param("id", binder.getKey())
                    .param("at", Timestamp.from(binder.getValue()))
                    .update();
        }
        for (Map.Entry<UUID, Instant> item : listings.items().entrySet()) {
            jdbc.sql(
                            "UPDATE inventory_item SET listing_changed_at = :at"
                                    + " WHERE id = :id AND publicly_listed")
                    .param("id", item.getKey())
                    .param("at", Timestamp.from(item.getValue()))
                    .update();
        }
    }

    /** Every collector the seed file names (whether or not the account is active). */
    private Set<UUID> seedOwners() {
        Set<UUID> owners = new LinkedHashSet<>();
        for (SeedBinder binder : seed.binders()) {
            owners.add(UUID.fromString(SEED_ID_PREFIX + binder.owner()));
        }
        for (SeedItem item : seed.unfiled()) {
            if (item.owner() != null) {
                owners.add(UUID.fromString(SEED_ID_PREFIX + item.owner()));
            }
        }
        return owners;
    }

    private int insertItem(
            SeedItem item,
            UUID ownerId,
            @Nullable UUID binderId,
            int confirmedDaysAgo,
            FreshnessPolicy policy,
            Instant now) {
        Instant confirmedAt = now.minus(Duration.ofDays(confirmedDaysAgo));
        FreshnessState state = policy.stateAt(confirmedAt, now);
        String visibility =
                item.visibility() != null
                        ? item.visibility()
                        : binderId != null ? "PUBLIC" : "PRIVATE";
        return jdbc.sql(
                        """
                        INSERT INTO inventory_item (id, owner_id, binder_id, printing_id, quantity,
                            condition, language, edition, finish, asking_price, asking_price_text,
                            currency,
                            availability, accepts_offers, notes, public_notes, visibility,
                            freshness_state, hidden_reason, created_at, updated_at, confirmed_at,
                            last_owner_activity_at)
                        SELECT :id, :ownerId, :binderId, p.id, :quantity, :condition, p.language,
                               p.edition, p.finish, :price, :priceText, 'CAD', :availability,
                               :acceptsOffers,
                               :notes, :publicNotes, :visibility, :state, :hiddenReason, :at, :at,
                               :at, :at
                          FROM card_printing p
                         WHERE p.external_ref ->> 'provider' = 'mock' AND p.external_ref ->> 'id' = :ref
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", UUID.fromString(item.id()))
                .param("ownerId", ownerId)
                .param("binderId", binderId, Types.OTHER)
                .param("quantity", item.quantity())
                .param("condition", item.condition())
                .param(
                        "price",
                        item.priceText() != null
                                ? AskingPriceText.amountOf(item.priceText()).orElse(null)
                                : item.price() == null ? null : new BigDecimal(item.price()),
                        Types.NUMERIC)
                .param("priceText", item.priceText(), Types.VARCHAR)
                .param("availability", item.availability())
                .param("acceptsOffers", item.acceptsOffers())
                .param("notes", item.notes() == null ? "" : item.notes())
                .param("publicNotes", item.publicNotes() == null ? "" : item.publicNotes())
                .param("visibility", visibility)
                .param("state", state.name())
                .param(
                        "hiddenReason",
                        state == FreshnessState.HIDDEN ? "STALE_UNCONFIRMED" : null,
                        Types.VARCHAR)
                .param("at", Timestamp.from(confirmedAt))
                .param("ref", item.printing())
                .update();
    }

    private boolean isActiveAccount(UUID ownerId) {
        return jdbc.sql(
                                "SELECT count(*) FROM user_account WHERE id = :id AND status NOT IN"
                                        + " ('DELETED', 'DELETION_REQUESTED')")
                        .param("id", ownerId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    /** JSON shape of {@value #RESOURCE}. */
    record SeedFile(List<SeedBinder> binders, List<SeedItem> unfiled) {}

    /** A seeded binder; it holds cards of its {@code game} only (stage G). */
    record SeedBinder(
            String id,
            String owner,
            String game,
            String name,
            String description,
            String kind,
            String visibility,
            @Nullable Integer publicForHours,
            int confirmedDaysAgo,
            int sortOrder,
            List<SeedItem> items,
            @Nullable Boolean sellsAsCore,
            @Nullable String askingPriceText,
            @Nullable Integer listedMinutesAgo) {}

    /** A seeded item (owner only for unfiled items). */
    record SeedItem(
            String id,
            @Nullable String owner,
            String printing,
            int quantity,
            String condition,
            @Nullable String price,
            String availability,
            boolean acceptsOffers,
            @Nullable String notes,
            @Nullable String publicNotes,
            @Nullable String visibility,
            @Nullable Integer confirmedDaysAgo,
            @Nullable String priceText,
            @Nullable Integer listedMinutesAgo) {}
}
