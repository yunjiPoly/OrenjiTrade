package com.orenjitrade.api.wishlist.api;

import com.orenjitrade.api.wishlist.domain.WishlistChanges.NewWishlistItem;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Request bodies of the wishlist endpoints. Members of the old wish model (conditionMin, edition,
 * language, maxPrice, currency, tradePreference, notes, active, radiusKm) are not part of the
 * contract any more: like every request body of the API, unknown members are ignored and nothing is
 * stored for them (no such column exists).
 */
public final class WishlistRequests {

    private WishlistRequests() {}

    /** {@code POST /wishlist}: a card (any printing) or one printing is required. */
    @Schema(
            name = "CreateWishlistItemRequest",
            description =
                    "Which copy: cardId (any printing, optionally of one rarity of the card's"
                        + " printings) or printingId (that printing; its card is derived). note is"
                        + " public (plain text, at most 280 characters, moderated). priceTerm is"
                        + " one of GET /wishlist/price-terms (a display term, not a filter).")
    public record CreateWishlistItemRequest(
            @Nullable UUID cardId,
            @Nullable UUID printingId,
            @Schema(
                            example = "Quarter Century Secret Rare",
                            description =
                                    "Any printing of this rarity (only without printingId, or"
                                            + " equal to the printing's own rarity)")
                    @Size(max = 40)
                    @Nullable String rarity,
            @Schema(example = "For my Azure-Eyes deck.", description = "Public note")
                    @Size(max = 2 * WishlistService.NOTE_MAX)
                    @Nullable String note,
            @Schema(description = "Only Near Mint (or Mint) copies; default false")
                    @Nullable Boolean nearMintOnly,
            @Schema(example = "85% TCG") @Size(max = 40) @Nullable String priceTerm) {

        NewWishlistItem toNew() {
            return new NewWishlistItem(cardId, printingId, rarity, note, nearMintOnly, priceTerm);
        }
    }

    /** {@code PATCH /wishlist/{id}} (documentation of the accepted members). */
    @Schema(
            name = "UpdateWishlistItemRequest",
            description =
                    "Any subset of the fields; absent fields are unchanged. printingId (another"
                        + " printing of the same card, or null for any printing), rarity, note and"
                        + " priceTerm may be null to clear them. Changing printingId without rarity"
                        + " clears the stored rarity.")
    public record UpdateWishlistItemRequest(
            @Schema(nullable = true) @Nullable UUID printingId,
            @Schema(nullable = true) @Size(max = 40) @Nullable String rarity,
            @Schema(nullable = true) @Size(max = 2 * WishlistService.NOTE_MAX)
                    @Nullable String note,
            @Nullable Boolean nearMintOnly,
            @Schema(nullable = true, example = "85% TCG") @Size(max = 40)
                    @Nullable String priceTerm) {}

    /** {@code PUT /admin/wishlist/settings}. */
    @Schema(name = "UpdateWishlistSettingsRequest")
    public record UpdateWishlistSettingsRequest(
            @Schema(
                            requiredMode = Schema.RequiredMode.REQUIRED,
                            description =
                                    "1 to 10 terms \"<percent>% TCG\" with an optional \"+\""
                                            + " (percent 1-200), in display order")
                    @NotNull
                    @Size(max = 20)
                    List<@Size(max = 40) String> priceTerms) {}
}
