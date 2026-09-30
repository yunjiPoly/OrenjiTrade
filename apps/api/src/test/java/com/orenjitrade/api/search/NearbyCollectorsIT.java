package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /collectors/nearby} and {@code GET /collectors/{handle}/preview}: radius on the public
 * point, filters, ranking (ACTIVE > AGING > no listings, then distance), signed-out versus
 * signed-in detail, exclusions (not discoverable, PRIVATE, suspended, pending deletion,
 * stale-only), the plan radius cap and cache invalidation.
 */
class NearbyCollectorsIT extends AbstractSearchIT {

    @Test
    void radiusFreshnessRankingAndDetailsBySignInState() {
        Centre centre = randomCentre();
        UUID printingId = printing("ygo-p001a");
        Collector fresh = collector("near-fresh", centre.offset(7, 0));
        publicItem(fresh, printingId, Map.of("availability", "SALE", "askingPrice", 40));
        Collector aging = collector("near-aging", centre.offset(0, 3));
        String agingItem =
                publicItem(aging, printingId, Map.of("availability", "TRADE", "askingPrice", 30));
        freshness(agingItem, "AGING", 20);
        Collector empty = collector("near-empty", centre.offset(0.2, 0));
        Collector far = collector("near-far", centre.offset(-15, 0));
        publicItem(far, printingId, Map.of());
        Collector stale = collector("near-stale", centre.offset(1, 1));
        freshness(publicItem(stale, printingId, Map.of()), "STALE", 35);

        JsonNode anonymous = nearby(null, centre.query() + "&radiusKm=10");
        assertThat(handles(anonymous))
                .as("ACTIVE > AGING > no listings; outside the radius and stale-only excluded")
                .containsExactly(fresh.handle(), aging.handle(), empty.handle());
        assertThat(anonymous.path("total").asLong()).isEqualTo(3);
        assertThat(anonymous.path("truncated").asBoolean()).isFalse();
        assertThat(anonymous.path("radiusKm").asDouble()).isEqualTo(10.0);
        assertThat(anonymous.path("center").path("lat").asDouble()).isEqualTo(centre.lat());
        assertThat(anonymous.path("center").path("lng").asDouble()).isEqualTo(centre.lng());
        for (JsonNode marker : anonymous.path("collectors")) {
            assertThat(marker.path("distanceBucket").isNull())
                    .as("signed-out callers get no distance buckets")
                    .isTrue();
            assertThat(marker.path("lastActiveBucket").asString())
                    .as("MEMBERS profiles hide last activity from signed-out visitors")
                    .isEqualTo("HIDDEN");
            assertThat(marker.path("matchingItems").isEmpty()).isTrue();
        }
        JsonNode freshMarker = marker(anonymous, fresh.handle());
        assertThat(freshMarker.path("binderFreshness").asString()).isEqualTo("ACTIVE");
        assertThat(freshMarker.path("publicItemCount").asLong()).isEqualTo(1);
        assertThat(freshMarker.path("games").toString()).contains("yugioh");
        double[] point = publicPoint(fresh.id());
        assertThat(freshMarker.path("publicPoint").path("lat").asDouble()).isEqualTo(point[0]);
        assertThat(freshMarker.path("publicPoint").path("lng").asDouble()).isEqualTo(point[1]);
        assertThat(marker(anonymous, aging.handle()).path("binderFreshness").asString())
                .isEqualTo("AGING");
        assertThat(marker(anonymous, empty.handle()).path("binderFreshness").isNull()).isTrue();

        // A wider radius reaches the far collector.
        assertThat(handles(nearby(null, centre.query() + "&radiusKm=20")))
                .contains(far.handle())
                .doesNotContain(stale.handle());

        // Signed in: distance buckets and last activity.
        String viewer = uniqueUid("near-viewer");
        provisionCompliant(viewer);
        JsonNode signedIn = nearby(viewer, centre.query() + "&radiusKm=10");
        assertThat(handles(signedIn))
                .containsExactly(fresh.handle(), aging.handle(), empty.handle());
        assertThat(marker(signedIn, fresh.handle()).path("distanceBucket").asString())
                .isEqualTo("KM_5_10");
        assertThat(marker(signedIn, aging.handle()).path("distanceBucket").asString())
                .isEqualTo("KM_1_5");
        assertThat(marker(signedIn, fresh.handle()).path("lastActiveBucket").asString())
                .isEqualTo("TODAY");

        // Filters.
        assertThat(handles(nearby(null, centre.query() + "&freshness=ACTIVE")))
                .containsExactly(fresh.handle());
        assertThat(handles(nearby(null, centre.query() + "&availability=SALE")))
                .containsExactly(fresh.handle());
        assertThat(handles(nearby(null, centre.query() + "&availability=TRADE_OR_SALE")))
                .containsExactly(fresh.handle(), aging.handle());
        JsonNode holders = nearby(null, centre.query() + "&hasPrintingId=" + printingId);
        assertThat(handles(holders)).containsExactly(fresh.handle(), aging.handle());
        JsonNode matching = marker(holders, fresh.handle()).path("matchingItems");
        assertThat(matching.size()).isEqualTo(1);
        assertThat(matching.get(0).path("printingId").asString()).isEqualTo(printingId.toString());
        assertThat(matching.get(0).path("availability").asString()).isEqualTo("SALE");
        assertThat(matching.get(0).path("askingPrice").decimalValue()).isEqualByComparingTo("40");
        assertThat(matching.get(0).has("notes")).isFalse();
        assertThat(handles(nearby(null, centre.query() + "&hasCardId=" + cardOf(printingId))))
                .containsExactly(fresh.handle(), aging.handle());
        assertThat(handles(nearby(null, centre.query() + "&game=pokemon"))).isEmpty();
        assertThat(handles(nearby(null, centre.query() + "&game=yugioh")))
                .containsExactly(fresh.handle(), aging.handle());
    }

