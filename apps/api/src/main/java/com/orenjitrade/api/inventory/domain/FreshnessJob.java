package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.inventory.domain.imports.InventoryImportPurgeJob;
import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The hourly {@code freshness} job: {@link FreshnessService#run()} recorded as a {@code job_run}.
 * Triggered by {@code POST /internal/jobs/freshness} (Cloud Scheduler) and, under the {@code local}
 * profile, by {@code FreshnessScheduler}.
 *
 * <p>The same hourly trigger then runs the inventory module's other housekeeping, the {@code
 * inventory-import-purge} job (stage S5), as a job run of its own: expired import previews are
 * refused when they are read, so removing them within the hour is enough, and the cloud needs no
 * tenth Cloud Scheduler job for it (ADR 0016). A purge that fails never fails the freshness run.
 */
@Component
public class FreshnessJob {

    public static final String NAME = "freshness";

    private static final Logger log = LoggerFactory.getLogger(FreshnessJob.class);

    private final FreshnessService freshnessService;
    private final JobRunService jobRunService;
    private final InventoryImportPurgeJob importPurge;

    public FreshnessJob(
            FreshnessService freshnessService,
            JobRunService jobRunService,
            InventoryImportPurgeJob importPurge) {
        this.freshnessService = freshnessService;
        this.jobRunService = jobRunService;
        this.importPurge = importPurge;
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
        try {
            importPurge.run();
        } catch (RuntimeException e) {
            // Recorded as a failed job run of its own; the next hour tries again.
            log.warn("Import preview purge failed after the freshness run: {}", e.toString());
        }
        return result.get();
    }
}
