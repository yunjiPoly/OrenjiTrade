package com.orenjitrade.api.wishlist.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.wishlist.api.WishlistResponses.WishlistSummaryEntryResponse;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/collectors/{handle}/wishlist}: a collector's public wishlist summary. */
@RestController
@Tag(name = "wishlist", description = "The caller's wishlist and its matches nearby")
public class CollectorWishlistController {

    private final WishlistService wishlistService;

    public CollectorWishlistController(WishlistService wishlistService) {
        this.wishlistService = wishlistService;
    }

    @GetMapping(
            path = "/api/v1/collectors/{handle}/wishlist",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getCollectorWishlist",
            summary = "A collector's public wishlist",
            description =
                    "Only when the collector shows their wishlist (privacy setting wishlistVisible)"
                        + " and their profile is visible to the caller: the active items as card,"
                        + " printing and minimum condition (never notes, prices or radii). 404"
                        + " otherwise, and for unknown, suspended, deleted or blocked collectors.")
    @ApiResponse(responseCode = "200", description = "The public wishlist")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown collector or wishlist not visible",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = WishlistController.PROBLEM_REF)))
    public List<WishlistSummaryEntryResponse> wishlist(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable String handle) {
        return wishlistService.publicSummary(principal.userId(), handle).stream()
                .map(WishlistSummaryEntryResponse::from)
                .toList();
    }
}
