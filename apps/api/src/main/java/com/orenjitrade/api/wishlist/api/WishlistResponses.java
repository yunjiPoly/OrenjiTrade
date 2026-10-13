package com.orenjitrade.api.wishlist.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.wishlist.domain.PriceTerm;
import com.orenjitrade.api.wishlist.domain.WishlistItemRow;
import com.orenjitrade.api.wishlist.domain.WishlistItemView;
import com.orenjitrade.api.wishlist.domain.WishlistSettings;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Response DTOs of the wishlist (stage S2 model): which copy, the public note, "Near Mint only" and
 * the price term. Nothing private exists on a wish any more; no matches, no locations.
 */
public final class WishlistResponses {

    private WishlistResponses() {}

    /** The wished card. */
    @Schema(name = "WishlistCardRef", description = "The wished card")
    public record CardRefResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Azure-Eyes Sky Dragon")
                    String name,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String imageUrl) {

        static @Nullable CardRefResponse from(WishlistItemView.@Nullable CardRef card) {
            return card == null
                    ? null
                    : new CardRefResponse(card.id(), card.name(), card.imageUrl());
        }
    }

    /** A price term relative to the TCG market price. */
    @Schema(
            name = "WishPriceTerm",
            description =
                    "A display term relative to the TCG market price of the printing (not a"
                            + " filter); orMore = this percent or more (\"100% TCG+\")")
    public record PriceTermResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "85% TCG") String label,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "85") int percent,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean orMore) {

        static PriceTermResponse from(PriceTerm term) {
            return new PriceTermResponse(term.label(), term.percent(), term.orMore());
        }

        static @Nullable PriceTermResponse of(@Nullable String label) {
            return label == null
                    ? null
                    : PriceTerm.parse(label).map(PriceTermResponse::from).orElse(null);
        }
    }

    /** A wish of the caller. */
    @Schema(name = "WishlistItemResponse", description = "A card the caller is looking for")
    public record WishlistItemResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "yugioh") String game,
            @Schema(nullable = true, description = "Null only if the catalog lost the card")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable CardRefResponse card,
            @Schema(nullable = true, description = "The wished printing; null = any printing")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PrintingSummary printing,
            @Schema(
                            nullable = true,
                            example = "Ultra Rare",
                            description = "Any printing of this rarity; null = any rarity")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String rarity,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Public note (\"\" = none)")
                    String note,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean nearMintOnly,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PriceTermResponse priceTerm,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

        static WishlistItemResponse from(WishlistItemView view) {
            WishlistItemRow row = view.row();
            return new WishlistItemResponse(
                    row.id(),
                    row.gameSlug(),
                    CardRefResponse.from(view.card()),
                    view.printing(),
                    row.rarity(),
                    row.publicNote(),
                    row.nearMintOnly(),
                    PriceTermResponse.of(row.priceTerm()),
                    row.createdAt(),
                    row.updatedAt());
        }
    }

    /** One entry of a collector's public wishlist. */
    @Schema(
            name = "WishlistSummaryEntry",
            description = "A card a collector is looking for (public wishlist)")
    public record WishlistSummaryEntryResponse(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable CardRefResponse card,
            @Schema(nullable = true, description = "Null = any printing")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PrintingSummary printing,
            @Schema(nullable = true, description = "Any printing of this rarity; null = any")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String rarity,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Public note (\"\" = none)")
                    String note,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean nearMintOnly,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PriceTermResponse priceTerm) {

        static WishlistSummaryEntryResponse from(WishlistItemView view) {
            WishlistItemRow row = view.row();
            return new WishlistSummaryEntryResponse(
                    CardRefResponse.from(view.card()),
                    view.printing(),
                    row.rarity(),
                    row.publicNote(),
                    row.nearMintOnly(),
                    PriceTermResponse.of(row.priceTerm()));
        }
    }

    /** {@code GET /wishlist/price-terms}. */
    @Schema(name = "WishPriceTermsResponse", description = "The price terms a wish may choose")
    public record PriceTermsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "In display order")
                    List<PriceTermResponse> terms) {

        static PriceTermsResponse from(List<PriceTerm> terms) {
            return new PriceTermsResponse(terms.stream().map(PriceTermResponse::from).toList());
        }
    }

    /** {@code GET|PUT /admin/wishlist/settings}. */
    @Schema(name = "WishlistSettingsResponse", description = "Wishlist settings (admin)")
    public record SettingsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> priceTerms,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID updatedBy,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant updatedAt) {

        static SettingsResponse from(WishlistSettings.Values values) {
            return new SettingsResponse(
                    values.priceTerms(), values.updatedBy(), values.updatedAt());
        }
    }
}
