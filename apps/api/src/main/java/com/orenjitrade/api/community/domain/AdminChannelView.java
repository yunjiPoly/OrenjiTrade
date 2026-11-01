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
 * @param slug URL slug; "archived-channel" for a channel named after a city
 * @param name display name; "Archived channel" for a channel named after a city
 * @param kind kind
 * @param game game slug
 * @param regionLabel platform region code of region channels (ADR 0017); never an old city label
 * @param description description; empty for a channel named after a city
 * @param status ACTIVE or ARCHIVED
 * @param postRateLimitPerHour posts per member per hour
 * @param sortOrder position in lists
 * @param postCount24h visible posts of the last 24 hours
 * @param updatedAt last change
 * @param cityChannel a channel of the old model named after a city (V041's "Montréal / …"):
 *     archived for good; its region label is never sent, nor its slug, name or description (each
 *     carries the city), and the console names it by its game only (ADR 0017, spec 15.2; web stage
 *     WH1 review fixes 1 and 2)
 */
@Schema(name = "AdminCommunityChannel", description = "Community channel (moderator console)")
public record AdminChannelView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "URL slug; \"archived-channel\" for a channel named after a city"
                                        + " (cityChannel): its own slug names the city")
                String slug,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "Display name; \"Archived channel\" for a channel named after a"
                                        + " city (cityChannel): its own name names the city")
                String name,
        @Schema(requiredMode = RequiredMode.REQUIRED) ChannelKind kind,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String game,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String regionLabel,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "Description; empty for a channel named after a city"
                                        + " (cityChannel)")
                String description,
        @Schema(requiredMode = RequiredMode.REQUIRED) ChannelStatus status,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "10") int postRateLimitPerHour,
        @Schema(requiredMode = RequiredMode.REQUIRED) int sortOrder,
        @Schema(requiredMode = RequiredMode.REQUIRED) int postCount24h,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "A channel of the old model named after a city: it stays archived,"
                                        + " its slug, name and description are not sent and the"
                                        + " console names it by its game only")
                boolean cityChannel) {}
