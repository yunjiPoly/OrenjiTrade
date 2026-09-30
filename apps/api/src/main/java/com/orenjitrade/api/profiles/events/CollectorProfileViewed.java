package com.orenjitrade.api.profiles.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A collector's public profile was opened by someone other than its owner ({@code GET
 * /collectors/{handle}}). An in-process notification for the analytics module (plain listener,
 * never persisted): it carries ids and the target's public grid cell / region label only, never a
 * coordinate (ADR 0004). The analytics module pseudonymises the ids.
 *
 * @param viewerId the viewer, {@code null} for signed-out visitors
 * @param collectorId the collector whose profile was viewed
 * @param gridCell the collector's public grid cell while discoverable
 * @param regionLabel the collector's public region label while discoverable
 * @param occurredAt when
 */
public record CollectorProfileViewed(
        @Nullable UUID viewerId,
        UUID collectorId,
        @Nullable String gridCell,
        @Nullable String regionLabel,
        Instant occurredAt) {}
