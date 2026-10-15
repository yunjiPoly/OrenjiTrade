package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * The search side of deck cores (owner spec 2026-10-14, section 12, built in stage R3 for the
 * screens of R5): the cards of a deck core left out of the card holders on request, the deck cores
 * of a region holding a card, the {@code deckCore} and {@code q} filters of binder search and of
 * the state and region binder lists (a deck core matches its card names, every binder its owner's
 * handle), and {@code deckCoreCount} on the map. A deck core shows without cards; private, sold,
 * own and blocked deck cores are left out; places are a state and a country, never a city.
 */
class DeckCoreSearchIT extends AbstractSearchIT {

    private static final String REGION = "americas-north";

    /** A public deck core with a price; returns its id. */
    private String deckCore(Collector owner, String name, String price) {
        Map<String, Object> body = binder(name, "PUBLIC");
        body.put("sellsAsCore", true);
        body.put("askingPriceText", price);
        return callJson(HttpMethod.POST, "/api/v1/binders", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    private String plainBinder(Collector owner, String name) {
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/binders",
                        owner.uid(),
                        binder(name, "PUBLIC"),
                        201)
                .path("id")
                .asString();
    }

    /** Files a public copy of {@code printingId} in the binder; returns the item id. */
    private String file(Collector owner, String binderId, java.util.UUID printingId, int copies) {
        Map<String, Object> body = item(printingId);
        body.put("binderId", binderId);
        body.put("quantity", copies);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    private static List<String> ids(JsonNode arrayOrPage) {
        JsonNode items = arrayOrPage.has("items") ? arrayOrPage.path("items") : arrayOrPage;
        List<String> ids = new ArrayList<>();
        items.forEach(node -> ids.add(node.path("id").asString()));
        return ids;
    }

    private long[] counts(@Nullable String uid, String subdivision) {
        JsonNode counts =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/regions/" + REGION + "/binder-counts",
                        uid,
                        null,
                        200);
        assertThat(counts.has("deckCoreTotal")).isTrue();
        for (JsonNode entry : counts.path("subdivisions")) {
            if (subdivision.equals(entry.path("code").asString())) {
                return new long[] {
                    entry.path("binderCount").asLong(), entry.path("deckCoreCount").asLong()
                };
            }
        }
        return new long[] {0, 0};
    }

    @Test
    void theCardHoldersCanLeaveOutTheCardsOfADeckCoreAndTheDeckCoresListThem() {
        IsolatedCard card = isolatedPrinting("ygo-p012a");
        Collector seller = collector("core-holders-seller");
        String core = deckCore(seller, token() + " core", "$95");
        String inCore = file(seller, core, card.printingId(), 3);
        String loose = publicItem(seller, card.printingId(), Map.of());
        Collector other = collector("core-holders-other", "US", "US-NY");
        String otherCore = deckCore(other, token() + " other core", "Trade only");
        file(other, otherCore, card.printingId(), 1);
        Collector privateOwner = collector("core-holders-private");
        Map<String, Object> privateBody = binder(token() + " private core", "PRIVATE");
        privateBody.put("sellsAsCore", true);
        String privateCore =
                callJson(HttpMethod.POST, "/api/v1/binders", privateOwner.uid(), privateBody, 201)
                        .path("id")
                        .asString();
        file(privateOwner, privateCore, card.printingId(), 1);

        String viewer = uniqueUid("core-holders-viewer");
        provisionCompliant(viewer);
        String holders =
                "/api/v1/search/card-holders?region=" + REGION + "&cardId=" + card.cardId();
        List<String> all = new ArrayList<>();
        callJson(HttpMethod.GET, holders, viewer, null, 200)
                .path("items")
                .forEach(row -> all.add(row.path("item").path("id").asString()));
        assertThat(all).contains(inCore, loose);
        List<String> withoutCores = new ArrayList<>();
        JsonNode page =
                callJson(HttpMethod.GET, holders + "&excludeDeckCoreItems=true", viewer, null, 200);
        page.path("items").forEach(row -> withoutCores.add(row.path("item").path("id").asString()));
        assertThat(withoutCores).containsExactly(loose);
        assertThat(page.path("totalItems").asLong()).isEqualTo(1);

        // The deck cores of the region holding the card: public ones, newest first.
        JsonNode cores =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/deck-cores?region=" + REGION + "&cardId=" + card.cardId(),
                        viewer,
                        null,
                        200);
        assertThat(ids(cores)).containsExactly(otherCore, core);
        JsonNode first = cores.get(0);
        assertThat(first.path("sellsAsCore").asBoolean()).isTrue();
        assertThat(first.path("askingPriceText").asString()).isEqualTo("Trade only");
        assertThat(first.path("owner").path("handle").asString()).isEqualTo(other.handle());
        assertThat(first.path("owner").path("place").path("label").asString())
                .isEqualTo("New York, United States");
        assertThat(first.path("keyCards").get(0).path("name").asString()).isEqualTo(card.name());
        assertThat(cores.toString()).doesNotContain("\"lat").doesNotContain("city");

        // Never the caller's own; never a blocked collector's; limit applies.
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/search/deck-cores?region="
                                                + REGION
                                                + "&cardId="
                                                + card.cardId(),
                                        seller.uid(),
                                        null,
                                        200)))
                .containsExactly(otherCore);
        callJson(HttpMethod.POST, "/api/v1/users/" + other.id() + "/block", viewer, null, 200);
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/search/deck-cores?limit=1&region="
                                                + REGION
                                                + "&cardId="
                                                + card.cardId(),
                                        viewer,
                                        null,
                                        200)))
                .containsExactly(core);
        callJson(
                HttpMethod.GET,
                "/api/v1/search/deck-cores?limit=11&cardId=" + card.cardId(),
                null,
                null,
                400);
        callJson(HttpMethod.GET, "/api/v1/search/deck-cores", null, null, 400);
        callJson(
                HttpMethod.GET,
                "/api/v1/search/deck-cores?region=asia&cardId=" + card.cardId(),
                null,
                null,
                400);

        // A sold deck core leaves the list (stage R4 sells it).
        testUsers.update("UPDATE binder SET sold_at = now() WHERE id = ?::uuid", core);
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/search/deck-cores?region="
                                                + REGION
                                                + "&cardId="
                                                + card.cardId(),
                                        null,
                                        null,
                                        200)))
                .containsExactly(otherCore);
    }

    @Test
    void binderSearchMatchesNamesHandlesAndTheCardsOfADeckCore() {
        IsolatedCard card = isolatedPrinting("ygo-p017a");
        String word = token();
        Collector owner = collector("core-search");
        String emptyCore = deckCore(owner, word + " empty core", "$40");
        String core = deckCore(owner, token() + " engine", "$120");
        file(owner, core, card.printingId(), 2);
        String plain = plainBinder(owner, word + " plain");
        file(owner, plain, printing("pkm-p002a"), 1);
        String plainWithCard = plainBinder(owner, token() + " not a core");
        file(owner, plainWithCard, card.printingId(), 1);

        String base = "/api/v1/search?types=binders&region=" + REGION + "&q=";
        assertThat(ids(callJson(HttpMethod.GET, base + word, null, null, 200).path("binders")))
                .containsExactlyInAnyOrder(emptyCore, plain);
        assertThat(
                        ids(
                                callJson(
                                                HttpMethod.GET,
                                                base + word + "&deckCore=true",
                                                null,
                                                null,
                                                200)
                                        .path("binders")))
                .containsExactly(emptyCore);
        assertThat(
                        ids(
                                callJson(
                                                HttpMethod.GET,
                                                base + word + "&deckCore=false",
                                                null,
                                                null,
                                                200)
                                        .path("binders")))
                .containsExactly(plain);
        // A deck core's card name finds the core, never a plain binder holding it.
        JsonNode byCard =
                get(
                        null,
                        200,
                        "/api/v1/search?types=binders&region={r}&q={q}",
                        REGION,
                        card.name());
        assertThat(ids(byCard.path("binders"))).containsExactly(core);
        JsonNode found = byCard.path("binders").get(0);
        assertThat(found.path("keyCards").get(0).path("quantity").asInt()).isEqualTo(2);
        assertThat(found.path("askingPriceText").asString()).isEqualTo("$120");
        // The owner's handle finds their binders (an "@" is allowed).
        JsonNode byHandle =
                get(
                        null,
                        200,
                        "/api/v1/search?types=binders&limit=50&region={r}&q={q}",
                        REGION,
                        "@" + owner.handle());
        assertThat(ids(byHandle.path("binders"))).contains(emptyCore, core, plain, plainWithCard);
    }

    @Test
    void theStateAndRegionListsFilterDeckCoresAndText() {
        String vermont = "US-VT";
        long[] before = counts(null, vermont);
        IsolatedCard card = isolatedPrinting("ygo-p019a");
        Collector owner = collector("core-state", "US", vermont);
        String core = deckCore(owner, token() + " state core", "$75");
        file(owner, core, card.printingId(), 3);
        String emptyCore = deckCore(owner, token() + " bare core", "$10");
        String plain = plainBinder(owner, token() + " state binder");
        file(owner, plain, printing("pkm-p002a"), 1);
        plainBinder(owner, token() + " empty plain");

        long[] after = counts(null, vermont);
        assertThat(after[0])
                .as("every public binder, deck cores without cards included")
                .isEqualTo(before[0] + 3);
        assertThat(after[1]).as("the deck cores among them").isEqualTo(before[1] + 2);
        String viewer = uniqueUid("core-state-viewer");
        provisionCompliant(viewer);
        assertThat(counts(viewer, vermont)[1]).isEqualTo(before[1] + 2);

        String state = "/api/v1/regions/" + REGION + "/subdivisions/US-VT/binders";
        assertThat(ids(callJson(HttpMethod.GET, state, null, null, 200)))
                .containsExactly(plain, emptyCore, core);
        assertThat(ids(callJson(HttpMethod.GET, state + "?deckCore=true", null, null, 200)))
                .containsExactly(emptyCore, core);
        assertThat(ids(callJson(HttpMethod.GET, state + "?deckCore=false", null, null, 200)))
                .containsExactly(plain);
        assertThat(
                        ids(
                                get(
                                        null,
                                        200,
                                        "/api/v1/regions/{r}/subdivisions/US-VT/binders?q={q}",
                                        REGION,
                                        card.name())))
                .containsExactly(core);
        assertThat(
                        ids(
                                get(
                                        viewer,
                                        200,
                                        "/api/v1/regions/{r}/binders?deckCore=true&q={q}",
                                        REGION,
                                        owner.handle())))
                .containsExactly(emptyCore, core);
        JsonNode region =
                get(null, 200, "/api/v1/regions/{r}/binders?q={q}&limit=1", REGION, owner.handle());
        assertThat(ids(region)).containsExactly(plain);
        assertThat(region.path("hasMore").asBoolean()).isTrue();
        JsonNode next =
                get(
                        null,
                        200,
                        "/api/v1/regions/{r}/binders?q={q}&limit=5&cursor={c}",
                        REGION,
                        owner.handle(),
                        region.path("nextCursor").asString());
        assertThat(ids(next)).containsExactly(emptyCore, core);
        callJson(HttpMethod.GET, "/api/v1/regions/asia/binders", null, null, 404);

        // Blocked: the viewer neither sees nor counts them.
        callJson(HttpMethod.POST, "/api/v1/users/" + owner.id() + "/block", viewer, null, 200);
        assertThat(ids(callJson(HttpMethod.GET, state, viewer, null, 200))).isEmpty();
        assertThat(counts(viewer, vermont)[1]).isEqualTo(before[1]);
    }
}
