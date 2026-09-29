package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.inventory.api.InventoryResponses.PublicInventoryItemResponse;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.domain.InventoryChanges.PublicQuery;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.PublicInventoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Locale;
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
 * Public item lists (permitAll GET, privacy enforced): {@code GET /public/binders/{id}/items} and
 * {@code GET /collectors/{handle}/inventory}. Only effectively public items; never private notes,
 * never coordinates.
 */
@RestController
@Validated
@Tag(name = "public-binders", description = "Public binders of collectors (no auth required)")
public class PublicInventoryController {

    private final PublicInventoryService publicInventoryService;
    private final TimeProvider timeProvider;

    public PublicInventoryController(
            PublicInventoryService publicInventoryService, TimeProvider timeProvider) {
        this.publicInventoryService = publicInventoryService;
        this.timeProvider = timeProvider;
    }

    @GetMapping(
            path = "/api/v1/public/binders/{id}/items",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listPublicBinderItems",
            summary = "Public items of a public binder (auth optional)",
            description =
                    "404 unless the binder is public right now. Only items that are public right"
                            + " now, by card name. Never private notes or coordinates.")
    @ApiResponse(responseCode = "200", description = "One page of public items")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown or non-public binder",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    public PageResponse<PublicInventoryItemResponse> binderItems(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @PathVariable UUID id,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @Parameter(description = "Card name, printing code or set")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String query,
            @RequestParam(required = false) @Nullable Availability availability,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return responses(
                publicInventoryService.binderItems(
                        viewer(principal), id, publicQuery(query, game, availability, page, size)));
    }

    @GetMapping(
            path = "/api/v1/collectors/{handle}/inventory",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listCollectorInventory",
            summary = "Public items of a collector across binders (auth optional)",
            description =
                    "Only items that are public right now, by card name. 404 when the collector is"
                        + " suspended, pending deletion, deleted, has a PRIVATE profile or a block"
                        + " exists. Never private notes or coordinates.")
    @ApiResponse(responseCode = "200", description = "One page of public items")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown or hidden collector",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    public PageResponse<PublicInventoryItemResponse> collectorInventory(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @PathVariable String handle,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @Parameter(description = "Card name, printing code or set")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String query,
            @RequestParam(required = false) @Nullable Availability availability,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return responses(
                publicInventoryService.collectorItems(
                        viewer(principal),
                        handle,
                        publicQuery(query, game, availability, page, size)));
    }

    private PageResponse<PublicInventoryItemResponse> responses(
            PageResponse<InventoryItemView> page) {
        Instant now = timeProvider.now();
        return new PageResponse<>(
                page.items().stream()
                        .map(view -> PublicInventoryItemResponse.from(view, now))
                        .toList(),
                page.page(),
                page.size(),
                page.totalItems(),
                page.totalPages());
    }

    private static PublicQuery publicQuery(
            @Nullable String query,
            @Nullable String game,
            @Nullable Availability availability,
            int page,
            int size) {
        return new PublicQuery(
                query == null || query.isBlank() ? null : query.trim(),
                game == null || game.isBlank() ? null : game.trim().toLowerCase(Locale.ROOT),
                availability,
                page,
                size);
    }

    private static @Nullable UUID viewer(@Nullable AuthenticatedUser principal) {
        return principal == null ? null : principal.userId();
    }
}
