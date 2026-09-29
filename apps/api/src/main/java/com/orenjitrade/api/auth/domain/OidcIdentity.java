package com.orenjitrade.api.auth.domain;

import org.jspecify.annotations.Nullable;

/**
 * The verified subject of a Google OIDC token.
 *
 * @param subject the {@code sub} claim
 * @param email the {@code email} claim (service-account email), when present
 * @param emailVerified the {@code email_verified} claim
 */
public record OidcIdentity(String subject, @Nullable String email, boolean emailVerified) {}
