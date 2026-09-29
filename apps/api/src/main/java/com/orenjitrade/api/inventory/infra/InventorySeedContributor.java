package com.orenjitrade.api.inventory.infra;

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
import java.util.LinkedHashSet;
import java.util.List;
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
 * CONFLICT DO NOTHING}) and never overwritten, so local edits survive restarts. Freshness states
 * come from the active delist policy and the materialised visibility is reconciled without
 * publication events (seed data is not "newly published"). Skips deleted accounts and printings
 * that do not exist (catalog seed not active).
 */
@Component
public class InventorySeedContributor implements SeedContributor {

    static final String RESOURCE = "db/seed/inventory.json";
    static final String SEED_ID_PREFIX = "00000000-0000-4000-8000-0000000000";

    private static final Logger log = LoggerFactory.getLogger(InventorySeedContributor.class);

    private final JdbcClient jdbc;
    private final TimeProvider timeProvider;
    private final DelistPolicyService policies;
    private final ListingReconciler reconciler;
    private final SeedFile seed;

    public InventorySeedContributor(
            JdbcClient jdbc,
            TimeProvider timeProvider,
            DelistPolicyService policies,
            ListingReconciler reconciler,
            JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.timeProvider = timeProvider;
        this.policies = policies;
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
                                        created_at, updated_at, confirmed_at, last_owner_activity_at)
                                    VALUES (:id, :ownerId, :name, :description, :kind, :visibility,
                                        :publicUntil, :sortOrder, :state, :at, :at, :at, :at)
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
        for (UUID owner : owners) {
            reconciler.owner(owner, false);
        }
        log.info("Inventory seed: {} binder(s) and {} item(s) inserted", binders, items);
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
                            condition, language, edition, finish, asking_price, currency,
                            availability, accepts_offers, notes, public_notes, visibility,
                            freshness_state, hidden_reason, created_at, updated_at, confirmed_at,
                            last_owner_activity_at)
                        SELECT :id, :ownerId, :binderId, p.id, :quantity, :condition, p.language,
                               p.edition, p.finish, :price, 'CAD', :availability, :acceptsOffers,
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
                        item.price() == null ? null : new BigDecimal(item.price()),
                        Types.NUMERIC)
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

    /** A seeded binder. */
    record SeedBinder(
            String id,
            String owner,
            String name,
            String description,
            String kind,
            String visibility,
            @Nullable Integer publicForHours,
            int confirmedDaysAgo,
            int sortOrder,
            List<SeedItem> items) {}

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
            @Nullable Integer confirmedDaysAgo) {}
}
