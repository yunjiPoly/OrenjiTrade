/**
 * Auth module.
 *
 * Identity verification: Firebase ID token verification (IdentityTokenVerifier), the bearer token
 * filter, the AuthenticatedUser principal and first-login provisioning. Never trusts
 * client-provided user ids (ADR 0008).
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Auth")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.auth;
