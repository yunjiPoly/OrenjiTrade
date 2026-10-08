package com.orenjitrade.api.wishlist;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Event-driven wishlist matching (Phase 6 contract "Matching pipeline", ADR 0017): a publication in
 * the wisher's platform region creates one match and one WISHLIST_MATCH notification naming the
 * seller's state/province and country; publications from another region, from a blocked collector,
 * over the maximum price, in another currency, below the minimum condition, of the wrong language /
 * edition / rarity / availability or the wisher's own never match; a re-publication or the nightly
 * rematch never matches or notifies twice; dismissed matches stay dismissed; blocks hide existing
 * matches; the rematch job recovers a lost publication.
 */
class WishlistMatchingIT extends AbstractWishlistIT {

    @Test
    void aPublicationInTheRegionMatchesAndNotifiesTheWisher() {
        Place place = americasNorth();
        Collector wisher = collector("wm-wisher", place);
        Collector seller = collector("wm-seller", place);
        UUID azure = printing(AZURE);
        Map<String, Object> body = wish(azure, true);
        body.put("conditionMin", "LIGHTLY_PLAYED");
        body.put("maxPrice", new BigDecimal("60.00"));
        body.put("notes", "Wisher private note");
        String wishId = createWish(wisher, body).path("id").asString();

        Map<String, Object> fields = offered("NEAR_MINT", "45.00", "TRADE_OR_SALE");
        fields.put("notes", "Seller private note");
        String itemId = publicItem(seller, azure, fields);
        awaitEventsProcessed(itemId);

        JsonNode page = matches(wisher, wishId);
        assertThat(page.path("items")).hasSize(1);
        assertThat(page.path("nextCursor").isMissingNode() || page.path("nextCursor").isNull())
                .isTrue();
        JsonNode match = page.path("items").get(0);
        assertThat(match.path("wishlistItemId").asString()).isEqualTo(wishId);
        assertThat(match.path("item").path("id").asString()).isEqualTo(itemId);
        assertThat(match.path("item").path("condition").asString()).isEqualTo("NEAR_MINT");
        assertThat(match.path("collector").path("handle").asString()).isEqualTo(seller.handle());
        assertThat(match.path("dismissed").asBoolean()).isFalse();
        assertThat(match.path("matchedAt").asString()).isNotBlank();
        assertThat(match.has("distanceBucket")).isFalse();
        assertThat(match.path("collector").path("place").path("label").asString())
                .isEqualTo("Quebec, Canada");
        assertThat(match.path("collector").has("publicPoint")).isFalse();
        assertAtMostThreeDecimals(page, "matches");
        assertThat(page.toString())
                .doesNotContain("Seller private note")
                .doesNotContain("Wisher private note")
                .doesNotContain("tradingArea");

        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM wishlist_match WHERE wishlist_item_id ="
                                        + " ?::uuid AND notified",
                                wishId))
                .isEqualTo(1);
        JsonNode item =
                callJson(HttpMethod.GET, "/api/v1/wishlist", wisher.uid(), null, 200).get(0);
        assertThat(item.path("matchCount").asLong()).isEqualTo(1);
        assertThat(item.path("lastMatchedAt").asString()).isNotBlank();

        List<JsonNode> notified = notificationsOfType(wisher, "WISHLIST_MATCH");
        assertThat(notified).hasSize(1);
        JsonNode notification = notified.get(0);
        String name = cardNameOf(azure);
        assertThat(notification.path("title").asString()).isEqualTo("Wishlist match: " + name);
        assertThat(notification.path("body").asString())
                .isEqualTo(
                        name
                                + " "
                                + codeOf(azure)
                                + " was listed by @"
                                + seller.handle()
                                + " in Quebec, Canada for 45.00 CAD.")
                .doesNotContain("km");
        JsonNode data = notification.path("data");
        assertThat(data.path("wishlistItemId").asString()).isEqualTo(wishId);
        assertThat(data.path("inventoryItemId").asString()).isEqualTo(itemId);
        assertThat(data.path("matchId").asString()).isEqualTo(match.path("id").asString());
        assertThat(data.path("collectorId").asString()).isEqualTo(seller.id().toString());
        assertThat(data.has("distanceBucket")).isFalse();
        assertThat(data.path("regionCode").asString()).isEqualTo("americas-north");
        assertThat(data.path("deepLink").asString()).isEqualTo("/wishlist/" + wishId);
        assertCardPicture(notification, name);
        assertThat(notification.path("readAt").isNull()).isTrue();
        assertAtMostThreeDecimals(notification, "notification");
        assertThat(notification.toString())
                .doesNotContain("Seller private note")
                .doesNotContain("Wisher private note");
        assertThat(unreadCount(wisher)).isEqualTo(1);

        // The seller is not notified about their own publication.
        assertThat(storedNotifications(seller.id(), "WISHLIST_MATCH")).isZero();
    }

    @Test
    void otherRegionBlockedOverPricedWrongConditionAndOwnPublicationsDoNotMatch() {
        Place place = americasNorth();
        Collector wisher = collector("wm-strict", place);
        Collector near = collector("wm-near", place);
        Collector far = collector("wm-far", europe());
        Collector blocked = collector("wm-blocked", place);
        Collector blocker = collector("wm-blocker", place);
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
        UUID azure = printing(AZURE);
        Map<String, Object> body = wish(azure, true);
        body.put("conditionMin", "LIGHTLY_PLAYED");
        body.put("maxPrice", new BigDecimal("60.00"));
        String wishId = createWish(wisher, body).path("id").asString();

        List<String> none =
                List.of(
                        publicItem(far, azure, offered("NEAR_MINT", "45.00", "SALE")),
                        publicItem(blocked, azure, offered("NEAR_MINT", "45.00", "SALE")),
                        publicItem(blocker, azure, offered("NEAR_MINT", "45.00", "SALE")),
                        publicItem(near, azure, offered("NEAR_MINT", "80.00", "SALE")),
                        publicItem(near, azure, currency(offered("NEAR_MINT", "45.00", "SALE"))),
                        publicItem(near, azure, offered("MODERATELY_PLAYED", "45.00", "SALE")),
                        publicItem(near, printing(AZURE_FR), offered("MINT", "10.00", "SALE")),
                        publicItem(wisher, azure, offered("NEAR_MINT", "45.00", "SALE")));
        Map<String, Object> privateFields = offered("NEAR_MINT", "45.00", "SALE");
        privateFields.put("visibility", "PRIVATE");
        callJson(
                HttpMethod.POST,
                "/api/v1/inventory/items",
                near.uid(),
                withPrinting(azure, privateFields),
                201);
        String unpriced = publicItem(near, azure, offered("LIGHTLY_PLAYED", null, "TRADE"));
        String atTheLimit = publicItem(near, azure, offered("MINT", "60.00", "COLLECTION_ONLY"));
        for (String id : none) {
            awaitEventsProcessed(id);
        }
        awaitEventsProcessed(unpriced);
        awaitEventsProcessed(atTheLimit);

        assertThat(matchedItems(wisher, wishId)).containsExactlyInAnyOrder(unpriced, atTheLimit);
        assertThat(storedMatches(wishId)).isEqualTo(2);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH")).isEqualTo(2);
        for (JsonNode notification : notificationsOfType(wisher, "WISHLIST_MATCH")) {
            assertThat(notification.path("data").path("inventoryItemId").asString())
                    .isIn(unpriced, atTheLimit);
        }
    }

    @Test
    void tradePreferenceLanguageEditionAndRarityFiltersApply() {
        Place place = americasNorth();
        Collector wisher = collector("wm-filters", place);
        Collector seller = collector("wm-filter-seller", place);
        UUID azure = printing(AZURE);
        UUID french = printing(AZURE_FR);
        UUID card = cardOf(azure);

        Map<String, Object> tradeInFrench = wish(card, false);
        tradeInFrench.put("tradePreference", "TRADE");
        tradeInFrench.put("language", "fr");
        String tradeWish = createWish(wisher, tradeInFrench).path("id").asString();
        Map<String, Object> firstEdition = wish(card, false);
        firstEdition.put("edition", "FIRST_EDITION");
        firstEdition.put("tradePreference", "SALE");
        String editionWish = createWish(wisher, firstEdition).path("id").asString();
        Map<String, Object> common = wish(card, false);
        common.put("rarity", "Common");
        String rarityWish = createWish(wisher, common).path("id").asString();

        String frenchForSale = publicItem(seller, french, offered("NEAR_MINT", "20.00", "SALE"));
        String englishForTrade = publicItem(seller, azure, offered("NEAR_MINT", "20.00", "TRADE"));
        String frenchForBoth =
                publicItem(seller, french, offered("NEAR_MINT", "20.00", "TRADE_OR_SALE"));
        String englishForSale = publicItem(seller, azure, offered("NEAR_MINT", "20.00", "SALE"));
        for (String id : List.of(frenchForSale, englishForTrade, frenchForBoth, englishForSale)) {
            awaitEventsProcessed(id);
        }

        assertThat(matchedItems(wisher, tradeWish)).containsExactly(frenchForBoth);
        assertThat(matchedItems(wisher, editionWish)).containsExactly(englishForSale);
        assertThat(matchedItems(wisher, rarityWish)).isEmpty();
    }

    @Test
    void republicationAndRematchNeverMatchOrNotifyTwiceAndDismissedMatchesStayDismissed() {
        Place place = americasNorth();
        Collector wisher = collector("wm-idem", place);
        Collector seller = collector("wm-idem-seller", place);
        Collector stranger = collector("wm-idem-stranger", place);
        UUID azure = printing(AZURE);
        String wishId = createWish(wisher, wish(azure, true)).path("id").asString();
        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(itemId);
        assertThat(storedMatches(wishId)).isEqualTo(1);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH")).isEqualTo(1);

        // Private, then public again: a second InventoryItemPublished for the same pair.
        visibility(seller, itemId, "PRIVATE");
        assertThat(matchedItems(wisher, wishId)).as("not served while private").isEmpty();
        visibility(seller, itemId, "PUBLIC");
        awaitEventsProcessed(itemId);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM event_publication WHERE"
                                        + " serialized_event LIKE ? AND listener_id LIKE"
                                        + " '%WishlistInventoryListener%'",
                                "%" + itemId + "%"))
                .as("the matcher saw both publications")
                .isEqualTo(2);
        assertThat(storedMatches(wishId)).isEqualTo(1);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH")).isEqualTo(1);
        assertThat(matchedItems(wisher, wishId)).containsExactly(itemId);

        JsonNode rematch = runRematchJob();
        assertThat(rematch.path("inventoryItems").asInt()).isPositive();
        assertThat(rematch.path("failures").asInt()).isZero();
        assertThat(storedMatches(wishId)).isEqualTo(1);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH")).isEqualTo(1);

        // Dismiss: idempotent, owner only; hidden unless includeDismissed=true.
        String matchId = matches(wisher, wishId).path("items").get(0).path("id").asString();
        String dismiss = "/api/v1/wishlist/matches/" + matchId + "/dismiss";
        callJson(HttpMethod.POST, dismiss, stranger.uid(), null, 404);
        callJson(HttpMethod.POST, dismiss, null, null, 401);
        callJson(HttpMethod.POST, dismiss, wisher.uid(), null, 204);
        callJson(HttpMethod.POST, dismiss, wisher.uid(), null, 204);
        assertThat(matchedItems(wisher, wishId)).isEmpty();
        JsonNode all =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/wishlist/" + wishId + "/matches?includeDismissed=true",
                        wisher.uid(),
                        null,
                        200);
        assertThat(all.path("items")).hasSize(1);
        assertThat(all.path("items").get(0).path("dismissed").asBoolean()).isTrue();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/wishlist", wisher.uid(), null, 200)
                                .get(0)
                                .path("matchCount")
                                .asLong())
                .isZero();

        // Editing the wish keeps dismissed matches dismissed.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + wishId,
                wisher.uid(),
                Map.of("conditionMin", "LIGHTLY_PLAYED"),
                200);
        assertThat(matchedItems(wisher, wishId)).isEmpty();
        assertThat(storedMatches(wishId)).isEqualTo(1);
    }

    @Test
    void wishesMatchTheCurrentInventoryAtOnceWithoutNotificationAndFollowEdits() {
        Place place = americasNorth();
        Collector wisher = collector("wm-late", place);
        Collector seller = collector("wm-late-seller", place);
        UUID azure = printing(AZURE);
        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(itemId);

        JsonNode created = createWish(wisher, wish(azure, true));
        String wishId = created.path("id").asString();
        assertThat(created.path("matchCount").asLong()).isEqualTo(1);
        assertThat(created.path("lastMatchedAt").asString()).isNotBlank();
        assertThat(matchedItems(wisher, wishId)).containsExactly(itemId);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH"))
                .as("the collector is looking at the matches already")
                .isZero();

        // Criteria change: the match goes, and comes back.
        assertThat(
                        callJson(
                                        HttpMethod.PATCH,
                                        "/api/v1/wishlist/" + wishId,
                                        wisher.uid(),
                                        Map.of("conditionMin", "MINT"),
                                        200)
                                .path("matchCount")
                                .asLong())
                .isZero();
        assertThat(storedMatches(wishId)).isZero();
        assertThat(
                        callJson(
                                        HttpMethod.PATCH,
                                        "/api/v1/wishlist/" + wishId,
                                        wisher.uid(),
                                        Map.of("conditionMin", "NEAR_MINT"),
                                        200)
                                .path("matchCount")
                                .asLong())
                .isEqualTo(1);

        // Inactive wishes are not matched by new publications.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + wishId,
                wisher.uid(),
                Map.of("active", false),
                200);
        String later = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(later);
        assertThat(storedMatches(wishId)).isEqualTo(1);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH")).isZero();
    }

    @Test
    void blocksHideExistingMatches() {
        Place place = americasNorth();
        Collector wisher = collector("wm-hide", place);
        Collector seller = collector("wm-hide-seller", place);
        UUID azure = printing(AZURE);
        String wishId = createWish(wisher, wish(azure, true)).path("id").asString();
        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(itemId);
        assertThat(matchedItems(wisher, wishId)).containsExactly(itemId);

        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + wisher.id() + "/block",
                seller.uid(),
                null,
                200);
        assertThat(matchedItems(wisher, wishId)).isEmpty();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/wishlist", wisher.uid(), null, 200)
                                .get(0)
                                .path("matchCount")
                                .asLong())
                .isZero();
        callJson(
                HttpMethod.DELETE,
                "/api/v1/users/" + wisher.id() + "/block",
                seller.uid(),
                null,
                204);
        assertThat(matchedItems(wisher, wishId)).containsExactly(itemId);
    }

    @Test
    void theRematchJobRecoversALostPublicationAndNeedsServiceCredentials() {
        Place place = americasNorth();
        Collector wisher = collector("wm-lost", place);
        Collector seller = collector("wm-lost-seller", place);
        UUID azure = printing(AZURE);
        String wishId = createWish(wisher, wish(azure, true)).path("id").asString();
        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "30.00", "SALE"));
        awaitEventsProcessed(itemId);
        assertThat(storedMatches(wishId)).isEqualTo(1);

        // Simulate a publication whose event never reached the matcher.
        testUsers.update("DELETE FROM wishlist_match WHERE wishlist_item_id = ?::uuid", wishId);
        testUsers.update(
                "DELETE FROM notification WHERE dedup_key = ?",
                "wishlist:" + wishId + ":" + itemId);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH")).isZero();

        JsonNode result = runRematchJob();
        assertThat(result.path("matchesCreated").asInt()).isPositive();
        assertThat(result.path("notified").asInt()).isPositive();
        assertThat(storedMatches(wishId)).isEqualTo(1);
        assertThat(storedNotifications(wisher.id(), "WISHLIST_MATCH")).isEqualTo(1);
        assertThat(testUsers.jobRuns("wishlist-rematch").get(0).get("status"))
                .isEqualTo("SUCCEEDED");

        http.post()
                .uri("/internal/jobs/wishlist-rematch")
                .exchange()
                .expectStatus()
                .isUnauthorized();
        http.post()
                .uri("/internal/jobs/wishlist-rematch")
                .header(HttpHeaders.AUTHORIZATION, bearer(wisher.uid()))
                .exchange()
                .expectStatus()
                .isUnauthorized();
    }

    private void visibility(Collector owner, String itemId, String visibility) {
        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + itemId,
                owner.uid(),
                Map.of("visibility", visibility),
                200);
    }

    private static Map<String, Object> currency(Map<String, Object> fields) {
        fields.put("currency", "USD");
        return fields;
    }

    private static Map<String, Object> withPrinting(UUID printingId, Map<String, Object> fields) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("printingId", printingId.toString());
        body.putAll(fields);
        return body;
    }
}
