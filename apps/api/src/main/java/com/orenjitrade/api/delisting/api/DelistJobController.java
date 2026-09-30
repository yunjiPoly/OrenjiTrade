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
                    "Nightly. Counts the conversations waiting for each collector's answer (the"
                        + " other participant's last message of the last 30 days, older than the"
                        + " policy's unansweredAfterHours), stores the strikes (unanswered"
                        + " conversations since the owner's last resume) and pauses the public"
                        + " listings of owners who reached the policy's maxStrikes (they resume by"
                        + " confirming, POST /me/listings/resume). Also ends timed pauses. Never"
                        + " deletes. Records a job run.")
    public DelistJobResponse run() {
        DelistJob.Result result = job.run();
        return new DelistJobResponse(
                result.ownersEvaluated(),
                result.listingsPaused(),
                result.ownersWithStrikes(),
                result.pausesExpired());
    }

    /** Response of {@code POST /internal/jobs/delist}. */
    @Schema(name = "DelistJobResponse")
    public record DelistJobResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Collectors with at least one unanswered conversation")
                    int ownersEvaluated,
            @Schema(requiredMode = RequiredMode.REQUIRED) int listingsPaused,
            @Schema(requiredMode = RequiredMode.REQUIRED) int ownersWithStrikes,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Timed pauses that ended")
                    int pausesExpired) {}
}
