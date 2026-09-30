package com.orenjitrade.api.notifications.domain;

import java.util.UUID;

/**
 * Transactional email abstraction (Phase 6 contract): {@code LogEmailProvider} by default (local,
 * tests and every environment until a real adapter is configured, {@code EMAIL_PROVIDER=log}).
 * Implementations never throw for delivery problems; they answer {@code false}.
 */
public interface EmailProvider {

    /** Provider name for logs and channel state ({@code log}). */
    String name();

    /** Sends one email; whether the provider accepted it. */
    boolean send(EmailMessage message);

    /**
     * A notification email (plain text).
     *
     * @param notificationId the stored notification
     * @param type notification type
     * @param to verified recipient address
     * @param subject subject line
     * @param text plain-text body
     */
    record EmailMessage(
            UUID notificationId, NotificationType type, String to, String subject, String text) {}
}
