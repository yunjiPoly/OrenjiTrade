package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentEventRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.RefundRow;
import com.orenjitrade.api.payments.domain.PaymentRows.ShipmentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.WebhookEventRow;
import com.orenjitrade.api.payments.infra.DisputeRepository;
import com.orenjitrade.api.payments.infra.PaymentRepository;
import com.orenjitrade.api.payments.infra.ShipmentRepository;
import com.orenjitrade.api.payments.infra.WebhookEventRepository;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeService;
import com.orenjitrade.api.trades.domain.TradeStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin console "Transactions" and "Payments" (Phase 9 contract "Admin"): trades with a protected
 * payment (all, pending shipment, pending confirmation), payments with their history, refunds
 * (SUPER_ADMIN, or ADMIN while {@code payments.admin_refunds_enabled}), the webhook event browser
 * and the payment settings. Every write is audited with the request id.
 */
@Service
public class PaymentAdminService {

    public static final String ACTION_REFUND = "payment.refund";
    public static final String TARGET_PAYMENT = "PAYMENT";

    private static final Logger log = LoggerFactory.getLogger(PaymentAdminService.class);

    private final PaymentRepository payments;
    private final ShipmentRepository shipments;
    private final DisputeRepository disputes;
    private final WebhookEventRepository webhooks;
    private final ProtectedPaymentService paymentFlow;
    private final PaymentSettings settings;
    private final TradeService trades;
    private final MemberDirectory members;
    private final AuditService audit;
    private final TimeProvider timeProvider;

    public PaymentAdminService(
            PaymentRepository payments,
            ShipmentRepository shipments,
            DisputeRepository disputes,
            WebhookEventRepository webhooks,
            ProtectedPaymentService paymentFlow,
            PaymentSettings settings,
            TradeService trades,
            MemberDirectory members,
            AuditService audit,
            TimeProvider timeProvider) {
        this.payments = payments;
        this.shipments = shipments;
        this.disputes = disputes;
        this.webhooks = webhooks;
        this.paymentFlow = paymentFlow;
        this.settings = settings;
        this.trades = trades;
        this.members = members;
        this.audit = audit;
        this.timeProvider = timeProvider;
    }

    /**
     * A trade with its protected payment (admin lists).
     *
     * @param payment the payment
     * @param tradeStatus the trade's status
     * @param summary the trade's terms as text
     * @param buyer the buyer's card
     * @param seller the seller's card
     * @param shipment the shipping confirmation, if any
     * @param dispute the dispute, if any
     */
    public record Transaction(
            PaymentRow payment,
            @Nullable TradeStatus tradeStatus,
            String summary,
            @Nullable MemberCard buyer,
            @Nullable MemberCard seller,
            @Nullable ShipmentRow shipment,
            @Nullable DisputeRow dispute) {}

    /**
     * A payment with its full history (admin detail).
     *
     * @param transaction the payment and its trade
     * @param events payment history, oldest first
     * @param refunds refunds, oldest first
     * @param webhooks provider webhooks linked to the payment, oldest first
     * @param refundAllowed whether the viewer may refund it now
     */
    public record PaymentDetail(
            Transaction transaction,
            List<PaymentEventRow> events,
            List<RefundRow> refunds,
            List<WebhookEventRow> webhooks,
            boolean refundAllowed) {}

    /** Which admin list of transactions. */
    public enum TransactionQueue {
        ALL,
        PENDING_SHIPMENT,
        PENDING_CONFIRMATION
    }

    /**
     * {@code GET /admin/transactions}, {@code /pending-shipment}, {@code /pending-confirmation}.
     */
    @Transactional(readOnly = true)
    public PageResponse<Transaction> transactions(
            TransactionQueue queue, @Nullable PaymentStatus status, int page, int size) {
        List<PaymentRow> rows;
        long total;
        switch (queue) {
            case PENDING_SHIPMENT -> {
                rows = payments.pendingShipment(page, size);
                total = payments.countPendingShipment();
            }
            case PENDING_CONFIRMATION -> {
                rows = payments.pendingConfirmation(page, size);
                total = payments.countPendingConfirmation();
            }
            default -> {
                rows = payments.page(status, page, size);
                total = payments.count(status);
            }
        }
        return PageResponse.of(transactions(rows), page, size, total);
    }

    /** {@code GET /admin/payments?status=}. */
    @Transactional(readOnly = true)
    public PageResponse<Transaction> payments(@Nullable PaymentStatus status, int page, int size) {
        return transactions(TransactionQueue.ALL, status, page, size);
    }

    /** {@code GET /admin/payments/{id}}. */
    @Transactional(readOnly = true)
    public PaymentDetail payment(AuthenticatedUser viewer, UUID paymentId) {
        PaymentRow payment =
                payments.find(paymentId)
                        .orElseThrow(() -> ApiException.notFound("Payment not found"));
        return detail(viewer, payment);
    }

