package com.orenjitrade.api.delisting.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A collector's listing health: the pause of their public listings and their unresponsiveness
 * strikes.
 *
 * @param userId the collector
 * @param paused whether a pause is in force now
 * @param source why (while paused)
 * @param reason moderator/admin reason (while paused; admin views only)
 * @param pausedAt start of the pause
 * @param pausedUntil optional end of the pause
 * @param strikes current strikes
 * @param unansweredConversations30d unanswered conversations of the last 30 days
 * @param maxStrikes strikes that pause the listings (active policy)
 * @param evaluatedAt last nightly evaluation
 */
public record ListingStatus(
        UUID userId,
        boolean paused,
        @Nullable PauseSource source,
        @Nullable String reason,
        @Nullable Instant pausedAt,
        @Nullable Instant pausedUntil,
        int strikes,
        int unansweredConversations30d,
        int maxStrikes,
        @Nullable Instant evaluatedAt) {

    /** Whether the owner can lift the pause by confirming. */
    public boolean canResume() {
        return paused && source != null && source.ownerCanResume();
    }
}
