package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.wishlist.domain.WishlistRematchJob;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Local stand-in for Cloud Scheduler: runs the {@code wishlist-rematch} job daily under the {@code
 * local} profile (deployed environments call {@code POST /internal/jobs/wishlist-rematch} nightly).
 */
@Component
@Profile("local")
public class WishlistRematchScheduler {

    private final WishlistRematchJob job;

    public WishlistRematchScheduler(WishlistRematchJob job) {
        this.job = job;
    }

    @Scheduled(initialDelayString = "PT15M", fixedDelayString = "P1D")
    public void run() {
        job.run();
    }
}
