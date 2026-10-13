package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.featureflags.domain.FeatureFlags;
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
 * wishlist.alerts.per_day: FREE 5, PREMIUM unlimited): beyond the limit wishlist alerts are held
 * back and a single "more alerts" SYSTEM notice is created per day. The notice invites to upgrade
 * only while the {@code premiumPlans} flag is on (off by the V105 launch configuration).
 */
class NotificationLimitIT extends AbstractWishlistIT {

    @Autowired private FeatureFlags featureFlags;

    @AfterEach
    void premiumPlansOff() {
        premiumPlans(false);
    }

    @Test
    void freeCollectorsGetFiveAlertsAndASingleNoticePerDayWithoutAPremiumPitchWhileTheFlagIsOff() {
        Place place = americasNorth();
        Collector wisher = collector("nl-free", place);
        Collector seller = collector("nl-free-seller", place);
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
        assertThat(notices).as("one upgrade notice for the day").hasSize(1);
        JsonNode notice = notices.get(0);
        assertThat(notice.path("title").asString()).isEqualTo("More wishlist alerts are waiting");
        assertThat(notice.path("body").asString()).contains("limit of 5 wishlist alerts");
        JsonNode data = notice.path("data");
        assertThat(data.path("kind").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(data.path("notificationType").asString()).isEqualTo("WISHLIST_ALERT");
        assertThat(data.path("limitKey").asString()).isEqualTo("wishlist.alerts.per_day");
        assertThat(data.path("limit").asInt()).isEqualTo(5);
        assertThat(data.path("planCode").asString()).isEqualTo("FREE");
        // Launch configuration: nothing offers a subscription while premiumPlans is off.
        assertThat(notice.path("body").asString()).doesNotContainIgnoringCase("premium");
        assertThat(notice.path("body").asString()).contains("resets tomorrow");
        assertThat(data.has("upgradeUrl")).isFalse();
        assertThat(data.has("deepLink")).isFalse();
        assertThat(unreadCount(wisher)).isEqualTo(6);
    }

    @Test
    void theNoticeInvitesToUpgradeWhilePremiumPlansIsOn() {
        premiumPlans(true);
        Place place = americasNorth();
        Collector wisher = collector("nl-pitch", place);
        Collector seller = collector("nl-pitch-seller", place);
        UUID azure = printing(AZURE);
        createWish(wisher, wish(azure, true));

        publishSequentially(seller, azure, 6);

        List<JsonNode> notices = notificationsOfType(wisher, "SYSTEM");
        assertThat(notices).hasSize(1);
        JsonNode notice = notices.get(0);
        assertThat(notice.path("body").asString()).contains("upgrade to Premium");
        assertThat(notice.path("data").path("upgradeUrl").asString()).isEqualTo("/premium");
        assertThat(notice.path("data").path("deepLink").asString()).isEqualTo("/premium");
    }

    private void premiumPlans(boolean enabled) {
        testUsers.update(
                "UPDATE feature_flag SET enabled = ?, rollout_percent = 100 WHERE key ="
                        + " 'premiumPlans'",
                enabled);
        featureFlags.invalidate();
    }

    @Test
    void premiumCollectorsAreNotLimited() {
        Place place = americasNorth();
        Collector wisher = collector("nl-premium", place);
        testUsers.update("UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", wisher.id());
        Collector seller = collector("nl-premium-seller", place);
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
