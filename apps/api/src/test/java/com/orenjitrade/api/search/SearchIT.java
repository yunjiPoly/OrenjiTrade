package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /search} (sections, printing/card resolution with the holders of the region, text
 * matches of collectors and public binders of the region) and {@code GET /search/suggest} (mixed
 * kinds). Every collector and binder result is scoped to one platform region (ADR 0017).
 */
class SearchIT extends AbstractSearchIT {

    private static List<String> ids(JsonNode array) {
        List<String> ids = new ArrayList<>();
        array.forEach(node -> ids.add(node.path("id").asString()));
        return ids;
    }

    @Test
    void anExactPrintingCodeResolvesThePrintingAndListsTheHoldersOfTheRegion() {
        IsolatedCard card = isolatedPrinting("ygo-p001a");
        UUID english = card.printingId();
        UUID french = siblingPrinting(card, "ygo-p001b", "fr");
        Collector holder = collector("srch-holder", "CA", "CA-QC");
        publicItem(holder, english, Map.of("availability", "TRADE", "askingPrice", 50));
        Collector frenchHolder = collector("srch-fr", "US", "US-CA");
        publicItem(frenchHolder, french, Map.of("availability", "SALE"));
        Collector european = collector("srch-eu", "FR", "FR-IDF");
        publicItem(european, english, Map.of());
        Collector bystander = collector("srch-none", "CA", "CA-QC");

        JsonNode result = get(null, 200, "/api/v1/search?q={q}&region=americas-north", card.code());
        assertThat(result.path("query").asString()).isEqualTo(card.code());
        assertThat(result.path("region").asString()).isEqualTo("americas-north");
        assertThat(result.path("resolved").path("printingId").asString())
                .isEqualTo(english.toString());
        assertThat(result.path("resolved").path("cardId").asString())
                .isEqualTo(card.cardId().toString());
        assertThat(result.path("printings").get(0).path("printingCode").asString())
                .isEqualTo(card.code());
        assertThat(handles(result)).containsExactly(holder.handle());
        JsonNode marker = marker(result, holder.handle());
        assertThat(marker.path("place").path("label").asString()).isEqualTo("Quebec, Canada");
        assertThat(marker.has("publicPoint")).isFalse();
        assertThat(marker.has("distanceBucket")).isFalse();
        JsonNode matching = marker.path("matchingItems");
        assertThat(matching.get(0).path("printingCode").asString()).isEqualTo(card.code());
        assertThat(matching.get(0).path("availability").asString()).isEqualTo("TRADE");
        assertThat(handles(result)).doesNotContain(bystander.handle(), european.handle());

        // The exact card name resolves the card: holders of any of its printings in the region.
        JsonNode byName =
                get(null, 200, "/api/v1/search?q={q}", card.name().toUpperCase(Locale.ROOT));
        assertThat(byName.path("region").asString())
                .as("signed out without a region: the default region")
                .isEqualTo("americas-north");
        assertThat(byName.path("resolved").path("printingId").isNull()).isTrue();
        assertThat(byName.path("resolved").path("cardId").asString())
                .isEqualTo(card.cardId().toString());
        assertThat(handles(byName))
                .containsExactlyInAnyOrder(holder.handle(), frenchHolder.handle());

        // Europe: the European holder only.
        JsonNode europe = get(null, 200, "/api/v1/search?q={q}&region=europe", card.code());
        assertThat(handles(europe)).containsExactly(european.handle());

        // Signed in without a region: the caller's home region.
        String viewer = uniqueUid("srch-viewer");
        provisionCompliantWithoutLocation(viewer);
        setLocation(viewer, "ES", "ES-MD", null);
        JsonNode own = get(viewer, 200, "/api/v1/search?q={q}", card.code());
        assertThat(own.path("region").asString()).isEqualTo("europe");
        assertThat(handles(own)).containsExactly(european.handle());

        // A code shared by several printings of one card resolves the card only.
        UUID pokemonEn = printing("pkm-p001a");
        JsonNode shared = get(null, 200, "/api/v1/search?q={q}&types=printings", "SVX-001");
        assertThat(shared.path("resolved").path("printingId").isNull()).isTrue();
        assertThat(shared.path("resolved").path("cardId").asString())
                .isEqualTo(cardOf(pokemonEn).toString());
        assertThat(shared.path("printings").size()).isEqualTo(2);
        assertThat(shared.path("cards").isEmpty()).isTrue();
        assertThat(shared.path("collectors").isEmpty()).isTrue();
    }

