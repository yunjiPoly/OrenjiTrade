package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * The {@code inventory-import-purge} job: deletes the inventory import previews that have expired.
 * Recorded in {@code job_run}. It runs after every {@code freshness} job (hourly, in the cloud and
 * locally: {@code FreshnessJob}), and on request through {@code POST
 * /internal/jobs/inventory-import-purge}. It has no schedule of its own: an expired preview is
 * refused when it is read, so the purge is housekeeping and the hour is soon enough.
 */
@Component
public class InventoryImportPurgeJob {

    public static final String NAME = "inventory-import-purge";
    static final int BATCH_SIZE = 500;

    private final InventoryImportService imports;
    private final JobRunService jobRuns;

    public InventoryImportPurgeJob(InventoryImportService imports, JobRunService jobRuns) {
        this.imports = imports;
        this.jobRuns = jobRuns;
    }

    /** Runs the job and returns the number of imports removed. */
    public int run() {
        Map<String, ?> details =
                jobRuns.run(NAME, () -> Map.of("removed", imports.purgeExpired(BATCH_SIZE)));
        Object removed = details.get("removed");
        return removed instanceof Number number ? number.intValue() : 0;
    }
}
