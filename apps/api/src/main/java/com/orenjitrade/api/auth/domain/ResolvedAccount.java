package com.orenjitrade.api.auth.domain;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** The account facts the auth module needs to build an {@link AuthenticatedUser}. */
public record ResolvedAccount(
        UUID userId,
        String handle,
        @Nullable String email,
        boolean emailVerified,
        AccountStatus status,
        @Nullable Instant suspendedUntil,
        Set<Role> roles) {

    public ResolvedAccount {
        roles = Set.copyOf(roles);
    }
}
