package com.orenjitrade.api.credits.infra;

import com.orenjitrade.api.credits.domain.CreditReconciliationJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code credits-reconcile} job every hour under the
 * {@code local} profile (deployed environments call {@code POST /internal/jobs/credits-reconcile}).
 */
@Component
@Profile("local")
public class CreditReconcileScheduler {

    private final CreditReconciliationJob job;

    public CreditReconcileScheduler(CreditReconciliationJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT5M", fixedDelayString = "PT1H")
    public void run() {
        job.run();
    }
}
