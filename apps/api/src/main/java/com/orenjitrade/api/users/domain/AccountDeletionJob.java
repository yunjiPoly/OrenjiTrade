package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.jobs.domain.JobRunService;
import com.orenjitrade.api.users.domain.AccountDeletionService.DeletionJobResult;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/**
 * The {@code account-deletion} job: {@link AccountDeletionService#processDue()} recorded as a
 * {@code job_run}. Triggered by {@code POST /internal/jobs/account-deletion} (Cloud Scheduler) and,
 * under the {@code local} profile, by {@code AccountDeletionScheduler}.
 */
@Component
public class AccountDeletionJob {

    public static final String NAME = "account-deletion";

    private final AccountDeletionService accountDeletionService;
    private final JobRunService jobRunService;

    public AccountDeletionJob(
            AccountDeletionService accountDeletionService, JobRunService jobRunService) {
        this.accountDeletionService = accountDeletionService;
        this.jobRunService = jobRunService;
    }

    public DeletionJobResult run() {
        AtomicReference<DeletionJobResult> result = new AtomicReference<>();
        jobRunService.run(
                NAME,
                () -> {
                    DeletionJobResult outcome = accountDeletionService.processDue();
                    result.set(outcome);
                    return Map.of(
                            "processed", outcome.processed(),
                            "skipped", outcome.skipped(),
                            "failed", outcome.failed());
                });
        return result.get();
    }
}
