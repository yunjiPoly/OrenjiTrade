package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Seeds payment protection (fictional, local/dev only; stable ids {@code
 * 00000000-0000-4000-9f00-...}; fake provider references, no money):
 *
 * <ul>
 *   <li>fake payout accounts, ACTIVE, for collector1 and collector2 (buyers can pay their protected
 *       trades at once);
 *   <li>payment {@code …0001} of trade {@code 9d00…0003} (collector8 buys collector1's Yu-Gi-Oh!
 *       single for 55.00 CAD): SECURED and shipped, dispute window of 7 days;
 *   <li>payment {@code …0002} of trade {@code 9d00…0004} (collector5 buys collector2's Magic card
 *       for 35.00 CAD): SECURED and frozen by dispute {@code …0101} (NOT_AS_DESCRIBED, OPEN) with a
 *       TEXT evidence of the buyer and one message from each party.
 * </ul>
 *
 * Times are derived from the seeded trades; inserted once ({@code ON CONFLICT DO NOTHING}), nothing
 * is notified.
 */
@Component
public class PaymentSeedContributor implements SeedContributor {

    static final UUID COLLECTOR1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID TRADE_8_1 = UUID.fromString("00000000-0000-4000-9d00-000000000003");
    static final UUID TRADE_5_2 = UUID.fromString("00000000-0000-4000-9d00-000000000004");
    static final UUID PAYMENT_8_1 = UUID.fromString("00000000-0000-4000-9f00-000000000001");
    static final UUID PAYMENT_5_2 = UUID.fromString("00000000-0000-4000-9f00-000000000002");
    static final UUID DISPUTE_5_2 = UUID.fromString("00000000-0000-4000-9f00-000000000101");
    static final BigDecimal FEE_PERCENT = new BigDecimal("5.00");

    private final JdbcClient jdbc;
    private final TradeService trades;
    private final JsonMapper jsonMapper;

