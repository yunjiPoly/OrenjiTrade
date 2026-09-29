package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import org.jspecify.annotations.Nullable;

/**
 * Filters of the admin user list; every field is optional.
 *
 * @param query case-insensitive substring of handle, email or display name
 * @param status exact status
 * @param role accounts holding this role
 */
public record AdminUserQuery(
        @Nullable String query, @Nullable AccountStatus status, @Nullable Role role) {}
