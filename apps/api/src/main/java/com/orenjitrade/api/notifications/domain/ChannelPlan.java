package com.orenjitrade.api.notifications.domain;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Which channels a notification uses, decided once when it is created (pure; {@link #of}).
 *
 * @param inApp whether the notification appears in the in-app centre (and realtime queue)
 * @param push {@link DeliveryState#PENDING} when a push is due, else {@link DeliveryState#SKIPPED}
 * @param pushReason why push is skipped ({@code DISABLED}, {@code QUIET_HOURS}), {@code null} when
 *     due
 * @param email {@link DeliveryState#PENDING} when an email is due, else {@link
 *     DeliveryState#SKIPPED}
 * @param emailReason why email is skipped ({@code DISABLED}), {@code null} when due
 */
public record ChannelPlan(
        boolean inApp,
        DeliveryState push,
        @Nullable String pushReason,
        DeliveryState email,
        @Nullable String emailReason) {

    public static final String REASON_DISABLED = "DISABLED";
    public static final String REASON_QUIET_HOURS = "QUIET_HOURS";
    public static final String REASON_NO_TOKENS = "NO_TOKENS";
    public static final String REASON_NO_EMAIL = "NO_EMAIL";

    /** Delivery state of one channel. */
    public enum DeliveryState {
        PENDING,
        SENT,
        FAILED,
        SKIPPED
    }

    /** The channels of wishlist alerts while their switch is on: in-app and push, never email. */
    static final ChannelPreferences WISHLIST_ALERT_CHANNELS =
            new ChannelPreferences(true, false, true);

    /** No channel (a switch is off). */
    static final ChannelPreferences NO_CHANNEL = new ChannelPreferences(false, false, false);

    /**
     * The channels of a notification of {@code type} under {@code settings} at {@code now}: the
     * master switch and the category switch must both be on; push is skipped during quiet hours
     * (in-app and email are not); {@link NotificationType#WISHLIST_ALERT} follows the one {@code
     * wishlistAlerts} switch (in-app and push); {@link NotificationType#SYSTEM} notices are in-app
     * only.
     */
    public static ChannelPlan of(
            NotificationSettings settings, NotificationType type, Instant now) {
        @Nullable NotificationCategory category = type.category();
        if (type == NotificationType.WISHLIST_ALERT) {
            return of(
                    settings,
                    settings.wishlistAlerts() ? WISHLIST_ALERT_CHANNELS : NO_CHANNEL,
                    now);
        }
        if (category == null) {
            return new ChannelPlan(
                    settings.inAppEnabled(),
                    DeliveryState.SKIPPED,
                    REASON_DISABLED,
                    DeliveryState.SKIPPED,
                    REASON_DISABLED);
        }
        return of(settings, settings.categories().get(category), now);
    }

    private static ChannelPlan of(
            NotificationSettings settings, ChannelPreferences channels, Instant now) {
        boolean inApp = settings.inAppEnabled() && channels.inApp();
        DeliveryState push = DeliveryState.SKIPPED;
        @Nullable String pushReason = REASON_DISABLED;
        if (settings.pushEnabled() && channels.push()) {
            if (QuietHoursRules.isQuiet(settings.quietHours(), now)) {
                pushReason = REASON_QUIET_HOURS;
            } else {
                push = DeliveryState.PENDING;
                pushReason = null;
            }
        }
        boolean email = settings.emailEnabled() && channels.email();
        return new ChannelPlan(
                inApp,
                push,
                pushReason,
                email ? DeliveryState.PENDING : DeliveryState.SKIPPED,
                email ? null : REASON_DISABLED);
    }

    /**
     * Whether the collector wants this notification at all: in-app, email, or push (even when push
     * is held back by quiet hours). Nothing is stored or counted otherwise.
     */
    public boolean wanted() {
        return inApp
                || push == DeliveryState.PENDING
                || REASON_QUIET_HOURS.equals(pushReason)
                || email == DeliveryState.PENDING;
    }
}
