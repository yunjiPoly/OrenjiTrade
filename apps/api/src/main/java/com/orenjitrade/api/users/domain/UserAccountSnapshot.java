package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Immutable, detached view of a {@link UserAccount} handed to other modules (auth filter, admin,
 * controllers). Contains no location data by construction.
 */
public record UserAccountSnapshot(
        UUID id,
        String providerUid,
        @Nullable String email,
        boolean emailVerified,
        String handle,
        @Nullable String displayName,
        AccountStatus status,
        @Nullable Instant suspendedUntil,
        @Nullable String suspensionReason,
        String planCode,
        Set<Role> roles,
        Instant createdAt,
        Instant updatedAt,
        @Nullable Instant lastActiveAt,
        @Nullable Instant deletedAt) {

    public UserAccountSnapshot {
        roles = Set.copyOf(roles);
    }

    public boolean hasRole(Role role) {
        return roles.contains(role);
    }

    public boolean hasAnyRole(Role... candidates) {
        for (Role candidate : candidates) {
            if (roles.contains(candidate)) {
                return true;
            }
        }
        return false;
    }

    /** Whether a suspension is in force at {@code now}. */
    public boolean isSuspendedAt(Instant now) {
        return status == AccountStatus.SUSPENDED
                && (suspendedUntil == null || suspendedUntil.isAfter(now));
    }
}
