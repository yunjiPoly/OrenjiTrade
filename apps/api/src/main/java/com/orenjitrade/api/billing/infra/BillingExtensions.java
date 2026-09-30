package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionRow;
import com.orenjitrade.api.billing.domain.SubscriptionService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The billing module's account-data extensions: the export section {@code subscriptions} (plan,
 * status, provider, price and dates of every subscription; never provider references) and the
 * deletion participant (a deletion request stops renewals; the purge ends the live subscription at
 * once; the framework anonymises the account to FREE without roles).
 */
@Configuration(proxyBeanMethods = false)
public class BillingExtensions {

    private static final Logger log = LoggerFactory.getLogger(BillingExtensions.class);

    @Bean
    @Order(490)
    ExportContributor subscriptionsExportContributor(SubscriptionService subscriptions) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "subscriptions";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                List<SubscriptionRow> rows = subscriptions.history(userId);
                if (rows.isEmpty()) {
                    return null;
                }
                return rows.stream().map(BillingExtensions::exported).toList();
            }
        };
    }

    @Bean
    @Order(490)
    DeletionParticipant subscriptionsDeletionParticipant(SubscriptionService subscriptions) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "subscriptions";
            }

            @Override
            public void onDeletionRequested(UUID userId) {
                try {
                    subscriptions.stopRenewals(userId);
                } catch (RuntimeException e) {
                    // The purge ends the subscription anyway; never block a deletion request.
                    log.warn(
                            "Renewals of {} could not be stopped: {}",
                            userId,
                            e.getClass().getSimpleName());
                }
            }

            @Override
            public void purge(UUID userId) {
                subscriptions.endForPurge(userId);
            }
        };
    }

    static Map<String, Object> exported(SubscriptionRow row) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", row.id().toString());
        result.put("plan", row.planCode());
        result.put("status", row.status().name());
        result.put("provider", row.provider());
        result.put("amount", row.amount().toPlainString());
        result.put("currency", row.currency());
        result.put("createdAt", row.createdAt().toString());
        if (row.activatedAt() != null) {
            result.put("activatedAt", row.activatedAt().toString());
        }
        if (row.currentPeriodEnd() != null) {
            result.put("currentPeriodEnd", row.currentPeriodEnd().toString());
        }
        result.put("cancelAtPeriodEnd", row.cancelAtPeriodEnd());
        if (row.endedAt() != null) {
            result.put("endedAt", row.endedAt().toString());
        }
        return result;
    }
}
