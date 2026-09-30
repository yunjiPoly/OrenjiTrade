package com.orenjitrade.api.users.events;

import com.orenjitrade.api.auth.domain.Role;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/** Published when an admin changes the role set of an account. */
public record UserRolesChangedEvent(
        UUID userId, Set<Role> previousRoles, Set<Role> roles, Instant occurredAt) {}
