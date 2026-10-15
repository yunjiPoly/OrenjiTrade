package com.orenjitrade.api.binders.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.binders.domain.BinderContents;
import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.BinderPhoto;
import com.orenjitrade.api.binders.domain.BinderShowcase;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.KeyCard;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinder;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderHit;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderSummary;
import com.orenjitrade.api.binders.domain.PublicOwner;
import com.orenjitrade.api.delisting.domain.FreshnessInfo;
import com.orenjitrade.api.location.api.PlaceResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Public binder DTOs. They never carry private notes, private items, a city or coordinates: the
 * owner's location is their state/province and country only (ADR 0017).
 */
public final class PublicBinderResponses {

    private PublicBinderResponses() {}

    /** A public binder in a collector's list ({@code GET /collectors/{handle}/binders}). */
    @Schema(name = "PublicBinderSummary", description = "Public binder of a collector")
    public record PublicBinderSummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) String description,
            @Schema(requiredMode = RequiredMode.REQUIRED) BinderKind kind,
            @Schema(nullable = true, description = "End of a temporary publication")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant publicUntil,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Public items")
                    long itemCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> games,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String coverImageUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessInfo freshness,
            @Schema(
                            description =
                                    "Owner block; present in search results (`GET /search`),"
                                            + " absent in a collector's own binder list")
                    @Nullable PublicBinderOwner owner,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description =
                                    "A deck core (\"Sell as a deck core\", stage R3): one bundle"
                                            + " with photos, one price and the description as its"
                                            + " note. Always sent")
                    boolean sellsAsCore,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            nullable = true,
                            maxLength = 40,
                            example = "$95",
                            description =
                                    "A deck core's asking price as the owner typed it; null for"
                                            + " other binders and a core without a price")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String askingPriceText,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description = "A deck core's photos in order; empty for other binders")
                    List<BinderPhoto> photos,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description =
                                    "Up to 3 pictures for lists: a deck core's first photo,"
                                            + " otherwise the catalog pictures of its first public"
                                            + " cards (every card of a deck core counts)")
                    List<String> previewImages,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description =
                                    "A deck core's key cards with their copies, most copies"
                                            + " first (at most 30): every live card filed in it,"
                                            + " whatever the card's own visibility, as its cards"
                                            + " sell only together; empty for other binders")
                    List<KeyCard> keyCards) {

        static PublicBinderSummaryResponse from(PublicBinderSummary summary, Instant now) {
            return of(summary, null, now);
        }

        /** A search result: the summary with its owner block. */
        public static PublicBinderSummaryResponse from(PublicBinderHit hit, Instant now) {
            return of(hit.summary(), PublicBinderOwner.from(hit.owner()), now);
        }

        private static PublicBinderSummaryResponse of(
                PublicBinderSummary summary, @Nullable PublicBinderOwner owner, Instant now) {
            BinderView binder = summary.binder();
            BinderContents.Stats stats = summary.stats();
            BinderShowcase showcase = summary.showcase();
            return new PublicBinderSummaryResponse(
                    binder.id(),
                    binder.name(),
                    binder.description(),
                    binder.kind(),
                    binder.publicUntil(),
                    stats.publicItemCount(),
                    stats.games(),
                    summary.coverImageUrl(),
                    binderFreshness(binder, now),
                    owner,
                    binder.sellsAsCore(),
                    publicPrice(binder),
                    showcase.photos(),
                    showcase.previewImages(),
                    showcase.keyCards());
        }
    }

    /** {@code GET /public/binders/{id}}. */
    @Schema(name = "PublicBinderResponse", description = "A public binder with its owner")
    public record PublicBinderResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) String description,
            @Schema(requiredMode = RequiredMode.REQUIRED) BinderKind kind,
            @Schema(nullable = true, description = "End of a temporary publication")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant publicUntil,
            @Schema(requiredMode = RequiredMode.REQUIRED) PublicBinderOwner owner,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessInfo freshness,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Public items")
                    long itemCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> games,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String coverImageUrl,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description =
                                    "A deck core (\"Sell as a deck core\", stage R3): one bundle"
                                            + " with photos, one price and the description as its"
                                            + " note. Always sent")
                    boolean sellsAsCore,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            nullable = true,
                            maxLength = 40,
                            example = "$95",
                            description =
                                    "A deck core's asking price as the owner typed it; null for"
                                            + " other binders and a core without a price")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String askingPriceText,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description = "A deck core's photos in order; empty for other binders")
                    List<BinderPhoto> photos,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description =
                                    "Up to 3 pictures for lists: a deck core's first photo,"
                                            + " otherwise the catalog pictures of its first public"
                                            + " cards (every card of a deck core counts)")
                    List<String> previewImages,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            description =
                                    "A deck core's key cards with their copies, most copies"
                                            + " first (at most 30): every live card filed in it,"
                                            + " whatever the card's own visibility, as its cards"
                                            + " sell only together; empty for other binders")
                    List<KeyCard> keyCards,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            example = "2",
                            description =
                                    "The owner's public binders, deck cores included (the seller"
                                            + " row of a deck core page)")
                    int ownerPublicBinderCount) {

        static PublicBinderResponse from(PublicBinder publicBinder, Instant now) {
            BinderView binder = publicBinder.binder();
            BinderShowcase showcase = publicBinder.showcase();
            return new PublicBinderResponse(
                    binder.id(),
                    binder.name(),
                    binder.description(),
                    binder.kind(),
                    binder.publicUntil(),
                    PublicBinderOwner.from(publicBinder.owner()),
                    binderFreshness(binder, now),
                    publicBinder.stats().publicItemCount(),
                    publicBinder.stats().games(),
                    publicBinder.coverImageUrl(),
                    binder.sellsAsCore(),
                    publicPrice(binder),
                    showcase.photos(),
                    showcase.previewImages(),
                    showcase.keyCards(),
                    publicBinder.ownerPublicBinderCount());
        }
    }

    /** The owner of a public binder (state/province and country, never a city). */
    @Schema(name = "PublicBinderOwner", description = "Owner of a public binder")
    public record PublicBinderOwner(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "collector1") String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl,
            @Schema(
                            nullable = true,
                            description =
                                    "State/province and country; null unless the collector is"
                                            + " discoverable with a location")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PlaceResponse place) {

        public static PublicBinderOwner from(PublicOwner owner) {
            return new PublicBinderOwner(
                    owner.id(),
                    owner.handle(),
                    owner.displayName(),
                    owner.avatarUrl(),
                    owner.place() == null ? null : PlaceResponse.from(owner.place()));
        }
    }

    /** The price buyers see: a deck core's text as typed; none for another binder. */
    static @Nullable String publicPrice(BinderView binder) {
        return binder.sellsAsCore() ? binder.askingPriceText() : null;
    }

    static FreshnessInfo binderFreshness(BinderView binder, Instant now) {
        return FreshnessInfo.of(
                binder.freshnessState(), binder.confirmedAt(), binder.updatedAt(), now);
    }
}
