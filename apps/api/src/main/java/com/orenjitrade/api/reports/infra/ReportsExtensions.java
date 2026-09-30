package com.orenjitrade.api.reports.infra;

import com.orenjitrade.api.reports.domain.CollectorReportService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The reports module's implementations of the account extension points: the export section {@code
 * reports} (the reports the account filed, never reports about it) and the deletion participant
 * (the free text of decided reports is erased; the reports themselves stay as moderation records).
 */
@Configuration(proxyBeanMethods = false)
public class ReportsExtensions {

    @Bean
    @Order(470)
    DeletionParticipant reportsDeletionParticipant(CollectorReportService reports) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "reports";
            }

            @Override
            public void purge(UUID userId) {
                reports.purge(userId);
            }
        };
    }

    @Bean
    @Order(470)
    ExportContributor reportsExportContributor(CollectorReportService reports) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "reports";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return reports.export(userId);
            }
        };
    }
}
