package com.orenjitrade.api.donations.infra;

import com.orenjitrade.api.donations.domain.DonationRows.DonationRow;
import com.orenjitrade.api.donations.domain.DonationService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The donations module's account-data extensions: the export section {@code donations} (amount,
 * currency, status, the donor's own note and public-thanks choice, dates; never provider
 * references) and the deletion participant (notes and public thanks are erased; the rows stay for
 * financial records).
 */
@Configuration(proxyBeanMethods = false)
public class DonationsExtensions {

    @Bean
    @Order(492)
    ExportContributor donationsExportContributor(DonationService donations) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "donations";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                List<DonationRow> rows = donations.history(userId);
                if (rows.isEmpty()) {
                    return null;
                }
                return rows.stream().map(DonationsExtensions::exported).toList();
            }
        };
    }

    @Bean
    @Order(492)
    DeletionParticipant donationsDeletionParticipant(DonationService donations) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "donations";
            }

            @Override
            public void purge(UUID userId) {
                donations.purge(userId);
            }
        };
    }

    static Map<String, Object> exported(DonationRow row) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", row.id().toString());
        result.put("amount", row.amount().toPlainString());
        result.put("currency", row.currency());
        result.put("status", row.status().name());
        result.put("publicThanks", row.publicThanks());
        if (row.message() != null) {
            result.put("message", row.message());
        }
        result.put("createdAt", row.createdAt().toString());
        if (row.succeededAt() != null) {
            result.put("succeededAt", row.succeededAt().toString());
        }
        return result;
    }
}
