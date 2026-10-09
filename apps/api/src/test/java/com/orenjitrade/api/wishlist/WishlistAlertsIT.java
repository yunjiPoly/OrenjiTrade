package com.orenjitrade.api.wishlist;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.wishlist.domain.WishlistService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Wishlist alerts (stage S2, replacing the matches feature; ADR 0017): a public listing in the wish
 * owner's platform region that fits a wish (printing, or any printing of the card in the wished
 * rarity, Near Mint or better when asked) creates one WISHLIST_ALERT naming the seller's
 * state/province and country and linking to the card page with the wish's selection; listings from
 * another region, a blocked collector, a non-discoverable or private listing, a worse condition for
 * a Near Mint wish, another rarity, or the owner's own never alert; owners without a location get
 * nothing; the one notification switch turns alerts off; one item never alerts one collector twice
 * (republication, several fitting wishes).
 */
class WishlistAlertsIT extends AbstractWishlistIT {

    @Autowired private WishlistService wishlistService;

    @Test
    void aListingInTheRegionAlertsTheWishOwnerWithTheCardPageLink() {
        Place place = americasNorth();
        Collector wisher = collector("wa-wisher", place);
        Collector seller = collector("wa-seller", place);
        UUID azure = printing(AZURE);
        Map<String, Object> body = wish(azure, true);
        body.put("note", "Public wisher note");
        String wishId = createWish(wisher, body).path("id").asString();

        Map<String, Object> fields = offered("NEAR_MINT", "45.00", "TRADE_OR_SALE");
        fields.put("notes", "Seller private note");
        String itemId = publicItem(seller, azure, fields);
        awaitEventsProcessed(itemId);

        List<JsonNode> alerts = notificationsOfType(wisher, "WISHLIST_ALERT");
        assertThat(alerts).hasSize(1);
        JsonNode alert = alerts.get(0);
        String name = cardNameOf(azure);
        assertThat(alert.path("title").asString()).isEqualTo("Wishlist alert: " + name);
        assertThat(alert.path("body").asString())
                .isEqualTo(
                        name
                                + " "
                                + codeOf(azure)
                                + " Ultra Rare was just listed by @"
                                + seller.handle()
                                + " in Quebec, Canada.")
                .doesNotContain("km");
        JsonNode data = alert.path("data");
        assertThat(data.path("wishlistItemId").asString()).isEqualTo(wishId);
        assertThat(data.path("inventoryItemId").asString()).isEqualTo(itemId);
        assertThat(data.path("collectorId").asString()).isEqualTo(seller.id().toString());
        assertThat(data.path("cardId").asString()).isEqualTo(cardOf(azure).toString());
        assertThat(data.path("printingId").asString()).isEqualTo(azure.toString());
        assertThat(data.has("matchId")).isFalse();
        assertThat(data.path("regionCode").asString()).isEqualTo("americas-north");
        assertThat(data.path("deepLink").asString())
                .isEqualTo("/cards/" + cardOf(azure) + "?printing=" + azure);
        assertCardPicture(alert, name);
        assertThat(alert.path("readAt").isNull()).isTrue();
        assertAtMostThreeDecimals(alert, "notification");
        assertThat(alert.toString())
                .doesNotContain("Seller private note")
                .doesNotContain("Public wisher note");
        assertThat(unreadCount(wisher)).isEqualTo(1);
        assertThat(sentAlerts(wisher.id())).isEqualTo(1);

        // The seller is not alerted about their own listing.
        assertThat(storedNotifications(seller.id(), "WISHLIST_ALERT")).isZero();
    }