    /**
     * {@code POST /admin/payments/{id}/refund}: SUPER_ADMIN, or ADMIN while {@code
     * payments.admin_refunds_enabled} (403 otherwise). The payment must be secured (not REFUNDED)
     * and without an open dispute (409; resolve the dispute instead); the amount at most what is
     * still refundable (400). A full refund of a trade that is not complete yet cancels it.
     * Audited.
     */
    @Transactional
    public PaymentDetail refund(
            AuthenticatedUser admin, UUID paymentId, BigDecimal amount, String rawReason) {
        if (!refundAllowed(admin)) {
            throw ApiException.forbidden(
                    "Refunds need a SUPER_ADMIN (or an ADMIN when the refund policy allows it)");
        }
        String reason = ProtectedPaymentService.text(rawReason) == null ? "" : rawReason.trim();
        if (reason.isEmpty() || reason.length() > 500) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("reason", "must be 1 to 500 characters")));
        }
        PaymentRow found =
                payments.find(paymentId)
                        .orElseThrow(() -> ApiException.notFound("Payment not found"));
        TradeRow trade =
                trades.lockForPayment(found.tradeId())
                        .orElseThrow(() -> ApiException.notFound("Payment not found"));
        PaymentRow payment = paymentFlow.requireLocked(paymentId);
        if (!payment.status().secured() || payment.status() == PaymentStatus.REFUNDED) {
            throw ApiException.conflict("This payment cannot be refunded in its current state")
                    .withProperty("currentStatus", payment.status().name());
        }
        if (disputes.byTrade(trade.id()).filter(row -> row.status().isOpen()).isPresent()) {
            throw ApiException.conflict(
                    "This payment has an open dispute; resolve the dispute instead");
        }
        if (!PaymentRules.validAmount(amount) || amount.compareTo(payment.refundable()) > 0) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "amount",
                                    "must be more than 0 and at most "
                                            + payment.refundable().toPlainString())));
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        long previousRefunds = payments.refunds(paymentId).size();
        PaymentRow refunded =
                paymentFlow.refund(
                        payment,
                        amount.setScale(2),
                        reason,
                        "ADMIN",
                        admin.userId(),
                        now,
                        "refund:admin:" + paymentId + ":" + (previousRefunds + 1));
        if (refunded.status() == PaymentStatus.REFUNDED
                && trade.status().isOpen()
                && trade.status() != TradeStatus.AWAITING_PAYMENT) {
            trades.cancelProtected(
                    trade.id(), null, "The payment was refunded by OrenjiTrade", now);
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("amount", amount.setScale(2));
        details.put("currency", payment.currency());
        details.put("tradeId", trade.id().toString());
        details.put("fullRefund", refunded.status() == PaymentStatus.REFUNDED);
        audit.record(
                ActorType.ADMIN,
                admin.userId(),
                ACTION_REFUND,
                TARGET_PAYMENT,
                paymentId.toString(),
                details);
        log.info("Admin {} refunded {} of payment {}", admin.userId(), amount, paymentId);
        return detail(admin, paymentFlow.requirePayment(paymentId));
    }

    /** {@code GET /admin/payments/webhooks?status=&provider=}: newest first (without payloads). */
    @Transactional(readOnly = true)
    public PageResponse<WebhookEventRow> webhooks(
            @Nullable WebhookStatus status, @Nullable String provider, int page, int size) {
        return PageResponse.of(
                webhooks.page(status, provider, page, size),
                page,
                size,
                webhooks.count(status, provider));
    }

    /** {@code GET /admin/payments/webhooks/{id}}: one event with its payload. */
    @Transactional(readOnly = true)
    public WebhookEventRow webhook(UUID id) {
        return webhooks.find(id)
                .orElseThrow(() -> ApiException.notFound("Webhook event not found"));
    }

    /** Whether {@code admin} may issue refunds (SUPER_ADMIN, or ADMIN under the policy). */
    public boolean refundAllowed(AuthenticatedUser admin) {
        return admin.hasRole(Role.SUPER_ADMIN)
                || (admin.hasRole(Role.ADMIN) && settings.current().adminRefundsEnabled());
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private PaymentDetail detail(AuthenticatedUser viewer, PaymentRow payment) {
        Transaction transaction = transactions(List.of(payment)).get(0);
        boolean openDispute =
                transaction.dispute() != null && transaction.dispute().status().isOpen();
        return new PaymentDetail(
                transaction,
                payments.events(payment.id()),
                payments.refunds(payment.id()),
                webhooks.ofPayment(payment.id()),
                refundAllowed(viewer)
                        && payment.status().secured()
                        && payment.status() != PaymentStatus.REFUNDED
                        && !openDispute);
    }

    private List<Transaction> transactions(List<PaymentRow> rows) {
        Set<UUID> tradeIds = new LinkedHashSet<>();
        Set<UUID> people = new LinkedHashSet<>();
        for (PaymentRow row : rows) {
            tradeIds.add(row.tradeId());
            people.add(row.buyerId());
            people.add(row.sellerId());
        }
        Map<UUID, TradeRow> tradeRows = trades.rows(tradeIds);
        Map<UUID, ShipmentRow> shipped = shipments.byTrades(tradeIds);
        Map<UUID, DisputeRow> disputed = disputes.byTrades(tradeIds);
        Map<UUID, MemberCard> cards = members.cards(people);
        List<Transaction> result = new ArrayList<>();
        for (PaymentRow row : rows) {
            @Nullable TradeRow trade = tradeRows.get(row.tradeId());
            result.add(
                    new Transaction(
                            row,
                            trade == null ? null : trade.status(),
                            trade == null ? "a trade" : trades.summaryText(trade),
                            cards.get(row.buyerId()),
                            cards.get(row.sellerId()),
                            shipped.get(row.tradeId()),
                            disputed.get(row.tradeId())));
        }
        return result;
    }
}
