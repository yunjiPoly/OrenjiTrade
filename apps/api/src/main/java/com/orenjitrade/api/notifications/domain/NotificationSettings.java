package com.orenjitrade.api.notifications.domain;

import java.util.EnumMap;
import java.util.Map;

/**
 * A collector's complete notification settings (defaults filled in).
 *
 * @param pushEnabled master switch for push notifications
 * @param emailEnabled master switch for email
 * @param inAppEnabled master switch for the in-app notification centre
 * @param categories every category with its channels, in {@link NotificationCategory} order
 * @param quietHours push-free period
 * @param wishlistAlerts the one on/off switch of wishlist alerts (in-app and push)
 */
public record NotificationSettings(
        boolean pushEnabled,
        boolean emailEnabled,
        boolean inAppEnabled,
        Map<NotificationCategory, ChannelPreferences> categories,
        QuietHours quietHours,
        boolean wishlistAlerts) {

    public NotificationSettings {
        EnumMap<NotificationCategory, ChannelPreferences> complete =
                new EnumMap<>(NotificationCategory.class);
        for (NotificationCategory category : NotificationCategory.values()) {
            complete.put(category, categories.getOrDefault(category, category.defaults()));
        }
        categories = complete;
    }

    public static NotificationSettings defaults() {
        return new NotificationSettings(true, false, true, Map.of(), QuietHours.DEFAULT, true);
    }
}
