package com.orenjitrade.api.auth.domain;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * SPI through which a module names the accounts it stores by id (the admin console's "Changed by
 * Rosa Lima", the audit log's "Who"; spec 15.8: never a raw id). Implemented by the users module,
 * so no module depends on it for a name. Never a place: a handle, a display name and the staff
 * role.
 */
public interface AccountNames {

    /**
     * The names of the given accounts; ids without an account are absent from the result.
     *
     * @param userIds the account ids
     */
    Map<UUID, AccountName> namesOf(Collection<UUID> userIds);

    /**
     * The account with this handle (case-insensitive, without the "@"), if any.
     *
     * @param handle the handle
     */
    Optional<UUID> idOfHandle(String handle);

    /** The name of one account, if it exists. */
    default Optional<AccountName> nameOf(@Nullable UUID userId) {
        if (userId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(namesOf(java.util.List.of(userId)).get(userId));
    }

    /**
     * How the console names an account.
     *
     * @param handle the handle
     * @param displayName the display name, {@code null} when none
     * @param staffRole the highest staff role ({@code SUPER_ADMIN}, {@code ADMIN} or {@code
     *     MODERATOR}), {@code null} for a collector
     */
    record AccountName(String handle, @Nullable String displayName, @Nullable Role staffRole) {}
}
