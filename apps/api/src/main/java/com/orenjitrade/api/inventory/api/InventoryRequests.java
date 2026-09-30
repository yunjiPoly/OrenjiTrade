package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkAction;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of the inventory endpoints. */
public final class InventoryRequests {

    private InventoryRequests() {}

    /**
     * {@code POST /inventory/items}.
     *
     * @param printingId catalog printing (required)
     * @param quantity 1 by default
     * @param condition one of the game's conditions, NEAR_MINT by default
     * @param language the printing's language by default
     * @param edition the printing's edition by default
     * @param finish the printing's finish by default
     * @param askingPrice at most 2 decimals
     * @param currency ISO 4217, CAD by default
     * @param availability COLLECTION_ONLY by default
     * @param acceptsOffers false by default
     * @param notes private notes (only the owner sees them)
     * @param publicNotes notes shown on public listings
     * @param visibility PUBLIC inside a binder (the binder decides), PRIVATE otherwise
     * @param publicUntil required for TEMPORARILY_PUBLIC, at most 30 days ahead
     * @param binderId one of the caller's binders
     */
    @Schema(name = "CreateInventoryItemRequest", description = "A new inventory item")
    public record CreateInventoryItemRequest(
            @NotNull UUID printingId,
            @Min(1) @Max(9999) @Nullable Integer quantity,
            @Size(max = 32) @Schema(example = "NEAR_MINT") @Nullable String condition,
            @Size(min = 2, max = 2) @Schema(example = "en") @Nullable String language,
            @Size(max = 32) @Schema(example = "FIRST_EDITION") @Nullable String edition,
            @Size(max = 32) @Schema(example = "NORMAL") @Nullable String finish,
            @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) @Schema(example = "45.00")
                    @Nullable BigDecimal askingPrice,
            @Size(min = 3, max = 3) @Schema(example = "CAD") @Nullable String currency,
            @Nullable Availability availability,
            @Nullable Boolean acceptsOffers,
            @Size(max = 2000) @Nullable String notes,
            @Size(max = 500) @Nullable String publicNotes,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID binderId) {}

    /**
     * {@code PATCH /inventory/items/{id}}: any subset of the fields of the create request. {@code
     * askingPrice}, {@code publicUntil}, {@code binderId}, {@code notes} and {@code publicNotes}
     * may be {@code null} to clear them.
     */
    @Schema(
            name = "UpdateInventoryItemRequest",
            description =
                    "Any subset of the fields; absent fields are unchanged. binderId null unfiles"
                        + " the item (it becomes PRIVATE unless its binder was PUBLIC without an"
                        + " end date and no visibility is sent). Making the item public confirms"
                        + " it.")
    public record UpdateInventoryItemRequest(
            @Nullable UUID printingId,
            @Min(1) @Max(9999) @Nullable Integer quantity,
            @Size(max = 32) @Nullable String condition,
            @Size(min = 2, max = 2) @Nullable String language,
            @Size(max = 32) @Nullable String edition,
            @Size(max = 32) @Nullable String finish,
            @Schema(nullable = true) @Nullable BigDecimal askingPrice,
            @Size(min = 3, max = 3) @Nullable String currency,
            @Nullable Availability availability,
            @Nullable Boolean acceptsOffers,
            @Schema(nullable = true) @Size(max = 2000) @Nullable String notes,
            @Schema(nullable = true) @Size(max = 500) @Nullable String publicNotes,
            @Nullable ListingVisibility visibility,
            @Schema(nullable = true) @Nullable Instant publicUntil,
            @Schema(nullable = true) @Nullable UUID binderId) {}

    /**
     * {@code POST /inventory/items/bulk}.
     *
     * @param itemIds 1-500 items
     * @param action what to do
     * @param visibility SET_VISIBILITY target (required for it)
     * @param publicUntil SET_VISIBILITY with TEMPORARILY_PUBLIC: end (at most 30 days ahead)
     * @param binderId MOVE_TO_BINDER target; null or absent = unfiled
     * @param availability SET_AVAILABILITY target (required for it)
     */
    @Schema(name = "BulkInventoryRequest", description = "A bulk operation on the caller's items")
    public record BulkInventoryRequest(
            @NotNull @Size(min = 1, max = 500) List<@NotNull UUID> itemIds,
            @NotNull BulkAction action,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID binderId,
            @Nullable Availability availability) {}
}