    @Test
    void anotherRegionBlockedPrivateHiddenAndOwnListingsDoNotAlert() {
        Place place = americasNorth();
        Collector wisher = collector("wa-strict", place);
        Collector far = collector("wa-far", europe());
        Collector blocked = collector("wa-blocked", place);
        Collector blocker = collector("wa-blocker", place);
        Collector hidden = collector("wa-hidden", place);
        Collector near = collector("wa-near", place);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + blocked.id() + "/block",
                wisher.uid(),
                null,
                200);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + wisher.id() + "/block",
                blocker.uid(),
                null,
                200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                hidden.uid(),
                // Public profile, not discoverable: the listing is public, the collector not.
                com.orenjitrade.api.inventory.InventoryTestSupport.privacy(false, "PUBLIC"),
                200);
        UUID azure = printing(AZURE);
        createWish(wisher, wish(azure, true));

        List<String> none =
                List.of(
                        publicItem(far, azure, offered("NEAR_MINT", "45.00", "SALE")),
                        publicItem(blocked, azure, offered("NEAR_MINT", "45.00", "SALE")),
                        publicItem(blocker, azure, offered("NEAR_MINT", "45.00", "SALE")),
                        publicItem(hidden, azure, offered("NEAR_MINT", "45.00", "SALE")),
                        publicItem(near, printing(AZURE_FR), offered("MINT", "10.00", "SALE")),
                        publicItem(wisher, azure, offered("NEAR_MINT", "45.00", "SALE")));
        Map<String, Object> privateFields = offered("NEAR_MINT", "45.00", "SALE");
        privateFields.put("visibility", "PRIVATE");
        privateFields.put("printingId", azure.toString());
        callJson(HttpMethod.POST, "/api/v1/inventory/items", near.uid(), privateFields, 201);
        // Any price, availability and condition fit a wish without "Near Mint only".
        String fits = publicItem(near, azure, offered("DAMAGED", null, "COLLECTION_ONLY"));
        for (String id : none) {
            awaitEventsProcessed(id);
        }
        awaitEventsProcessed(fits);

        List<JsonNode> alerts = notificationsOfType(wisher, "WISHLIST_ALERT");
        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).path("data").path("inventoryItemId").asString()).isEqualTo(fits);
        assertThat(storedNotifications(far.id(), "WISHLIST_ALERT")).isZero();
    }

    @Test
    void anotherRegionsWisherIsNotAlertedAboutAListingHere() {
        Collector farWisher = collector("wa-far-wisher", europe());
        Collector seller = collector("wa-here-seller", americasNorth());
        Collector sameRegion = collector("wa-eu-seller", europe());
        UUID azure = printing(AZURE);
        createWish(farWisher, wish(cardOf(azure), false));

        String here = publicItem(seller, azure, offered("NEAR_MINT", "20.00", "SALE"));
        awaitEventsProcessed(here);
        assertThat(storedNotifications(farWisher.id(), "WISHLIST_ALERT")).isZero();

        String there = publicItem(sameRegion, azure, offered("NEAR_MINT", "20.00", "SALE"));
        awaitEventsProcessed(there);
        List<JsonNode> alerts = notificationsOfType(farWisher, "WISHLIST_ALERT");
        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).path("body").asString()).endsWith(" in Île-de-France, France.");
        assertThat(alerts.get(0).path("data").path("regionCode").asString()).isEqualTo("europe");
        assertThat(alerts.get(0).path("data").path("deepLink").asString())
                .as("any printing: the card page without a selection")
                .isEqualTo("/cards/" + cardOf(azure));
    }

    @Test
    void nearMintOnlyAndRarityWishesFilterListings() {
        Place place = americasNorth();
        Collector nmWisher = collector("wa-nm", place);
        Collector rarityWisher = collector("wa-rarity", place);
        Collector seller = collector("wa-filter-seller", place);
        UUID azure = printing(AZURE);
        UUID secret = rarityPrinting(AZURE, "Secret Rare");
        UUID card = cardOf(azure);

        Map<String, Object> nearMint = wish(card, false);
        nearMint.put("nearMintOnly", true);
        createWish(nmWisher, nearMint);
        Map<String, Object> secretOnly = wish(card, false);
        secretOnly.put("rarity", "Secret Rare");
        createWish(rarityWisher, secretOnly);

        String played = publicItem(seller, azure, offered("LIGHTLY_PLAYED", "20.00", "SALE"));
        String nearMintCopy = publicItem(seller, azure, offered("NEAR_MINT", "20.00", "SALE"));
        String mintSecret = publicItem(seller, secret, offered("MINT", "90.00", "SALE"));
        for (String id : List.of(played, nearMintCopy, mintSecret)) {
            awaitEventsProcessed(id);
        }

        assertThat(
                        notificationsOfType(nmWisher, "WISHLIST_ALERT").stream()
                                .map(n -> n.path("data").path("inventoryItemId").asString())
                                .toList())
                .as("Near Mint or better only")
                .containsExactlyInAnyOrder(nearMintCopy, mintSecret);
        List<JsonNode> rarityAlerts = notificationsOfType(rarityWisher, "WISHLIST_ALERT");
        assertThat(rarityAlerts).hasSize(1);
        JsonNode alert = rarityAlerts.get(0);
        assertThat(alert.path("data").path("inventoryItemId").asString()).isEqualTo(mintSecret);
        assertThat(alert.path("body").asString()).contains(" Secret Rare was just listed by @");
        assertThat(alert.path("data").path("deepLink").asString())
                .isEqualTo("/cards/" + card + "?rarity=Secret%20Rare");
    }

    @Test
    void oneItemNeverAlertsOneCollectorTwice() {
        Place place = americasNorth();
        Collector wisher = collector("wa-idem", place);
        Collector seller = collector("wa-idem-seller", place);
        UUID azure = printing(AZURE);
        UUID card = cardOf(azure);
        // Two fitting wishes: one printing and any printing.
        String exact = createWish(wisher, wish(azure, true)).path("id").asString();
        createWish(wisher, wish(card, false));

        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(itemId);
        List<JsonNode> alerts = notificationsOfType(wisher, "WISHLIST_ALERT");
        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).path("data").path("wishlistItemId").asString())
                .as("the most specific wish")
                .isEqualTo(exact);

        // Private, then public again: a second InventoryItemPublished for the same item.
        visibility(seller, itemId, "PRIVATE");
        visibility(seller, itemId, "PUBLIC");
        awaitEventsProcessed(itemId);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM event_publication WHERE"
                                        + " serialized_event LIKE ? AND listener_id LIKE"
                                        + " '%WishlistInventoryListener%'",
                                "%" + itemId + "%"))
                .as("the alerts saw both publications")
                .isEqualTo(2);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_ALERT")).isEqualTo(1);
        assertThat(sentAlerts(wisher.id())).isEqualTo(1);

        // Even when the notification itself is gone, the sent-alert key keeps it at one.
        testUsers.update(
                "DELETE FROM notification WHERE user_id = ? AND type = 'WISHLIST_ALERT'",
                wisher.id());
        visibility(seller, itemId, "PRIVATE");
        visibility(seller, itemId, "PUBLIC");
        awaitEventsProcessed(itemId);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_ALERT")).isZero();
    }

    @Test
    void ownersWithoutALocationOrWithAlertsOffGetNoAlerts() {
        Place place = americasNorth();
        Collector seller = collector("wa-off-seller", place);
        Collector switchedOff = collector("wa-off", place);
        String nowhereUid = uniqueUid("wa-nowhere");
        UUID nowhereId = provisionCompliantWithoutLocation(nowhereUid);
        Collector nowhere =
                new Collector(nowhereUid, nowhereId, me(nowhereUid).path("handle").asString());
        UUID azure = printing(AZURE);
        createWish(switchedOff, wish(azure, true));
        createWish(nowhere, wish(azure, true));
        wishlistAlerts(switchedOff, false);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/me/settings/notifications",
                                        switchedOff.uid(),
                                        null,
                                        200)
                                .path("wishlistAlerts")
                                .asBoolean())
                .isFalse();

        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(itemId);
        assertThat(storedNotifications(switchedOff.id(), "WISHLIST_ALERT")).isZero();
        assertThat(storedNotifications(nowhere.id(), "WISHLIST_ALERT")).isZero();
        assertThat(sentAlerts(nowhere.id())).as("no location, no candidate").isZero();

        // Switched back on: the next listing alerts.
        wishlistAlerts(switchedOff, true);
        String next = publicItem(seller, azure, offered("NEAR_MINT", "31.00", "SALE"));
        awaitEventsProcessed(next);
        assertThat(storedNotifications(switchedOff.id(), "WISHLIST_ALERT")).isEqualTo(1);
    }

    @Test
    void accountDeletionForgetsTheSentAlertKeys() {
        Place place = americasNorth();
        Collector wisher = collector("wa-purge", place);
        Collector seller = collector("wa-purge-seller", place);
        UUID azure = printing(AZURE);
        createWish(wisher, wish(azure, true));
        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(itemId);
        assertThat(sentAlerts(wisher.id())).isEqualTo(1);

        wishlistService.purge(wisher.id()); // the wishlist's account deletion participant
        assertThat(sentAlerts(wisher.id())).isZero();
        assertThat(callJson(HttpMethod.GET, "/api/v1/wishlist", wisher.uid(), null, 200)).isEmpty();
    }

    private void visibility(Collector owner, String itemId, String visibility) {
        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + itemId,
                owner.uid(),
                Map.of("visibility", visibility),
                200);
    }
}
