package com.orenjitrade.api.trades.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.offers.domain.OfferRow;
import com.orenjitrade.api.offers.domain.OfferService;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Seeds the trades of the seeded accepted offers (fictional, local/dev only, stable ids {@code
 * 00000000-0000-4000-9d00-...}): {@code …0001} collector2 ↔ collector1 (TRADE, in-person meetup,
 * COMPLETED; Phase 7 seeded its TRADE interaction and ratings) and {@code …0002} collector5 ↔
 * collector1 (30.00 CAD, shipped informally, COMPLETED; its TRADE interaction is recorded here).
 * Phase 9 adds two trades with payment protection: {@code …0003} collector8 ↔ collector1 (55.00
 * CAD, paid and SHIPPED) and {@code …0004} collector5 ↔ collector2 (35.00 CAD, shipped, DISPUTED);
 * the payments module seeds their payments, shipments and the dispute. Inventory quantities are
 * left as seeded (the history predates the seed inventory); nothing is notified. Inserted once.
 */
@Component
public class TradeSeedContributor implements SeedContributor {

    static final UUID COLLECTOR1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID COLLECTOR5 = UUID.fromString("00000000-0000-4000-8000-000000000005");
    static final UUID OFFER_2_TO_1 = UUID.fromString("00000000-0000-4000-9c00-000000000001");
    static final UUID OFFER_5_TO_1 = UUID.fromString("00000000-0000-4000-9c00-000000000002");
    static final UUID TRADE_1_2 = UUID.fromString("00000000-0000-4000-9d00-000000000001");
    static final UUID TRADE_1_5 = UUID.fromString("00000000-0000-4000-9d00-000000000002");
    static final UUID COLLECTOR8 = UUID.fromString("00000000-0000-4000-8000-000000000008");
    static final UUID OFFER_8_TO_1 = UUID.fromString("00000000-0000-4000-9c00-000000000006");
    static final UUID OFFER_5_TO_2 = UUID.fromString("00000000-0000-4000-9c00-000000000007");
    static final UUID TRADE_8_1 = UUID.fromString("00000000-0000-4000-9d00-000000000003");
    static final UUID TRADE_5_2 = UUID.fromString("00000000-0000-4000-9d00-000000000004");
    static final UUID PAYMENT_8_1 = UUID.fromString("00000000-0000-4000-9f00-000000000001");
    static final UUID PAYMENT_5_2 = UUID.fromString("00000000-0000-4000-9f00-000000000002");
    static final UUID DISPUTE_5_2 = UUID.fromString("00000000-0000-4000-9f00-000000000101");

