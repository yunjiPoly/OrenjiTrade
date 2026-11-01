package com.orenjitrade.api.deals.infra;

import com.orenjitrade.api.deals.domain.SaleService;
import com.orenjitrade.api.messaging.domain.ChatSaleStatus;
import com.orenjitrade.api.ratings.domain.SaleDeals;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The deals module's implementations of other modules' extension points: the messaging module's
 * {@link ChatSaleStatus} (the pinned bar's "Sold"), the ratings module's {@link SaleDeals} (the
 * rating form's deal line, stage R14), the export section {@code deals} and the deletion
 * participant (the account's sales go with it).
 */
@Configuration(proxyBeanMethods = false)
public class DealsExtensions {

    @Bean
    ChatSaleStatus dealsChatSaleStatus(SaleService saleService) {
        return new ChatSaleStatus() {
            @Override
            public Set<UUID> soldSubjects(Collection<Subject> subjects) {
                return saleService.soldSubjects(subjects);
            }
        };
    }

    @Bean
    SaleDeals dealsSaleDeals(SaleService saleService) {
        return saleService::deals;
    }

    @Bean
    @Order(390)
    DeletionParticipant dealsDeletionParticipant(SaleService saleService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "deals";
            }

            @Override
            public void purge(UUID userId) {
                saleService.purge(userId);
            }
        };
    }

    @Bean
    @Order(390)
    ExportContributor dealsExportContributor(SaleService saleService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "deals";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                List<Map<String, @Nullable Object>> sales = saleService.export(userId);
                return sales.isEmpty() ? null : Map.of("sales", sales);
            }
        };
    }
}
