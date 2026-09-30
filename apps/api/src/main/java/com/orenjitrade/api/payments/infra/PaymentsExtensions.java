package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.DisputeService;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.SellerAccountRow;
import com.orenjitrade.api.payments.domain.PaymentRows.ShipmentRow;
import com.orenjitrade.api.payments.domain.PaymentRules;
import com.orenjitrade.api.trades.domain.TradeProtection;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The payments module's implementations of other modules' extension points: the trades module's
 * {@link TradeProtection} (payment, shipment and dispute on the trade page; built from the
 * repositories only, so the trades module never depends on payments) and the export section {@code
 * payments} (seller account, payments as buyer or seller, disputes opened).
 */
@Configuration(proxyBeanMethods = false)
public class PaymentsExtensions {

    @Bean
    TradeProtection tradeProtection(
            PaymentRepository payments, ShipmentRepository shipments, DisputeRepository disputes) {
        return (tradeIds, now) -> states(payments, shipments, disputes, tradeIds, now);
    }

    static Map<UUID, TradeProtection.State> states(
            PaymentRepository payments,
            ShipmentRepository shipments,
            DisputeRepository disputes,
            java.util.Collection<UUID> tradeIds,
            Instant now) {
        Map<UUID, TradeProtection.State> result = new LinkedHashMap<>();
        if (tradeIds.isEmpty()) {
            return result;
        }
        Set<UUID> ids = new LinkedHashSet<>(tradeIds);
        Map<UUID, PaymentRow> paid = payments.byTrades(ids);
        if (paid.isEmpty()) {
            return result;
        }
        Map<UUID, ShipmentRow> shipped = shipments.byTrades(paid.keySet());
        Map<UUID, DisputeRow> disputed = disputes.byTrades(paid.keySet());
        for (Map.Entry<UUID, PaymentRow> entry : paid.entrySet()) {
            PaymentRow payment = entry.getValue();
            @Nullable ShipmentRow shipment = shipped.get(entry.getKey());
            @Nullable DisputeRow dispute = disputed.get(entry.getKey());
            result.put(
                    entry.getKey(),
                    new TradeProtection.State(
                            new TradeProtection.Payment(
                                    payment.id(),
                                    payment.provider(),
                                    payment.status().name(),
                                    payment.amount(),
                                    payment.currency(),
                                    payment.platformFee(),
                                    payment.sellerAmount(),
                                    payment.refundedAmount(),
                                    payment.payoutAmount(),
                                    payment.payoutFrozen(),
                                    payment.checkoutUrl(),
                                    payment.securedAt(),
                                    payment.disputeWindowEndsAt(),
                                    payment.payoutReleasedAt(),
                                    payment.refundedAt()),
                            shipment == null
                                    ? null
                                    : new TradeProtection.Shipment(
                                            shipment.carrier(),
                                            shipment.trackingNumber(),
                                            shipment.notes(),
                                            shipment.shippedAt(),
                                            shipment.deliveredAt()),
                            dispute == null
                                    ? null
                                    : new TradeProtection.Dispute(
                                            dispute.id(),
                                            dispute.status().name(),
                                            dispute.reason().name(),
                                            dispute.openedAt(),
                                            dispute.resolvedAt(),
                                            dispute.refundAmount()),
                            PaymentRules.disputeOpenable(
                                    payment.status(),
                                    dispute != null,
                                    payment.disputeWindowEndsAt(),
                                    now)));
        }
        return result;
    }

    @Bean
    @Order(480)
    ExportContributor paymentsExportContributor(
            PaymentRepository payments,
            SellerAccountRepository sellers,
            DisputeService disputeService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "payments";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                Map<String, @Nullable Object> section = new LinkedHashMap<>();
                Optional<SellerAccountRow> account = sellers.find(userId);
                section.put(
                        "sellerAccount",
                        account.map(
                                        row -> {
                                            Map<String, Object> value = new LinkedHashMap<>();
                                            value.put("provider", row.provider());
                                            value.put("status", row.status().name());
                                            value.put("payoutsEnabled", row.payoutsEnabled());
                                            value.put("updatedAt", row.updatedAt());
                                            return (Object) value;
                                        })
                                .orElse(null));
                List<Map<String, @Nullable Object>> list = new ArrayList<>();
                for (PaymentRow row : payments.ofUser(userId, 1000)) {
                    Map<String, @Nullable Object> entry = new LinkedHashMap<>();
                    entry.put("id", row.id());
                    entry.put("tradeId", row.tradeId());
                    entry.put("role", row.buyerId().equals(userId) ? "BUYER" : "SELLER");
                    entry.put("status", row.status().name());
                    entry.put("amount", row.amount());
                    entry.put("currency", row.currency());
                    entry.put("platformFee", row.platformFee());
                    entry.put("refundedAmount", row.refundedAmount());
                    entry.put("payoutAmount", row.payoutAmount());
                    entry.put("createdAt", row.createdAt());
                    entry.put("securedAt", row.securedAt());
                    entry.put("payoutReleasedAt", row.payoutReleasedAt());
                    list.add(entry);
                }
                section.put("payments", list);
                section.put("disputesOpened", disputeService.export(userId));
                return section;
            }
        };
    }
}