    public PaymentSeedContributor(JdbcClient jdbc, TradeService trades, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.trades = trades;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public String name() {
        return "payments";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 62;
    }

    @Override
    @Transactional
    public void seed() {
        sellerAccount(COLLECTOR1, "fake_acct_seedcollector1");
        sellerAccount(COLLECTOR2, "fake_acct_seedcollector2");

        Optional<TradeRow> shipped = trades.row(TRADE_8_1);
        if (shipped.isPresent()) {
            TradeRow trade = shipped.get();
            Instant created = trade.createdAt();
            Instant started = created.plus(Duration.ofMinutes(10));
            Instant secured = created.plus(Duration.ofMinutes(12));
            Instant shippedAt = created.plus(Duration.ofDays(2));
            if (payment(
                    PAYMENT_8_1,
                    trade,
                    "fake_pi_seed00000000000001",
                    false,
                    started,
                    secured,
                    shippedAt)) {
                event(PAYMENT_8_1, 1, "CREATED", trade.buyerId(), started, created(trade));
                event(PAYMENT_8_1, 2, "SECURED", null, secured, amount(trade));
                event(PAYMENT_8_1, 3, "SHIPPED", trade.sellerId(), shippedAt, window(shippedAt));
                shipment(trade, "LOCAL-000001", "Top loader and bubble mailer.", shippedAt);
            }
        }

        Optional<TradeRow> disputed = trades.row(TRADE_5_2);
        if (disputed.isPresent()) {
            TradeRow trade = disputed.get();
            Instant created = trade.createdAt();
            Instant started = created.plus(Duration.ofMinutes(15));
            Instant secured = created.plus(Duration.ofMinutes(20));
            Instant shippedAt = created.plus(Duration.ofDays(1));
            Instant openedAt = created.plus(Duration.ofDays(5));
            if (payment(
                    PAYMENT_5_2,
                    trade,
                    "fake_pi_seed00000000000002",
                    true,
                    started,
                    secured,
                    shippedAt)) {
                event(PAYMENT_5_2, 1, "CREATED", trade.buyerId(), started, created(trade));
                event(PAYMENT_5_2, 2, "SECURED", null, secured, amount(trade));
                event(PAYMENT_5_2, 3, "SHIPPED", trade.sellerId(), shippedAt, window(shippedAt));
                event(
                        PAYMENT_5_2,
                        4,
                        "PAYOUT_FROZEN",
                        trade.buyerId(),
                        openedAt,
                        Map.of("disputeId", DISPUTE_5_2.toString()));
                shipment(trade, "LOCAL-000002", null, shippedAt);
                dispute(trade, openedAt);
            }
        }
    }

    private void sellerAccount(UUID userId, String accountRef) {
        jdbc.sql(
                        """
                        INSERT INTO seller_account (user_id, provider, provider_account_id, status,
                            payouts_enabled)
                        SELECT :id, 'fake', :ref, 'ACTIVE', true
                         WHERE EXISTS (SELECT 1 FROM user_account WHERE id = :id)
                        ON CONFLICT (user_id) DO NOTHING
                        """)
                .param("id", userId)
                .param("ref", accountRef)
                .update();
    }

    /** Inserts a SECURED fake payment of a seeded trade; returns whether it was inserted now. */
    private boolean payment(
            UUID id,
            TradeRow trade,
            String ref,
            boolean frozen,
            Instant createdAt,
            Instant securedAt,
            Instant shippedAt) {
        BigDecimal amount = trade.cashAmount() == null ? BigDecimal.ONE : trade.cashAmount();
        BigDecimal fee =
                amount.multiply(FEE_PERCENT)
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        return jdbc.sql(
                                """
                                INSERT INTO payment (id, trade_id, buyer_id, seller_id, provider,
                                    provider_ref, status, amount, currency, fee_percent,
                                    platform_fee, seller_amount, payout_frozen, secured_at,
                                    dispute_window_ends_at, created_at, updated_at, version)
                                VALUES (:id, :tradeId, :buyerId, :sellerId, 'fake', :ref,
                                    'SECURED', :amount, :currency, :feePercent, :fee,
                                    :sellerAmount, :frozen, :securedAt, :windowEnds, :createdAt,
                                    :updatedAt, 3)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("id", id)
                        .param("tradeId", trade.id())
                        .param("buyerId", trade.buyerId())
                        .param("sellerId", trade.sellerId())
                        .param("ref", ref)
                        .param("amount", amount)
                        .param("currency", trade.currency() == null ? "CAD" : trade.currency())
                        .param("feePercent", FEE_PERCENT)
                        .param("fee", fee)
                        .param("sellerAmount", amount.subtract(fee))
                        .param("frozen", frozen)
                        .param("securedAt", Timestamp.from(securedAt))
                        .param("windowEnds", Timestamp.from(shippedAt.plus(Duration.ofDays(7))))
                        .param("createdAt", Timestamp.from(createdAt))
                        .param("updatedAt", Timestamp.from(shippedAt))
                        .update()
                > 0;
    }

    private void event(
            UUID paymentId,
            int sequence,
            String event,
            @Nullable UUID actorId,
            Instant at,
            Map<String, ?> details) {
        jdbc.sql(
                        """
                        INSERT INTO payment_event (id, payment_id, event, actor_id, details,
                            created_at)
                        VALUES (:id, :paymentId, :event, :actorId, CAST(:details AS jsonb), :at)
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", stable(paymentId + ":event:" + sequence))
                .param("paymentId", paymentId)
                .param("event", event)
                .param("actorId", actorId, Types.OTHER)
                .param("details", jsonMapper.writeValueAsString(details))
                .param("at", Timestamp.from(at))
                .update();
    }

    private void shipment(
            TradeRow trade, String trackingNumber, @Nullable String notes, Instant shippedAt) {
        jdbc.sql(
                        """
                        INSERT INTO shipment (id, trade_id, carrier, tracking_number, notes,
                            shipped_by, shipped_at, created_at)
                        VALUES (:id, :tradeId, 'Postal service', :tracking, :notes, :by, :at, :at)
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", stable(trade.id() + ":shipment"))
                .param("tradeId", trade.id())
                .param("tracking", trackingNumber)
                .param("notes", notes, Types.VARCHAR)
                .param("by", trade.sellerId())
                .param("at", Timestamp.from(shippedAt))
                .update();
    }

    private void dispute(TradeRow trade, Instant openedAt) {
        int inserted =
                jdbc.sql(
                                """
                                INSERT INTO dispute (id, trade_id, payment_id, opened_by, reason,
                                    description, status, opened_at, updated_at)
                                VALUES (:id, :tradeId, :paymentId, :buyerId, 'NOT_AS_DESCRIBED',
                                    :description, 'OPEN', :at, :at)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("id", DISPUTE_5_2)
                        .param("tradeId", trade.id())
                        .param("paymentId", PAYMENT_5_2)
                        .param("buyerId", trade.buyerId())
                        .param(
                                "description",
                                "The card arrived with a crease across the art; the listing said"
                                        + " near mint.")
                        .param("at", Timestamp.from(openedAt))
                        .update();
        if (inserted == 0) {
            return;
        }
        jdbc.sql(
                        """
                        INSERT INTO dispute_event (id, dispute_id, actor_id, event, details, created_at)
                        VALUES (:id, :disputeId, :actorId, 'OPENED',
                            CAST('{"reason":"NOT_AS_DESCRIBED"}' AS jsonb), :at)
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", stable(DISPUTE_5_2 + ":event:1"))
                .param("disputeId", DISPUTE_5_2)
                .param("actorId", trade.buyerId())
                .param("at", Timestamp.from(openedAt))
                .update();
        UUID evidenceId = stable(DISPUTE_5_2 + ":evidence:1");
        Instant evidenceAt = openedAt.plus(Duration.ofMinutes(5));
        jdbc.sql(
                        """
                        INSERT INTO dispute_evidence (id, dispute_id, submitted_by, party_role, kind,
                            body, created_at)
                        VALUES (:id, :disputeId, :by, 'BUYER', 'TEXT', :body, :at)
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", evidenceId)
                .param("disputeId", DISPUTE_5_2)
                .param("by", trade.buyerId())
                .param(
                        "body",
                        "The crease is visible under a desk lamp; the sleeve was not damaged, so"
                                + " it happened before packing.")
                .param("at", Timestamp.from(evidenceAt))
                .update();
        Map<String, Object> evidenceDetails = new LinkedHashMap<>();
        evidenceDetails.put("evidenceId", evidenceId.toString());
        evidenceDetails.put("kind", "TEXT");
        evidenceDetails.put("role", "BUYER");
        disputeEvent(2, trade.buyerId(), "EVIDENCE_ADDED", evidenceDetails, evidenceAt);
        message(
                1,
                trade.buyerId(),
                "BUYER",
                "Could you check your photos of the card before shipping?",
                openedAt.plus(Duration.ofMinutes(10)));
        message(
                2,
                trade.sellerId(),
                "SELLER",
                "It was flat when I packed it; I can share my photos.",
                openedAt.plus(Duration.ofHours(2)));
    }

    private void message(int sequence, UUID authorId, String role, String body, Instant at) {
        UUID id = stable(DISPUTE_5_2 + ":message:" + sequence);
        int inserted =
                jdbc.sql(
                                """
                                INSERT INTO dispute_message (id, dispute_id, author_id, author_role,
                                    body, created_at)
                                VALUES (:id, :disputeId, :authorId, :role, :body, :at)
                                ON CONFLICT (id) DO NOTHING
                                """)
                        .param("id", id)
                        .param("disputeId", DISPUTE_5_2)
                        .param("authorId", authorId)
                        .param("role", role)
                        .param("body", body)
                        .param("at", Timestamp.from(at))
                        .update();
        if (inserted > 0) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("messageId", id.toString());
            details.put("role", role);
            disputeEvent(2 + sequence, authorId, "MESSAGE_POSTED", details, at);
        }
    }

    private void disputeEvent(
            int sequence, UUID actorId, String event, Map<String, ?> details, Instant at) {
        jdbc.sql(
                        """
                        INSERT INTO dispute_event (id, dispute_id, actor_id, event, details, created_at)
                        VALUES (:id, :disputeId, :actorId, :event, CAST(:details AS jsonb), :at)
                        ON CONFLICT (id) DO NOTHING
                        """)
                .param("id", stable(DISPUTE_5_2 + ":event:" + sequence))
                .param("disputeId", DISPUTE_5_2)
                .param("actorId", actorId)
                .param("event", event)
                .param("details", jsonMapper.writeValueAsString(details))
                .param("at", Timestamp.from(at))
                .update();
    }

    private static Map<String, Object> created(TradeRow trade) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("provider", "fake");
        details.put("amount", trade.cashAmount());
        details.put("currency", trade.currency());
        details.put("feePercent", FEE_PERCENT);
        details.put("seeded", true);
        return details;
    }

    private static Map<String, Object> amount(TradeRow trade) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("amount", trade.cashAmount());
        details.put("currency", trade.currency());
        return details;
    }

    private static Map<String, Object> window(Instant shippedAt) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("windowDays", 7);
        details.put("disputeWindowEndsAt", shippedAt.plus(Duration.ofDays(7)).toString());
        return details;
    }

    private static UUID stable(String key) {
        return UUID.nameUUIDFromBytes(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
