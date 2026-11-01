package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * The {@code inventory-photo-purge} job (stage R2): closes the restore windows of the items their
 * owners deleted more than {@link InventoryService#RESTORE_WINDOW} ago and deletes those items'
 * photos. Recorded in {@code job_run}. Like the {@code inventory-import-purge} job it has no
 * schedule of its own: it runs after every {@code freshness} job (hourly, in the cloud and locally:
 * {@code FreshnessJob}). The restore itself checks the time, so a window is closed for the owner
 * after ten minutes whatever this job does; the photos go within the hour that follows.
 */
@Component
public class InventoryPhotoPurgeJob {

    public static final String NAME = "inventory-photo-purge";
    static final int BATCH_SIZE = 500;
    static final int MAX_BATCHES = 20;

    private final InventoryService inventory;
    private final JobRunService jobRuns;

    public InventoryPhotoPurgeJob(InventoryService inventory, JobRunService jobRuns) {
        this.inventory = inventory;
        this.jobRuns = jobRuns;
    }

    /** Runs the job and returns the number of items whose window was closed. */
    public int run() {
        Map<String, ?> details =
                jobRuns.run(
                        NAME,
                        () -> {
                            int closed = 0;
                            for (int batch = 0; batch < MAX_BATCHES; batch++) {
                                int done = inventory.closeRestoreWindows(BATCH_SIZE);
                                closed += done;
                                if (done < BATCH_SIZE) {
                                    break;
                                }
                            }
                            return Map.of("closed", closed);
                        });
        Object closed = details.get("closed");
        return closed instanceof Number number ? number.intValue() : 0;
    }
}
