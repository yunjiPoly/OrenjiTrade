package com.orenjitrade.api.delisting.api;

import com.orenjitrade.api.delisting.domain.DelistJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/delist} (service token / Google OIDC, daily). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class DelistJobController {

    private final DelistJob job;

    public DelistJobController(DelistJob job) {
        this.job = job;
    }

    @PostMapping(path = "/internal/jobs/delist", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runDelistJob",
            summary = "Pause listings of unresponsive owners (service auth)",
            description =
                    "Daily. Pauses the public listings of owners whose unresponsiveness strikes"
                        + " reached the policy's maxStrikes. Strike tracking arrives with Phases"
                        + " 5/7: until then the run is recorded and nobody is paused. Never"
                        + " deletes.")
    public DelistJobResponse run() {
        DelistJob.Result result = job.run();
        return new DelistJobResponse(result.ownersEvaluated(), result.listingsPaused());
    }

    /** Response of {@code POST /internal/jobs/delist}. */
    @Schema(name = "DelistJobResponse")
    public record DelistJobResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int ownersEvaluated,
            @Schema(requiredMode = RequiredMode.REQUIRED) int listingsPaused) {}
}
