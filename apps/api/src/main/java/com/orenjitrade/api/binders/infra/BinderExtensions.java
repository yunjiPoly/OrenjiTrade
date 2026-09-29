package com.orenjitrade.api.binders.infra;

import com.orenjitrade.api.billing.domain.LimitUsageSource;
import com.orenjitrade.api.binders.domain.BinderDetails;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.profiles.domain.PublicBinderCountProvider;
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
 * The binders module's implementations of other modules' extension points: the {@code binders.max}
 * usage ({@link LimitUsageSource}, read straight from the repository so the limits service does not
 * depend on the binder service that uses it), the public binder count of collector profiles, the
 * owner's export section {@code binders} and the deletion participant (binders are purged after the
 * inventory module purged the items).
 */
@Configuration(proxyBeanMethods = false)
public class BinderExtensions {

    @Bean
    LimitUsageSource bindersMaxUsageSource(BinderRepository repository) {
        return new LimitUsageSource() {
            @Override
            public boolean supports(String limitKey) {
                return BinderService.BINDERS_MAX.equals(limitKey);
            }

            @Override
            public long currentUsage(UUID userId, String limitKey) {
                return repository.countByOwner(userId);
            }
        };
    }

    @Bean
    PublicBinderCountProvider publicBinderCountProvider(PublicBinderService publicBinderService) {
        return publicBinderService::publicBinderCount;
    }

    @Bean
    @Order(410)
    DeletionParticipant binderDeletionParticipant(BinderService binderService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "binders";
            }

            @Override
            public void purge(UUID userId) {
                binderService.purge(userId);
            }
        };
    }

    @Bean
    @Order(410)
    ExportContributor binderExportContributor(BinderService binderService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "binders";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                List<BinderDetails> binders = binderService.listMine(userId);
                return binders.stream()
                        .map(
                                details -> {
                                    BinderView binder = details.binder();
                                    Map<String, @Nullable Object> row = new LinkedHashMap<>();
                                    row.put("id", binder.id());
                                    row.put("name", binder.name());
                                    row.put("description", binder.description());
                                    row.put("kind", binder.kind().name());
                                    row.put("visibility", binder.visibility().name());
                                    row.put("publicUntil", binder.publicUntil());
                                    row.put("sortOrder", binder.sortOrder());
                                    row.put("itemCount", binder.itemCount());
                                    row.put("freshness", binder.freshnessState().name());
                                    row.put("confirmedAt", binder.confirmedAt());
                                    row.put("createdAt", binder.createdAt());
                                    row.put("updatedAt", binder.updatedAt());
                                    return row;
                                })
                        .toList();
            }
        };
    }
}
