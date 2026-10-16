package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.limits.domain.UsageLimitService;
import com.orenjitrade.api.wishlist.AbstractWishlistIT;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

/**
 * The per-type daily notification limit (Phase 6 contract, {@code usage_limit}
 * wishlist.alerts.per_day: 5 for every collector since stage F1): beyond the limit wishlist alerts
 * are held back and a single "more alerts" SYSTEM notice is created per day. The notice says when
 * the limit resets and links nowhere: nothing is sold to lift it (ADR 0019).
 */
class NotificationLimitIT extends AbstractWishlistIT {

    @Autowired private UsageLimitService usageLimits;

    @AfterEach
    void defaultLimit() {
        testUsers.update(
                "UPDATE usage_limit SET max_value = 5 WHERE limit_key = 'wishlist.alerts.per_day'");
        usageLimits.invalidate();
    }

    @Test
    void everyCollectorGetsFiveAlertsAndASinglePlainNoticePerDay() {
        Place place = americasNorth();
        Collector wisher = collector("nl-limit", place);
        Collector seller = collector("nl-limit-seller", place);
        UUID azure = printing(AZURE);
        createWish(wisher, wish(azure, true));

        List<String> items = publishSequentially(seller, azure, 7);

        assertThat(sentAlerts(wisher.id())).as("every listing was considered once").isEqualTo(7);
        List<JsonNode> alerts = notificationsOfType(wisher, "WISHLIST_ALERT");
        assertThat(alerts).hasSize(5);
        List<String> alerted = new ArrayList<>();
        alerts.forEach(node -> alerted.add(node.path("data").path("inventoryItemId").asString()));
        assertThat(alerted).containsExactlyInAnyOrderElementsOf(items.subList(0, 5));

        List<JsonNode> notices = notificationsOfType(wisher, "SYSTEM");
        assertThat(notices).as("one limit notice for the day").hasSize(1);
        JsonNode notice = notices.get(0);
        assertThat(notice.path("title").asString()).isEqualTo("More wishlist alerts are waiting");
        assertThat(notice.path("body").asString())
                .isEqualTo(
                        "You reached today's limit of 5 wishlist alerts. New listings still show"
                                + " on the card pages. The limit resets tomorrow.");
        JsonNode data = notice.path("data");
        assertThat(data.path("kind").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(data.path("notificationType").asString()).isEqualTo("WISHLIST_ALERT");
        assertThat(data.path("limitKey").asString()).isEqualTo("wishlist.alerts.per_day");
        assertThat(data.path("limit").asInt()).isEqualTo(5);
        assertThat(notice.path("body").asString())
                .doesNotContainIgnoringCase("premium")
                .doesNotContainIgnoringCase("plan")
                .doesNotContainIgnoringCase("upgrade");
        assertThat(data.has("planCode")).isFalse();
        assertThat(data.has("upgradeUrl")).isFalse();
        assertThat(data.has("deepLink")).isFalse();
        assertThat(unreadCount(wisher)).isEqualTo(6);
    }

    @Test
    void anUnlimitedSettingLetsEveryAlertThrough() {
        testUsers.update(
                "UPDATE usage_limit SET max_value = NULL WHERE limit_key ="
                        + " 'wishlist.alerts.per_day'");
        usageLimits.invalidate();
        Place place = americasNorth();
        Collector wisher = collector("nl-unlimited", place);
        Collector seller = collector("nl-unlimited-seller", place);
        UUID azure = printing(AZURE);
        createWish(wisher, wish(azure, true));

        publishSequentially(seller, azure, 7);

        assertThat(notificationsOfType(wisher, "WISHLIST_ALERT")).hasSize(7);
        assertThat(notificationsOfType(wisher, "SYSTEM")).isEmpty();
    }

    /** Publishes {@code count} fitting items one after the other (each alerted before the next). */
    private List<String> publishSequentially(Collector seller, UUID printingId, int count) {
        List<String> items = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            String itemId =
                    publicItem(seller, printingId, offered("NEAR_MINT", (20 + i) + ".00", "SALE"));
            awaitEventsProcessed(itemId);
            items.add(itemId);
        }
        return items;
    }
}
