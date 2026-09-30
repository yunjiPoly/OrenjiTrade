/**
 * Messaging module.
 *
 * <p>Private conversations and messages, blocking, realtime delivery over WebSocket (STOMP) with
 * Redis fan-out (Phase 5). {@code ConversationService} (list, start, messages, send, read markers,
 * mute/archive), {@code BlockService} (also the {@code BlockRelationProvider} of the profiles
 * module), {@code ImageUploadService} ({@code POST /uploads/images}, upload-cleanup job), the STOMP
 * endpoint {@code /ws} ({@code RealtimeConfig}: handshake and CONNECT authentication, own-queue
 * subscriptions only, Redis channel {@code rt:user:{userId}}, presence keys). Publishes {@code
 * MessageSent}, {@code MessageRead}, {@code UserBlocked} and {@code UserUnblocked}; message text
 * never leaves the module except to the two participants. Phase 8: OFFER_LINK messages and SYSTEM
 * messages posted by the offers and trades modules ({@code ConversationService.postSystemMessage},
 * idempotent per key); the linked offer's live state comes from the {@code OfferLinkResolver}
 * extension point (implemented by the offers module).
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Messaging")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.messaging;
