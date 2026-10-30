package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Owner decision of 2026-10-28, review fix 1 (P1, F2): a suspension leaves the login on, so the
 * account's token stays valid; on the public routes (the feed, search, card holders, the binders of
 * a region and of a state, a public binder) the suspended account reads exactly what a signed-out
 * visitor reads: places, never who. The same holds for a deletion pending and a deleted account; an
 * expired suspension reads as a member again.
 */
class RefusedAccountBrowsesAsGuestIT extends AbstractSearchIT {

    private static final String REGION = "americas-north";

    /** Identity keys a guest never reads with a value. */
    private static final List<String> WHO = List.of("id", "handle", "displayName", "avatarUrl");

    @Test
    void aSuspendedAccountReadsThePublicRoutesAsAGuest() {
        Collector holder = collector("refused-holder");
        String name = "Refusedguest " + token();
        profile(holder, name, List.of("yugioh"));
        IsolatedCard card = isolatedPrinting("ygo-p007a");
        String itemId =
                publicItem(
                        holder,
                        card.printingId(),
                        Map.of("availability", "SALE", "askingPriceText", "$3.00"));
        Map<String, Object> folder =
                binder(
                        token() + " folder",
                        "PUBLIC",
                        InventoryTestSupport.gameId(testUsers, "yugioh"));
        String binderId =
                callJson(HttpMethod.POST, "/api/v1/binders", holder.uid(), folder, 201)
                        .path("id")
                        .asString();
        Map<String, Object> filed = item(printing("ygo-p012a"));
        filed.put("binderId", binderId);
        filed.put("visibility", "PUBLIC");
        callJson(HttpMethod.POST, "/api/v1/inventory/items", holder.uid(), filed, 201);
        Collector viewer = collector("refused-viewer");
        String admin = uniqueUid("refused-admin");
        provisionWithRoles(admin, Role.ADMIN);

        List<String> routes =
                List.of(
                        "/api/v1/search/card-holders?region="
                                + REGION
                                + "&game=yugioh&cardId="
                                + card.cardId(),
                        "/api/v1/search/collectors?q=" + holder.handle() + "&region=" + REGION,
                        "/api/v1/search?q=" + holder.handle() + "&region=" + REGION,
                        "/api/v1/regions/" + REGION + "/binders?game=yugioh&q=" + holder.handle(),
                        "/api/v1/regions/" + REGION + "/subdivisions/CA-QC/binders?limit=50",
                        "/api/v1/feed?region=" + REGION + "&game=yugioh&limit=50",
                        "/api/v1/public/binders/" + binderId,
                        "/api/v1/collectors/" + holder.handle() + "/binders",
                        "/api/v1/collectors/" + holder.handle() + "/inventory");
        // A member reads who holds the card and who owns the binder.
        assertThat(get(viewer.uid(), 200, routes.get(0)).toString()).contains(holder.handle());
        assertThat(get(viewer.uid(), 200, routes.get(1)).toString()).contains(holder.handle());

        Instant until = Instant.now().plus(5, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        Map<String, Object> suspension = new LinkedHashMap<>();
        suspension.put("reason", "Guest view test");
        suspension.put("until", until.toString());
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + viewer.id() + "/suspend",
                admin,
                suspension,
                204);
        callJson(HttpMethod.GET, "/api/v1/me", viewer.uid(), null, 403);

        assertReadsLikeAGuest(viewer, routes, holder, name);
        JsonNode holders = get(viewer.uid(), 200, routes.get(0));
        assertThat(holders.path("items")).hasSize(1);
        assertThat(holders.path("items").get(0).path("item").path("id").asString())
                .isEqualTo(itemId);
        assertNobody(holders.path("items").get(0).path("collector"), "a holder");
        assertThat(get(viewer.uid(), 200, routes.get(1))).as("name search").isEmpty();
        for (JsonNode post : get(viewer.uid(), 200, routes.get(5)).path("items")) {
            assertNobody(post.path("collector"), "a post of the feed");
        }
        // A read the public routes do not cover stays refused.
        callJson(HttpMethod.GET, "/api/v1/collectors/" + holder.handle(), viewer.uid(), null, 403);

        // A deletion pending and a deleted account read the same.
        testUsers.setStatus(viewer.id(), AccountStatus.DELETION_REQUESTED, null);
        assertReadsLikeAGuest(viewer, routes, holder, name);
        testUsers.setStatus(viewer.id(), AccountStatus.DELETED, null);
        assertReadsLikeAGuest(viewer, routes, holder, name);

        // Once the suspension is over, the account reads as a member again.
        testUsers.setStatus(viewer.id(), AccountStatus.SUSPENDED, Instant.now().minusSeconds(60));
        assertThat(get(viewer.uid(), 200, routes.get(0)).toString()).contains(holder.handle());
    }

    /** Every route answers the account exactly as it answers a signed-out visitor. */
    private void assertReadsLikeAGuest(
            Collector viewer, List<String> routes, Collector holder, String name) {
        for (String route : routes) {
            JsonNode guest = withoutAgeLabels(get(null, 200, route));
            JsonNode refused = withoutAgeLabels(get(viewer.uid(), 200, route));
            if (!refused.equals(guest)) {
                // Another test of the suite may write a binder of the state between the two reads:
                // the guest's read made right after the account's must then match it.
                guest = withoutAgeLabels(get(null, 200, route));
            }
            assertThat(refused).as("%s for the refused account", route).isEqualTo(guest);
            assertThat(refused.toString()).as(route).doesNotContain(name);
            if (!route.contains(holder.handle())) {
                assertThat(refused.toString()).as(route).doesNotContain(holder.handle());
            }
        }
    }

    /**
     * A copy without the freshness labels ("Updated just now", "Updated 1 minute ago"): they are
     * worded from the age at the moment of the read, so a binder another test wrote about a minute
     * earlier reads "just now" to the first call and "1 minute ago" to the second (seen in the full
     * suite, 2026-10-30); the dates themselves stay compared.
     */
    private static JsonNode withoutAgeLabels(JsonNode node) {
        JsonNode copy = node.deepCopy();
        for (JsonNode freshness : copy.findParents("confirmedAt")) {
            if (freshness instanceof ObjectNode object) {
                object.remove("label");
            }
        }
        return copy;
    }

    private static void assertNobody(JsonNode person, String context) {
        for (String key : WHO) {
            assertThat(person.has(key)).as("%s keeps the key %s", context, key).isTrue();
            assertThat(person.path(key).isNull()).as("%s of %s", key, context).isTrue();
        }
    }
}
