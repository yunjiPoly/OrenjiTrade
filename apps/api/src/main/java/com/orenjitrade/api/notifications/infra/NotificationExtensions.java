package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.notifications.domain.NotificationPreferencesService;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.PushTokenService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * Deletion participants and export sections of the notifications module: preferences, notifications
 * and push tokens (platforms and dates only, never the token values).
 */
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

    @Bean
    @Order(401)
    DeletionParticipant notificationsDeletionParticipant(
            NotificationService notifications, PushTokenService pushTokens) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "notifications";
            }

            @Override
            public void purge(UUID userId) {
                notifications.purge(userId);
                pushTokens.purge(userId);
            }
        };
    }

    @Bean
    @Order(401)
    ExportContributor notificationsExportContributor(NotificationService notifications) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "notifications";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return notifications.export(userId);
            }
        };
    }

    @Bean
    @Order(402)
    ExportContributor pushTokensExportContributor(PushTokenService pushTokens) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "pushTokens";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return pushTokens.export(userId);
            }
        };
    }
}
