package com.orenjitrade.api.location.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a collector sets or changes their location. Carries the codes only, never the city
 * (ADR 0017).
 */
public record LocationChangedEvent(
        UUID userId,
        String regionCode,
        String countryCode,
        String subdivisionCode,
        Instant occurredAt) {}
