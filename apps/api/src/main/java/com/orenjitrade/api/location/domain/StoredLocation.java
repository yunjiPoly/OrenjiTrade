package com.orenjitrade.api.location.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A {@code user_location} row as read inside the location module. Contains the PRIVATE trading-area
 * centre: never serialise it for anyone but its owner and never log it ({@link #toString()} is
 * redacted). {@code home_point} is deliberately not loaded at all.
 */
public record StoredLocation(
        UUID userId,
        double centreLat,
        double centreLng,
        int radiusMeters,
        TradingAreaSource source,
        @Nullable PublicPoint publicPoint,
        @Nullable String publicLabel,
        @Nullable String gridCell,
        Instant updatedAt) {

    public int radiusKm() {
        return radiusMeters / 1000;
    }

    @Override
    public String toString() {
        return "StoredLocation[userId=" + userId + ", gridCell=" + gridCell + "]";
    }
}
