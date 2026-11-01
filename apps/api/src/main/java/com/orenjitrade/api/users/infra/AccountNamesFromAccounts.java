package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.auth.domain.AccountNames;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.users.domain.UserAccount;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Users-module implementation of {@link AccountNames} (the admin console names accounts). */
@Component
public class AccountNamesFromAccounts implements AccountNames {

    private final UserAccountRepository repository;

    public AccountNamesFromAccounts(UserAccountRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, AccountName> namesOf(Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, AccountName> names = new HashMap<>();
        for (UserAccount account : repository.findWithRolesByIdIn(Set.copyOf(userIds))) {
            names.put(
                    account.getId(),
                    new AccountName(
                            account.getHandle(),
                            account.getDisplayName(),
                            staffRole(account.roleSet())));
        }
        return names;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> idOfHandle(String handle) {
        String bare = handle.strip();
        if (bare.startsWith("@")) {
            bare = bare.substring(1);
        }
        if (bare.isEmpty()) {
            return Optional.empty();
        }
        return repository.findWithRolesByHandleIgnoreCase(bare).map(UserAccount::getId);
    }

    /** The highest staff role, {@code null} for a collector. */
    static @Nullable Role staffRole(Set<Role> roles) {
        if (roles.contains(Role.SUPER_ADMIN)) {
            return Role.SUPER_ADMIN;
        }
        if (roles.contains(Role.ADMIN)) {
            return Role.ADMIN;
        }
        return roles.contains(Role.MODERATOR) ? Role.MODERATOR : null;
    }
}
