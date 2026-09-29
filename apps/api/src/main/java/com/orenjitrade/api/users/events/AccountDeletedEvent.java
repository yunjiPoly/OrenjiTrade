package com.orenjitrade.api.users.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published by the deletion job once an account is anonymised and every participant purged.
 * Listeners must not try to load personal data of {@code userId}: there is none left.
 */
public record AccountDeletedEvent(UUID userId, UUID requestId, Instant occurredAt) {}
