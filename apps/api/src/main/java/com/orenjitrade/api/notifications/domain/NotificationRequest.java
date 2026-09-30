package com.orenjitrade.api.notifications.domain;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * What another module asks {@link NotificationService#notify} to deliver.
 *
 * @param userId recipient
 * @param type notification type (decides the preference category and the daily limit)
 * @param title short title (at most 200 characters, trimmed beyond)
 * @param body text (at most 1 000 characters, trimmed beyond)
 * @param data ids of the objects concerned and a {@code deepLink}; string, number and boolean
 *     values only, never coordinates, message text or private notes
 * @param dedupKey idempotency key: a second request with the same key is a no-op
 */
public record NotificationRequest(
        UUID userId,
        NotificationType type,
        String title,
        String body,
        Map<String, @Nullable Object> data,
        String dedupKey) {

    public NotificationRequest {
        data = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(data));
    }
}
