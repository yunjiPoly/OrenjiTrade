package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/**
 * The hourly {@code freshness} job: {@link FreshnessService#run()} recorded as a {@code job_run}.
 * Triggered by {@code POST /internal/jobs/freshness} (Cloud Scheduler) and, under the {@code local}
 * profile, by {@code FreshnessScheduler}.
 */
@Component
public class FreshnessJob {

    public static final String NAME = "freshness";

    private final FreshnessService freshnessService;
    private final JobRunService jobRunService;

    public FreshnessJob(FreshnessService freshnessService, JobRunService jobRunService) {
        this.freshnessService = freshnessService;
        this.jobRunService = jobRunService;
    }

    public FreshnessService.Result run() {
        AtomicReference<FreshnessService.Result> result = new AtomicReference<>();
        jobRunService.run(
                NAME,
                () -> {
                    FreshnessService.Result outcome = freshnessService.run();
                    result.set(outcome);
                    return outcome.asMap();
                });
        return result.get();
    }
}
