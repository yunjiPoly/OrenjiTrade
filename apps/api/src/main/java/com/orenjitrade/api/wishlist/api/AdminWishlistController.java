package com.orenjitrade.api.wishlist.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.wishlist.api.WishlistRequests.UpdateWishlistSettingsRequest;
import com.orenjitrade.api.wishlist.api.WishlistResponses.SettingsResponse;
import com.orenjitrade.api.wishlist.domain.WishlistSettings;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/admin/wishlist/settings}: the wishlist platform settings (ADMIN, audited). */
@RestController
@RequestMapping(path = "/api/v1/admin/wishlist", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-wishlist", description = "Admin: wishlist settings")
public class AdminWishlistController {

    private final WishlistSettings settings;

    public AdminWishlistController(WishlistSettings settings) {
        this.settings = settings;
    }

    @GetMapping("/settings")
    @Operation(
            operationId = "getAdminWishlistSettings",
            summary = "The price terms a wish may choose (ADMIN)")
    public SettingsResponse getSettings() {
        return SettingsResponse.from(settings.current());
    }

    @PutMapping(path = "/settings", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminWishlistSettings",
            summary = "Replace the price terms a wish may choose (ADMIN)",
            description =
                    "1 to 10 terms \"<percent>% TCG\" with an optional \"+\" (percent 1-200), in"
                            + " display order; duplicates are dropped. Wishes that chose a removed"
                            + " term keep it. Audited (wishlist.settings.update).")
    @ApiResponse(responseCode = "200", description = "The settings")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = WishlistController.PROBLEM_REF)))
    public SettingsResponse updateSettings(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateWishlistSettingsRequest body) {
        return SettingsResponse.from(settings.update(principal, body.priceTerms()));
    }
}
