package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.jobs.domain.JobRunService;
import com.orenjitrade.api.wishlist.infra.WishlistMatchRepository;
import com.orenjitrade.api.wishlist.infra.WishlistRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The nightly {@code wishlist-rematch} job (Phase 6 contract safety net), recorded as a {@code
 * job_run}: re-runs the matching of inventory items published in the last {@link #WINDOW} (a lost
 * {@code InventoryItemPublished} still notifies; matches and notifications are idempotent) and of
 * wishlist items edited in that window. Triggered by {@code POST /internal/jobs/wishlist-rematch}
 * (Cloud Scheduler) and, under the {@code local} profile, by {@code WishlistRematchScheduler}. Each
 * item is matched in its own transaction, so one failure never blocks the rest.
 */
@Component
public class WishlistRematchJob {

    public static final String NAME = "wishlist-rematch";

    /** Look-back window. */
    public static final Duration WINDOW = Duration.ofHours(24);

    /** Safety bound per run and side. */
    static final int MAX_ITEMS = 5_000;

    private static final Logger log = LoggerFactory.getLogger(WishlistRematchJob.class);

    private final WishlistMatchRepository matches;
    private final WishlistRepository wishlist;
    private final WishlistMatcher matcher;
    private final JobRunService jobRunService;
    private final TimeProvider timeProvider;

    public WishlistRematchJob(
            WishlistMatchRepository matches,
            WishlistRepository wishlist,
            WishlistMatcher matcher,
            JobRunService jobRunService,
            TimeProvider timeProvider) {
        this.matches = matches;
        this.wishlist = wishlist;
        this.matcher = matcher;
        this.jobRunService = jobRunService;
        this.timeProvider = timeProvider;
    }

    public Result run() {
        AtomicReference<Result> result = new AtomicReference<>();
        jobRunService.run(
                NAME,
                () -> {
                    Result outcome = rematch(timeProvider.now().minus(WINDOW));
                    result.set(outcome);
                    return outcome.asMap();
                });
        return result.get();
    }

    private Result rematch(Instant since) {
        int inventoryItems = 0;
        int created = 0;
        int notified = 0;
        int failures = 0;
        for (UUID itemId : matches.itemsPublishedSince(since, MAX_ITEMS)) {
            try {
                WishlistMatcher.MatchRun run = matcher.matchPublishedItem(itemId);
                inventoryItems++;
                created += run.created();
                notified += run.notified();
            } catch (RuntimeException e) {
                failures++;
                log.warn("Rematch of inventory item {} failed: {}", itemId, e.getMessage());
            }
        }
        int wishlistItems = 0;
        List<UUID> edited = wishlist.activeUpdatedSince(since, MAX_ITEMS);
        for (UUID wishlistItemId : edited) {
            try {
                matcher.matchWishlistItem(wishlistItemId);
                wishlistItems++;
            } catch (RuntimeException e) {
                failures++;
                log.warn("Rematch of wishlist item {} failed: {}", wishlistItemId, e.getMessage());
            }
        }
        return new Result(inventoryItems, wishlistItems, created, notified, failures);
    }

    /**
     * Outcome of one run (also stored in {@code job_run.details}).
     *
     * @param inventoryItems recently published items re-matched
     * @param wishlistItems recently edited wishlist items re-matched
     * @param matchesCreated new matches of published items (the notifications a lost event missed)
     * @param notified new matches notified
     * @param failures items whose matching failed
     */
    public record Result(
            int inventoryItems, int wishlistItems, int matchesCreated, int notified, int failures) {

        public Map<String, Object> asMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("inventoryItems", inventoryItems);
            map.put("wishlistItems", wishlistItems);
            map.put("matchesCreated", matchesCreated);
            map.put("notified", notified);
            map.put("failures", failures);
            return map;
        }
    }
}
