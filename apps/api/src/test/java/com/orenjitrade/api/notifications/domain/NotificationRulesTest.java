package com.orenjitrade.api.notifications.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.notifications.domain.ChannelPlan.DeliveryState;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Pure notification rules: channel plans from preferences (master and category switches, the one
 * wishlist alerts switch, push held back during quiet hours, SYSTEM notices in-app only), quiet
 * hours in the collector's zone (including periods across midnight), the initial channel state and
 * the message phrases.
 */
class NotificationRulesTest {

    /** 2026-09-30T03:30Z = 23:30 in America/Toronto (EDT, UTC-4). */
    private static final Instant NIGHT = Instant.parse("2026-09-30T03:30:00Z");

    /** 2026-09-30T16:00Z = 12:00 in America/Toronto. */
    private static final Instant NOON = Instant.parse("2026-09-30T16:00:00Z");

    private static final QuietHours NIGHTS =
            new QuietHours(true, "22:00", "08:00", "America/Toronto");

    @Test
    void defaultsGiveInAppAndPushButNoEmail() {
        ChannelPlan plan =
                ChannelPlan.of(
                        NotificationSettings.defaults(), NotificationType.WISHLIST_ALERT, NOON);
        assertThat(plan.inApp()).isTrue();
        assertThat(plan.push()).isEqualTo(DeliveryState.PENDING);
        assertThat(plan.pushReason()).isNull();
        assertThat(plan.email()).isEqualTo(DeliveryState.SKIPPED);
        assertThat(plan.emailReason()).isEqualTo(ChannelPlan.REASON_DISABLED);
        assertThat(plan.wanted()).isTrue();
        assertThat(NotificationService.initialChannelState(plan))
                .containsEntry("realtime", "PENDING")
                .containsEntry("push", "PENDING")
                .containsEntry("email", "SKIPPED")
                .containsEntry("emailReason", "DISABLED")
                .doesNotContainKey("pushReason");
    }

    @Test
    void quietHoursHoldPushBackOnly() {
        NotificationSettings settings =
                settings(true, true, true, channels(true, true, true), NIGHTS);
        ChannelPlan night = ChannelPlan.of(settings, NotificationType.MESSAGE, NIGHT);
        assertThat(night.push()).isEqualTo(DeliveryState.SKIPPED);
        assertThat(night.pushReason()).isEqualTo(ChannelPlan.REASON_QUIET_HOURS);
        assertThat(night.inApp()).isTrue();
        assertThat(night.email()).isEqualTo(DeliveryState.PENDING);

        ChannelPlan noon = ChannelPlan.of(settings, NotificationType.MESSAGE, NOON);
        assertThat(noon.push()).isEqualTo(DeliveryState.PENDING);

        // Push only, held back: still wanted (in-app off, nothing else), so it is stored.
        NotificationSettings pushOnly =
                settings(true, false, false, channels(true, false, false), NIGHTS);
        ChannelPlan held = ChannelPlan.of(pushOnly, NotificationType.MESSAGE, NIGHT);
        assertThat(held.inApp()).isFalse();
        assertThat(held.wanted()).isTrue();
    }

    @Test
    void disabledCategoriesAndMasterSwitchesSuppressEverything() {
        NotificationSettings off =
                settings(true, true, true, channels(false, false, false), QuietHours.DEFAULT);
        ChannelPlan plan = ChannelPlan.of(off, NotificationType.MESSAGE, NOON);
        assertThat(plan.wanted()).isFalse();
        // Other categories keep their defaults.
        assertThat(ChannelPlan.of(off, NotificationType.OFFER_RECEIVED, NOON).wanted()).isTrue();

        NotificationSettings masterOff =
                settings(false, false, false, channels(true, true, true), QuietHours.DEFAULT);
        assertThat(ChannelPlan.of(masterOff, NotificationType.WISHLIST_ALERT, NOON).wanted())
                .isFalse();
        // Binder freshness shares one category.
        NotificationSettings freshnessOff =
                new NotificationSettings(
                        true,
                        false,
                        true,
                        Map.of(
                                NotificationCategory.BINDER_FRESHNESS,
                                new ChannelPreferences(false, false, false)),
                        QuietHours.DEFAULT,
                        true);
        assertThat(ChannelPlan.of(freshnessOff, NotificationType.BINDER_HIDDEN, NOON).wanted())
                .isFalse();
        assertThat(
                        ChannelPlan.of(freshnessOff, NotificationType.BINDER_STALE_WARNING, NOON)
                                .wanted())
                .isFalse();
    }

    @Test
    void systemNoticesAreInAppOnly() {
        ChannelPlan plan =
                ChannelPlan.of(NotificationSettings.defaults(), NotificationType.SYSTEM, NOON);
        assertThat(plan.inApp()).isTrue();
        assertThat(plan.push()).isEqualTo(DeliveryState.SKIPPED);
        assertThat(plan.email()).isEqualTo(DeliveryState.SKIPPED);
        NotificationSettings inAppOff =
                new NotificationSettings(true, true, false, Map.of(), QuietHours.DEFAULT, true);
        assertThat(ChannelPlan.of(inAppOff, NotificationType.SYSTEM, NOON).wanted()).isFalse();
        assertThat(NotificationType.SYSTEM.category()).isNull();
        assertThat(NotificationType.WISHLIST_ALERT.dailyLimitKey())
                .isEqualTo("wishlist.alerts.per_day");
        assertThat(NotificationType.MESSAGE.dailyLimitKey()).isNull();
    }

