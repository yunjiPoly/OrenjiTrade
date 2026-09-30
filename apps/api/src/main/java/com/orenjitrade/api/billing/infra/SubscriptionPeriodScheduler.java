package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.SubscriptionPeriodJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code subscriptions-period} job every hour under
 * the {@code local} profile (deployed environments call {@code POST
 * /internal/jobs/subscriptions-period}).
 */
@Component
@Profile("local")
public class SubscriptionPeriodScheduler {

    private final SubscriptionPeriodJob job;

    public SubscriptionPeriodScheduler(SubscriptionPeriodJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT4M", fixedDelayString = "PT1H")
    public void run() {
        job.run();
    }
}
