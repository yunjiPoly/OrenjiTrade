package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.notifications.domain.NotificationPreferencesService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/** Deletion participant and export section of the notifications module. */
@Configuration(proxyBeanMethods = false)
public class NotificationExtensions {

    @Bean
    @Order(400)
    DeletionParticipant notificationPreferencesDeletionParticipant(
            NotificationPreferencesService service) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "notification-preferences";
            }

            @Override
            public void purge(UUID userId) {
                service.purge(userId);
            }
        };
    }

    @Bean
    @Order(400)
    ExportContributor notificationPreferencesExportContributor(
            NotificationPreferencesService service) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "notificationPreferences";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return service.settingsOf(userId);
            }
        };
    }
}
