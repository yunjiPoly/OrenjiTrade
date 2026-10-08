package com.orenjitrade.api.location.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a collector's location is deleted (owner request or purge); the profiles module
 * turns discoverability off in the same transaction.
 */
public record LocationRemovedEvent(UUID userId, Instant occurredAt) {}
