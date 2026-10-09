package com.orenjitrade.api.notifications.api;

import com.orenjitrade.api.notifications.domain.ChannelPreferences;
import com.orenjitrade.api.notifications.domain.NotificationCategory;
import com.orenjitrade.api.notifications.domain.NotificationSettings;
import com.orenjitrade.api.notifications.domain.QuietHours;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.EnumMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/** Body of {@code PUT /api/v1/me/settings/notifications} (full replacement). */
@Schema(name = "NotificationSettingsRequest")
public record NotificationSettingsRequest(
        @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean pushEnabled,
        @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean emailEnabled,
        @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean inAppEnabled,
        @Schema(
                        nullable = true,
                        description =
                                "Channels per category; categories left out get their defaults"
                                        + " (MARKETING is off unless explicitly enabled)")
                @Nullable Map<NotificationCategory, @Valid @NotNull ChannelPreferencesRequest>
                        categories,
        @Schema(nullable = true, description = "Defaults to disabled 22:00-08:00 America/Toronto")
                @Valid
                @Nullable QuietHoursRequest quietHours,
        @Schema(
                        nullable = true,
                        description =
                                "Wishlist alerts on or off (one switch; in-app and push follow the"
                                        + " master switches and quiet hours). Defaults to true"
                                        + " when absent")
                @Nullable Boolean wishlistAlerts) {

    static final String TIME_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";

    NotificationSettings toSettings() {
        Map<NotificationCategory, ChannelPreferences> channels =
                new EnumMap<>(NotificationCategory.class);
        if (categories != null) {
            categories.forEach(
                    (category, value) ->
                            channels.put(
                                    category,
                                    new ChannelPreferences(
                                            value.push(), value.email(), value.inApp())));
        }
        QuietHours quiet =
                quietHours == null
                        ? QuietHours.DEFAULT
                        : new QuietHours(
                                quietHours.enabled(),
                                quietHours.start(),
                                quietHours.end(),
                                quietHours.timezone().trim());
        return new NotificationSettings(
                pushEnabled,
                emailEnabled,
                inAppEnabled,
                channels,
                quiet,
                wishlistAlerts == null || wishlistAlerts);
    }

    /** Channels of one category. */
    @Schema(name = "ChannelPreferencesRequest")
    public record ChannelPreferencesRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean push,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean email,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean inApp) {}

    /** Quiet hours; {@code end} before {@code start} spans midnight. */
    @Schema(name = "QuietHoursRequest")
    public record QuietHoursRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean enabled,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "22:00")
                    @NotNull
                    @Pattern(regexp = TIME_PATTERN, message = "must be HH:mm")
                    String start,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "08:00")
                    @NotNull
                    @Pattern(regexp = TIME_PATTERN, message = "must be HH:mm")
                    String end,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "America/Toronto")
                    @NotBlank
                    @Size(max = 64)
                    String timezone) {}
}