    @Test
    void tagGameAndQueryFiltersUseTheProfile() {
        Centre centre = randomCentre();
        Collector trader = collector("near-trader", centre.offset(1, 0));
        profile(trader, "Zephyrine Quartermain", List.of("mtg"));
        tags(trader, "trader", "local-meetups");
        Collector player = collector("near-player", centre.offset(-1, 0));
        profile(player, "Player Two", List.of("pokemon"));
        tags(player, "player");

        assertThat(handles(nearby(null, centre.query() + "&tags=trader,vintage")))
                .containsExactly(trader.handle());
        assertThat(handles(nearby(null, centre.query() + "&tags=player&tags=trader")))
                .containsExactlyInAnyOrder(trader.handle(), player.handle());
        assertThat(handles(nearby(null, centre.query() + "&game=mtg")))
                .containsExactly(trader.handle());
        assertThat(handles(nearby(null, centre.query() + "&query=zephyrine")))
                .containsExactly(trader.handle());
        assertThat(handles(nearby(null, centre.query() + "&query=meetups")))
                .containsExactly(trader.handle());
        assertThat(handles(nearby(null, centre.query() + "&query=" + player.handle())))
                .containsExactly(player.handle());
        JsonNode traderMarker = marker(nearby(null, centre.query()), trader.handle());
        assertThat(traderMarker.path("displayName").asString()).isEqualTo("Zephyrine Quartermain");
        assertThat(traderMarker.path("tags").toString()).contains("trader", "local-meetups");

        // Collectors who opted out of name search are not found by text (still on the map).
        Map<String, Object> hidden = privacy(true, "MEMBERS");
        hidden.put("searchDiscoverable", false);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", player.uid(), hidden, 200);
        assertThat(handles(nearby(null, centre.query() + "&query=" + player.handle()))).isEmpty();
        assertThat(handles(nearby(null, centre.query()))).contains(player.handle());
    }

