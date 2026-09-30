package com.orenjitrade.api.auth.domain;

import java.time.Instant;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * What an identity provider asserted about the caller after the ID token was verified.
 *
 * @param providerUid the provider's stable user id (Firebase {@code uid})
 * @param email primary email, when known
 * @param emailVerified whether the provider verified that email
 * @param authTime when the user actually authenticated (not when the token was minted)
 * @param signInProvider e.g. {@code password}, {@code google.com}, {@code apple.com}
 * @param secondFactorUsed whether a second factor was used for this session (admin routes)
 * @param claims every claim of the token, for adapters that need more (never logged)
 */
public record VerifiedIdentity(
        String providerUid,
        @Nullable String email,
        boolean emailVerified,
        Instant authTime,
        @Nullable String signInProvider,
        boolean secondFactorUsed,
        Map<String, Object> claims) {

    public VerifiedIdentity {
        claims = Map.copyOf(claims);
    }

    /** The {@code name} claim when present (used as the initial display name). */
    public @Nullable String displayName() {
        Object name = claims.get("name");
        return name instanceof String value && !value.isBlank() ? value : null;
    }
}
