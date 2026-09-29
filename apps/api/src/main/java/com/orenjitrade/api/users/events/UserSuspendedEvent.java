package com.orenjitrade.api.users.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published when an admin suspends an account. Listeners (inventory, location, messaging) hide the
 * collector's public data.
 */
public record UserSuspendedEvent(UUID userId, @Nullable Instant until, Instant occurredAt) {}
