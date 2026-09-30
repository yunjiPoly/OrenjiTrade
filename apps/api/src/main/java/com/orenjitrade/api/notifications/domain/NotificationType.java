package com.orenjitrade.api.notifications.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

/**
 * Notification types (Phase 6 contract). Each type belongs to a preference category (channels per
 * category in {@code notification_preferences}); {@link #SYSTEM} notices are in-app only and not
 * configurable per category. Types with a daily limit key are counted per UTC day against the
 * caller's plan ({@code usage_limit}, ADR 0014).
 */
@Schema(name = "NotificationType")
public enum NotificationType {
    WISHLIST_MATCH(NotificationCategory.WISHLIST_MATCH, "wishlist.alerts.per_day"),
    MESSAGE(NotificationCategory.MESSAGE, null),
    OFFER_RECEIVED(NotificationCategory.OFFER, null),
    OFFER_ACCEPTED(NotificationCategory.OFFER, null),
    OFFER_COUNTERED(NotificationCategory.OFFER, null),
    OFFER_DECLINED(NotificationCategory.OFFER, null),
    /** The buyer withdrew an open offer (Phase 8). */
    OFFER_CANCELLED(NotificationCategory.OFFER, null),
    /** An offer ran past its expiry without an answer (Phase 8 hourly job). */
    OFFER_EXPIRED(NotificationCategory.OFFER, null),
    BINDER_EXPIRING(NotificationCategory.BINDER_FRESHNESS, null),
    BINDER_STALE_WARNING(NotificationCategory.BINDER_FRESHNESS, null),
    BINDER_HIDDEN(NotificationCategory.BINDER_FRESHNESS, null),
    RATING_RECEIVED(NotificationCategory.RATING, null),
    TRADE_UPDATE(NotificationCategory.TRADE, null),
    SHIPMENT_STATUS(NotificationCategory.TRADE, null),
    PAYMENT_UPDATE(NotificationCategory.TRADE, null),
    REPORT_DECISION(NotificationCategory.REPORT_DECISION, null),
    SYSTEM(null, null);

    private final @Nullable NotificationCategory category;
    private final @Nullable String dailyLimitKey;

    NotificationType(@Nullable NotificationCategory category, @Nullable String dailyLimitKey) {
        this.category = category;
        this.dailyLimitKey = dailyLimitKey;
    }

    /** The preference category, {@code null} for {@link #SYSTEM}. */
    public @Nullable NotificationCategory category() {
        return category;
    }

    /** The {@code usage_limit} key counting notifications of this type per day, if any. */
    public @Nullable String dailyLimitKey() {
        return dailyLimitKey;
    }
}
