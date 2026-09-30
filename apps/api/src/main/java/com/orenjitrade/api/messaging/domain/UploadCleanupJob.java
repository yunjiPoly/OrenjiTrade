package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * The {@code upload-cleanup} job: deletes image uploads that were not attached to a message within
 * one hour, with their stored objects. Recorded in {@code job_run}; triggered by {@code POST
 * /internal/jobs/upload-cleanup} (Cloud Scheduler) or, locally, every 15 minutes.
 */
@Component
public class UploadCleanupJob {

    public static final String NAME = "upload-cleanup";
    static final int BATCH_SIZE = 200;

    private final ImageUploadService uploads;
    private final JobRunService jobRuns;

    public UploadCleanupJob(ImageUploadService uploads, JobRunService jobRuns) {
        this.uploads = uploads;
        this.jobRuns = jobRuns;
    }

    /** Runs the job and returns the number of uploads removed. */
    public int run() {
        Map<String, ?> details =
                jobRuns.run(NAME, () -> Map.of("removed", uploads.cleanup(BATCH_SIZE)));
        Object removed = details.get("removed");
        return removed instanceof Number number ? number.intValue() : 0;
    }
}
