package com.orenjitrade.api.notifications.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/**
 * Period without push notifications, in the collector's time zone. {@code end} before {@code start}
 * spans midnight.
 */
@Schema(name = "QuietHours", description = "Period without push notifications")
public record QuietHours(
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean enabled,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "22:00",
                        pattern = "^\\d{2}:\\d{2}$")
                String start,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "08:00",
                        pattern = "^\\d{2}:\\d{2}$")
                String end,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "America/Toronto")
                String timezone) {

    public static final QuietHours DEFAULT =
            new QuietHours(false, "22:00", "08:00", "America/Toronto");
}
