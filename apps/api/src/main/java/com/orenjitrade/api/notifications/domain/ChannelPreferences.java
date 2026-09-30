package com.orenjitrade.api.notifications.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** Channels enabled for one notification category. */
@Schema(name = "ChannelPreferences", description = "Channels enabled for one category")
public record ChannelPreferences(
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean push,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean email,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean inApp) {}
