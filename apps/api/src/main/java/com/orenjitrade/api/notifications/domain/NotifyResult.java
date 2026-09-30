package com.orenjitrade.api.notifications.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Outcome of {@link NotificationService#notify}.
 *
 * @param outcome what happened
 * @param notificationId the stored notification ({@link Outcome#CREATED}, {@link
 *     Outcome#DUPLICATE}), otherwise {@code null}
 */
public record NotifyResult(Outcome outcome, @Nullable UUID notificationId) {

    /** What {@link NotificationService#notify} did. */
    public enum Outcome {
        /** A new notification was stored and will be dispatched. */
        CREATED,
        /** A notification with the same dedup key already exists; nothing changed. */
        DUPLICATE,
        /** The collector's preferences refuse every channel of this type; nothing stored. */
        SUPPRESSED,
        /**
         * The daily limit of the type is reached: nothing stored for this request; the single "more
         * matches, upgrade" notice of the day was created (or already existed).
         */
        LIMITED,
        /** The recipient is unknown, suspended, pending deletion or deleted. */
        RECIPIENT_UNAVAILABLE
    }

    /** Whether the collector has (or already had) a notification for this key. */
    public boolean delivered() {
        return outcome == Outcome.CREATED || outcome == Outcome.DUPLICATE;
    }
}
