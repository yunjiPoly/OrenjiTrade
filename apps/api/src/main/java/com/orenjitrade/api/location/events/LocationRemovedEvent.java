package com.orenjitrade.api.location.events;

import java.time.Instant;
import java.util.UUID;

/** Published when every location row of a collector is deleted (owner request or purge). */
public record LocationRemovedEvent(UUID userId, Instant occurredAt) {}
