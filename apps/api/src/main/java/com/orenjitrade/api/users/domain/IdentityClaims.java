package com.orenjitrade.api.users.domain;

import org.jspecify.annotations.Nullable;

/**
 * The identity-provider attributes the users module needs to provision or refresh an account.
 * Deliberately decoupled from the auth module's verified-token type so users never depends on auth.
 *
 * @param providerUid stable identity-provider user id
 * @param email primary email when the provider knows one
 * @param emailVerified whether the provider verified that email
 * @param displayName provider display name, used as the initial display name
 */
public record IdentityClaims(
        String providerUid,
        @Nullable String email,
        boolean emailVerified,
        @Nullable String displayName) {}
