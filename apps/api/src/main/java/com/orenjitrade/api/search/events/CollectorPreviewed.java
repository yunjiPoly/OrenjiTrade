package com.orenjitrade.api.search.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A collector's map preview was opened by someone else ({@code GET /collectors/{handle}/preview}).
 * An in-process notification for the analytics module (plain listener, never persisted): the
 * collector's public grid cell and region label only, never a coordinate.
 *
 * @param viewerId the viewer, {@code null} for signed-out visitors
 * @param collectorId the previewed collector
 * @param gridCell the collector's public grid cell
 * @param regionLabel the collector's public region label
 * @param occurredAt when
 */
public record CollectorPreviewed(
        @Nullable UUID viewerId,
        UUID collectorId,
        @Nullable String gridCell,
        @Nullable String regionLabel,
        Instant occurredAt) {}
