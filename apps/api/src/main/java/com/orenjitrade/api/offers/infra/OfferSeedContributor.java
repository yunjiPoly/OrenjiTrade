package com.orenjitrade.api.offers.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.InventoryService;
import com.orenjitrade.api.offers.domain.OfferSnapshots;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Seeds offers (fictional, local/dev only, stable ids {@code 00000000-0000-4000-9c00-...}):
 *
 * <ul>
 *   <li>{@code …0001}: collector2's accepted TRADE offer for collector1's Yu-Gi-Oh! single (the
 *       completed trade {@code 9d00…0001} that Phase 7 seeded ratings for);
 *   <li>{@code …0002}: collector5's accepted cash offer for collector1's Pokémon holo (the accepted
 *       offer Phase 7 seeded an interaction and a rating for; its trade {@code 9d00…0002} is
 *       completed);
 *   <li>{@code …0003}: collector5's OPEN cash offer of 40.00 CAD for collector1's Azure-Eyes Sky
 *       Dragon (collector1's turn);
 *   <li>{@code …0004} / {@code …0005}: collector6's MIXED offer for collector2's Magic foil,
 *       countered by collector2 (COUNTERED, collector6's turn);
 *   <li>{@code …0006}: collector8's accepted 55.00 CAD offer with payment protection for
 *       collector1's Yu-Gi-Oh! single (Phase 9: trade {@code 9d00…0003}, shipped);
 *   <li>{@code …0007}: collector5's accepted 35.00 CAD offer with payment protection for
 *       collector2's Magic card (Phase 9: trade {@code 9d00…0004}, disputed).
 * </ul>
 *
 * Inserted once ({@code ON CONFLICT DO NOTHING}), dates relative to the first run (the live
 * proposals expire 7 days later); nothing is notified and no message is posted. The trades module
 * seeds the two trades.
 */
@Component
public class OfferSeedContributor implements SeedContributor {

    static final UUID COLLECTOR1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID COLLECTOR5 = UUID.fromString("00000000-0000-4000-8000-000000000005");
    static final UUID COLLECTOR6 = UUID.fromString("00000000-0000-4000-8000-000000000006");
    static final UUID COLLECTOR8 = UUID.fromString("00000000-0000-4000-8000-000000000008");

    static final UUID OFFER_2_TO_1 = UUID.fromString("00000000-0000-4000-9c00-000000000001");
    static final UUID OFFER_5_TO_1_ACCEPTED =
            UUID.fromString("00000000-0000-4000-9c00-000000000002");
    static final UUID OFFER_5_TO_1_OPEN = UUID.fromString("00000000-0000-4000-9c00-000000000003");
    static final UUID OFFER_6_TO_2 = UUID.fromString("00000000-0000-4000-9c00-000000000004");
    static final UUID COUNTER_2_TO_6 = UUID.fromString("00000000-0000-4000-9c00-000000000005");
    static final UUID PROTECTED_8_TO_1 = UUID.fromString("00000000-0000-4000-9c00-000000000006");
    static final UUID PROTECTED_5_TO_2 = UUID.fromString("00000000-0000-4000-9c00-000000000007");

    /** collector1: Azure-Eyes Sky Dragon (ygo-p001a), 45.00 CAD, TRADE_OR_SALE. */
    static final UUID ITEM_AZURE = UUID.fromString("00000000-0000-4000-8c00-000000010101");

    /** collector1: ygo-p018a, 3 copies, TRADE_OR_SALE. */
    static final UUID ITEM_1_YGO = UUID.fromString("00000000-0000-4000-8c00-000000010104");

    /** collector1: pkm-p006a, 2 copies, TRADE_OR_SALE, offers welcome. */
    static final UUID ITEM_1_PKM = UUID.fromString("00000000-0000-4000-8c00-000000010204");

    /** collector2: mtg-p001a (foil), TRADE_OR_SALE, offers welcome. */
    static final UUID ITEM_2_FOIL = UUID.fromString("00000000-0000-4000-8c00-000000020101");

    /** collector2: mtg-p010a, 2 copies. */
    static final UUID ITEM_2_MTG = UUID.fromString("00000000-0000-4000-8c00-000000020103");

    /** collector6: mtg-p001b. */
    static final UUID ITEM_6_MTG = UUID.fromString("00000000-0000-4000-8c00-000000060102");

    private final JdbcClient jdbc;
    private final InventoryService inventory;
    private final OfferSnapshots snapshots;
    private final InteractionService interactions;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public OfferSeedContributor(
            JdbcClient jdbc,
            InventoryService inventory,
            OfferSnapshots snapshots,
            InteractionService interactions,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.snapshots = snapshots;
        this.interactions = interactions;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public String name() {
        return "offers";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 60;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        Map<UUID, InventoryItemView> items =
                inventory.itemsForParties(
                        List.of(
                                ITEM_AZURE,
                                ITEM_1_YGO,
                                ITEM_1_PKM,
                                ITEM_2_FOIL,
                                ITEM_2_MTG,
                                ITEM_6_MTG));
        if (items.size() < 6
                || !active(COLLECTOR1)
                || !active(COLLECTOR2)
                || !active(COLLECTOR5)
                || !active(COLLECTOR6)) {
            return;
        }

        // collector2 -> collector1: TRADE, accepted (trade 9d00...0001, completed).
        Instant created1 = now.minus(Duration.ofDays(3));
        Instant accepted1 = now.minus(Duration.ofDays(2));
        offer(
                new Seeded(
                        OFFER_2_TO_1,
                        OFFER_2_TO_1,
                        null,
                        null,
                        items.get(ITEM_1_YGO),
                        COLLECTOR1,
                        COLLECTOR2,
                        "TRADE",
                        null,
                        null,
                        "ACCEPTED",
                        "SELLER",
                        "My spare Magic rare for your Yu-Gi-Oh! single? Happy to meet at a"
                                + " game store.",
                        created1,
                        accepted1,
                        accepted1,
                        1),
                List.of(new Line(items.get(ITEM_2_MTG), 1)));
        event(OFFER_2_TO_1, OFFER_2_TO_1, COLLECTOR2, "CREATED", "OPEN", 0, created1, 1);
        event(OFFER_2_TO_1, OFFER_2_TO_1, COLLECTOR1, "ACCEPTED", "ACCEPTED", 1, accepted1, 2);
        interactions.record(
                InteractionKind.OFFER_ACCEPTED,
                COLLECTOR2,
                COLLECTOR1,
                InteractionKind.OFFER_ACCEPTED.subjectType(),
                OFFER_2_TO_1,
                accepted1);

        // collector5 -> collector1: CASH 30.00 CAD, accepted (trade 9d00...0002, completed). The
        // OFFER_ACCEPTED interaction was seeded by the ratings module.
        Instant created2 = now.minus(Duration.ofDays(4));
        Instant accepted2 = now.minus(Duration.ofDays(3));
        offer(
                new Seeded(
                        OFFER_5_TO_1_ACCEPTED,
                        OFFER_5_TO_1_ACCEPTED,
                        null,
                        null,
                        items.get(ITEM_1_PKM),
                        COLLECTOR1,
                        COLLECTOR5,
                        "CASH",
                        "30.00",
                        "CAD",
                        "ACCEPTED",
                        "SELLER",
                        "Could you ship it in a top loader? Thanks!",
                        created2,
                        accepted2,
                        accepted2,
                        1),
                List.of());
        event(
                OFFER_5_TO_1_ACCEPTED,
                OFFER_5_TO_1_ACCEPTED,
                COLLECTOR5,
                "CREATED",
                "OPEN",
                0,
                created2,
                1);
        event(
                OFFER_5_TO_1_ACCEPTED,
                OFFER_5_TO_1_ACCEPTED,
                COLLECTOR1,
                "ACCEPTED",
                "ACCEPTED",
                1,
                accepted2,
                2);

        // collector5 -> collector1: CASH 40.00 CAD, OPEN (collector1's turn).
        Instant created3 = now.minus(Duration.ofHours(2));
        offer(
                new Seeded(
                        OFFER_5_TO_1_OPEN,
                        OFFER_5_TO_1_OPEN,
                        null,
                        null,
                        items.get(ITEM_AZURE),
                        COLLECTOR1,
                        COLLECTOR5,
                        "CASH",
                        "40.00",
                        "CAD",
                        "OPEN",
                        "SELLER",
                        "Would you take 40 for the Azure-Eyes? I can meet at Berri-UQAM after"
                                + " work.",
                        created3,
                        created3,
                        null,
                        0),
                List.of());
        event(OFFER_5_TO_1_OPEN, OFFER_5_TO_1_OPEN, COLLECTOR5, "CREATED", "OPEN", 0, created3, 1);

        // collector6 -> collector2: MIXED 20.00 CAD + a card, countered with 35.00 CAD + the card.
        Instant created4 = now.minus(Duration.ofDays(1));
        Instant countered = now.minus(Duration.ofHours(3));
        offer(
                new Seeded(
                        OFFER_6_TO_2,
                        OFFER_6_TO_2,
                        null,
                        COUNTER_2_TO_6,
                        items.get(ITEM_2_FOIL),
                        COLLECTOR2,
                        COLLECTOR6,
                        "MIXED",
                        "20.00",
                        "CAD",
                        "COUNTERED",
                        "SELLER",
                        "20 CAD plus my alternate print for your foil?",
                        created4,
                        countered,
                        countered,
                        1),
                List.of(new Line(items.get(ITEM_6_MTG), 1)));
        offer(
                new Seeded(
                        COUNTER_2_TO_6,
                        OFFER_6_TO_2,
                        OFFER_6_TO_2,
                        null,
                        items.get(ITEM_2_FOIL),
                        COLLECTOR2,
                        COLLECTOR6,
                        "MIXED",
                        "35.00",
                        "CAD",
                        "COUNTERED",
                        "BUYER",
                        "I would do it for 35 plus the card.",
                        countered,
                        countered,
                        null,
                        0),
                List.of(new Line(items.get(ITEM_6_MTG), 1)));
        event(OFFER_6_TO_2, OFFER_6_TO_2, COLLECTOR6, "CREATED", "OPEN", 0, created4, 1);
        event(COUNTER_2_TO_6, OFFER_6_TO_2, COLLECTOR2, "COUNTERED", "COUNTERED", 0, countered, 1);

        if (!active(COLLECTOR8)) {
            return;
        }
        // Phase 9: collector8 -> collector1, CASH 55.00 CAD with payment protection, accepted
        // (trade 9d00...0003, shipped; the payments module seeds its payment and shipment).
        Instant created6 = now.minus(Duration.ofDays(3)).minus(Duration.ofHours(2));
        Instant accepted6 = now.minus(Duration.ofDays(3));
        protectedOffer(
                new Seeded(
                        PROTECTED_8_TO_1,
                        PROTECTED_8_TO_1,
                        null,
                        null,
                        items.get(ITEM_1_YGO),
                        COLLECTOR1,
                        COLLECTOR8,
                        "CASH",
                        "55.00",
                        "CAD",
                        "ACCEPTED",
                        "SELLER",
                        "I would like payment protection and shipping, if that works for you.",
                        created6,
                        accepted6,
                        accepted6,
                        1));
        event(PROTECTED_8_TO_1, PROTECTED_8_TO_1, COLLECTOR8, "CREATED", "OPEN", 0, created6, 1);
        event(
                PROTECTED_8_TO_1,
                PROTECTED_8_TO_1,
                COLLECTOR1,
                "ACCEPTED",
                "ACCEPTED",
                1,
                accepted6,
                2);
        interactions.record(
                InteractionKind.OFFER_ACCEPTED,
                COLLECTOR8,
                COLLECTOR1,
                InteractionKind.OFFER_ACCEPTED.subjectType(),
                PROTECTED_8_TO_1,
                accepted6);

        // Phase 9: collector5 -> collector2, CASH 35.00 CAD with payment protection, accepted
        // (trade 9d00...0004, disputed by collector5).
        Instant created7 = now.minus(Duration.ofDays(6)).minus(Duration.ofHours(3));
        Instant accepted7 = now.minus(Duration.ofDays(6));
        protectedOffer(
                new Seeded(
                        PROTECTED_5_TO_2,
                        PROTECTED_5_TO_2,
                        null,
                        null,
                        items.get(ITEM_2_MTG),
                        COLLECTOR2,
                        COLLECTOR5,
                        "CASH",
                        "35.00",
                        "CAD",
                        "ACCEPTED",
                        "SELLER",
                        "Protected payment please; I can pay right away.",
                        created7,
                        accepted7,
                        accepted7,
                        1));
        event(PROTECTED_5_TO_2, PROTECTED_5_TO_2, COLLECTOR5, "CREATED", "OPEN", 0, created7, 1);
        event(
                PROTECTED_5_TO_2,
                PROTECTED_5_TO_2,
                COLLECTOR2,
                "ACCEPTED",
                "ACCEPTED",
                1,
                accepted7,
                2);
        interactions.record(
                InteractionKind.OFFER_ACCEPTED,
                COLLECTOR5,
                COLLECTOR2,
                InteractionKind.OFFER_ACCEPTED.subjectType(),
                PROTECTED_5_TO_2,
                accepted7);
    }

    /** A seeded cash proposal with payment protection requested (Phase 9). */
    private void protectedOffer(Seeded offer) {
        offer(offer, List.of());
        jdbc.sql(
                        "UPDATE offer SET protection_requested = true WHERE id = :id AND NOT"
                                + " protection_requested")
                .param("id", offer.id())
                .update();
    }

    /** A seeded proposal. */
    private record Seeded(
            UUID id,
            UUID rootId,
            @Nullable UUID parentId,
            @Nullable UUID supersededBy,
            @Nullable InventoryItemView item,
            UUID sellerId,
            UUID buyerId,
            String kind,
            @Nullable String cash,
            @Nullable String currency,
            String status,
            String turn,
            String message,
            Instant createdAt,
            Instant updatedAt,
            @Nullable Instant closedAt,
            int version) {}

    /** A seeded trade card. */
    private record Line(@Nullable InventoryItemView item, int quantity) {}

    private void offer(Seeded offer, List<Line> lines) {
        InventoryItemView item = requireItem(offer.item());
        int inserted =
                jdbc.sql(
                                """
                                INSERT INTO offer (id, root_offer_id, parent_offer_id,
                                    superseded_by, item_id, seller_id, buyer_id, kind, cash_amount,
                                    currency, status, current_turn, message, item_snapshot,
                                    expires_at, created_at, updated_at, closed_at, version)
                                VALUES (:id, :rootId, :parentId, :supersededBy, :itemId,
                                    :sellerId, :buyerId, :kind, CAST(:cash AS numeric),
                                    :currency, :status, :turn, :message, CAST(:snapshot AS jsonb),
                                    :expiresAt, :createdAt, :updatedAt, :closedAt, :version)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("id", offer.id())
                        .param("rootId", offer.rootId())
                        .param("parentId", offer.parentId(), Types.OTHER)
                        .param("supersededBy", offer.supersededBy(), Types.OTHER)
                        .param("itemId", item.row().id())
                        .param("sellerId", offer.sellerId())
                        .param("buyerId", offer.buyerId())
                        .param("kind", offer.kind())
                        .param("cash", offer.cash(), Types.VARCHAR)
                        .param("currency", offer.currency(), Types.CHAR)
                        .param("status", offer.status())
                        .param("turn", offer.turn())
                        .param("message", offer.message())
                        .param("snapshot", snapshots.item(item))
                        .param(
                                "expiresAt",
                                Timestamp.from(offer.updatedAt().plus(Duration.ofDays(7))))
                        .param("createdAt", Timestamp.from(offer.createdAt()))
                        .param("updatedAt", Timestamp.from(offer.updatedAt()))
                        .param(
                                "closedAt",
                                offer.closedAt() == null ? null : Timestamp.from(offer.closedAt()),
                                Types.TIMESTAMP)
                        .param("version", offer.version())
                        .update();
        if (inserted == 0) {
            return;
        }
        int position = 0;
        for (Line line : lines) {
            InventoryItemView card = requireItem(line.item());
            jdbc.sql(
                            """
                            INSERT INTO offer_trade_item (id, offer_id, inventory_item_id, quantity,
                                position, item_snapshot)
                            VALUES (:id, :offerId, :itemId, :quantity, :position,
                                CAST(:snapshot AS jsonb))
                            ON CONFLICT DO NOTHING
                            """)
                    .param("id", UUID.nameUUIDFromBytes((offer.id() + ":" + position).getBytes()))
                    .param("offerId", offer.id())
                    .param("itemId", card.row().id())
                    .param("quantity", line.quantity())
                    .param("position", position++)
                    .param("snapshot", snapshots.item(card))
                    .update();
        }
    }

    /** A history entry with a snapshot of the stored proposal. */
    private void event(
            UUID offerId,
            UUID rootId,
            UUID actorId,
            String event,
            String status,
            int version,
            Instant at,
            int sequence) {
        List<Map<String, Object>> rows =
                jdbc.sql(
                                "SELECT kind, cash_amount::text AS cash, currency, message,"
                                        + " current_turn, expires_at, item_id, seller_id, buyer_id,"
                                        + " protection_requested FROM offer WHERE id = :id")
                        .param("id", offerId)
                        .query()
                        .listOfRows();
        if (rows.isEmpty()) {
            return;
        }
        Map<String, Object> row = rows.get(0);
        ObjectNode snapshot = jsonMapper.createObjectNode();
        snapshot.put("id", offerId.toString());
        snapshot.put("status", status);
        snapshot.put("kind", (String) row.get("kind"));
        if (row.get("cash") != null) {
            snapshot.put("cashAmount", (String) row.get("cash"));
            snapshot.put("currency", ((String) row.get("currency")).trim());
        }
        ArrayNode lines = snapshot.putArray("tradeItems");
        jdbc.sql(
                        "SELECT inventory_item_id, quantity, item_snapshot ->> 'cardName' AS card,"
                                + " item_snapshot ->> 'printingCode' AS code FROM offer_trade_item"
                                + " WHERE offer_id = :id ORDER BY position")
                .param("id", offerId)
                .query(
                        rs -> {
                            ObjectNode line = lines.addObject();
                            line.put("inventoryItemId", rs.getString("inventory_item_id"));
                            line.put("quantity", rs.getInt("quantity"));
                            line.put("cardName", rs.getString("card"));
                            if (rs.getString("code") != null) {
                                line.put("printingCode", rs.getString("code"));
                            }
                        });
        snapshot.put("message", (String) row.get("message"));
        snapshot.put("currentTurn", (String) row.get("current_turn"));
        snapshot.put("expiresAt", ((Timestamp) row.get("expires_at")).toInstant().toString());
        snapshot.put("version", version);
        snapshot.put("protectionRequested", Boolean.TRUE.equals(row.get("protection_requested")));
        snapshot.put("itemId", row.get("item_id").toString());
        snapshot.put("sellerId", row.get("seller_id").toString());
        snapshot.put("buyerId", row.get("buyer_id").toString());
        jdbc.sql(
                        """
                        INSERT INTO offer_event (id, offer_id, root_offer_id, actor_id, event,
                            snapshot, created_at)
                        VALUES (:id, :offerId, :rootId, :actorId, :event, CAST(:snapshot AS jsonb),
                            :at)
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", UUID.nameUUIDFromBytes((offerId + ":event:" + sequence).getBytes()))
                .param("offerId", offerId)
                .param("rootId", rootId)
                .param("actorId", actorId)
                .param("event", event)
                .param("snapshot", jsonMapper.writeValueAsString(snapshot))
                .param("at", Timestamp.from(at))
                .update();
    }

    private static InventoryItemView requireItem(@Nullable InventoryItemView item) {
        if (item == null) {
            throw new IllegalStateException("Seed item missing");
        }
        return item;
    }

    private boolean active(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM user_account WHERE id = :id AND status = 'ACTIVE'")
                        .param("id", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }
}
