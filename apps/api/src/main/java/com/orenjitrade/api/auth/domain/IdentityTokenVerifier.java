package com.orenjitrade.api.auth.domain;

/**
 * Verifies a bearer ID token and returns what the identity provider asserts (ADR 0008). Firebase in
 * every deployed environment, a static stub under the {@code test} profile.
 */
public interface IdentityTokenVerifier {

    /**
     * @param token the raw bearer token
     * @return the verified identity
     * @throws InvalidIdentityTokenException when the token is malformed, expired, revoked or
     *     otherwise not acceptable
     */
    VerifiedIdentity verify(String token);
}
