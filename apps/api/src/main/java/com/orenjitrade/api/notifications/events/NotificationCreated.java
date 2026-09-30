package com.orenjitrade.api.notifications.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction that stored a notification (Spring Modulith registry): the
 * notifications module's own dispatcher fans it out after commit (realtime queue, push, email).
 * Carries ids only.
 *
 * @param notificationId the stored notification
 * @param userId recipient
 * @param type notification type name
 * @param createdAt creation time
 */
public record NotificationCreated(
        UUID notificationId, UUID userId, String type, Instant createdAt) {}