    @Test
    void textMatchesCollectorsAndPublicBindersOfTheRegionWithTheirOwners() {
        String word = token();
        Collector owner = collector("srch-text", "CA", "CA-BC");
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
                        "/api/v1/search?q={q}&region=americas-north",
                        word.toLowerCase(Locale.ROOT));
        assertThat(result.path("resolved").path("cardId").isNull()).isTrue();
        assertThat(handles(result)).containsExactly(owner.handle());
        assertThat(marker(result, owner.handle()).path("matchingItems").isEmpty()).isTrue();
        assertThat(ids(result.path("binders")))
                .containsExactly(binderId)
                .doesNotContain(emptyBinder);
        JsonNode hit = result.path("binders").get(0);
        assertThat(hit.path("owner").path("handle").asString()).isEqualTo(owner.handle());
        assertThat(hit.path("owner").path("place").path("label").asString())
                .isEqualTo("British Columbia, Canada");
        assertThat(hit.path("owner").has("publicPoint")).isFalse();
        assertThat(hit.path("itemCount").asLong()).isEqualTo(1);

        // types narrows the sections.
        JsonNode bindersOnly =
                get(null, 200, "/api/v1/search?q={q}&types=binders&region=americas-north", word);
        assertThat(bindersOnly.path("cards").isEmpty()).isTrue();
        assertThat(bindersOnly.path("sets").isEmpty()).isTrue();
        assertThat(bindersOnly.path("collectors").isEmpty()).isTrue();
        assertThat(ids(bindersOnly.path("binders"))).containsExactly(binderId);
        // Another region: nothing.
        JsonNode away = get(null, 200, "/api/v1/search?q={q}&region=americas-south", word);
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
        JsonNode region =
                callJson(HttpMethod.GET, "/api/v1/search?q=azure&region=mars", null, null, 400);
        assertThat(region.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        // Coordinates are no parameter any more: ignored.
        callJson(
                HttpMethod.GET,
                "/api/v1/search?q=azure&lat=10&lng=10&radiusKm=40",
                null,
                null,
                200);
    }

    @Test
    void suggestMixesCardsCollectorsSetsBindersAndTagsOfTheRegion() {
        String word = token();
        Collector owner = collector("sugg-owner", "BR", "BR-SP");
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
                get(null, 200, "/api/v1/search/suggest?q={q}&region=americas-south", word);
        List<String> types = new ArrayList<>();
        suggestions.forEach(entry -> types.add(entry.path("type").asString()));
        assertThat(types).contains("COLLECTOR", "BINDER");
        for (JsonNode entry : suggestions) {
            if ("COLLECTOR".equals(entry.path("type").asString())) {
                assertThat(entry.path("slug").asString()).isEqualTo(owner.handle());
                assertThat(entry.path("id").asString()).isEqualTo(owner.id().toString());
                assertThat(entry.path("label").asString()).isEqualTo(word + " Suggestable");
                assertThat(entry.path("sublabel").asString())
                        .isEqualTo("@" + owner.handle() + " · São Paulo, Brazil");
            }
            if ("BINDER".equals(entry.path("type").asString())) {
                assertThat(entry.path("id").asString()).isEqualTo(binderId);
            }
        }
        JsonNode elsewhere =
                get(null, 200, "/api/v1/search/suggest?q={q}&region=americas-north", word);
        elsewhere.forEach(
                entry -> assertThat(entry.path("type").asString()).isNotIn("COLLECTOR", "BINDER"));

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
        callJson(HttpMethod.GET, "/api/v1/search/suggest?q=a&region=nowhere", null, null, 400);
        assertThat(suggestions.toString()).doesNotContain("\"lat\"").doesNotContain("\"lng\"");
    }
}
