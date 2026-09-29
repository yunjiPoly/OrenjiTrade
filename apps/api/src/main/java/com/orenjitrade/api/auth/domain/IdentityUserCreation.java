package com.orenjitrade.api.auth.domain;

import org.jspecify.annotations.Nullable;

/** Attributes of an identity-provider user to create (seeding, local emulator only). */
public record IdentityUserCreation(
        String providerUid,
        String email,
        String password,
        @Nullable String displayName,
        boolean emailVerified) {

    @Override
    public String toString() {
        // Never print the password.
        return "IdentityUserCreation[providerUid=" + providerUid + ", email=" + email + "]";
    }
}
