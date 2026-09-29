/**
 * Profiles module.
 *
 * Public collector profiles: display name, avatar, bio, games of interest and tags.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Profiles")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.profiles;
