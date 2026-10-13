package com.orenjitrade.api.location.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A {@code user_location} row as read inside the location module, with the names of its country and
 * subdivision. {@link #toString()} leaves the city out: it is never logged.
 */
public record StoredLocation(
        UUID userId,
        PublicPlace place,
        @Nullable String city,
        boolean showCity,
        Instant updatedAt) {

    @Override
    public String toString() {
        return "StoredLocation[userId=" + userId + ", subdivision=" + place.subdivisionCode() + "]";
    }
}