    private final JdbcClient jdbc;
    private final OfferService offers;
    private final InteractionService interactions;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public TradeSeedContributor(
            JdbcClient jdbc,
            OfferService offers,
            InteractionService interactions,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.offers = offers;
        this.interactions = interactions;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public String name() {
        return "trades";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 61;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        Optional<OfferRow> meetupOffer = offers.row(OFFER_2_TO_1);
        if (meetupOffer.isPresent()) {
            Instant created = now.minus(Duration.ofDays(2));
            Instant proposed = created.plus(Duration.ofHours(1));
            Instant agreed = created.plus(Duration.ofHours(2));
            Instant completed = now.minus(Duration.ofHours(20));
            Instant buyerConfirmed = completed.minus(Duration.ofMinutes(10));
            if (trade(
                    TRADE_1_2,
                    meetupOffer.get(),
                    true,
                    agreed,
                    proposed,
                    buyerConfirmed,
                    completed,
                    created,
                    6)) {
                event(TRADE_1_2, 1, COLLECTOR1, "CREATED", created, created(OFFER_2_TO_1));
                event(TRADE_1_2, 2, COLLECTOR2, "MEETUP_PROPOSED", proposed, role("BUYER"));
                event(TRADE_1_2, 3, COLLECTOR1, "MEETUP_AGREED", agreed, Map.of());
                event(
                        TRADE_1_2,
                        4,
                        COLLECTOR2,
                        "COMPLETION_CONFIRMED",
                        buyerConfirmed,
                        role("BUYER"));
                event(TRADE_1_2, 5, COLLECTOR1, "COMPLETION_CONFIRMED", completed, role("SELLER"));
                event(TRADE_1_2, 6, COLLECTOR1, "COMPLETED", completed, seededCompletion());
            }
        }
        Optional<OfferRow> cashOffer = offers.row(OFFER_5_TO_1);
        if (cashOffer.isPresent()) {
            Instant created = now.minus(Duration.ofDays(3));
            Instant completed = now.minus(Duration.ofDays(2)).minus(Duration.ofHours(1));
            Instant buyerConfirmed = completed.minus(Duration.ofHours(1));
            if (trade(
                    TRADE_1_5,
                    cashOffer.get(),
                    false,
                    null,
                    null,
                    buyerConfirmed,
                    completed,
                    created,
                    3)) {
                event(TRADE_1_5, 1, COLLECTOR1, "CREATED", created, created(OFFER_5_TO_1));
                event(
                        TRADE_1_5,
                        2,
                        COLLECTOR5,
                        "COMPLETION_CONFIRMED",
                        buyerConfirmed,
                        role("BUYER"));
                event(TRADE_1_5, 3, COLLECTOR1, "COMPLETION_CONFIRMED", completed, role("SELLER"));
                event(TRADE_1_5, 4, COLLECTOR1, "COMPLETED", completed, seededCompletion());
            }
            interactions.record(
                    InteractionKind.TRADE,
                    COLLECTOR5,
                    COLLECTOR1,
                    InteractionKind.TRADE.subjectType(),
                    TRADE_1_5,
                    completed);
        }
        seedProtectedTrades(now);
    }

    /**
     * Phase 9: the protected trades of the seeded offers {@code …0006} (SHIPPED) and {@code …0007}
     * (DISPUTED), with the timeline the payment flow would have written. The times match the
     * payments module's seed (same offsets from the first run).
     */
    private void seedProtectedTrades(Instant now) {
        Optional<OfferRow> shippedOffer = offers.row(OFFER_8_TO_1);
        if (shippedOffer.isPresent()) {
            Instant created = now.minus(Duration.ofDays(3));
            Instant started = created.plus(Duration.ofMinutes(10));
            Instant secured = created.plus(Duration.ofMinutes(12));
            Instant shipped = now.minus(Duration.ofDays(1));
            if (protectedTrade(TRADE_8_1, shippedOffer.get(), "SHIPPED", created, shipped, 3)) {
                event(TRADE_8_1, 1, COLLECTOR1, "CREATED", created, protectedCreated(OFFER_8_TO_1));
                event(TRADE_8_1, 2, COLLECTOR8, "PAYMENT_STARTED", started, payment(PAYMENT_8_1));
                event(TRADE_8_1, 3, null, "PAYMENT_SECURED", secured, payment(PAYMENT_8_1));
                Map<String, Object> shipping = new LinkedHashMap<>();
                shipping.put("carrier", "Postal service");
                shipping.put("trackingNumber", "LOCAL-000001");
                shipping.put("disputeWindowEndsAt", shipped.plus(Duration.ofDays(7)).toString());
                event(TRADE_8_1, 4, COLLECTOR1, "SHIPPED", shipped, shipping);
            }
        }
        Optional<OfferRow> disputedOffer = offers.row(OFFER_5_TO_2);
        if (disputedOffer.isPresent()) {
            Instant created = now.minus(Duration.ofDays(6));
            Instant started = created.plus(Duration.ofMinutes(15));
            Instant secured = created.plus(Duration.ofMinutes(20));
            Instant shipped = now.minus(Duration.ofDays(5));
            Instant disputed = now.minus(Duration.ofDays(1));
            if (protectedTrade(TRADE_5_2, disputedOffer.get(), "DISPUTED", created, disputed, 4)) {
                event(TRADE_5_2, 1, COLLECTOR2, "CREATED", created, protectedCreated(OFFER_5_TO_2));
                event(TRADE_5_2, 2, COLLECTOR5, "PAYMENT_STARTED", started, payment(PAYMENT_5_2));
                event(TRADE_5_2, 3, null, "PAYMENT_SECURED", secured, payment(PAYMENT_5_2));
                Map<String, Object> shipping = new LinkedHashMap<>();
                shipping.put("carrier", "Postal service");
                shipping.put("trackingNumber", "LOCAL-000002");
                shipping.put("disputeWindowEndsAt", shipped.plus(Duration.ofDays(7)).toString());
                event(TRADE_5_2, 4, COLLECTOR2, "SHIPPED", shipped, shipping);
                Map<String, Object> dispute = new LinkedHashMap<>();
                dispute.put("disputeId", DISPUTE_5_2.toString());
                dispute.put("reason", "NOT_AS_DESCRIBED");
                event(TRADE_5_2, 5, COLLECTOR5, "DISPUTE_OPENED", disputed, dispute);
            }
        }
    }

    /**
     * Inserts an open protected trade of an accepted offer; returns whether it was inserted now.
     */
    private boolean protectedTrade(
            UUID id,
            OfferRow offer,
            String status,
            Instant createdAt,
            Instant updatedAt,
            int version) {
        return jdbc.sql(
                                """
                                INSERT INTO trade (id, offer_id, item_id, seller_id, buyer_id,
                                    kind, cash_amount, currency, status, protection_enabled,
                                    created_at, updated_at, version)
                                VALUES (:id, :offerId, :itemId, :sellerId, :buyerId, :kind, :cash,
                                    :currency, :status, true, :createdAt, :updatedAt, :version)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("id", id)
                        .param("offerId", offer.id())
                        .param("itemId", offer.itemId(), Types.OTHER)
                        .param("sellerId", offer.sellerId())
                        .param("buyerId", offer.buyerId())
                        .param("kind", offer.kind().name())
                        .param("cash", offer.cashAmount(), Types.NUMERIC)
                        .param("currency", offer.currency(), Types.CHAR)
                        .param("status", status)
                        .param("createdAt", Timestamp.from(createdAt))
                        .param("updatedAt", Timestamp.from(updatedAt))
                        .param("version", version)
                        .update()
                > 0;
    }

    private static Map<String, Object> protectedCreated(UUID offerId) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("offerId", offerId.toString());
        details.put("status", "AWAITING_PAYMENT");
        details.put("protectionEnabled", true);
        return details;
    }

    private static Map<String, Object> payment(UUID paymentId) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("paymentId", paymentId.toString());
        details.put("provider", "fake");
        return details;
    }

    /** Inserts a COMPLETED trade of an accepted offer; returns whether it was inserted now. */
    private boolean trade(
            UUID id,
            OfferRow offer,
            boolean meetup,
            @Nullable Instant meetupAgreedAt,
            @Nullable Instant meetupProposedAt,
            Instant buyerConfirmedAt,
            Instant completedAt,
            Instant createdAt,
            int version) {
        return jdbc.sql(
                                """
                                INSERT INTO trade (id, offer_id, item_id, seller_id, buyer_id,
                                    kind, cash_amount, currency, status, protection_enabled,
                                    meetup, buyer_meetup_at, seller_meetup_at, buyer_confirmed_at,
                                    seller_confirmed_at, created_at, updated_at, completed_at,
                                    version)
                                VALUES (:id, :offerId, :itemId, :sellerId, :buyerId, :kind, :cash,
                                    :currency, 'COMPLETED', false, :meetup, :buyerMeetupAt,
                                    :sellerMeetupAt, :buyerConfirmedAt, :completedAt, :createdAt,
                                    :completedAt, :completedAt, :version)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("id", id)
                        .param("offerId", offer.id())
                        .param("itemId", offer.itemId(), Types.OTHER)
                        .param("sellerId", offer.sellerId())
                        .param("buyerId", offer.buyerId())
                        .param("kind", offer.kind().name())
                        .param("cash", offer.cashAmount(), Types.NUMERIC)
                        .param("currency", offer.currency(), Types.CHAR)
                        .param("meetup", meetup)
                        .param("buyerMeetupAt", timestamp(meetupProposedAt), Types.TIMESTAMP)
                        .param("sellerMeetupAt", timestamp(meetupAgreedAt), Types.TIMESTAMP)
                        .param("buyerConfirmedAt", Timestamp.from(buyerConfirmedAt))
                        .param("completedAt", Timestamp.from(completedAt))
                        .param("createdAt", Timestamp.from(createdAt))
                        .param("version", version)
                        .update()
                > 0;
    }

    private void event(
            UUID tradeId,
            int sequence,
            @Nullable UUID actorId,
            String event,
            Instant at,
            Map<String, Object> details) {
        jdbc.sql(
                        """
                        INSERT INTO trade_event (id, trade_id, actor_id, event, details, created_at)
                        VALUES (:id, :tradeId, :actorId, :event, CAST(:details AS jsonb), :at)
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", UUID.nameUUIDFromBytes((tradeId + ":event:" + sequence).getBytes()))
                .param("tradeId", tradeId)
                .param("actorId", actorId, Types.OTHER)
                .param("event", event)
                .param("details", jsonMapper.writeValueAsString(details))
                .param("at", Timestamp.from(at))
                .update();
    }

    private static Map<String, Object> created(UUID offerId) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("offerId", offerId.toString());
        details.put("status", "AGREED");
        details.put("protectionEnabled", false);
        return details;
    }

    private static Map<String, Object> role(String role) {
        return Map.of("role", role);
    }

    private static Map<String, Object> seededCompletion() {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("transfers", List.of());
        details.put("seeded", true);
        return details;
    }

    private static @Nullable Timestamp timestamp(@Nullable Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
