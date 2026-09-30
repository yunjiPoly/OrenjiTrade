package com.orenjitrade.api.delisting.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction that lifted (or found expired) the pause of a collector's public
 * listings: the inventory module re-evaluates the owner's listings.
 *
 * @param userId the collector
 * @param source {@code PauseSource} name of the lifted pause
 * @param resumedAt when
 */
public record ListingsResumed(UUID userId, String source, Instant resumedAt) {}
