package com.orenjitrade.api.profiles.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A collector's public profile was opened by someone other than its owner ({@code GET
 * /collectors/{handle}}). An in-process notification for the analytics module (plain listener,
 * never persisted): it carries ids and the target's region and subdivision codes only, never a city
 * or a coordinate (ADR 0017). The analytics module pseudonymises the ids.
 *
 * @param viewerId the viewer, {@code null} for signed-out visitors
 * @param collectorId the collector whose profile was viewed
 * @param regionCode the collector's platform region while discoverable
 * @param subdivisionCode the collector's subdivision code while discoverable
 * @param occurredAt when
 */
public record CollectorProfileViewed(
        @Nullable UUID viewerId,
        UUID collectorId,
        @Nullable String regionCode,
        @Nullable String subdivisionCode,
        Instant occurredAt) {}
