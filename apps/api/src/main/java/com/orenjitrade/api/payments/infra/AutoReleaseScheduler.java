package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.AutoReleaseJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code payments-auto-release} job every hour under
 * the {@code local} profile (deployed environments call {@code POST
 * /internal/jobs/payments-auto-release}).
 */
@Component
@Profile("local")
public class AutoReleaseScheduler {

    private final AutoReleaseJob job;

    public AutoReleaseScheduler(AutoReleaseJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT3M", fixedDelayString = "PT1H")
    public void run() {
        job.run();
    }
}
