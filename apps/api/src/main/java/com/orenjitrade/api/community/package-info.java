/**
 * Community module.
 *
 * <p>Public community channels and posts (per game, region, looking-for, new listings, trades,
 * general), Phase 5: {@code CommunityService} (channels, posts, replies, edits, deletions,
 * moderator console, one region channel per platform region), gated by the {@code publicChat}
 * feature flag, moderated through the moderation module. Publishes {@code CommunityPostCreated}.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Community")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.community;
