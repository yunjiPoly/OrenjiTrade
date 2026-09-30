package com.orenjitrade.api.users.events;

import java.time.Instant;
import java.util.UUID;

/** Published when a suspension is lifted by an admin or expires. */
public record UserUnsuspendedEvent(UUID userId, Instant occurredAt) {}
