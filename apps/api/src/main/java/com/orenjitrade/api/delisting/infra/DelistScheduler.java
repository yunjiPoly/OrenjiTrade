package com.orenjitrade.api.delisting.infra;

import com.orenjitrade.api.delisting.domain.DelistJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code delist} job daily under the {@code local}
 * profile (deployed environments call {@code POST /internal/jobs/delist}).
 */
@Component
@Profile("local")
public class DelistScheduler {

    private final DelistJob job;

    public DelistScheduler(DelistJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT10M", fixedDelayString = "P1D")
    public void run() {
        job.run();
    }
}
