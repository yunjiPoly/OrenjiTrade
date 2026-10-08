package com.orenjitrade.api.wishlist.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.inventory.api.InventoryResponses.PublicInventoryItemResponse;
import com.orenjitrade.api.search.api.SearchResponses.CollectorMarkerResponse;
import com.orenjitrade.api.wishlist.domain.TradePreference;
import com.orenjitrade.api.wishlist.domain.WishlistItemRow;
import com.orenjitrade.api.wishlist.domain.WishlistItemView;
import com.orenjitrade.api.wishlist.domain.WishlistMatchView;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Response DTOs of the wishlist (Phase 6 contract). Matches carry the public item and the owner's
 * marker (state/province and country, never a city or a distance; ADR 0017); the public summary
 * never carries notes or prices.
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

    /** A wishlist item of the caller. */
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
            @Schema(nullable = true, example = "Ultra Rare")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String rarity,
            @Schema(
                            nullable = true,
                            example = "LIGHTLY_PLAYED",
                            description = "Worst acceptable condition")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String conditionMin,
            @Schema(nullable = true, example = "FIRST_EDITION")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String edition,
            @Schema(nullable = true, example = "en") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String language,
            @Schema(nullable = true, example = "60.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal maxPrice,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) TradePreference tradePreference,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Private to the caller")
                    String notes,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean active,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Undismissed matches whose item is public right now (blocked"
                                            + " collectors excluded)")
                    long matchCount,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant lastMatchedAt,
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
                    row.conditionMin(),
                    row.edition(),
                    row.language(),
                    row.maxPrice(),
                    row.currency(),
                    row.tradePreference(),
                    row.notes(),
                    row.active(),
                    row.matchCount(),
                    row.lastMatchedAt(),
                    row.createdAt(),
                    row.updatedAt());
        }
    }

    /** A public item matching a wishlist item. */
    @Schema(name = "WishlistMatchResponse", description = "A public item matching a wishlist item")
    public record WishlistMatchResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID wishlistItemId,
            @Schema(requiredMode = RequiredMode.REQUIRED) PublicInventoryItemResponse item,
            @Schema(requiredMode = RequiredMode.REQUIRED) CollectorMarkerResponse collector,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant matchedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean dismissed) {

        static WishlistMatchResponse from(WishlistMatchView view, Instant now) {
            return new WishlistMatchResponse(
                    view.id(),
                    view.wishlistItemId(),
                    PublicInventoryItemResponse.from(view.item(), now),
                    CollectorMarkerResponse.from(view.collector()),
                    view.matchedAt(),
                    view.dismissed());
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
            @Schema(nullable = true, example = "NEAR_MINT") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String conditionMin) {

        static WishlistSummaryEntryResponse from(WishlistItemView view) {
            return new WishlistSummaryEntryResponse(
                    CardRefResponse.from(view.card()), view.printing(), view.row().conditionMin());
        }
    }
}
