package com.orenjitrade.api.messaging.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a collector blocks another one (wishlist alerts and notifications of later phases
 * skip blocked pairs). The optional reason is never part of the event.
 */
public record UserBlocked(UUID blockerId, UUID blockedId, Instant occurredAt) {}
