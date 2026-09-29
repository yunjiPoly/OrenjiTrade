/**
 * Messaging module.
 *
 * <p>Private conversations and messages, blocking, realtime delivery over WebSocket (STOMP) with
 * Redis fan-out.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Messaging")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.messaging;
