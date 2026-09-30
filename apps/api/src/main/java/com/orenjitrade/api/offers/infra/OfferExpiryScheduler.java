package com.orenjitrade.api.offers.infra;

import com.orenjitrade.api.offers.domain.OfferExpiryJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code offers-expire} job every hour under the
 * {@code local} profile (deployed environments call {@code POST /internal/jobs/offers-expire}).
 */
@Component
@Profile("local")
public class OfferExpiryScheduler {

    private final OfferExpiryJob job;

    public OfferExpiryScheduler(OfferExpiryJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT2M", fixedDelayString = "PT1H")
    public void run() {
        job.run();
    }
}
