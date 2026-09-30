package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.jobs.domain.JobRunService;
import com.orenjitrade.api.payments.domain.PaymentSettings.Settings;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The hourly {@code payments-auto-release} job (Phase 9 contract): buyers of shipped trades are
 * reminded {@code payments.release_reminder_hours} before their dispute window ends; once the
 * window has ended without a dispute, the card is treated as received, the payout released and the
 * trade COMPLETED. Does nothing while {@code payments.auto_release_enabled} is false. Each payment
 * is handled in its own transaction (re-checked under the trade and payment locks, so a dispute
 * opened meanwhile wins); recorded as a {@code job_run}. Triggered by {@code POST
 * /internal/jobs/payments-auto-release} (Cloud Scheduler) and, under the {@code local} profile, by
 * {@code AutoReleaseScheduler}.
 */
@Component
public class AutoReleaseJob {

    public static final String NAME = "payments-auto-release";

    private static final Logger log = LoggerFactory.getLogger(AutoReleaseJob.class);

    private final ProtectedPaymentService payments;
    private final PaymentSettings settings;
    private final JobRunService jobRuns;

    public AutoReleaseJob(
            ProtectedPaymentService payments, PaymentSettings settings, JobRunService jobRuns) {
        this.payments = payments;
        this.settings = settings;
        this.jobRuns = jobRuns;
    }

    /**
     * Outcome of a run.
     *
     * @param enabled whether auto-release was enabled
     * @param reminded buyers reminded
     * @param released payouts released
     * @param failed payments that could not be released (retried next run)
     */
    public record Result(boolean enabled, int reminded, int released, int failed) {}

    public Result run() {
        int[] counts = new int[3];
        boolean[] enabled = new boolean[1];
        jobRuns.run(
                NAME,
                () -> {
                    Settings rules = settings.current();
                    enabled[0] = rules.autoReleaseEnabled();
                    Map<String, Object> details = new LinkedHashMap<>();
                    details.put("enabled", enabled[0]);
                    if (!enabled[0]) {
                        return details;
                    }
                    for (UUID id : payments.reminderCandidates(rules.releaseReminderHours())) {
                        if (payments.remind(id)) {
                            counts[0]++;
                        }
                    }
                    for (UUID id : payments.releaseCandidates()) {
                        try {
                            if (payments.autoRelease(id)) {
                                counts[1]++;
                            }
                        } catch (RuntimeException e) {
                            counts[2]++;
                            log.warn(
                                    "Automatic release of payment {} failed: {}",
                                    id,
                                    e.getClass().getSimpleName());
                        }
                    }
                    details.put("reminded", counts[0]);
                    details.put("released", counts[1]);
                    details.put("failed", counts[2]);
                    return details;
                });
        return new Result(enabled[0], counts[0], counts[1], counts[2]);
    }
}