    @Test
    void hiddenCollectorsNeverAppear() {
        Centre centre = randomCentre();
        Collector visible = collector("near-visible", centre.offset(1, 0));
        Collector publicProfile = collector("near-public", centre.offset(0, 1), true, "PUBLIC");
        Collector notDiscoverable = collector("near-hidden", centre.offset(-1, 0), false, "PUBLIC");
        Collector privateProfile = collector("near-private", centre.offset(0, -1), true, "PRIVATE");
        Collector suspended = collector("near-suspended", centre.offset(1, 1));
        testUsers.setStatus(
                suspended.id(), AccountStatus.SUSPENDED, Instant.now().plus(3, ChronoUnit.DAYS));
        Collector leaving = collector("near-leaving", centre.offset(-1, -1));
        testUsers.setStatus(leaving.id(), AccountStatus.DELETION_REQUESTED, null);

        String viewer = uniqueUid("near-hidden-viewer");
        provisionCompliant(viewer);
        for (String caller : Arrays.asList(null, viewer)) {
            assertThat(handles(nearby(caller, centre.query())))
                    .containsExactlyInAnyOrder(visible.handle(), publicProfile.handle());
        }
        // A PUBLIC profile shows its last activity even to signed-out visitors.
        assertThat(
                        marker(nearby(null, centre.query()), publicProfile.handle())
                                .path("lastActiveBucket")
                                .asString())
                .isEqualTo("TODAY");

        // Previews follow the same rules.
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/" + visible.handle() + "/preview",
                null,
                null,
                200);
        for (Collector hidden : List.of(notDiscoverable, privateProfile, suspended, leaving)) {
            callJson(
                    HttpMethod.GET,
                    "/api/v1/collectors/" + hidden.handle() + "/preview",
                    viewer,
                    null,
                    404);
        }
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nobody-"
                        + UUID.randomUUID().toString().substring(0, 6)
                        + "/preview",
                null,
                null,
                404);
    }

    @Test
    void previewCarriesMessagingStateAndNoPreciseLocation() {
        Centre centre = randomCentre();
        Collector target = collector("prev-target", centre.offset(3, 0));
        profile(target, "Preview Target", List.of("pokemon"));
        String viewer = uniqueUid("prev-viewer");
        provisionCompliant(viewer);

        JsonNode anonymous =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + target.handle() + "/preview",
                        null,
                        null,
                        200);
        assertThat(anonymous.path("canMessage").asBoolean()).isFalse();
        assertThat(anonymous.path("isBlocked").asBoolean()).isFalse();
        assertThat(anonymous.path("distanceBucket").isNull()).isTrue();
        double[] point = publicPoint(target.id());
        assertThat(anonymous.path("publicPoint").path("lat").asDouble()).isEqualTo(point[0]);
        assertThat(anonymous.path("publicPoint").path("lng").asDouble()).isEqualTo(point[1]);
        assertThat(anonymous.toString()).doesNotContain("tradingArea").doesNotContain("radiusKm");

        // A member without a profile cannot message a MEMBERS_WITH_PROFILE collector yet.
        JsonNode member =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + target.handle() + "/preview?" + centre.query(),
                        viewer,
                        null,
                        200);
        assertThat(member.path("canMessage").asBoolean()).isFalse();
        assertThat(member.path("distanceBucket").asString()).isEqualTo("KM_1_5");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("handle", me(viewer).path("handle").asString());
        body.put("displayName", "Preview Viewer");
        body.put("games", List.of("pokemon"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", viewer, body, 200);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + target.handle() + "/preview",
                                        viewer,
                                        null,
                                        200)
                                .path("canMessage")
                                .asBoolean())
                .isTrue();
        // Oneself: no messaging, no distance.
        JsonNode self =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + target.handle() + "/preview",
                        target.uid(),
                        null,
                        200);
        assertThat(self.path("canMessage").asBoolean()).isFalse();
        assertThat(self.path("distanceBucket").isNull()).isTrue();
    }

    @Test
    void centreIsRequiredForSignedOutCallersAndDefaultsToTheOwnTradingArea() {
        Centre centre = randomCentre();
        Collector near = collector("near-own", centre.offset(1, 0));
        JsonNode problem = callJson(HttpMethod.GET, "/api/v1/collectors/nearby", null, null, 400);
        assertThat(problem.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        callJson(HttpMethod.GET, "/api/v1/collectors/nearby?lat=" + centre.lat(), null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/collectors/nearby?lat=95&lng=10", null, null, 400);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nearby?" + centre.query() + "&radiusKm=0",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nearby?" + centre.query() + "&freshness=STALE",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nearby?" + centre.query() + "&availability=SOMETIMES",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nearby?" + centre.query() + "&game=chess",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nearby?" + centre.query() + "&tags=Not_A_Slug",
                null,
                null,
                400);

        // A member without a trading area must pass a centre.
        String nomad = uniqueUid("near-nomad");
        provisionCompliant(nomad);
        callJson(HttpMethod.GET, "/api/v1/collectors/nearby", nomad, null, 400);

        // A member with a trading area searches around it (snapped to 0.01 degrees).
        String local = uniqueUid("near-local");
        provisionCompliant(local);
        Centre home = centre.offset(0.4, 0.3);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                local,
                Map.of("lat", home.lat(), "lng", home.lng(), "radiusKm", 3),
                200);
        JsonNode own = nearby(local, "radiusKm=5");
        assertThat(handles(own)).contains(near.handle());
        double[] stored = {
            ((Number) testUsers.locationOf(testUsers.idOf(local)).get("centre_lat")).doubleValue(),
            ((Number) testUsers.locationOf(testUsers.idOf(local)).get("centre_lng")).doubleValue()
        };
        assertThat(own.path("center").path("lat").asDouble()).isEqualTo(round2(stored[0]));
        assertThat(own.path("center").path("lng").asDouble()).isEqualTo(round2(stored[1]));
        assertThat(own.path("radiusKm").asDouble()).isEqualTo(5.0);
        // The default radius is 10 km.
        assertThat(nearby(local, "").path("radiusKm").asDouble()).isEqualTo(10.0);
    }

    @Test
    void radiusBeyondThePlanIsLimitReached() {
        Centre centre = randomCentre();
        JsonNode anonymous =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/nearby?" + centre.query() + "&radiusKm=30",
                        null,
                        null,
                        429);
        assertThat(anonymous.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(anonymous.path("limitKey").asString()).isEqualTo("map.radius.max_km");
        assertThat(anonymous.path("limit").asInt()).isEqualTo(25);
        assertThat(anonymous.path("planCode").asString()).isEqualTo("FREE");
        assertThat(anonymous.path("upgradeUrl").asString()).isEqualTo("/premium");

        String free = uniqueUid("near-free");
        provisionCompliant(free);
        assertThat(nearby(free, centre.query() + "&radiusKm=25").path("radiusKm").asDouble())
                .isEqualTo(25.0);
        JsonNode problem =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/nearby?" + centre.query() + "&radiusKm=25.5",
                        free,
                        null,
                        429);
        assertThat(problem.path("used").asLong()).isEqualTo(26);

        String premium = uniqueUid("near-premium");
        UUID premiumId = provisionCompliant(premium);
        testUsers.update("UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", premiumId);
        assertThat(nearby(premium, centre.query() + "&radiusKm=80").path("radiusKm").asDouble())
                .isEqualTo(80.0);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nearby?" + centre.query() + "&radiusKm=150",
                premium,
                null,
                429);
    }

    @Test
    void cachedResultsAreInvalidatedByPublicationAndPrivacyChanges() {
        Centre centre = randomCentre();
        UUID printingId = printing("pkm-p003a");
        Collector owner = collector("near-cache", centre.offset(1, 0));
        String query = centre.query() + "&hasPrintingId=" + printingId;
        assertThat(handles(nearby(null, query))).isEmpty();

        String itemId = publicItem(owner, printingId, Map.of("availability", "TRADE"));
        assertThat(handles(nearby(null, query)))
                .as("InventoryItemPublished invalidates the cached empty result")
                .containsExactly(owner.handle());

        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + itemId,
                owner.uid(),
                Map.of("visibility", "PRIVATE"),
                200);
        assertThat(handles(nearby(null, query))).isEmpty();

        assertThat(handles(nearby(null, centre.query()))).containsExactly(owner.handle());
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                owner.uid(),
                InventoryTestSupport.privacy(false, "MEMBERS"),
                200);
        assertThat(handles(nearby(null, centre.query())))
                .as("privacy change invalidates the cache")
                .isEmpty();
    }

    @Test
    void limitTruncatesTheRankedList() {
        Centre centre = randomCentre();
        Collector first = collector("near-limit-a", centre.offset(0.5, 0));
        Collector second = collector("near-limit-b", centre.offset(4, 0));
        Collector third = collector("near-limit-c", centre.offset(9, 0));
        JsonNode limited = nearby(null, centre.query() + "&radiusKm=15&limit=2");
        assertThat(handles(limited)).containsExactly(first.handle(), second.handle());
        assertThat(limited.path("total").asLong()).isEqualTo(3);
        assertThat(limited.path("truncated").asBoolean()).isTrue();
        assertThat(handles(nearby(null, centre.query() + "&radiusKm=15")))
                .containsExactly(first.handle(), second.handle(), third.handle());
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/nearby?" + centre.query() + "&limit=501",
                null,
                null,
                400);
    }
}
