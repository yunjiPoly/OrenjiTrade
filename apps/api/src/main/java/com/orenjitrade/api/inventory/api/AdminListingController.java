package com.orenjitrade.api.inventory.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.domain.AdminListingService;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.domain.ItemRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.AdminRow;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.function.Function;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/listings}: listings, stale/hidden review, restore and hide (ADMIN,
 * SUPER_ADMIN; writes audited). Never the owner's private notes, never a location.
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/admin/listings", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-listings", description = "Listings and stale-listing review (admin console)")
public class AdminListingController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final AdminListingService listings;

    public AdminListingController(AdminListingService listings) {
        this.listings = listings;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminListings",
            summary = "List listings (ADMIN)",
            description =
                    "Items their owners made public or temporarily public (effectivePublic says"
                            + " whether they are public right now), newest change first. `query`"
                            + " matches card names, printing codes and sets; `state` is the"
                            + " freshness state.")
    public PageResponse<AdminListingResponse> list(
            @RequestParam(required = false) @Size(max = 100) @Nullable String query,
            @RequestParam(required = false) @Nullable FreshnessState state,
            @RequestParam(required = false) @Size(max = 40) @Nullable String game,
            @RequestParam(required = false) @Nullable UUID ownerId,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return map(
                listings.list(query, state, game, ownerId, page, size), AdminListingResponse::from);
    }

    @GetMapping("/stale")
    @Operation(
            operationId = "listStaleListings",
            summary = "Stale and hidden listings for review (ADMIN)",
            description =
                    "STALE or HIDDEN listings (both when `state` is omitted), oldest confirmation"
                            + " first, with the warning time. Nothing is ever deleted by the"
                            + " freshness rules; POST /admin/listings/{itemId}/restore confirms a"
                            + " listing again.")
    public PageResponse<StaleListingResponse> stale(
            @RequestParam(required = false) @Nullable FreshnessState state,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return map(listings.stale(state, page, size), StaleListingResponse::from);
    }

    @PostMapping("/{itemId}/restore")
    @Operation(
            operationId = "restoreListing",
            summary = "Restore a stale or hidden listing (ADMIN)",
            description =
                    "Confirms the listing on the owner's behalf (freshness ACTIVE again, RESTORED"
                            + " event). Audited (`listing.restore`).")
    @ApiResponse(responseCode = "200", description = "The restored listing")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown or deleted item",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminListingResponse restore(
            @AuthenticationPrincipal AuthenticatedUser actor, @PathVariable UUID itemId) {
        return AdminListingResponse.from(listings.restore(actor, itemId));
    }

    @PostMapping(path = "/{itemId}/hide", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "hideListing",
            summary = "Hide a listing (ADMIN)",
            description =
                    "Makes the item PRIVATE (the owner can publish it again). Audited"
                            + " (`listing.hide` with the reason).")
    @ApiResponse(responseCode = "200", description = "The listing, now private")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown or deleted item",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminListingResponse hide(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID itemId,
            @Valid @RequestBody HideListingRequest body) {
        return AdminListingResponse.from(listings.hide(actor, itemId, body.reason()));
    }

    private static <T> PageResponse<T> map(
            PageResponse<AdminRow> page, Function<AdminRow, T> mapper) {
        return new PageResponse<>(
                page.items().stream().map(mapper).toList(),
                page.page(),
                page.size(),
                page.totalItems(),
                page.totalPages());
    }

    /** Body of {@code POST /admin/listings/{itemId}/hide}. */
    @Schema(name = "HideListingRequest")
    public record HideListingRequest(
            @Schema(maxLength = 500, description = "Why (audited)") @NotBlank @Size(max = 500)
                    String reason) {}

    /** The owner of a listing (never a location). */
    @Schema(name = "ListingOwner")
    public record OwnerResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String handle) {}

    /** The listed item (never private notes). */
    @Schema(name = "AdminListingItem")
    public record ItemResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID cardId,
            @Schema(requiredMode = RequiredMode.REQUIRED) String cardName,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID printingId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String printingCode,
            @Schema(requiredMode = RequiredMode.REQUIRED) String game,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID binderId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String binderName,
            @Schema(requiredMode = RequiredMode.REQUIRED) int quantity,
            @Schema(requiredMode = RequiredMode.REQUIRED) String condition,
            @Schema(requiredMode = RequiredMode.REQUIRED) Availability availability,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal askingPrice,
            @Schema(requiredMode = RequiredMode.REQUIRED) String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) ListingVisibility visibility,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant publicUntil,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean effectivePublic) {

        static ItemResponse from(AdminRow row) {
            ItemRow item = row.item();
            return new ItemResponse(
                    item.id(),
                    item.cardId(),
                    item.cardName(),
                    item.printingId(),
                    row.printingCode(),
                    item.game(),
                    item.binderId(),
                    item.binderName(),
                    item.quantity(),
                    item.condition(),
                    item.availability(),
                    item.askingPrice(),
                    item.currency(),
                    item.visibility(),
                    item.publicUntil(),
                    item.effectivePublic());
        }
    }

    /** A listing waiting for review (Phase 7 contract {@code StaleListing}). */
    @Schema(name = "StaleListing")
    public record StaleListingResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) ItemResponse item,
            @Schema(requiredMode = RequiredMode.REQUIRED) OwnerResponse owner,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant confirmedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessState state,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant warnedAt) {

        static StaleListingResponse from(AdminRow row) {
            return new StaleListingResponse(
                    ItemResponse.from(row),
                    new OwnerResponse(row.item().ownerId(), row.ownerHandle()),
                    row.item().confirmedAt(),
                    row.item().freshnessState(),
                    row.warnedAt());
        }
    }

    /** A listing in the admin console. */
    @Schema(name = "AdminListing")
    public record AdminListingResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) ItemResponse item,
            @Schema(requiredMode = RequiredMode.REQUIRED) OwnerResponse owner,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant confirmedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessState state,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant warnedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

        static AdminListingResponse from(AdminRow row) {
            return new AdminListingResponse(
                    ItemResponse.from(row),
                    new OwnerResponse(row.item().ownerId(), row.ownerHandle()),
                    row.item().confirmedAt(),
                    row.item().freshnessState(),
                    row.warnedAt(),
                    row.item().updatedAt());
        }
    }
}
