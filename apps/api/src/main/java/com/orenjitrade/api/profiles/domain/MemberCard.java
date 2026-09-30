package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * How a member appears next to their messages and posts (Phase 5): handle, display name and avatar
 * plus the account state and privacy switches other modules need to apply the privacy matrix. Never
 * contains a location.
 *
 * @param id account id
 * @param handle handle
 * @param displayName profile display name (account name or handle when no profile was saved)
 * @param avatarUrl avatar URL, when uploaded
 * @param status account status
 * @param suspendedUntil end of a temporary suspension
 * @param privacy privacy switches (defaults when never saved)
 * @param profileComplete whether the member saved their profile
 */
public record MemberCard(
        UUID id,
        String handle,
        String displayName,
        @Nullable String avatarUrl,
        AccountStatus status,
        @Nullable Instant suspendedUntil,
        PrivacySettingsView privacy,
        boolean profileComplete) {

    /** Whether the account can take part right now (active, or its suspension is over). */
    public boolean activeAt(Instant now) {
        return switch (status) {
            case ACTIVE -> true;
            case SUSPENDED -> suspendedUntil != null && !suspendedUntil.isAfter(now);
            case DELETION_REQUESTED, DELETED -> false;
        };
    }
}
