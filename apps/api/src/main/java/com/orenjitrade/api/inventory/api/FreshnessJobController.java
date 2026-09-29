package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.inventory.domain.FreshnessJob;
import com.orenjitrade.api.inventory.domain.FreshnessService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/freshness} (service token / Google OIDC, hourly). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class FreshnessJobController {

    private final FreshnessJob job;

    public FreshnessJobController(FreshnessJob job) {
        this.job = job;
    }

    @PostMapping(path = "/internal/jobs/freshness", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runFreshnessJob",
            summary = "Recompute listing freshness (service auth)",
            description =
                    "Hourly. Expired temporary publications become PRIVATE; freshness states of"
                        + " items and binders are re-derived from confirmedAt and the active delist"
                        + " policy; public listings entering the warning window are warned once;"
                        + " hidden listings stop being public (InventoryItemUnpublished). Never"
                        + " deletes. Records a job run.")
    public FreshnessJobResponse run() {
        FreshnessService.Result result = job.run();
        return new FreshnessJobResponse(
                result.expired(),
                result.itemsAged(),
                result.itemsStaled(),
                result.itemsHidden(),
                result.itemsRestored(),
                result.binderStateChanges(),
                result.itemsWarned(),
                result.bindersWarned(),
                result.published(),
                result.unpublished());
    }

    /** Response of {@code POST /internal/jobs/freshness}. */
    @Schema(name = "FreshnessJobResponse")
    public record FreshnessJobResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int expired,
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemsAged,
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemsStaled,
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemsHidden,
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemsRestored,
            @Schema(requiredMode = RequiredMode.REQUIRED) int binderStateChanges,
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemsWarned,
            @Schema(requiredMode = RequiredMode.REQUIRED) int bindersWarned,
            @Schema(requiredMode = RequiredMode.REQUIRED) int published,
            @Schema(requiredMode = RequiredMode.REQUIRED) int unpublished) {}
}
