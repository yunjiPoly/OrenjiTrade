/**
 * Auth module.
 *
 * <p>Identity verification and request-level access control (ADR 0008): {@code
 * IdentityTokenVerifier} (Firebase Admin SDK, static stub under the {@code test} profile), the
 * bearer token filter and {@code AuthenticatedUser} principal, the RBAC vocabulary ({@code Role},
 * {@code AccountStatus}), the admin MFA authorization rule, service authentication for {@code
 * /internal/**} (shared token or Google OIDC), account-state enforcement and rate limiting. Never
 * trusts client-provided user ids.
 *
 * <p>Layout: {@code domain/} (SPI interfaces, principal, value objects), {@code infra/} (Firebase,
 * static and Google OIDC adapters, properties), {@code web/} (servlet filters and authorization
 * managers), {@code ratelimit/} (policies, Redis counter, filter). The users module implements the
 * {@code AccountResolver} SPI; this module depends on no business module.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Auth")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.auth;
