package com.orenjitrade.api.auth.domain;

import java.util.Set;

/** RBAC roles stored in {@code user_role}. Every account always keeps {@link #USER}. */
public enum Role {
    USER,
    PREMIUM_USER,
    MODERATOR,
    ADMIN,
    SUPER_ADMIN;

    /** Roles that only a {@link #SUPER_ADMIN} may grant or revoke. */
    public static final Set<Role> PRIVILEGED = Set.of(ADMIN, SUPER_ADMIN);

    /** Spring Security authority name ({@code ROLE_<name>}). */
    public String authority() {
        return "ROLE_" + name();
    }

    public boolean isPrivileged() {
        return PRIVILEGED.contains(this);
    }
}
