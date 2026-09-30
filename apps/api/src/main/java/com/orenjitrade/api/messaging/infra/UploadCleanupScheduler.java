package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.messaging.domain.UploadCleanupJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code upload-cleanup} job every 15 minutes under
 * the {@code local} profile (deployed environments call {@code POST
 * /internal/jobs/upload-cleanup}).
 */
@Component
@Profile("local")
public class UploadCleanupScheduler {

    private final UploadCleanupJob job;

    public UploadCleanupScheduler(UploadCleanupJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT2M", fixedDelayString = "PT15M")
    public void run() {
        job.run();
    }
}
