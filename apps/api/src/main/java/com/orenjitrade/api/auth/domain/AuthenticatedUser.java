package com.orenjitrade.api.auth.domain;

import java.security.Principal;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The principal of an authenticated collector request: the account (as loaded for this request)
 * plus session facts from the ID token. Inject in controllers with {@code @AuthenticationPrincipal
 * AuthenticatedUser}. Never trust a client-provided user id instead of {@link #userId()}.
 *
 * @param userId our account id
 * @param providerUid identity-provider uid
 * @param email account email, when known
 * @param emailVerified whether the provider verified the email
 * @param handle current handle
 * @param roles roles held at the time of the request
 * @param status account status at the time of the request
 * @param suspendedUntil end of a temporary suspension, when suspended
 * @param authTime when the user last authenticated with the provider
 * @param secondFactorUsed whether the session used a second factor (required for admin routes in
 *     deployed environments)
 */
public record AuthenticatedUser(
        UUID userId,
        String providerUid,
        @Nullable String email,
        boolean emailVerified,
        String handle,
        Set<Role> roles,
        AccountStatus status,
        @Nullable Instant suspendedUntil,
        Instant authTime,
        boolean secondFactorUsed)
        implements Principal {

    public AuthenticatedUser {
        roles = Set.copyOf(roles);
    }

    @Override
    public String getName() {
        return userId.toString();
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

    public boolean isAdmin() {
        return hasAnyRole(Role.ADMIN, Role.SUPER_ADMIN);
    }

    /** Whether a suspension is in force at {@code now}. */
    public boolean isSuspendedAt(Instant now) {
        return status == AccountStatus.SUSPENDED
                && (suspendedUntil == null || suspendedUntil.isAfter(now));
    }

    @Override
    public String toString() {
        // Compact and PII-free (no email) for logs.
        return "AuthenticatedUser[userId="
                + userId
                + ", handle="
                + handle
                + ", roles="
                + roles
                + "]";
    }
}
