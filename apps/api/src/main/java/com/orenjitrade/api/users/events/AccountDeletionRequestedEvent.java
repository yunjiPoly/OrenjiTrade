package com.orenjitrade.api.users.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when the owner asks for account deletion. The grace period ends at {@code
 * scheduledFor}; public traces are already hidden by the deletion participants.
 */
public record AccountDeletionRequestedEvent(
        UUID userId, UUID requestId, Instant scheduledFor, Instant occurredAt) {}
