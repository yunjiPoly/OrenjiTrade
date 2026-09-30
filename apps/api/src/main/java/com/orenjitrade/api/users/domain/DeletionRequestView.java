package com.orenjitrade.api.users.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Detached view of an {@link AccountDeletionRequest} for controllers and other modules. */
public record DeletionRequestView(
        UUID id,
        UUID userId,
        DeletionRequestStatus status,
        @Nullable String reason,
        boolean exportRequested,
        Instant requestedAt,
        Instant scheduledFor,
        @Nullable Instant cancelledAt,
        @Nullable Instant completedAt) {}
