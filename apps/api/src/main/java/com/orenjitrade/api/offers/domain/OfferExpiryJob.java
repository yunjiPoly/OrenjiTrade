package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.jobs.domain.JobRunService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;

/**
 * The hourly {@code offers-expire} job (Phase 8 contract): live OPEN / COUNTERED proposals past
 * their {@code expires_at} become EXPIRED (history entry, both parties notified). Batches of {@link
 * OfferService#EXPIRY_BATCH} in their own transactions; recorded as a {@code job_run}. Triggered by
 * {@code POST /internal/jobs/offers-expire} (Cloud Scheduler) and, under the {@code local} profile,
 * by {@code OfferExpiryScheduler}.
 */
@Component
public class OfferExpiryJob {

    public static final String NAME = "offers-expire";

    /** Safety bound of batches per run. */
    static final int MAX_BATCHES = 100;

    private final OfferService offerService;
    private final JobRunService jobRunService;

    public OfferExpiryJob(OfferService offerService, JobRunService jobRunService) {
        this.offerService = offerService;
        this.jobRunService = jobRunService;
    }

    /** Runs the job; returns the number of proposals expired. */
    public int run() {
        AtomicInteger expired = new AtomicInteger();
        jobRunService.run(
                NAME,
                () -> {
                    for (int batch = 0; batch < MAX_BATCHES; batch++) {
                        List<UUID> ids = offerService.expireDue();
                        expired.addAndGet(ids.size());
                        if (ids.size() < OfferService.EXPIRY_BATCH) {
                            break;
                        }
                    }
                    return Map.of("expired", expired.get());
                });
        return expired.get();
    }
}
