package com.orenjitrade.api.location.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published when a collector's trading area or public visibility changes. Carries no coordinates
 * (ADR 0004): only the grid cell id, {@code null} while the collector is not on the map.
 */
public record TradingAreaChangedEvent(UUID userId, @Nullable String gridCell, Instant occurredAt) {}
