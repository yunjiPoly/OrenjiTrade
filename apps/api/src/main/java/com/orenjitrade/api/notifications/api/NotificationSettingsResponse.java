package com.orenjitrade.api.notifications.api;

import com.orenjitrade.api.notifications.domain.ChannelPreferences;
import com.orenjitrade.api.notifications.domain.NotificationCategory;
import com.orenjitrade.api.notifications.domain.NotificationSettings;
import com.orenjitrade.api.notifications.domain.QuietHours;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.Map;

/** Response of {@code GET|PUT /api/v1/me/settings/notifications}; every category is present. */
@Schema(name = "NotificationSettingsResponse", description = "Notification preferences")
public record NotificationSettingsResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean pushEnabled,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean emailEnabled,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean inAppEnabled,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Every category, in order")
                Map<NotificationCategory, ChannelPreferences> categories,
        @Schema(requiredMode = RequiredMode.REQUIRED) QuietHours quietHours) {

    static NotificationSettingsResponse from(NotificationSettings settings) {
        return new NotificationSettingsResponse(
                settings.pushEnabled(),
                settings.emailEnabled(),
                settings.inAppEnabled(),
                settings.categories(),
                settings.quietHours());
    }
}
