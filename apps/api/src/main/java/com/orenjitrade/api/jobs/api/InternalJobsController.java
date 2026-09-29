package com.orenjitrade.api.jobs.api;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.jobs.domain.JobRunService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /internal/jobs/**}: entry points for Cloud Scheduler / Pub/Sub. Authenticated with the
 * service token or a Google OIDC token (see {@code ServiceAuthFilter}); never exposed through
 * Cloudflare.
 */
@RestController
@RequestMapping(path = "/internal/jobs", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class InternalJobsController {

    public static final String PING_JOB = "ping";

    private final JobRunService jobRunService;
    private final TimeProvider timeProvider;

    public InternalJobsController(JobRunService jobRunService, TimeProvider timeProvider) {
        this.jobRunService = jobRunService;
        this.timeProvider = timeProvider;
    }

    @PostMapping("/ping")
    @Operation(
            operationId = "pingInternalJobs",
            summary = "Connectivity check for schedulers (service auth)",
            description = "Records a `ping` job run and answers `{ \"ok\": true }`.")
    public PingJobResponse ping() {
        jobRunService.run(PING_JOB, () -> Map.of("pingedAt", timeProvider.now().toString()));
        return new PingJobResponse(true);
    }
}
