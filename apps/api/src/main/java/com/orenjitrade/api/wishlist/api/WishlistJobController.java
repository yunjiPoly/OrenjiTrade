package com.orenjitrade.api.wishlist.api;

import com.orenjitrade.api.wishlist.domain.WishlistRematchJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/wishlist-rematch} (service token / Google OIDC, nightly). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class WishlistJobController {

    private final WishlistRematchJob job;

    public WishlistJobController(WishlistRematchJob job) {
        this.job = job;
    }

    @PostMapping(
            path = "/internal/jobs/wishlist-rematch",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runWishlistRematchJob",
            summary = "Re-run wishlist matching for the last 24 h (service auth)",
            description =
                    "Nightly safety net: inventory items published in the last 24 hours are matched"
                        + " again (matches and notifications are idempotent, so only publications"
                        + " whose event was lost produce new ones) and wishlist items edited in"
                        + " that window are re-matched. Records a job run.")
    public WishlistRematchResponse run() {
        WishlistRematchJob.Result result = job.run();
        return new WishlistRematchResponse(
                result.inventoryItems(),
                result.wishlistItems(),
                result.matchesCreated(),
                result.notified(),
                result.failures());
    }

    /** Response of {@code POST /internal/jobs/wishlist-rematch}. */
    @Schema(name = "WishlistRematchResponse")
    public record WishlistRematchResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int inventoryItems,
            @Schema(requiredMode = RequiredMode.REQUIRED) int wishlistItems,
            @Schema(requiredMode = RequiredMode.REQUIRED) int matchesCreated,
            @Schema(requiredMode = RequiredMode.REQUIRED) int notified,
            @Schema(requiredMode = RequiredMode.REQUIRED) int failures) {}
}
