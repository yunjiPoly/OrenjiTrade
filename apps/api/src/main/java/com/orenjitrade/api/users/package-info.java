/**
 * Users module.
 *
 * <p>User accounts, roles (USER, PREMIUM_USER, MODERATOR, ADMIN, SUPER_ADMIN), suspension, terms
 * acceptance and the account deletion framework.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Users")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.users;
