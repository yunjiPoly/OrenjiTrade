package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.events.DisputeUpdated;
import com.orenjitrade.api.payments.events.PaymentUpdated;
import com.orenjitrade.api.payments.infra.PaymentRepository;
import com.orenjitrade.api.trades.domain.TradeEventType;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeService;
import com.orenjitrade.api.trades.events.TradeUpdated;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What payment protection changes cause after commit (Phase 9): PAYMENT_UPDATE notifications (the
 * seller is told to ship once the payment is secured, the buyer about failures, reminders and
 * refunds, the seller about payouts and missing payout accounts), SHIPMENT_STATUS to the buyer when
 * the card ships, DISPUTE_UPDATE to the parties for dispute changes; unpaid checkouts of cancelled
 * trades and agreed meetups are cancelled. Texts carry card names, amounts and dates only.
 * Idempotent through the de-duplication keys ({@code payment:<id>:<event>:<recipient>}, {@code
 * dispute:<id>:<event>[:<subject>]:<recipient>}).
 */
@Service
public class PaymentActivity {

    static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("MMMM d, yyyy HH:mm 'UTC'", Locale.ENGLISH)
                    .withZone(ZoneOffset.UTC);

    private final PaymentRepository payments;
    private final ProtectedPaymentService paymentFlow;
    private final SellerAccountService sellers;
    private final TradeService trades;
    private final NotificationService notifications;

    public PaymentActivity(
            PaymentRepository payments,
            ProtectedPaymentService paymentFlow,
            SellerAccountService sellers,
            TradeService trades,
            NotificationService notifications) {
        this.payments = payments;
        this.paymentFlow = paymentFlow;
        this.sellers = sellers;
        this.trades = trades;
        this.notifications = notifications;
    }

    /** A payment changed. */
    @Transactional
    public void paymentUpdated(PaymentUpdated event) {
        if (event.paymentId() == null) {
            return;
        }
        Optional<PaymentRow> found = payments.find(event.paymentId());
        Optional<TradeRow> trade = trades.row(event.tradeId());
        if (found.isEmpty() || trade.isEmpty()) {
            return;
        }
        PaymentRow payment = found.get();
        String card = trades.cardName(trade.get());
        String link = "/trades/" + event.tradeId();
        switch (event.event()) {
            case "SECURED" -> {
                notify(
                        event.sellerId(),
                        NotificationType.PAYMENT_UPDATE,
                        "Payment secured: ship " + card,
                        "The buyer paid "
                                + money(payment.amount(), payment.currency())
                                + " through payment protection. Ship the card and confirm the"
                                + " shipment on the trade page.",
                        event,
                        link);
                notify(
                        event.buyerId(),
                        NotificationType.PAYMENT_UPDATE,
                        "Payment secured for " + card,
                        "Your payment is protected until you confirm receipt or the dispute"
                                + " window ends.",
                        event,
                        link);
            }
            case "FAILED" ->
                    notify(
                            event.buyerId(),
                            NotificationType.PAYMENT_UPDATE,
                            "Payment failed for " + card,
                            "The payment did not go through. You can try again from the trade"
                                    + " page.",
                            event,
                            link);
            case "SHIPPED" ->
                    notify(
                            event.buyerId(),
                            NotificationType.SHIPMENT_STATUS,
                            card + " is on its way",
                            "The seller shipped the card. Confirm receipt when it arrives, or"
                                    + " open a dispute before "
                                    + date(payment)
                                    + ".",
                            event,
                            link);
            case "RELEASE_REMINDER" ->
                    notify(
                            event.buyerId(),
                            NotificationType.PAYMENT_UPDATE,
                            "Confirm receipt of " + card,
                            "The payment is released to the seller automatically on "
                                    + date(payment)
                                    + " unless you open a dispute before then.",
                            event,
                            link);
            case "PAYOUT_RELEASED" ->
                    notify(
                            event.sellerId(),
                            NotificationType.PAYMENT_UPDATE,
                            "Payout released for " + card,
                            money(
                                            payment.payoutAmount() == null
                                                    ? payment.sellerAmount()
                                                    : payment.payoutAmount(),
                                            payment.currency())
                                    + " is on its way to your payout account.",
                            event,
                            link);
            case "REFUNDED" ->
                    notify(
                            event.buyerId(),
                            NotificationType.PAYMENT_UPDATE,
                            "Refund issued for " + card,
                            money(payment.refundedAmount(), payment.currency())
                                    + " has been refunded to your payment method.",
                            event,
                            link);
            default -> {
                // nothing to tell
            }
        }
    }

