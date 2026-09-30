/**
 * Moderation module.
 *
 * <p>Moderator tooling shared by reports, community and messaging: actions, notes and escalation.
 * {@code TextModerationService} (banned terms), {@code ModerationService} (Phase 5 hooks: rate
 * rules, banned terms, repeated content; flags) and the flag queue {@code /admin/moderation/flags}.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Moderation")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.moderation;
