package com.orenjitrade.api.binders.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.binders.domain.BinderDetails;
import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.delisting.domain.FreshnessInfo;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** One of the caller's binders (owner view). */
@Schema(name = "BinderResponse", description = "A binder of the caller")
public record BinderResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Trade binder") String name,
        @Schema(requiredMode = RequiredMode.REQUIRED) String description,
        @Schema(requiredMode = RequiredMode.REQUIRED) BinderKind kind,
        @Schema(requiredMode = RequiredMode.REQUIRED) ListingVisibility visibility,
        @Schema(nullable = true, description = "End of a TEMPORARILY_PUBLIC publication")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant publicUntil,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Position in the caller's list")
                int sortOrder,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Items in the binder")
                long itemCount,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Items of the binder that are public right now")
                long publicItemCount,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "Whether the binder is public right now (visibility, expiry,"
                                        + " freshness and the owner's privacy settings)")
                boolean effectivePublic,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "[\"yugioh\"]") List<String> games,
        @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String coverImageUrl,
        @Schema(nullable = true, description = "Printing chosen as cover")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable UUID coverPrintingId,
        @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessInfo freshness,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

    static BinderResponse from(BinderDetails details, Instant now) {
        BinderView binder = details.binder();
        return new BinderResponse(
                binder.id(),
                binder.name(),
                binder.description(),
                binder.kind(),
                binder.visibility(),
                binder.publicUntil(),
                binder.sortOrder(),
                binder.itemCount(),
                details.stats().publicItemCount(),
                binder.effectivePublic(),
                details.stats().games(),
                details.coverImageUrl(),
                binder.coverPrintingId(),
                FreshnessInfo.of(
                        binder.freshnessState(), binder.confirmedAt(), binder.updatedAt(), now),
                binder.createdAt(),
                binder.updatedAt());
    }
}
