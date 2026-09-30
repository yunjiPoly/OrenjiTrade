package com.orenjitrade.api.community.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A community channel as the moderator console sees it (archived ones included).
 *
 * @param id channel id
 * @param slug URL slug
 * @param name display name
 * @param kind kind
 * @param game game slug
 * @param regionLabel city of region channels
 * @param description description
 * @param status ACTIVE or ARCHIVED
 * @param postRateLimitPerHour posts per member per hour
 * @param sortOrder position in lists
 * @param postCount24h visible posts of the last 24 hours
 * @param updatedAt last change
 */
@Schema(name = "AdminCommunityChannel", description = "Community channel (moderator console)")
public record AdminChannelView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) String slug,
        @Schema(requiredMode = RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = RequiredMode.REQUIRED) ChannelKind kind,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String game,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String regionLabel,
        @Schema(requiredMode = RequiredMode.REQUIRED) String description,
        @Schema(requiredMode = RequiredMode.REQUIRED) ChannelStatus status,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "10") int postRateLimitPerHour,
        @Schema(requiredMode = RequiredMode.REQUIRED) int sortOrder,
        @Schema(requiredMode = RequiredMode.REQUIRED) int postCount24h,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {}
