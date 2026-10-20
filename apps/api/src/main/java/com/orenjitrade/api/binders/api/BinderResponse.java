package com.orenjitrade.api.binders.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.binders.domain.BinderDetails;
import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.BinderPhoto;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.KeyCard;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.delisting.domain.FreshnessInfo;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
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
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        description =
                                "\"Sell as a deck core\" (stage R3): the binder is offered as one"
                                        + " bundle with its photos, one price and its description"
                                        + " as the public note. Always sent")
                boolean sellsAsCore,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        nullable = true,
                        maxLength = 40,
                        example = "$180",
                        description =
                                "The deck core's asking price as typed; null without one. Kept"
                                        + " when the switch is turned off (public views show it"
                                        + " only for a deck core)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String askingPriceText,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        nullable = true,
                        description =
                                "The amount of a plain-amount price text (\"$180\", \"180,00 $\"),"
                                        + " in `currency`; null for a text price or none")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable BigDecimal askingPrice,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        example = "CAD",
                        description = "ISO 4217 currency of `askingPrice`")
                String currency,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        nullable = true,
                        description =
                                "When the deck core was sold (stage R4); a sold binder is not"
                                        + " public")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant soldAt,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        description = "The binder's photos in order (at most 4). Always sent")
                List<BinderPhoto> photos,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        description =
                                "Up to 3 pictures for lists: a deck core's first photo, otherwise"
                                        + " the card pictures of its first items. Always sent")
                List<String> previewImages,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        description =
                                "A deck core's cards with their copies, most copies first (at most"
                                        + " 30); empty for other binders. Always sent")
                List<KeyCard> keyCards,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        example = "yugioh",
                        description =
                                "Slug of the one game whose cards the binder holds (stage G)."
                                        + " Always sent")
                String game,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        description = "Id of that game (GET /games). Always sent")
                UUID gameId) {

    /** The owner's view of a binder (also for the inventory module's binder photo routes). */
    public static BinderResponse from(BinderDetails details, Instant now) {
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
                binder.updatedAt(),
                binder.sellsAsCore(),
                binder.askingPriceText(),
                binder.askingPrice(),
                binder.currency(),
                binder.soldAt(),
                details.showcase().photos(),
                details.showcase().previewImages(),
                details.showcase().keyCards(),
                binder.game(),
                binder.gameId());
    }
}
