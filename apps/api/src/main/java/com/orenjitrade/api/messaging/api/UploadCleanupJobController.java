package com.orenjitrade.api.messaging.api;

import com.orenjitrade.api.messaging.domain.UploadCleanupJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/upload-cleanup} (service token / Google OIDC, every 15 minutes). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class UploadCleanupJobController {

    private final UploadCleanupJob job;

    public UploadCleanupJobController(UploadCleanupJob job) {
        this.job = job;
    }

    @PostMapping(
            path = "/internal/jobs/upload-cleanup",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runUploadCleanupJob",
            summary = "Delete unattached image uploads (service auth)",
            description =
                    "Every 15 minutes. Deletes image uploads older than 1 h that no message"
                            + " consumed, with their stored objects. Records a job run.")
    public UploadCleanupJobResponse run() {
        return new UploadCleanupJobResponse(job.run());
    }

    /** Response of {@code POST /internal/jobs/upload-cleanup}. */
    @Schema(name = "UploadCleanupJobResponse")
    public record UploadCleanupJobResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int removed) {}
}
