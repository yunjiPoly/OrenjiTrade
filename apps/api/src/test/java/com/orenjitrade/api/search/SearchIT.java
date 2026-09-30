package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /search} (sections, printing/card resolution with nearby holders, text matches of
 * collectors and public binders) and {@code GET /search/suggest} (mixed kinds).
 */
class SearchIT extends AbstractSearchIT {

    /** A random alphabetic token no other test uses (names are matched by substring). */
    private static String token() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        StringBuilder token = new StringBuilder("Zq");
        for (int i = 0; i < 8; i++) {
            token.append((char) ('a' + random.nextInt(26)));
        }
        return token.toString();
    }

    private static List<String> ids(JsonNode array) {
        List<String> ids = new ArrayList<>();
        array.forEach(node -> ids.add(node.path("id").asString()));
        return ids;
    }

    @Test
    void anExactPrintingCodeResolvesThePrintingAndListsNearbyHolders() {
        Centre centre = randomCentre();
        UUID english = printing("ygo-p001a"); // AZR-EN001, the only printing with that code
        UUID french = printing("ygo-p001b"); // AZR-FR001, same card
        UUID cardId = cardOf(english);
        Collector holder = collector("srch-holder", centre.offset(2, 0));
        publicItem(holder, english, Map.of("availability", "TRADE", "askingPrice", 50));
        Collector frenchHolder = collector("srch-fr", centre.offset(0, 4));
        publicItem(frenchHolder, french, Map.of("availability", "SALE"));
        Collector far = collector("srch-far", centre.offset(40, 0));
        publicItem(far, english, Map.of());
        Collector bystander = collector("srch-none", centre.offset(1, 1));

        JsonNode result = get(null, 200, "/api/v1/search?q={q}&" + centre.query(), "AZR-EN001");
        assertThat(result.path("query").asString()).isEqualTo("AZR-EN001");
        assertThat(result.path("resolved").path("printingId").asString())
                .isEqualTo(english.toString());
        assertThat(result.path("resolved").path("cardId").asString()).isEqualTo(cardId.toString());
        assertThat(ids(result.path("cards"))).containsExactly(cardId.toString());
        assertThat(result.path("printings").get(0).path("printingCode").asString())
                .isEqualTo("AZR-EN001");
        assertThat(handles(result)).containsExactly(holder.handle());
        JsonNode matching = marker(result, holder.handle()).path("matchingItems");
        assertThat(matching.get(0).path("printingCode").asString()).isEqualTo("AZR-EN001");
        assertThat(matching.get(0).path("availability").asString()).isEqualTo("TRADE");
        assertThat(handles(result)).doesNotContain(bystander.handle(), far.handle());

        // The exact card name resolves the card: holders of any of its printings.
        JsonNode byName =
                get(null, 200, "/api/v1/search?q={q}&" + centre.query(), "azure-eyes SKY dragon");
        assertThat(byName.path("resolved").path("printingId").isNull()).isTrue();
        assertThat(byName.path("resolved").path("cardId").asString()).isEqualTo(cardId.toString());
        assertThat(handles(byName))
                .containsExactlyInAnyOrder(holder.handle(), frenchHolder.handle());
        assertThat(byName.path("printings").size()).isGreaterThanOrEqualTo(2);

        // A code shared by several printings of one card resolves the card only.
        UUID pokemonEn = printing("pkm-p001a");
        JsonNode shared = get(null, 200, "/api/v1/search?q={q}&types=printings", "SVX-001");
        assertThat(shared.path("resolved").path("printingId").isNull()).isTrue();
        assertThat(shared.path("resolved").path("cardId").asString())
                .isEqualTo(cardOf(pokemonEn).toString());
        assertThat(shared.path("printings").size()).isEqualTo(2);
        assertThat(shared.path("cards").isEmpty()).isTrue();
        assertThat(shared.path("collectors").isEmpty()).isTrue();

        // Signed in without lat/lng: around the caller's trading area.
        String viewer = uniqueUid("srch-viewer");
        provisionCompliant(viewer);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                viewer,
                Map.of("lat", centre.lat(), "lng", centre.lng(), "radiusKm", 5),
                200);
        JsonNode own = get(viewer, 200, "/api/v1/search?q={q}", "AZR-EN001");
        assertThat(handles(own)).containsExactly(holder.handle());
        assertThat(marker(own, holder.handle()).path("distanceBucket").asString())
                .isEqualTo("KM_1_5");
    }

    @Test
    void textMatchesCollectorsAndPublicBindersWithTheirOwners() {
        Centre centre = randomCentre();
        String word = token();
        Collector owner = collector("srch-text", centre.offset(1, 0));
        profile(owner, word + " Brightwater", List.of("pokemon"));
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner.uid(),
                                binder(word + " trade vault", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> item = item(printing("pkm-p002a"));
        item.put("binderId", binderId);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), item, 201);
        String emptyBinder =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner.uid(),
                                binder(word + " empty shelf", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();

        JsonNode result =
                get(
                        null,
                        200,
                        "/api/v1/search?q={q}&" + centre.query(),
                        word.toLowerCase(Locale.ROOT));
        assertThat(result.path("resolved").path("cardId").isNull()).isTrue();
        assertThat(handles(result)).containsExactly(owner.handle());
        assertThat(marker(result, owner.handle()).path("matchingItems").isEmpty()).isTrue();
        assertThat(ids(result.path("binders")))
                .containsExactly(binderId)
                .doesNotContain(emptyBinder);
        JsonNode hit = result.path("binders").get(0);
        assertThat(hit.path("owner").path("handle").asString()).isEqualTo(owner.handle());
        assertThat(hit.path("owner").path("location").path("publicLabel").asString()).isNotBlank();
        assertThat(hit.path("owner").has("publicPoint")).isFalse();
        assertThat(hit.path("itemCount").asLong()).isEqualTo(1);

        // Without a centre the search is not geographic.
        assertThat(handles(get(null, 200, "/api/v1/search?q={q}", word))).contains(owner.handle());
        // types narrows the sections.
        JsonNode bindersOnly =
                get(null, 200, "/api/v1/search?q={q}&types=binders&" + centre.query(), word);
        assertThat(bindersOnly.path("cards").isEmpty()).isTrue();
        assertThat(bindersOnly.path("sets").isEmpty()).isTrue();
        assertThat(bindersOnly.path("collectors").isEmpty()).isTrue();
        assertThat(ids(bindersOnly.path("binders"))).containsExactly(binderId);
        // Outside the radius: nothing geographic.
        Centre elsewhere = centre.offset(60, 0);
        JsonNode away = get(null, 200, "/api/v1/search?q={q}&" + elsewhere.query(), word);
        assertThat(handles(away)).isEmpty();
        assertThat(away.path("binders").isEmpty()).isTrue();

        // Private binders never match.
        callJson(
                HttpMethod.POST,
                "/api/v1/binders/" + binderId + "/unpublish",
                owner.uid(),
                null,
                200);
        assertThat(
                        get(null, 200, "/api/v1/search?q={q}&types=binders", word)
                                .path("binders")
                                .isEmpty())
                .isTrue();
    }

    @Test
    void catalogSectionsAndValidation() {
        JsonNode sets = get(null, 200, "/api/v1/search?q={q}&types=sets,cards", "AZR");
        assertThat(sets.path("sets").get(0).path("code").asString()).isEqualTo("AZR");
        assertThat(sets.path("printings").isEmpty()).isTrue();
        JsonNode cards =
                get(null, 200, "/api/v1/search?q={q}&game=pokemon&types=cards", "Emberfang");
        assertThat(cards.path("cards").get(0).path("name").asString()).startsWith("Emberfang Fox");
        cards.path("cards")
                .forEach(card -> assertThat(card.path("game").asString()).isEqualTo("pokemon"));

        callJson(HttpMethod.GET, "/api/v1/search", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search?q=", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search?q=azure&types=decks", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search?q=azure&game=chess", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search?q=azure&limit=51", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search?q=azure&lat=45.5", null, null, 400);
        JsonNode limit =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search?q=azure&lat=10&lng=10&radiusKm=40",
                        null,
                        null,
                        429);
        assertThat(limit.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(limit.path("limitKey").asString()).isEqualTo("map.radius.max_km");
    }

    @Test
    void suggestMixesCardsCollectorsSetsBindersAndTags() {
        Centre centre = randomCentre();
        String word = token();
        Collector owner = collector("sugg-owner", centre.offset(1, 0));
        profile(owner, word + " Suggestable", List.of("mtg"));
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner.uid(),
                                binder(word + " binder", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> item = item(printing("mtg-p001a"));
        item.put("binderId", binderId);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), item, 201);

        JsonNode suggestions =
                get(null, 200, "/api/v1/search/suggest?q={q}&" + centre.query(), word);
        List<String> types = new ArrayList<>();
        suggestions.forEach(entry -> types.add(entry.path("type").asString()));
        assertThat(types).contains("COLLECTOR", "BINDER");
        for (JsonNode entry : suggestions) {
            if ("COLLECTOR".equals(entry.path("type").asString())) {
                assertThat(entry.path("slug").asString()).isEqualTo(owner.handle());
                assertThat(entry.path("id").asString()).isEqualTo(owner.id().toString());
                assertThat(entry.path("label").asString()).isEqualTo(word + " Suggestable");
            }
            if ("BINDER".equals(entry.path("type").asString())) {
                assertThat(entry.path("id").asString()).isEqualTo(binderId);
            }
        }

        JsonNode printings = get(null, 200, "/api/v1/search/suggest?q={q}&limit=5", "AZR-EN0");
        assertThat(printings.get(0).path("type").asString()).isEqualTo("PRINTING");
        assertThat(printings.get(0).path("cardId").asString()).isNotBlank();
        assertThat(printings.size()).isLessThanOrEqualTo(5);

        JsonNode tags = get(null, 200, "/api/v1/search/suggest?q={q}", "trade");
        List<String> tagSlugs = new ArrayList<>();
        tags.forEach(
                entry -> {
                    if ("TAG".equals(entry.path("type").asString())) {
                        tagSlugs.add(entry.path("slug").asString());
                    }
                });
        assertThat(tagSlugs).contains("trader");

        JsonNode cards = get(null, 200, "/api/v1/search/suggest?q={q}&game=pokemon", "Emberfang");
        assertThat(cards.get(0).path("type").asString()).isEqualTo("CARD");
        assertThat(cards.get(0).path("label").asString()).startsWith("Emberfang Fox");
        assertThat(cards.get(0).path("game").asString()).isEqualTo("pokemon");

        callJson(HttpMethod.GET, "/api/v1/search/suggest", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search/suggest?q=a&limit=31", null, null, 400);
        assertThat(suggestions.toString()).doesNotContain("\"lat\"").doesNotContain("\"lng\"");
    }
}
