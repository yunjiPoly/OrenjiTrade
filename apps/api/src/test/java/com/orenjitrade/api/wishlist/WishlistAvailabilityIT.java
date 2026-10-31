package com.orenjitrade.api.wishlist;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /wishlist} and {@code GET /wishlist/availability?region=}: "Available" on the Wishlist
 * segment of Search (stage R5, owner spec 2026-10-14, sections 8 and 12). A wish is available while
 * at least one public, fresh copy that fits it (the wishlist alert's fit) is held by a discoverable
 * collector of the region who is not the wisher and with no block either way; a card of a public
 * deck core counts. The answer is a boolean per wish: no count.
 */
class WishlistAvailabilityIT extends AbstractWishlistIT {

    private static final String PATH = "/api/v1/wishlist";

    /**
     * {@code available} per wish id: from {@code GET /wishlist} (the caller's home region) without
     * a query, otherwise from {@code GET /wishlist/availability?<query>}, which must agree with the
     * list for the home region.
     */
    private Map<String, Boolean> availability(Collector owner, String query) {
        JsonNode list = callJson(HttpMethod.GET, PATH, owner.uid(), null, 200);
        Map<String, Boolean> home = new HashMap<>();
        list.forEach(
                wish -> {
                    assertThat(wish.has("available")).as("always sent: %s", wish).isTrue();
                    home.put(wish.path("id").asString(), wish.path("available").asBoolean());
                });
        if (query.isEmpty()) {
            JsonNode answer =
                    callJson(HttpMethod.GET, PATH + "/availability", owner.uid(), null, 200);
            Map<String, Boolean> same = new HashMap<>();
            home.keySet().forEach(id -> same.put(id, false));
            answer.path("available").forEach(id -> same.put(id.asString(), true));
            assertThat(same).as("the list and the home region agree").isEqualTo(home);
            return home;
        }
        JsonNode answer =
                callJson(HttpMethod.GET, PATH + "/availability?" + query, owner.uid(), null, 200);
        Map<String, Boolean> result = new HashMap<>();
        home.keySet().forEach(id -> result.put(id, false));
        answer.path("available").forEach(id -> result.put(id.asString(), true));
        return result;
    }

    private String wishId(Collector owner, Map<String, Object> body) {
        return createWish(owner, body).path("id").asString();
    }

    private Collector hidden(String prefix) {
        Collector collector = collector(prefix, new Place("CA", "CA-ON"));
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                collector.uid(),
                privacy(false, "MEMBERS"),
                200);
        return collector;
    }

    @Test
    void aWishIsAvailableWhileAPublicHolderOfTheRegionHasAFittingCopy() {
        Collector owner = collector("avail-owner", americasNorth());
        UUID printing = printing(AZURE);
        UUID french = printing(AZURE_FR);
        UUID card = cardOf(printing);
        UUID secret = rarityPrinting(AZURE, "Secret Rare");

        String byPrinting = wishId(owner, wish(printing, true));
        Map<String, Object> rarityBody = wish(card, false);
        rarityBody.put("rarity", "Secret Rare");
        String byRarity = wishId(owner, rarityBody);
        String anyFrench = wishId(owner, wish(french, true));

        // Nobody holds anything yet: "None yet" everywhere.
        assertThat(availability(owner, ""))
                .containsOnly(
                        Map.entry(byPrinting, false),
                        Map.entry(byRarity, false),
                        Map.entry(anyFrench, false));

        // A public copy of the printing in Ontario (another province of the region).
        Collector seller = collector("avail-seller", new Place("CA", "CA-ON"));
        publicItem(seller, printing, Map.of());
        Map<String, Boolean> afterListing = availability(owner, "region=americas-north");
        assertThat(afterListing.get(byPrinting)).isTrue();
        assertThat(afterListing.get(byRarity)).as("not of the wished rarity").isFalse();
        assertThat(afterListing.get(anyFrench)).as("another printing").isFalse();

        // Without the parameter, the caller's home region (Americas (North)) applies.
        assertThat(availability(owner, "").get(byPrinting)).isTrue();
        // Europe has nobody holding it.
        assertThat(availability(owner, "region=europe").get(byPrinting)).isFalse();

        // A copy of the wished rarity in Europe counts for Europe only.
        Collector european = collector("avail-eu", europe());
        publicItem(european, secret, Map.of());
        assertThat(availability(owner, "region=europe").get(byRarity)).isTrue();
        assertThat(availability(owner, "region=americas-north").get(byRarity)).isFalse();
    }

    @Test
    void theBrowsedGameKeepsItsOwnWishesOnly() {
        Collector owner = collector("avail-game", americasNorth());
        UUID yugioh = printing(AZURE);
        UUID pokemon = printing("pkm-p002a");
        String yugiohWish = wishId(owner, wish(yugioh, true));
        String pokemonWish = wishId(owner, wish(pokemon, true));
        Collector seller = collector("avail-game-seller", new Place("CA", "CA-ON"));
        publicItem(seller, yugioh, Map.of());
        publicItem(seller, pokemon, Map.of());

        // Without game=: every wish, as before stage G.
        assertThat(availability(owner, "region=americas-north"))
                .containsEntry(yugiohWish, true)
                .containsEntry(pokemonWish, true);
        JsonNode pokemonOnly =
                callJson(
                        HttpMethod.GET,
                        PATH + "/availability?region=americas-north&game=pokemon",
                        owner.uid(),
                        null,
                        200);
        assertThat(pokemonOnly.path("available").toString())
                .contains(pokemonWish)
                .doesNotContain(yugiohWish);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        PATH + "/availability?game=mtg",
                                        owner.uid(),
                                        null,
                                        200)
                                .path("available"))
                .isEmpty();
        callJson(HttpMethod.GET, PATH + "/availability?game=chess", owner.uid(), null, 400);
    }

    @Test
    void privateStaleHiddenOwnAndBlockedCopiesNeverMakeAWishAvailable() {
        Collector owner = collector("avail-rules", americasNorth());
        UUID printing = printing(AZURE);
        String wished = wishId(owner, wish(printing, true));

        // A private copy, a stale public one, one of a collector who is not discoverable, and the
        // wisher's own public copy.
        Collector privateSeller = collector("avail-private", americasNorth());
        callJson(
                HttpMethod.POST,
                "/api/v1/inventory/items",
                privateSeller.uid(),
                item(printing),
                201);
        Collector staleSeller = collector("avail-stale", americasNorth());
        String stale = publicItem(staleSeller, printing, Map.of());
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'STALE', confirmed_at = now() -"
                        + " make_interval(days => 35) WHERE id = ?::uuid",
                stale);
        publicItem(hidden("avail-hidden"), printing, Map.of());
        publicItem(owner, printing, Map.of());
        assertThat(availability(owner, "").get(wished)).isFalse();

        // A public, fresh copy of a collector the wisher blocked: still "None yet".
        Collector blocked = collector("avail-blocked", americasNorth());
        publicItem(blocked, printing, Map.of());
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + blocked.id() + "/block",
                owner.uid(),
                null,
                200);
        assertThat(availability(owner, "").get(wished)).isFalse();
        callJson(
                HttpMethod.DELETE,
                "/api/v1/users/" + blocked.id() + "/block",
                owner.uid(),
                null,
                204);
        assertThat(availability(owner, "").get(wished)).isTrue();

        // The other direction: the holder blocked the wisher.
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + owner.id() + "/block",
                blocked.uid(),
                null,
                200);
        assertThat(availability(owner, "").get(wished)).isFalse();
        // An AGING copy counts.
        Collector aging = collector("avail-aging", americasNorth());
        String agingItem = publicItem(aging, printing, Map.of());
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'AGING', confirmed_at = now() -"
                        + " make_interval(days => 20) WHERE id = ?::uuid",
                agingItem);
        assertThat(availability(owner, "").get(wished)).isTrue();
    }

    @Test
    void nearMintOnlyFollowsTheWishlistAlertFit() {
        Collector owner = collector("avail-nm", americasNorth());
        UUID printing = printing(AZURE);
        Map<String, Object> body = wish(printing, true);
        body.put("nearMintOnly", true);
        String nearMint = wishId(owner, body);

        Collector played = collector("avail-played", americasNorth());
        publicItem(played, printing, Map.of("condition", "HEAVILY_PLAYED"));
        assertThat(availability(owner, "").get(nearMint)).as("a played copy").isFalse();

        // A copy whose condition its owner did not state (the phone's cards) may fit.
        Collector unstated = collector("avail-unstated", americasNorth());
        Map<String, Object> notStated = new LinkedHashMap<>();
        notStated.put("conditionStated", false);
        publicItem(unstated, printing, notStated);
        assertThat(availability(owner, "").get(nearMint)).isTrue();
    }

    @Test
    void aCardOfAPublicDeckCoreCountsWhateverItsOwnVisibility() {
        Collector owner = collector("avail-core", americasNorth());
        UUID printing = printing(AZURE);
        String wished = wishId(owner, wish(printing, true));

        Collector seller = collector("avail-core-seller", americasNorth());
        Map<String, Object> core = binder("Core " + UUID.randomUUID(), "PUBLIC");
        core.put("sellsAsCore", true);
        core.put("askingPriceText", "$95");
        String coreId =
                callJson(HttpMethod.POST, "/api/v1/binders", seller.uid(), core, 201)
                        .path("id")
                        .asString();
        Map<String, Object> filed = item(printing);
        filed.put("binderId", coreId);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", seller.uid(), filed, 201);
        assertThat(availability(owner, "").get(wished))
                .as("a private card of a public deck core is one of its key cards")
                .isTrue();

        // The core made private: its cards are no longer seen.
        Map<String, Object> privateCore = new LinkedHashMap<>();
        privateCore.put("visibility", "PRIVATE");
        callJson(HttpMethod.PATCH, "/api/v1/binders/" + coreId, seller.uid(), privateCore, 200);
        assertThat(availability(owner, "").get(wished)).isFalse();
    }

    @Test
    void writesAnswerWithTheAvailabilityAtHomeAndAnUnknownRegionIsRejected() {
        Collector owner = collector("avail-write", americasNorth());
        UUID printing = printing(AZURE);
        Collector seller = collector("avail-write-seller", americasNorth());
        publicItem(seller, printing, Map.of());

        JsonNode created = createWish(owner, wish(printing, true));
        assertThat(created.path("available").asBoolean()).isTrue();
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("note", "Any condition");
        JsonNode updated =
                callJson(
                        HttpMethod.PATCH,
                        PATH + "/" + created.path("id").asString(),
                        owner.uid(),
                        patch,
                        200);
        assertThat(updated.path("available").asBoolean()).isTrue();

        JsonNode problem =
                callJson(
                        HttpMethod.GET,
                        PATH + "/availability?region=atlantis",
                        owner.uid(),
                        null,
                        400);
        assertThat(problem.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
    }
}
