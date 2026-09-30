package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentProvider.CreatePaymentRequest;
import com.orenjitrade.api.payments.domain.PaymentProvider.Money;
import com.orenjitrade.api.payments.domain.PaymentProvider.PaymentProviderException;
import com.orenjitrade.api.payments.domain.PaymentProvider.Payout;
import com.orenjitrade.api.payments.domain.PaymentProvider.PayoutRequest;
import com.orenjitrade.api.payments.domain.PaymentProvider.ProtectedPayment;
import com.orenjitrade.api.payments.domain.PaymentProvider.Refund;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.SellerAccountRow;
import com.orenjitrade.api.payments.domain.PaymentSettings.Settings;
import com.orenjitrade.api.payments.events.PaymentUpdated;
import com.orenjitrade.api.payments.infra.DisputeRepository;
import com.orenjitrade.api.payments.infra.PaymentRepository;
import com.orenjitrade.api.payments.infra.ShipmentRepository;
import com.orenjitrade.api.trades.domain.TradeEventType;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeService;
import com.orenjitrade.api.trades.domain.TradeStatus;
import com.orenjitrade.api.trades.domain.TradeViews.Detail;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * The protected payment flow of a trade (Phase 9 contract "Endpoints"): the buyer pays ({@code POST
 * /trades/{id}/pay}, AWAITING_PAYMENT, the seller's payout account ACTIVE), the provider's webhook
 * secures the payment (trade PAID, the seller is told to ship), the seller ships ({@code /ship},
 * the dispute window starts), the buyer confirms receipt ({@code /confirm-receipt}) or the hourly
 * job treats the end of the window as receipt; the payout is then released and the trade COMPLETED.
 * Payments that arrive for a trade no longer awaiting them are refunded at once.
 *
 * <p>Every change appends a {@code payment_event} and the matching trade timeline entry inside one
 * transaction (lock order: trade row, then payment row) and publishes {@link PaymentUpdated} for
 * the notifications. Provider calls happen inside that transaction with idempotency keys, so a
 * rolled-back change retried later never moves money twice.
 */
@Service
public class ProtectedPaymentService {

    static final String TRADE_NOT_FOUND = "Trade not found";

    /** Batch bound of the auto-release job's queries. */
    public static final int JOB_BATCH = 200;

    private static final Logger log = LoggerFactory.getLogger(ProtectedPaymentService.class);

    private final TradeService trades;
    private final PaymentRepository payments;
    private final ShipmentRepository shipments;
    private final DisputeRepository disputes;
    private final SellerAccountService sellers;
    private final PaymentProvider provider;
    private final PaymentSettings settings;
    private final PaymentFeature feature;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public ProtectedPaymentService(
            TradeService trades,
            PaymentRepository payments,
            ShipmentRepository shipments,
            DisputeRepository disputes,
            SellerAccountService sellers,
            PaymentProvider provider,
            PaymentSettings settings,
            PaymentFeature feature,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.trades = trades;
        this.payments = payments;
        this.shipments = shipments;
        this.disputes = disputes;
        this.sellers = sellers;
        this.provider = provider;
        this.settings = settings;
        this.feature = feature;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    /**
     * Result of {@code POST /trades/{id}/pay}.
     *
     * @param payment the payment (REQUIRES_ACTION)
     * @param clientSecret the provider's client secret for an embedded form (never stored)
     * @param created whether this call started a new checkout attempt
     */
    public record PayResult(PaymentRow payment, @Nullable String clientSecret, boolean created) {}

    /**
     * What the fake checkout page shows ({@code GET /payments/fake/{ref}}).
     *
     * @param payment the payment
     * @param summary the trade's terms ("40.00 CAD for Azure-Eyes Sky Dragon")
     */
    public record CheckoutView(PaymentRow payment, String summary) {}

    // ---------------------------------------------------------------------------------------
    // Buyer and seller steps
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /trades/{id}/pay}: the buyer of an AWAITING_PAYMENT protected trade starts the
     * checkout (an open checkout is answered again; a failed or cancelled one is restarted with a
     * new provider payment). 403 for the seller, 409 INVALID_STATE_TRANSITION in other states, 409
     * SELLER_NOT_ONBOARDED while the seller's payout account is not ACTIVE.
     */
    @Transactional
    public PayResult pay(UUID me, UUID tradeId) {
        TradeRow trade = partyTrade(me, tradeId);
        feature.requireFor(trade.buyerId());
        if (!me.equals(trade.buyerId())) {
            throw ApiException.forbidden("Only the buyer pays a protected trade");
        }
        if (!trade.protectionEnabled() || trade.status() != TradeStatus.AWAITING_PAYMENT) {
            throw invalidState(trade, "paid");
        }
        Optional<PaymentRow> existing = payments.lockByTrade(tradeId);
        if (existing.isPresent()
                && existing.get().status() == PaymentStatus.REQUIRES_ACTION
                && existing.get().provider().equals(provider.providerId())) {
            return new PayResult(existing.get(), null, false);
        }
        if (existing.isPresent() && !existing.get().status().unpaid()) {
            throw invalidState(trade, "paid again");
        }
        String sellerAccount =
                sellers.readyAccountRef(trade.sellerId())
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                ErrorCode.SELLER_NOT_ONBOARDED,
                                                "The seller has not set up payouts yet; the"
                                                        + " payment can start once they have"));
        BigDecimal amount = requireCash(trade);
        String currency = requireCurrency(trade);
        Settings rules = settings.current();
        BigDecimal fee = PaymentRules.fee(amount, rules.platformFeePercent());
        BigDecimal sellerAmount = amount.subtract(fee);
        UUID paymentId = existing.map(PaymentRow::id).orElseGet(UUID::randomUUID);
        int attempt = existing.map(row -> row.version() + 2).orElse(1);
        if (existing.isPresent() && existing.get().status() == PaymentStatus.REQUIRES_ACTION) {
            cancelQuietly(existing.get().providerRef());
        }
        ProtectedPayment created;
        try {
            created =
                    provider.createProtectedPayment(
                            new CreatePaymentRequest(
                                    paymentId,
                                    attempt,
                                    tradeId,
                                    trade.buyerId(),
                                    sellerAccount,
                                    new Money(amount, currency),
                                    new Money(fee, currency),
                                    "OrenjiTrade payment protection: "
                                            + trades.summaryText(trade)));
        } catch (PaymentProviderException e) {
            log.warn("Protected payment of trade {} not created: {}", tradeId, e.getMessage());
            throw unavailable();
        }
        Instant now = now();
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("provider", provider.providerId());
        details.put("amount", amount);
        details.put("currency", currency);
        details.put("feePercent", rules.platformFeePercent());
        details.put("platformFee", fee);
        details.put("attempt", attempt);
        if (existing.isEmpty()) {
            payments.insert(
                    paymentId,
                    tradeId,
                    trade.buyerId(),
                    trade.sellerId(),
                    provider.providerId(),
                    created.paymentRef(),
                    amount,
                    currency,
                    rules.platformFeePercent(),
                    fee,
                    sellerAmount,
                    created.checkoutUrl(),
                    now);
            payments.insertEvent(paymentId, "CREATED", null, me, json(details), now);
        } else {
            payments.restart(
                    paymentId,
                    provider.providerId(),
                    created.paymentRef(),
                    rules.platformFeePercent(),
                    fee,
                    sellerAmount,
                    created.checkoutUrl(),
                    now);
            payments.insertEvent(paymentId, "CHECKOUT_RESTARTED", null, me, json(details), now);
        }
        Map<String, Object> tradeDetails = new LinkedHashMap<>();
        tradeDetails.put("paymentId", paymentId.toString());
        tradeDetails.put("provider", provider.providerId());
        tradeDetails.put("attempt", attempt);
        trades.recordProtectedEvent(tradeId, me, TradeEventType.PAYMENT_STARTED, tradeDetails, now);
        log.info(
                "Protected checkout {} of trade {} started (attempt {})",
                paymentId,
                tradeId,
                attempt);
        return new PayResult(requirePayment(paymentId), created.clientSecret(), true);
    }

    /**
     * {@code POST /trades/{id}/ship}: the seller of a PAID protected trade confirms the shipment;
     * the dispute window ({@code payments.dispute_window_days}) starts and the buyer is told.
     */
    @Transactional
    public Detail ship(
            UUID me,
            UUID tradeId,
            @Nullable String carrier,
            @Nullable String trackingNumber,
            @Nullable String notes) {
        TradeRow trade = partyTrade(me, tradeId);
        feature.requireFor(trade.buyerId());
        if (!me.equals(trade.sellerId())) {
            throw ApiException.forbidden("Only the seller confirms the shipment");
        }
        if (!trade.protectionEnabled() || trade.status() != TradeStatus.PAID) {
            throw invalidState(trade, "shipped");
        }
        PaymentRow payment =
                payments.lockByTrade(tradeId)
                        .filter(row -> row.status() == PaymentStatus.SECURED)
                        .orElseThrow(() -> invalidState(trade, "shipped"));
        Instant now = now();
        Settings rules = settings.current();
        Instant windowEnds = PaymentRules.windowEnd(now, rules.disputeWindowDays());
        if (!shipments.insert(tradeId, text(carrier), text(trackingNumber), text(notes), me, now)) {
            throw invalidState(trade, "shipped again");
        }
        payments.startWindow(payment.id(), windowEnds, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("windowDays", rules.disputeWindowDays());
        details.put("disputeWindowEndsAt", windowEnds.toString());
        payments.insertEvent(payment.id(), "SHIPPED", null, me, json(details), now);
        Map<String, Object> tradeDetails = new LinkedHashMap<>();
        if (text(carrier) != null) {
            tradeDetails.put("carrier", text(carrier));
        }
        if (text(trackingNumber) != null) {
            tradeDetails.put("trackingNumber", text(trackingNumber));
        }
        tradeDetails.put("disputeWindowEndsAt", windowEnds.toString());
        trades.advance(
                tradeId,
                EnumSet.of(TradeStatus.PAID),
                TradeStatus.SHIPPED,
                me,
                TradeEventType.SHIPPED,
                tradeDetails,
                now,
                "shipped");
        publish(payment, "SHIPPED", PaymentStatus.SECURED, me, now);
        return trades.get(me, tradeId);
    }

    /**
     * {@code POST /trades/{id}/confirm-receipt}: the buyer of a SHIPPED protected trade confirms
     * the card arrived; the payout is released and the trade COMPLETED (inventory transfer, TRADE
     * interaction). 409 while a dispute holds the payout.
     */
    @Transactional
    public Detail confirmReceipt(UUID me, UUID tradeId) {
        TradeRow trade = partyTrade(me, tradeId);
        feature.requireFor(trade.buyerId());
        if (!me.equals(trade.buyerId())) {
            throw ApiException.forbidden("Only the buyer confirms receipt");
        }
        if (!trade.protectionEnabled() || trade.status() != TradeStatus.SHIPPED) {
            throw invalidState(trade, "confirmed as received");
        }
        PaymentRow payment =
                payments.lockByTrade(tradeId)
                        .filter(row -> row.status() == PaymentStatus.SECURED && !row.payoutFrozen())
                        .orElseThrow(() -> invalidState(trade, "confirmed as received"));
        receive(trade, payment, me, false, now());
        return trades.get(me, tradeId);
    }

    /** The buyer's view of a fake checkout ({@code GET /payments/fake/{ref}}); 404 otherwise. */
    @Transactional(readOnly = true)
    public CheckoutView checkout(UUID me, String paymentRef) {
        PaymentRow payment =
                payments.findByRef(provider.providerId(), paymentRef)
                        .filter(row -> row.buyerId().equals(me))
                        .orElseThrow(() -> ApiException.notFound("Checkout not found"));
        feature.requireFor(payment.buyerId());
        String summary =
                trades.rows(List.of(payment.tradeId())).values().stream()
                        .findFirst()
                        .map(trades::summaryText)
                        .orElse("a trade");
        return new CheckoutView(payment, summary);
    }

    // ---------------------------------------------------------------------------------------
    // Webhook handlers (joined to the webhook processing transaction)
    // ---------------------------------------------------------------------------------------

    /**
     * {@code payment.secured}: REQUIRES_ACTION (or FAILED / CANCELLED) → SECURED; the trade moves
     * to PAID and the seller is told to ship. A trade that no longer awaits the payment (cancelled,
     * turned into a meetup) gets it refunded at once. Already secured: ignored.
     */
    @Transactional
    public WebhookOutcome onSecured(String providerEventId, String paymentRef) {
        Optional<PaymentRow> found = payments.findByRef(provider.providerId(), paymentRef);
        if (found.isEmpty()) {
            return WebhookOutcome.ignored(null, "UNKNOWN_PAYMENT");
        }
        Optional<TradeRow> locked = trades.lockForPayment(found.get().tradeId());
        PaymentRow payment = requireLocked(found.get().id());
        if (locked.isEmpty()) {
            return WebhookOutcome.ignored(payment.id(), "UNKNOWN_TRADE");
        }
        if (payment.status().secured()) {
            return WebhookOutcome.ignored(payment.id(), "ALREADY_SECURED");
        }
        TradeRow trade = locked.get();
        Instant now = now();
        boolean wasCancelled = payment.status() == PaymentStatus.CANCELLED;
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("amount", payment.amount());
        details.put("currency", payment.currency());
        if (!payments.insertEvent(
                payment.id(), "SECURED", providerEventId, null, json(details), now)) {
            return WebhookOutcome.ignored(payment.id(), "ALREADY_APPLIED");
        }
        payments.markSecured(payment.id(), now);
        if (!wasCancelled
                && trade.protectionEnabled()
                && trade.status() == TradeStatus.AWAITING_PAYMENT) {
            trades.advance(
                    trade.id(),
                    EnumSet.of(TradeStatus.AWAITING_PAYMENT),
                    TradeStatus.PAID,
                    null,
                    TradeEventType.PAYMENT_SECURED,
                    Map.of("paymentId", payment.id().toString()),
                    now,
                    "paid");
            publish(payment, "SECURED", PaymentStatus.SECURED, null, now);
            log.info("Payment {} secured; trade {} PAID", payment.id(), trade.id());
            return WebhookOutcome.processed(payment.id());
        }
        PaymentRow secured = requirePayment(payment.id());
        refund(
                secured,
                secured.refundable(),
                "The trade was no longer awaiting this payment",
                "SYSTEM",
                null,
                now,
                "refund:auto:" + payment.id());
        payments.insertEvent(
                payment.id(),
                "AUTO_REFUNDED",
                providerEventId,
                null,
                json(Map.of("tradeStatus", trade.status().name())),
                now);
        log.info(
                "Payment {} secured for trade {} in {}: refunded at once",
                payment.id(),
                trade.id(),
                trade.status());
        return WebhookOutcome.processed(payment.id());
    }

    /** {@code payment.failed}: REQUIRES_ACTION → FAILED; the buyer may pay again. */
    @Transactional
    public WebhookOutcome onFailed(
            String providerEventId, String paymentRef, @Nullable String failureCode) {
        Optional<PaymentRow> found = payments.findByRef(provider.providerId(), paymentRef);
        if (found.isEmpty()) {
            return WebhookOutcome.ignored(null, "UNKNOWN_PAYMENT");
        }
        trades.lockForPayment(found.get().tradeId());
        PaymentRow payment = requireLocked(found.get().id());
        if (payment.status() != PaymentStatus.REQUIRES_ACTION) {
            return WebhookOutcome.ignored(payment.id(), "NOT_AWAITING_PAYMENT");
        }
        Instant now = now();
        String code = failureCode == null ? null : truncate(failureCode, 100);
        payments.markFailed(payment.id(), code, now);
        Map<String, Object> details = new LinkedHashMap<>();
        if (code != null) {
            details.put("failureCode", code);
        }
        payments.insertEvent(payment.id(), "FAILED", providerEventId, null, json(details), now);
        Map<String, Object> tradeDetails = new LinkedHashMap<>(details);
        tradeDetails.put("paymentId", payment.id().toString());
        trades.recordProtectedEvent(
                payment.tradeId(), null, TradeEventType.PAYMENT_FAILED, tradeDetails, now);
        publish(payment, "FAILED", PaymentStatus.FAILED, null, now);
        return WebhookOutcome.processed(payment.id());
    }

    /** A refund confirmed ({@code refund.succeeded}) or failed ({@code refund.failed}). */
    @Transactional
    public WebhookOutcome onRefundResult(
            String providerEventId, String refundRef, boolean succeeded) {
        Instant now = now();
        Optional<UUID> paymentId =
                payments.completeRefund(refundRef, succeeded ? "SUCCEEDED" : "FAILED", now);
        if (paymentId.isEmpty()) {
            return WebhookOutcome.ignored(null, "UNKNOWN_OR_SETTLED_REFUND");
        }
        payments.insertEvent(
                paymentId.get(),
                succeeded ? "REFUND_CONFIRMED" : "REFUND_FAILED",
                providerEventId,
                null,
                json(Map.of("refundRef", refundRef)),
                now);
        if (!succeeded) {
            log.atWarn()
                    .addKeyValue("event", "payment.refund.failed")
                    .log("Refund of payment {} failed at the provider", paymentId.get());
        }
        return WebhookOutcome.processed(paymentId.get());
    }

    /** {@code payout.paid}: a PAYOUT_PENDING payment reached the seller (PAID_OUT). */
    @Transactional
    public WebhookOutcome onPayoutPaid(String providerEventId, String paymentRef) {
        Optional<PaymentRow> found = payments.findByRef(provider.providerId(), paymentRef);
        if (found.isEmpty()) {
            return WebhookOutcome.ignored(null, "UNKNOWN_PAYMENT");
        }
        trades.lockForPayment(found.get().tradeId());
        PaymentRow payment = requireLocked(found.get().id());
        if (payment.status() != PaymentStatus.PAYOUT_PENDING) {
            return WebhookOutcome.ignored(payment.id(), "NOT_PAYOUT_PENDING");
        }
        Instant now = now();
        payments.setStatus(payment.id(), settled(payment), now);
        payments.insertEvent(payment.id(), "PAYOUT_PAID", providerEventId, null, "{}", now);
        return WebhookOutcome.processed(payment.id());
    }

    // ---------------------------------------------------------------------------------------
    // Trade changes (after commit of TradeUpdated)
    // ---------------------------------------------------------------------------------------

    /**
     * Cancels the unpaid checkout of a trade that was cancelled or turned into an in-person meetup
     * (idempotent: only REQUIRES_ACTION and FAILED payments change).
     */
    @Transactional
    public void cancelUnpaid(UUID tradeId, String cause) {
        Optional<PaymentRow> found = payments.findByTrade(tradeId);
        if (found.isEmpty()
                || (found.get().status() != PaymentStatus.REQUIRES_ACTION
                        && found.get().status() != PaymentStatus.FAILED)) {
            return;
        }
        trades.lockForPayment(tradeId);
        PaymentRow payment = requireLocked(found.get().id());
        if (payment.status() != PaymentStatus.REQUIRES_ACTION
                && payment.status() != PaymentStatus.FAILED) {
            return;
        }
        Instant now = now();
        if (payment.status() == PaymentStatus.REQUIRES_ACTION) {
            cancelQuietly(payment.providerRef());
        }
        payments.markCancelled(payment.id(), now);
        payments.insertEvent(
                payment.id(), "CANCELLED", null, null, json(Map.of("cause", cause)), now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("paymentId", payment.id().toString());
        details.put("cause", cause);
        trades.recordProtectedEvent(tradeId, null, TradeEventType.PAYMENT_CANCELLED, details, now);
        log.info("Unpaid checkout {} of trade {} cancelled ({})", payment.id(), tradeId, cause);
    }

    // ---------------------------------------------------------------------------------------
    // Auto-release job
    // ---------------------------------------------------------------------------------------

    /** Payments whose buyer should be reminded of the automatic release now. */
    @Transactional(readOnly = true)
    public List<UUID> reminderCandidates(int reminderHours) {
        Instant now = now();
        return payments.reminderCandidates(
                now, now.plus(Duration.ofHours(reminderHours)), JOB_BATCH);
    }

    /** Payments whose dispute window has ended without a dispute. */
    @Transactional(readOnly = true)
    public List<UUID> releaseCandidates() {
        return payments.releaseCandidates(now(), JOB_BATCH);
    }

    /** Reminds the buyer of a shipped trade that the payout is released soon (once). */
    @Transactional
    public boolean remind(UUID paymentId) {
        Optional<PaymentRow> found = payments.find(paymentId);
        if (found.isEmpty()) {
            return false;
        }
        Optional<TradeRow> trade = trades.lockForPayment(found.get().tradeId());
        PaymentRow payment = requireLocked(paymentId);
        if (trade.isEmpty()
                || trade.get().status() != TradeStatus.SHIPPED
                || payment.status() != PaymentStatus.SECURED
                || payment.payoutFrozen()
                || payment.releaseRemindedAt() != null) {
            return false;
        }
        Instant now = now();
        if (!payments.markReminded(paymentId, now)) {
            return false;
        }
        payments.insertEvent(
                paymentId,
                "RELEASE_REMINDER",
                null,
                null,
                json(Map.of("disputeWindowEndsAt", String.valueOf(payment.disputeWindowEndsAt()))),
                now);
        publish(payment, "RELEASE_REMINDER", PaymentStatus.SECURED, null, now);
        return true;
    }

    /**
     * Treats a shipped trade whose dispute window ended without a dispute as received: payout
     * released, trade COMPLETED. False when anything changed meanwhile (checked under the locks).
     */
    @Transactional
    public boolean autoRelease(UUID paymentId) {
        Optional<PaymentRow> found = payments.find(paymentId);
        if (found.isEmpty()) {
            return false;
        }
        Optional<TradeRow> trade = trades.lockForPayment(found.get().tradeId());
        PaymentRow payment = requireLocked(paymentId);
        Instant now = now();
        if (trade.isEmpty()
                || trade.get().status() != TradeStatus.SHIPPED
                || payment.status() != PaymentStatus.SECURED
                || payment.payoutFrozen()
                || payment.disputeWindowEndsAt() == null
                || payment.disputeWindowEndsAt().isAfter(now)
                || disputes.byTrade(trade.get().id())
                        .filter(dispute -> dispute.status().isOpen())
                        .isPresent()) {
            return false;
        }
        receive(trade.get(), payment, null, true, now);
        log.info("Payout of payment {} released automatically", paymentId);
        return true;
    }

    // ---------------------------------------------------------------------------------------
    // Money movements (also used by disputes and admins)
    // ---------------------------------------------------------------------------------------

    /**
     * Releases the seller's payout of a secured payment: the retained amount (amount − refunds)
     * minus the fee on it. PAID_OUT when the provider reports the transfer done, PAYOUT_PENDING
     * otherwise (a {@code payout.paid} webhook completes it). The caller holds the trade and
     * payment locks.
     */
    public PaymentRow releasePayout(
            PaymentRow payment, @Nullable UUID actorId, String trigger, Instant now) {
        BigDecimal amount =
                PaymentRules.payout(
                        payment.amount(), payment.refundedAmount(), payment.feePercent());
        Payout payout;
        if (amount.signum() > 0) {
            String account =
                    sellers.find(payment.sellerId())
                            .map(SellerAccountRow::providerAccountId)
                            .orElseThrow(
                                    () ->
                                            ApiException.conflict(
                                                    "The seller's payout account is not"
                                                            + " available"));
            try {
                payout =
                        provider.releasePayout(
                                new PayoutRequest(
                                        payment.id(),
                                        payment.providerRef(),
                                        account,
                                        payment.money(amount),
                                        "trade_" + payment.tradeId()));
            } catch (PaymentProviderException e) {
                log.warn("Payout of payment {} failed: {}", payment.id(), e.getMessage());
                throw unavailable();
            }
        } else {
            payout = new Payout("none", true);
        }
        PaymentStatus status = payout.completed() ? settled(payment) : PaymentStatus.PAYOUT_PENDING;
        payments.markPayout(payment.id(), amount, payout.payoutRef(), status, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("amount", amount);
        details.put("currency", payment.currency());
        details.put("trigger", trigger);
        details.put("completed", payout.completed());
        payments.insertEvent(payment.id(), "PAYOUT_RELEASED", null, actorId, json(details), now);
        Map<String, Object> tradeDetails = new LinkedHashMap<>();
        tradeDetails.put("amount", amount);
        tradeDetails.put("currency", payment.currency());
        trades.recordProtectedEvent(
                payment.tradeId(),
                partyOrNull(payment, actorId),
                TradeEventType.PAYOUT_RELEASED,
                tradeDetails,
                now);
        publish(payment, "PAYOUT_RELEASED", status, actorId, now);
        return requirePayment(payment.id());
    }

    /**
     * Refunds {@code amount} of a secured payment to the buyer through the provider (idempotency
     * key {@code idempotencyKey}). A full refund makes the payment REFUNDED; a partial one keeps a
     * SECURED payment SECURED (the payout shrinks) and marks a paid-out one PARTIALLY_REFUNDED. The
     * caller holds the trade and payment locks and checked the amount.
     *
     * @param source ADMIN, DISPUTE or SYSTEM
     */
    public PaymentRow refund(
            PaymentRow payment,
            BigDecimal amount,
            String reason,
            String source,
            @Nullable UUID requestedBy,
            Instant now,
            String idempotencyKey) {
        Refund result;
        try {
            result =
                    provider.refund(
                            payment.providerRef(),
                            payment.money(amount),
                            truncate(reason, 500),
                            idempotencyKey);
        } catch (PaymentProviderException e) {
            log.warn("Refund of payment {} failed: {}", payment.id(), e.getMessage());
            throw unavailable();
        }
        UUID refundId =
                payments.insertRefund(
                        payment.id(),
                        result.refundRef(),
                        amount,
                        payment.currency(),
                        truncate(reason, 500),
                        source,
                        result.succeeded() ? "SUCCEEDED" : "PENDING",
                        requestedBy,
                        now);
        boolean full = payment.refundedAmount().add(amount).compareTo(payment.amount()) >= 0;
        PaymentStatus status;
        if (full) {
            status = PaymentStatus.REFUNDED;
        } else if (payment.status() == PaymentStatus.SECURED) {
            status = PaymentStatus.SECURED;
        } else {
            status = PaymentStatus.PARTIALLY_REFUNDED;
        }
        payments.addRefund(payment.id(), amount, status, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("refundId", refundId.toString());
        details.put("amount", amount);
        details.put("currency", payment.currency());
        details.put("source", source);
        details.put("pending", !result.succeeded());
        payments.insertEvent(payment.id(), "REFUNDED", null, requestedBy, json(details), now);
        Map<String, Object> tradeDetails = new LinkedHashMap<>();
        tradeDetails.put("amount", amount);
        tradeDetails.put("currency", payment.currency());
        tradeDetails.put("full", full);
        trades.recordProtectedEvent(
                payment.tradeId(),
                partyOrNull(payment, requestedBy),
                TradeEventType.REFUNDED,
                tradeDetails,
                now);
        publish(payment, "REFUNDED", status, requestedBy, now);
        log.info(
                "Refunded {} {} of payment {} ({})",
                amount,
                payment.currency(),
                payment.id(),
                source);
        return requirePayment(payment.id());
    }

    // ---------------------------------------------------------------------------------------
    // Reads for other services of the module
    // ---------------------------------------------------------------------------------------

    /** The payment of a trade. */
    @Transactional(readOnly = true)
    public Optional<PaymentRow> byTrade(UUID tradeId) {
        return payments.findByTrade(tradeId);
    }

    /** The active provider's id. */
    public String providerId() {
        return provider.providerId();
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    /** SHIPPED → RECEIVED, payout released, COMPLETED (the caller holds the locks). */
    private void receive(
            TradeRow trade,
            PaymentRow payment,
            @Nullable UUID actor,
            boolean automatic,
            Instant now) {
        shipments.markDelivered(trade.id(), now);
        trades.advance(
                trade.id(),
                EnumSet.of(TradeStatus.SHIPPED),
                TradeStatus.RECEIVED,
                actor,
                TradeEventType.RECEIPT_CONFIRMED,
                Map.of("automatic", automatic),
                now,
                "confirmed as received");
        releasePayout(payment, actor, automatic ? "AUTO_RELEASE" : "RECEIPT_CONFIRMED", now);
        trades.completeProtected(trade.id(), actor, now);
    }

    TradeRow partyTrade(UUID me, UUID tradeId) {
        return trades.lockForPayment(tradeId)
                .filter(row -> row.involves(me))
                .orElseThrow(() -> ApiException.notFound(TRADE_NOT_FOUND));
    }

    PaymentRow requireLocked(UUID paymentId) {
        return payments.lock(paymentId)
                .orElseThrow(() -> new IllegalStateException("Payment vanished: " + paymentId));
    }

    PaymentRow requirePayment(UUID paymentId) {
        return payments.find(paymentId)
                .orElseThrow(() -> new IllegalStateException("Payment vanished: " + paymentId));
    }

    void publish(
            PaymentRow payment,
            String event,
            PaymentStatus status,
            @Nullable UUID actorId,
            Instant at) {
        events.publishEvent(
                new PaymentUpdated(
                        payment.id(),
                        payment.tradeId(),
                        event,
                        status.name(),
                        payment.provider(),
                        payment.buyerId(),
                        payment.sellerId(),
                        actorId,
                        at));
    }

    String json(Map<String, ?> details) {
        return jsonMapper.writeValueAsString(details);
    }

    Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }

    static ApiException invalidState(TradeRow row, String action) {
        return new ApiException(
                        ErrorCode.INVALID_STATE_TRANSITION,
                        "This trade is "
                                + row.status().name().toLowerCase(Locale.ROOT).replace('_', ' ')
                                + " and cannot be "
                                + action)
                .withProperty("currentStatus", row.status().name());
    }

    static ApiException unavailable() {
        return new ApiException(
                ErrorCode.SERVICE_UNAVAILABLE,
                "The payment provider is not reachable; try again later");
    }

    /** Final status once the payout reached the seller: PARTIALLY_REFUNDED after any refund. */
    private static PaymentStatus settled(PaymentRow payment) {
        return payment.refundedAmount().signum() > 0
                ? PaymentStatus.PARTIALLY_REFUNDED
                : PaymentStatus.PAID_OUT;
    }

    /** Timeline entries name a party only; admins and the platform act anonymously there. */
    private static @Nullable UUID partyOrNull(PaymentRow payment, @Nullable UUID actorId) {
        return actorId != null && payment.involves(actorId) ? actorId : null;
    }

    private void cancelQuietly(String paymentRef) {
        try {
            provider.cancelPayment(paymentRef);
        } catch (PaymentProviderException e) {
            log.warn("Checkout {} not cancelled at the provider: {}", paymentRef, e.getMessage());
        }
    }

    private static BigDecimal requireCash(TradeRow trade) {
        if (trade.cashAmount() == null) {
            throw invalidState(trade, "paid without a cash part");
        }
        return trade.cashAmount();
    }

    private static String requireCurrency(TradeRow trade) {
        if (trade.currency() == null) {
            throw invalidState(trade, "paid without a currency");
        }
        return trade.currency();
    }

    static @Nullable String text(@Nullable String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
