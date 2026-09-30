package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.inventory.domain.FreshnessJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code freshness} job every hour under the {@code
 * local} profile (deployed environments call {@code POST /internal/jobs/freshness}).
 */
@Component
@Profile("local")
public class FreshnessScheduler {

    private final FreshnessJob job;

    public FreshnessScheduler(FreshnessJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT1M", fixedDelayString = "PT1H")
    public void run() {
        job.run();
    }
}
