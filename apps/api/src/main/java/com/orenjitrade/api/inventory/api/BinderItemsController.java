package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.api.InventoryResponses.InventoryItemResponse;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.domain.PublicInventoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/binders/{id}/items}: every item of one of the caller's binders (owner only;
 * other collectors use {@code GET /public/binders/{id}/items}).
 */
@RestController
@Validated
@Tag(name = "binders", description = "The caller's binders: create, publish, confirm, reorder")
public class BinderItemsController {

    private final PublicInventoryService publicInventoryService;
    private final TimeProvider timeProvider;

    public BinderItemsController(
            PublicInventoryService publicInventoryService, TimeProvider timeProvider) {
        this.publicInventoryService = publicInventoryService;
        this.timeProvider = timeProvider;
    }

    @GetMapping(path = "/api/v1/binders/{id}/items", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listBinderItems",
            summary = "Items of one of the caller's binders",
            description =
                    "Same filters and sort as GET /inventory/items. 404 when the binder is not the"
                            + " caller's (others use GET /public/binders/{id}/items).")
    @ApiResponse(responseCode = "200", description = "One page of items")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    public PageResponse<InventoryItemResponse> items(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Parameter(description = "Card name, printing code or set")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String query,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @RequestParam(required = false) @Nullable ListingVisibility visibility,
            @RequestParam(required = false) @Nullable Availability availability,
            @RequestParam(required = false) @Size(max = 32) @Nullable String condition,
            @RequestParam(required = false) @Nullable FreshnessState freshness,
            @Parameter(
                            description = "updated | name | price",
                            schema =
                                    @Schema(
                                            allowableValues = {"updated", "name", "price"},
                                            defaultValue = "updated"))
                    @RequestParam(defaultValue = "updated")
                    String sort,
            @Parameter(schema = @Schema(allowableValues = {"asc", "desc"}))
                    @RequestParam(required = false)
                    @Nullable String direction,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return InventoryResponses.ownerPage(
                publicInventoryService.ownerBinderItems(
                        principal.userId(),
                        id,
                        InventoryController.ownerQuery(
                                query,
                                game,
                                id,
                                false,
                                visibility,
                                availability,
                                condition,
                                freshness,
                                sort,
                                direction,
                                page,
                                size)),
                timeProvider.now());
    }
}
