package com.orenjitrade.api.profiles.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.PublicPoint;
import com.orenjitrade.api.profiles.domain.CollectorProfileView;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Response of {@code GET /api/v1/collectors/{handle}}: the public view of a collector for the
 * caller. Never contains a precise coordinate: {@code location} is null unless the collector is
 * discoverable and then only carries the derived public point (3 decimals), its label and a
 * distance bucket.
 */
@Schema(name = "CollectorProfileResponse", description = "Public collector profile")
public record CollectorProfileResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maïka Tremblay")
                String displayName,
        @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String avatarUrl,
        @Schema(requiredMode = RequiredMode.REQUIRED) String bio,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "[\"yugioh\"]") List<String> games,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<CollectorTag> tags,
        @Schema(nullable = true, description = "Null unless the collector is discoverable")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable CollectorLocation location,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date", example = "2026-09-01")
                LocalDate memberSince,
        @Schema(requiredMode = RequiredMode.REQUIRED) LastActiveBucket lastActiveBucket,
        @Schema(requiredMode = RequiredMode.REQUIRED) OnlineStatus onlineStatus,
        @Schema(requiredMode = RequiredMode.REQUIRED) CollectorRating rating,
        @Schema(requiredMode = RequiredMode.REQUIRED) int publicBinderCount,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Whether the caller may start a conversation")
                boolean canMessage,
        @Schema(requiredMode = RequiredMode.REQUIRED) @JsonProperty("isBlocked")
                boolean isBlocked) {

    static CollectorProfileResponse from(CollectorProfileView view) {
        CollectorProfileView.Location location = view.location();
        return new CollectorProfileResponse(
                view.id(),
                view.handle(),
                view.displayName(),
                view.avatarUrl(),
                view.bio(),
                view.games(),
                view.tags().stream().map(tag -> new CollectorTag(tag.slug(), tag.label())).toList(),
                location == null
                        ? null
                        : new CollectorLocation(
                                location.publicLabel(),
                                location.publicPoint(),
                                location.distanceBucket()),
                view.memberSince(),
                view.lastActiveBucket(),
                view.onlineStatus(),
                new CollectorRating(view.rating().average(), view.rating().count()),
                view.publicBinderCount(),
                view.canMessage(),
                view.isBlocked());
    }

    /** A tag as shown on a public profile. */
    @Schema(name = "CollectorTag")
    public record CollectorTag(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "trader") String slug,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Trader") String label) {}

    /** Approximate location of a discoverable collector. */
    @Schema(name = "CollectorLocation", description = "Approximate location (never precise)")
    public record CollectorLocation(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Plateau-Mont-Royal, Montréal")
                    String publicLabel,
            @Schema(requiredMode = RequiredMode.REQUIRED) PublicPoint publicPoint,
            @Schema(
                            nullable = true,
                            description =
                                    "Null unless the caller has a trading area and the collector"
                                            + " shows distances")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable DistanceBucket distanceBucket) {}

    /** Rating summary. */
    @Schema(name = "CollectorRating")
    public record CollectorRating(
            @Schema(nullable = true, description = "Null until the first rating")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Double average,
            @Schema(requiredMode = RequiredMode.REQUIRED) int count) {}
}
