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

        // The card names of a deck core are those of its key cards: every live card filed in the
        // public core, a private one too (buyers see it on the core's page, never listed alone).
        IsolatedCard privateInCore = isolatedPrinting("ygo-p012a");
        fileWith(owner, core, privateInCore.printingId(), "PRIVATE");
        assertThat(textHits(privateInCore.name()))
                .as("search, state list, region list")
                .containsExactly(List.of(core), List.of(core), List.of(core));
        // Never the private card of a plain binder (only a deck core's cards count, and a plain
        // binder shows its public cards only), a deleted card, or a card hidden as stale.
        IsolatedCard privateInPlain = isolatedPrinting("ygo-p012a");
        fileWith(owner, plain, privateInPlain.printingId(), "PRIVATE");
        assertThat(textHits(privateInPlain.name()))
                .containsExactly(List.of(), List.of(), List.of());
        IsolatedCard deleted = isolatedPrinting("ygo-p019a");
        String deletedItem = fileWith(owner, core, deleted.printingId(), "PUBLIC");
        callJson(
                HttpMethod.DELETE,
                "/api/v1/inventory/items/" + deletedItem,
                owner.uid(),
                null,
                204);
        assertThat(textHits(deleted.name())).containsExactly(List.of(), List.of(), List.of());
        IsolatedCard stale = isolatedPrinting("ygo-p019a");
        String staleItem = fileWith(owner, core, stale.printingId(), "PRIVATE");
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'HIDDEN' WHERE id = ?::uuid",
                staleItem);
        assertThat(textHits(stale.name())).containsExactly(List.of(), List.of(), List.of());
        // The switch off: a plain public binder, whose private card no longer finds it.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/binders/" + core,
                owner.uid(),
                Map.of("sellsAsCore", false),
                200);
        assertThat(textHits(privateInCore.name())).containsExactly(List.of(), List.of(), List.of());
    }

    /**
     * A plain public binder shows buyers its public cards only: a private card filed in it gives
     * the binder no game, no card picture and no hit of the binder search's game filter. Turned
     * into a deck core, the binder shows every live card it holds (they sell only together): the
     * private card's game, its catalog picture and the game filter's hit come with it, and leave
     * again when the switch is turned off (stage R3, review fix 2: the term {@code b.sells_as_core}
     * of {@code InventoryItemRepository.IN_PUBLIC_CORE} and the game filter's {@code
     * SHOWN_PUBLICLY}).
     */
    @Test
    void aPlainBinderShowsBuyersNoGamePictureOrGameHitOfItsPrivateCards() {
        String word = token();
        Collector owner = collector("core-plain-private");
        String binder = plainBinder(owner, word + " shelf");
        file(owner, binder, printing("ygo-p012a"), 1);
        fileWith(owner, binder, printing("pkm-p002a"), "PRIVATE");
        String viewer = uniqueUid("core-plain-private-viewer");
        provisionCompliant(viewer);

        JsonNode plain = publicBinder(binder, viewer);
        assertThat(strings(plain.path("games")))
                .as("the public card's game only")
                .containsExactly("yugioh");
        assertThat(plain.path("previewImages")).as("the public card's picture only").hasSize(1);
        assertThat(plain.path("keyCards")).isEmpty();
        assertThat(gameHits(word, "pokemon", viewer)).as("the private card's game").isEmpty();
        assertThat(gameHits(word, "yugioh", viewer)).containsExactly(binder);

        // "Sell as a deck core": the private card is one of its key cards, so its game, its
        // picture and the game filter's hit come with it.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/binders/" + binder,
                owner.uid(),
                Map.of("sellsAsCore", true),
                200);
        JsonNode core = publicBinder(binder, viewer);
        assertThat(strings(core.path("games"))).containsExactlyInAnyOrder("yugioh", "pokemon");
        assertThat(core.path("previewImages")).hasSize(2);
        assertThat(core.path("keyCards")).hasSize(2);
        assertThat(gameHits(word, "pokemon", viewer)).containsExactly(binder);
        assertThat(gameHits(word, "pokemon", null)).as("anonymously too").containsExactly(binder);

        // The switch off: a plain binder again, nothing of the private card.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/binders/" + binder,
                owner.uid(),
                Map.of("sellsAsCore", false),
                200);
        JsonNode again = publicBinder(binder, viewer);
        assertThat(strings(again.path("games"))).containsExactly("yugioh");
        assertThat(again.path("previewImages")).hasSize(1);
        assertThat(gameHits(word, "pokemon", viewer)).isEmpty();
        assertThat(gameHits(word, "yugioh", viewer)).containsExactly(binder);
    }

    private JsonNode publicBinder(String id, String viewer) {
        return callJson(HttpMethod.GET, "/api/v1/public/binders/" + id, viewer, null, 200);
    }

    /** The binders binder search finds for the text with the game filter. */
    private List<String> gameHits(String text, String game, @Nullable String viewer) {
        return ids(
                get(
                                viewer,
                                200,
                                "/api/v1/search?types=binders&region={r}&q={q}&game={g}",
                                REGION,
                                text,
                                game)
                        .path("binders"));
    }

    private static List<String> strings(JsonNode array) {
        List<String> values = new ArrayList<>();
        array.forEach(node -> values.add(node.asString()));
        return values;
    }

    /** Files a copy of {@code printingId} in the binder with a visibility; returns the item id. */
    private String fileWith(
            Collector owner, String binderId, java.util.UUID printingId, String visibility) {
        Map<String, Object> body = item(printingId);
        body.put("binderId", binderId);
        body.put("visibility", visibility);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    /**
     * The binders the text finds, anonymously: in binder search, in the Quebec list and in the
     * region list.
     */
    private List<List<String>> textHits(String text) {
        return List.of(
                ids(
                        get(
                                        null,
                                        200,
                                        "/api/v1/search?types=binders&region={r}&q={q}",
                                        REGION,
                                        text)
                                .path("binders")),
                ids(
                        get(
                                null,
                                200,
                                "/api/v1/regions/{r}/subdivisions/CA-QC/binders?q={q}",
                                REGION,
                                text)),
                ids(get(null, 200, "/api/v1/regions/{r}/binders?q={q}", REGION, text)));
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
