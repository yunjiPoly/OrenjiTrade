package com.orenjitrade.api.wishlist.api;

import com.orenjitrade.api.wishlist.domain.TradePreference;
import com.orenjitrade.api.wishlist.domain.WishlistChanges.NewWishlistItem;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of the wishlist endpoints. */
public final class WishlistRequests {

    private WishlistRequests() {}

    /** {@code POST /wishlist}: a card (any printing) or one printing is required. */
    @Schema(
            name = "CreateWishlistItemRequest",
            description =
                    "cardId or printingId is required (the card of a printing is derived)."
                            + " rarity, conditionMin, edition and language must belong to the"
                            + " game's GameSchema. Matching compares platform regions (no"
                            + " radius, no distance; ADR 0017).")
    public record CreateWishlistItemRequest(
            @Nullable UUID cardId,
            @Nullable UUID printingId,
            @Size(max = 40) @Nullable String rarity,
            @Schema(example = "LIGHTLY_PLAYED") @Size(max = 32) @Nullable String conditionMin,
            @Size(max = 32) @Nullable String edition,
            @Size(min = 2, max = 2) @Nullable String language,
            @Schema(example = "60.00") @DecimalMin("0") @Nullable BigDecimal maxPrice,
            @Schema(example = "CAD") @Size(min = 3, max = 3) @Nullable String currency,
            @Nullable TradePreference tradePreference,
            @Size(max = WishlistService.NOTES_MAX) @Nullable String notes,
            @Nullable Boolean active) {

        NewWishlistItem toNew() {
            return new NewWishlistItem(
                    cardId,
                    printingId,
                    rarity,
                    conditionMin,
                    edition,
                    language,
                    maxPrice,
                    currency,
                    tradePreference,
                    notes,
                    active);
        }
    }

    /** {@code PATCH /wishlist/{id}} (documentation of the accepted members). */
    @Schema(
            name = "UpdateWishlistItemRequest",
            description =
                    "Any subset of the fields; absent fields are unchanged. printingId (another"
                            + " printing of the same card, or null for any printing), rarity,"
                            + " conditionMin, edition, language, maxPrice and notes may be null to"
                            + " clear them. Changing the criteria re-matches the item against the"
                            + " current public inventory.")
    public record UpdateWishlistItemRequest(
            @Schema(nullable = true) @Nullable UUID printingId,
            @Schema(nullable = true) @Size(max = 40) @Nullable String rarity,
            @Schema(nullable = true) @Size(max = 32) @Nullable String conditionMin,
            @Schema(nullable = true) @Size(max = 32) @Nullable String edition,
            @Schema(nullable = true) @Size(min = 2, max = 2) @Nullable String language,
            @Schema(nullable = true) @Nullable BigDecimal maxPrice,
            @Size(min = 3, max = 3) @Nullable String currency,
            @Nullable TradePreference tradePreference,
            @Schema(nullable = true) @Size(max = WishlistService.NOTES_MAX) @Nullable String notes,
            @Nullable Boolean active) {}
}
