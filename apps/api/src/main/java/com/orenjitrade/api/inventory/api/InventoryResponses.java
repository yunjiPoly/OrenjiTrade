package com.orenjitrade.api.inventory.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.delisting.domain.FreshnessInfo;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkResult;
import com.orenjitrade.api.inventory.domain.InventoryChanges.SkipReason;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.InventoryService.InventorySummary;
import com.orenjitrade.api.inventory.domain.ItemImage;
import com.orenjitrade.api.inventory.domain.ItemRow;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Response DTOs of the inventory endpoints. */
public final class InventoryResponses {

    private InventoryResponses() {}

    /** An item of the caller (owner view, private notes included). */
    @Schema(name = "InventoryItemResponse", description = "An inventory item of the caller")
    public record InventoryItemResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) PrintingSummary printing,
            @Schema(requiredMode = RequiredMode.REQUIRED) CardRef card,
            @Schema(nullable = true, description = "Null when unfiled")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BinderRef binder,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "1") int quantity,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "NEAR_MINT") String condition,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "en") String language,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "FIRST_EDITION") String edition,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "NORMAL") String finish,
            @Schema(nullable = true, example = "45.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal askingPrice,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) Availability availability,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean acceptsOffers,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Private notes (only ever returned to the owner)")
                    String notes,
            @Schema(requiredMode = RequiredMode.REQUIRED) String publicNotes,
            @Schema(requiredMode = RequiredMode.REQUIRED) ListingVisibility visibility,
            @Schema(nullable = true, description = "End of a TEMPORARILY_PUBLIC publication")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant publicUntil,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Whether the item is public right now (visibility, expiry,"
                                            + " binder, freshness, the owner's account and privacy"
                                            + " settings)")
                    boolean effectivePublic,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessInfo freshness,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<ItemImage> images,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

        static InventoryItemResponse from(InventoryItemView view, Instant now) {
            ItemRow item = view.row();
            return new InventoryItemResponse(
                    item.id(),
                    view.printing(),
                    CardRef.of(item),
                    BinderRef.of(item),
                    item.quantity(),
                    item.condition(),
                    item.language(),
                    item.edition(),
                    item.finish(),
                    item.askingPrice(),
                    item.currency(),
                    item.availability(),
                    item.acceptsOffers(),
                    item.notes(),
                    item.publicNotes(),
                    item.visibility(),
                    item.publicUntil(),
                    item.effectivePublic(),
                    itemFreshness(item, now),
                    view.images(),
                    item.createdAt(),
                    item.updatedAt());
        }
    }

    /** A public item (never private notes, never owner coordinates). */
    @Schema(name = "PublicInventoryItem", description = "A public inventory item")
    public record PublicInventoryItemResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) PrintingSummary printing,
            @Schema(requiredMode = RequiredMode.REQUIRED) CardRef card,
            @Schema(nullable = true, description = "Public binder holding the item, if any")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BinderRef binder,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "1") int quantity,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "NEAR_MINT") String condition,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "en") String language,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "FIRST_EDITION") String edition,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "NORMAL") String finish,
            @Schema(nullable = true, example = "45.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal askingPrice,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) Availability availability,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean acceptsOffers,
            @Schema(requiredMode = RequiredMode.REQUIRED) String publicNotes,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<ItemImage> images,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessInfo freshness) {

        static PublicInventoryItemResponse from(InventoryItemView view, Instant now) {
            ItemRow item = view.row();
            return new PublicInventoryItemResponse(
                    item.id(),
                    view.printing(),
                    CardRef.of(item),
                    BinderRef.of(item),
                    item.quantity(),
                    item.condition(),
                    item.language(),
                    item.edition(),
                    item.finish(),
                    item.askingPrice(),
                    item.currency(),
                    item.availability(),
                    item.acceptsOffers(),
                    item.publicNotes(),
                    view.images(),
                    itemFreshness(item, now));
        }
    }

    /** The card of an item. */
    @Schema(name = "InventoryCardRef", description = "Card of an inventory item")
    public record CardRef(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Azure-Eyes Sky Dragon")
                    String name,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "yugioh") String game) {

        static CardRef of(ItemRow item) {
            return new CardRef(item.cardId(), item.cardName(), item.game());
        }
    }

    /** The binder of an item. */
    @Schema(name = "InventoryBinderRef", description = "Binder holding an inventory item")
    public record BinderRef(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Trade binder") String name) {

        static @Nullable BinderRef of(ItemRow item) {
            return item.binderId() == null || item.binderName() == null
                    ? null
                    : new BinderRef(item.binderId(), item.binderName());
        }
    }

    /** {@code POST /inventory/items/bulk} outcome. */
    @Schema(name = "BulkInventoryResponse", description = "Outcome of a bulk operation")
    public record BulkInventoryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Items changed")
                    int updated,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<BulkSkipped> skipped) {

        static BulkInventoryResponse from(BulkResult result) {
            return new BulkInventoryResponse(
                    result.updated(),
                    result.skipped().stream()
                            .map(skip -> new BulkSkipped(skip.itemId(), skip.reason()))
                            .toList());
        }
    }

    /** An item left alone by a bulk operation. */
    @Schema(name = "BulkSkipped", description = "Item skipped by a bulk operation")
    public record BulkSkipped(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID itemId,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "NOT_FOUND (unknown, deleted or not the caller's item) or"
                                            + " UNCHANGED (already in the requested state)")
                    SkipReason reason) {}

    /** {@code GET /inventory/summary}. */
    @Schema(name = "InventorySummaryResponse", description = "Totals of the caller's inventory")
    public record InventorySummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) long totalItems,
            @Schema(requiredMode = RequiredMode.REQUIRED) long totalQuantity,
            @Schema(requiredMode = RequiredMode.REQUIRED) VisibilityCounts byVisibility,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Items per game slug")
                    Map<String, Long> byGame,
            @Schema(requiredMode = RequiredMode.REQUIRED) long agingCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) long staleCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) long hiddenCount,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Items public right now")
                    long effectivePublicCount,
            @Schema(
                            nullable = true,
                            description =
                                    "Earliest future end of a temporary publication (items or"
                                            + " binders)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant nextExpiry) {

        static InventorySummaryResponse from(InventorySummary summary) {
            return new InventorySummaryResponse(
                    summary.totalItems(),
                    summary.totalQuantity(),
                    new VisibilityCounts(
                            summary.privateCount(),
                            summary.publicCount(),
                            summary.temporaryCount()),
                    summary.byGame(),
                    summary.agingCount(),
                    summary.staleCount(),
                    summary.hiddenCount(),
                    summary.effectivePublicCount(),
                    summary.nextExpiry());
        }
    }

    /** Items per visibility. */
    @Schema(name = "VisibilityCounts", description = "Items per visibility")
    public record VisibilityCounts(
            @Schema(requiredMode = RequiredMode.REQUIRED) @JsonProperty("PRIVATE")
                    long privateCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) @JsonProperty("PUBLIC") long publicCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) @JsonProperty("TEMPORARILY_PUBLIC")
                    long temporarilyPublicCount) {}

    /** Owner responses of one page of items. */
    static PageResponse<InventoryItemResponse> ownerPage(
            PageResponse<InventoryItemView> page, Instant now) {
        return new PageResponse<>(
                page.items().stream().map(view -> InventoryItemResponse.from(view, now)).toList(),
                page.page(),
                page.size(),
                page.totalItems(),
                page.totalPages());
    }

    static FreshnessInfo itemFreshness(ItemRow item, Instant now) {
        return FreshnessInfo.of(item.freshnessState(), item.confirmedAt(), item.updatedAt(), now);
    }
}
