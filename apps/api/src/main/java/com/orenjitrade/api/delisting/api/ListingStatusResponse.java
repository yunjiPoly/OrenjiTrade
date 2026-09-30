package com.orenjitrade.api.delisting.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.delisting.domain.ListingStatus;
import com.orenjitrade.api.delisting.domain.PauseSource;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * A collector's listing health: whether their public listings are paused, why, and their
 * unresponsiveness strikes. The owner's view never carries the moderator's reason ({@code reason}
 * is null there).
 */
@Schema(name = "ListingStatus", description = "Pause of the public listings and strikes")
public record ListingStatusResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean paused,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable PauseSource source,
        @Schema(nullable = true, description = "Moderator or admin reason (admin views only)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String reason,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant pausedAt,
        @Schema(
                        nullable = true,
                        description = "End of a timed pause; null while paused = until resumed")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant pausedUntil,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Whether the owner can resume by confirming (UNRESPONSIVE)")
                boolean canResume,
        @Schema(requiredMode = RequiredMode.REQUIRED) int strikes,
        @Schema(requiredMode = RequiredMode.REQUIRED) int maxStrikes,
        @Schema(requiredMode = RequiredMode.REQUIRED) int unansweredConversations30d,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant evaluatedAt) {

    /** The owner's view (no moderator reason). */
    public static ListingStatusResponse forOwner(ListingStatus status) {
        return from(status, false);
    }

    /** The admin view. */
    public static ListingStatusResponse forAdmin(ListingStatus status) {
        return from(status, true);
    }

    private static ListingStatusResponse from(ListingStatus status, boolean withReason) {
        return new ListingStatusResponse(
                status.paused(),
                status.source(),
                withReason ? status.reason() : null,
                status.pausedAt(),
                status.pausedUntil(),
                status.canResume(),
                status.strikes(),
                status.maxStrikes(),
                status.unansweredConversations30d(),
                status.evaluatedAt());
    }
}
