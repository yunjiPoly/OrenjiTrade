package com.orenjitrade.api.users.events;

import java.time.Instant;
import java.util.UUID;

/** Published when the owner cancels a pending deletion; the account is active again. */
public record AccountDeletionCancelledEvent(UUID userId, UUID requestId, Instant occurredAt) {}
