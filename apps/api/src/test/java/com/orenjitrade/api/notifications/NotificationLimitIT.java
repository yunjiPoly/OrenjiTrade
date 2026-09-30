package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.wishlist.AbstractWishlistIT;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/**
 * The per-type daily notification limit (Phase 6 contract, {@code usage_limit}
 * wishlist.alerts.per_day: FREE 5, PREMIUM unlimited): beyond the limit matches are still stored
 * (not notified) and a single "more matches, upgrade" SYSTEM notice is created per day.
 */
class NotificationLimitIT extends AbstractWishlistIT {

    @Test
    void freeCollectorsGetFiveAlertsAndASingleUpgradeNoticePerDay() {
        Centre centre = randomCentre();
        Collector wisher = collector("nl-free", centre);
        Collector seller = collector("nl-free-seller", centre.offset(2, 1));
        UUID azure = printing(AZURE);
        String wishId = createWish(wisher, wish(azure, true)).path("id").asString();

        List<String> items = publishSequentially(seller, azure, 7);

        assertThat(storedMatches(wishId)).as("every match is kept").isEqualTo(7);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM wishlist_match WHERE wishlist_item_id ="
                                        + " ?::uuid AND notified",
                                wishId))
                .isEqualTo(5);
        List<JsonNode> alerts = notificationsOfType(wisher, "WISHLIST_MATCH");
        assertThat(alerts).hasSize(5);
        List<String> alerted = new ArrayList<>();
        alerts.forEach(node -> alerted.add(node.path("data").path("inventoryItemId").asString()));
        assertThat(alerted).containsExactlyInAnyOrderElementsOf(items.subList(0, 5));

        List<JsonNode> notices = notificationsOfType(wisher, "SYSTEM");
        assertThat(notices).as("one upgrade notice for the day").hasSize(1);
        JsonNode notice = notices.get(0);
        assertThat(notice.path("title").asString()).isEqualTo("More wishlist matches are waiting");
        assertThat(notice.path("body").asString()).contains("limit of 5 wishlist alerts");
        JsonNode data = notice.path("data");
        assertThat(data.path("kind").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(data.path("notificationType").asString()).isEqualTo("WISHLIST_MATCH");
        assertThat(data.path("limitKey").asString()).isEqualTo("wishlist.alerts.per_day");
        assertThat(data.path("limit").asInt()).isEqualTo(5);
        assertThat(data.path("planCode").asString()).isEqualTo("FREE");
        assertThat(data.path("deepLink").asString()).isNotBlank();
        assertThat(unreadCount(wisher)).isEqualTo(6);

        // The matches beyond the limit are still served on the wishlist.
        assertThat(matchedItems(wisher, wishId)).containsExactlyInAnyOrderElementsOf(items);
    }

    @Test
    void premiumCollectorsAreNotLimited() {
        Centre centre = randomCentre();
        Collector wisher = collector("nl-premium", centre);
        testUsers.update("UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", wisher.id());
        Collector seller = collector("nl-premium-seller", centre.offset(-2, 1));
        UUID azure = printing(AZURE);
        String wishId = createWish(wisher, wish(azure, true)).path("id").asString();

        publishSequentially(seller, azure, 7);

        assertThat(storedMatches(wishId)).isEqualTo(7);
        assertThat(notificationsOfType(wisher, "WISHLIST_MATCH")).hasSize(7);
        assertThat(notificationsOfType(wisher, "SYSTEM")).isEmpty();
    }

    /**
     * Publishes {@code count} matching items one after the other (each matched before the next).
     */
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
