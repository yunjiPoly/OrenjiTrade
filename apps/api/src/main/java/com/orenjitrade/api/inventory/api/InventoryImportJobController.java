package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.inventory.domain.imports.InventoryImportPurgeJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /internal/jobs/inventory-import-purge} (service token / Google OIDC). Not scheduled
 * on its own: the hourly {@code freshness} trigger runs the same job; this route runs it on
 * request.
 */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class InventoryImportJobController {

    private final InventoryImportPurgeJob job;

    public InventoryImportJobController(InventoryImportPurgeJob job) {
        this.job = job;
    }

    @PostMapping(
            path = "/internal/jobs/inventory-import-purge",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runInventoryImportPurgeJob",
            summary = "Delete expired inventory import previews (service auth)",
            description =
                    "Deletes the import previews past their time to live"
                            + " (inventory.import.preview_ttl_minutes), the results of finished"
                            + " imports past the same time, and commits nobody finished for 7"
                            + " days. Never touches the inventory. Records a job run. The hourly"
                            + " freshness job runs it too; this route is for a run on request.")
    public InventoryImportPurgeJobResponse run() {
        return new InventoryImportPurgeJobResponse(job.run());
    }

    /** Response of {@code POST /internal/jobs/inventory-import-purge}. */
    @Schema(name = "InventoryImportPurgeJobResponse")
    public record InventoryImportPurgeJobResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int removed) {}
}
