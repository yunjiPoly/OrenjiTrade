package com.orenjitrade.api.auth.domain;

import java.util.Optional;

/**
 * Verifies a Google-issued OIDC ID token presented to {@code /internal/**} (Cloud Scheduler,
 * Pub/Sub push subscriptions, service-to-service calls).
 */
public interface OidcTokenVerifier {

    /**
     * @return the verified identity, or empty when the token is invalid, expired, has the wrong
     *     audience or the OIDC path is not configured
     */
    Optional<OidcIdentity> verify(String token);
}
