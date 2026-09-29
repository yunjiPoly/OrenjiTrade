package com.orenjitrade.api.notifications.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Kinds of notification a collector can tune per channel. */
@Schema(name = "NotificationCategory")
public enum NotificationCategory {
    WISHLIST_MATCH,
    MESSAGE,
    OFFER,
    RATING,
    TRADE,
    BINDER_FRESHNESS,
    REPORT_DECISION,
    MARKETING;

    /** Default channels: everything on except email, and marketing fully off (opt-in only). */
    public ChannelPreferences defaults() {
        return this == MARKETING
                ? new ChannelPreferences(false, false, false)
                : new ChannelPreferences(true, false, true);
    }
}
