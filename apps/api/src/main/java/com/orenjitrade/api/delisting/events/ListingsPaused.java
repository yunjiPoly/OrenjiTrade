package com.orenjitrade.api.delisting.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published inside the transaction that paused a collector's public listings (Spring Modulith
 * registry): the inventory module re-evaluates the owner's listings, the notifications module tells
 * the owner. Never carries the moderator's reason.
 *
 * @param userId the collector
 * @param source {@code PauseSource} name
 * @param strikes strikes that triggered an UNRESPONSIVE pause, otherwise {@code null}
 * @param pausedAt when
 */
public record ListingsPaused(
        UUID userId, String source, @Nullable Integer strikes, Instant pausedAt) {}