    @Test
    void wishlistAlertsFollowTheirOneSwitchInAppAndPushNeverEmail() {
        NotificationSettings everything =
                settings(true, true, true, channels(true, true, true), QuietHours.DEFAULT);
        ChannelPlan on = ChannelPlan.of(everything, NotificationType.WISHLIST_ALERT, NOON);
        assertThat(on.inApp()).isTrue();
        assertThat(on.push()).isEqualTo(DeliveryState.PENDING);
        assertThat(on.email()).as("never email").isEqualTo(DeliveryState.SKIPPED);
        assertThat(NotificationType.WISHLIST_ALERT.category()).isNull();

        NotificationSettings switchedOff =
                new NotificationSettings(true, true, true, Map.of(), QuietHours.DEFAULT, false);
        assertThat(ChannelPlan.of(switchedOff, NotificationType.WISHLIST_ALERT, NOON).wanted())
                .isFalse();
        assertThat(ChannelPlan.of(switchedOff, NotificationType.MESSAGE, NOON).wanted())
                .as("other kinds keep their channels")
                .isTrue();

        // The master switches and quiet hours still apply.
        NotificationSettings nights =
                new NotificationSettings(true, false, false, Map.of(), NIGHTS, true);
        ChannelPlan held = ChannelPlan.of(nights, NotificationType.WISHLIST_ALERT, NIGHT);
        assertThat(held.inApp()).isFalse();
        assertThat(held.pushReason()).isEqualTo(ChannelPlan.REASON_QUIET_HOURS);
        assertThat(held.wanted()).isTrue();
    }

    @Test
    void quietHoursRules() {
        assertThat(QuietHoursRules.isQuiet(NIGHTS, NIGHT)).isTrue();
        assertThat(QuietHoursRules.isQuiet(NIGHTS, NOON)).isFalse();
        // 07:59 and 08:00 local.
        assertThat(QuietHoursRules.isQuiet(NIGHTS, Instant.parse("2026-09-30T11:59:00Z"))).isTrue();
        assertThat(QuietHoursRules.isQuiet(NIGHTS, Instant.parse("2026-09-30T12:00:00Z")))
                .isFalse();
        // 22:00 local is quiet.
        assertThat(QuietHoursRules.isQuiet(NIGHTS, Instant.parse("2026-09-30T02:00:00Z"))).isTrue();

        QuietHours afternoon = new QuietHours(true, "13:00", "17:00", "UTC");
        assertThat(QuietHoursRules.isQuiet(afternoon, NOON)).isTrue();
        assertThat(QuietHoursRules.isQuiet(afternoon, NIGHT)).isFalse();

        assertThat(QuietHoursRules.isQuiet(new QuietHours(false, "00:00", "23:59", "UTC"), NOON))
                .as("disabled")
                .isFalse();
        assertThat(QuietHoursRules.isQuiet(new QuietHours(true, "10:00", "10:00", "UTC"), NOON))
                .as("empty period")
                .isFalse();
        assertThat(QuietHoursRules.isQuiet(new QuietHours(true, "25:00", "08:00", "UTC"), NOON))
                .as("malformed time")
                .isFalse();
        assertThat(
                        QuietHoursRules.isQuiet(
                                new QuietHours(true, "15:00", "17:00", "Mars/Olympus"), NOON))
                .as("unknown zone falls back to UTC")
                .isTrue();
    }

    @Test
    void messagePhrasesNeverQuoteTheMessage() {
        assertThat(ActivityNotifications.messagePhrase("TEXT")).isEqualTo("sent you a message");
        assertThat(ActivityNotifications.messagePhrase("card_link"))
                .isEqualTo("shared a card with you");
        assertThat(ActivityNotifications.messagePhrase("BINDER_LINK"))
                .isEqualTo("shared a binder with you");
        assertThat(ActivityNotifications.messagePhrase("IMAGE")).isEqualTo("sent you a photo");
        assertThat(ActivityNotifications.messagePhrase("OFFER_LINK"))
                .isEqualTo("sent you an offer");
        assertThat(ActivityNotifications.messagePhrase("SOMETHING_NEW"))
                .isEqualTo("sent you a message");
    }

    private static ChannelPreferences channels(boolean push, boolean email, boolean inApp) {
        return new ChannelPreferences(push, email, inApp);
    }

    private static NotificationSettings settings(
            boolean push,
            boolean email,
            boolean inApp,
            ChannelPreferences messages,
            QuietHours quietHours) {
        return new NotificationSettings(
                push,
                email,
                inApp,
                Map.of(NotificationCategory.MESSAGE, messages),
                quietHours,
                true);
    }
}
