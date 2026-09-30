package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.users.domain.AccountDeletionJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code account-deletion} job every hour under the
 * {@code local} profile (deployed environments call {@code POST /internal/jobs/account-deletion}).
 */
@Component
@Profile("local")
public class AccountDeletionScheduler {

    private final AccountDeletionJob job;

    public AccountDeletionScheduler(AccountDeletionJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT2M", fixedDelayString = "PT1H")
    public void run() {
        job.run();
    }
}