    /** A dispute changed. */
    @Transactional
    public void disputeUpdated(DisputeUpdated event) {
        Optional<TradeRow> trade = trades.row(event.tradeId());
        if (trade.isEmpty()) {
            return;
        }
        String card = trades.cardName(trade.get());
        String link = "/disputes/" + event.disputeId();
        List<UUID> recipients = new ArrayList<>();
        String title;
        String body;
        switch (event.event()) {
            case "OPENED" -> {
                recipients.add(event.sellerId());
                title = "A dispute was opened for " + card;
                body =
                        "The buyer opened a dispute. The payout is on hold while OrenjiTrade"
                                + " reviews it; add your evidence on the dispute page.";
            }
            case "EVIDENCE_ADDED", "MESSAGE_POSTED" -> {
                addOthers(recipients, event);
                title =
                        event.event().equals("EVIDENCE_ADDED")
                                ? "New evidence in the dispute for " + card
                                : "New message in the dispute for " + card;
                body = "Open the dispute page to read it.";
            }
            case "FROZEN" -> {
                recipients.add(event.buyerId());
                recipients.add(event.sellerId());
                title = "The dispute for " + card + " is on hold";
                body = "An OrenjiTrade admin is reviewing the case; new evidence is paused.";
            }
            case "UNFROZEN" -> {
                recipients.add(event.buyerId());
                recipients.add(event.sellerId());
                title = "The dispute for " + card + " is under review";
                body = "You can add evidence and messages again.";
            }
            case "RESOLVED" -> {
                recipients.add(event.buyerId());
                recipients.add(event.sellerId());
                title = "The dispute for " + card + " was resolved";
                body = resolution(event.status());
            }
            default -> {
                return;
            }
        }
        for (UUID recipient : recipients) {
            Map<String, @Nullable Object> data = new LinkedHashMap<>();
            data.put("disputeId", event.disputeId().toString());
            data.put("tradeId", event.tradeId().toString());
            data.put("event", event.event());
            data.put("status", event.status());
            data.put("deepLink", link);
            String subject = event.subjectId() == null ? "" : ":" + event.subjectId();
            notifications.notify(
                    new NotificationRequest(
                            recipient,
                            NotificationType.DISPUTE_UPDATE,
                            title,
                            body,
                            data,
                            "dispute:"
                                    + event.disputeId()
                                    + ":"
                                    + event.event()
                                    + subject
                                    + ":"
                                    + recipient));
        }
    }

    /**
     * A trade changed: a protected trade asks the seller to set up payouts when needed; unpaid
     * checkouts of cancelled trades and agreed meetups are cancelled.
     */
    @Transactional
    public void tradeUpdated(TradeUpdated event) {
        TradeEventType type;
        try {
            type = TradeEventType.valueOf(event.event());
        } catch (IllegalArgumentException e) {
            return;
        }
        switch (type) {
            case CREATED -> {
                if (event.protectionEnabled() && !sellers.ready(event.sellerId())) {
                    Optional<TradeRow> trade = trades.row(event.tradeId());
                    String card = trade.map(trades::cardName).orElse("your card");
                    Map<String, @Nullable Object> data = new LinkedHashMap<>();
                    data.put("tradeId", event.tradeId().toString());
                    data.put("event", "SELLER_ONBOARDING_NEEDED");
                    data.put("deepLink", SellerAccountService.DEFAULT_RETURN_URL);
                    notifications.notify(
                            new NotificationRequest(
                                    event.sellerId(),
                                    NotificationType.PAYMENT_UPDATE,
                                    "Set up payouts to sell " + card,
                                    "The buyer chose payment protection. Set up your payout"
                                            + " account so they can pay.",
                                    data,
                                    "trade:"
                                            + event.tradeId()
                                            + ":SELLER_ONBOARDING_NEEDED:"
                                            + event.sellerId()));
                }
            }
            case CANCELLED -> paymentFlow.cancelUnpaid(event.tradeId(), "TRADE_CANCELLED");
            case MEETUP_AGREED -> paymentFlow.cancelUnpaid(event.tradeId(), "MEETUP_AGREED");
            default -> {
                // nothing to do
            }
        }
    }

    private void notify(
            UUID recipient,
            NotificationType type,
            String title,
            String body,
            PaymentUpdated event,
            String link) {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("tradeId", event.tradeId().toString());
        data.put("paymentId", String.valueOf(event.paymentId()));
        data.put("event", event.event());
        data.put("status", event.status());
        data.put("deepLink", link);
        notifications.notify(
                new NotificationRequest(
                        recipient,
                        type,
                        title,
                        body,
                        data,
                        "payment:"
                                + event.paymentId()
                                + ":"
                                + event.event()
                                + ":"
                                + event.occurredAt().toEpochMilli()
                                + ":"
                                + recipient));
    }

    private static void addOthers(List<UUID> recipients, DisputeUpdated event) {
        if ("ADMIN".equals(event.actorRole())) {
            recipients.add(event.buyerId());
            recipients.add(event.sellerId());
        } else if (event.buyerId().equals(event.actorId())) {
            recipients.add(event.sellerId());
        } else {
            recipients.add(event.buyerId());
        }
    }

    static String resolution(String status) {
        return switch (status) {
            case "RESOLVED_BUYER" ->
                    "The payment is refunded to the buyer and the trade is cancelled.";
            case "RESOLVED_SELLER" ->
                    "The payout is released to the seller and the trade is complete.";
            case "RESOLVED_SPLIT" ->
                    "Part of the payment is refunded to the buyer and the rest paid out to the"
                            + " seller.";
            default -> "Open the dispute page for the decision.";
        };
    }

    private static String money(java.math.BigDecimal amount, String currency) {
        return amount.toPlainString() + " " + currency;
    }

    private static String date(PaymentRow payment) {
        return payment.disputeWindowEndsAt() == null
                ? "the end of the dispute window"
                : DATE.format(payment.disputeWindowEndsAt());
    }
}
