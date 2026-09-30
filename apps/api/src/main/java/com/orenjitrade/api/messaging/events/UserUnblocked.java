package com.orenjitrade.api.messaging.events;

import java.time.Instant;
import java.util.UUID;

/** Published when a collector lifts a block. */
public record UserUnblocked(UUID blockerId, UUID blockedId, Instant occurredAt) {}
