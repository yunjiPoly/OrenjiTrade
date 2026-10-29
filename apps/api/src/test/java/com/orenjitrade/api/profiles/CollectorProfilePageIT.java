package com.orenjitrade.api.profiles;

import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Stage R6 of the phone redesign (owner spec 2026-10-14, sections 9 and 10; mockup screens 19 to
 * 21): the collector profile as the phone reads it, one request per section (the profile, its
 * cards, binders, wishes, ratings and references), and the caller's own copies of one card for "I
 * have it" ({@code GET /inventory/items?cardId=}). Private cards and binders and hidden wishes
 * never reach another collector; a block leaves the blocker the header only (no cards, binders or
 * wishes, no messaging) and the blocked collector nothing (404, owner decision of 2026-10-28); the
 * city only on its owner's profile while shown; the last activity in buckets, hidden when the
 * collector hides it (ADR 0017).
 */
class CollectorProfilePageIT extends AbstractIntegrationTest {

    private static final String ITEMS = "/api/v1/inventory/items";
    private static final String CITY = "Rivière-du-Loup";

    @Autowired private CatalogImportService importService;

    private record Collector(String uid, UUID id, String handle) {}

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    private Collector collector(String prefix) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliant(uid);
        return new Collector(uid, id, me(uid).path("handle").asString());
    }

    private void privacy(Collector collector, boolean showLastActive, boolean wishlistVisible) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", true);
        body.put("showOnlineStatus", false);
        body.put("showLastActive", showLastActive);
        body.put("profileVisibility", "MEMBERS");
        body.put("messagingPermission", "EVERYONE");
        body.put("wishlistVisible", wishlistVisible);
        body.put("searchDiscoverable", true);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", collector.uid(), body, 200);
    }

    private void location(Collector collector, boolean showCity) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("countryCode", "CA");
        body.put("subdivisionCode", "CA-QC");
        body.put("city", CITY);
        body.put("showCity", showCity);
        callJson(HttpMethod.PUT, "/api/v1/me/location", collector.uid(), body, 200);
    }

    private String createBinder(Collector owner, String name, String visibility) {
        return createBinder(owner, name, visibility, "yugioh");
    }

    /** A binder of {@code game} (stage G: a binder holds the cards of one game). */
    private String createBinder(Collector owner, String name, String visibility, String game) {
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/binders",
                        owner.uid(),
                        InventoryTestSupport.binder(
                                name, visibility, InventoryTestSupport.gameId(testUsers, game)),
                        201)
                .path("id")
                .asString();
    }

    private String createItem(
            Collector owner, UUID printingId, String visibility, String binderId, String price) {
        Map<String, Object> body = item(printingId);
        body.put("visibility", visibility);
        if (binderId != null) {
            body.put("binderId", binderId);
        }
        if (price != null) {
            body.put("askingPriceText", price);
        }
        return callJson(HttpMethod.POST, ITEMS, owner.uid(), body, 201).path("id").asString();
    }

    private JsonNode get(String path, Collector caller, int status) {
        return callJson(HttpMethod.GET, path, caller.uid(), null, status);
    }

    private void block(Collector blocker, Collector blocked) {
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + blocked.id() + "/block",
                blocker.uid(),
                null,
                200);
    }

    private void unblock(Collector blocker, Collector blocked) {
        callJson(
                HttpMethod.DELETE,
                "/api/v1/users/" + blocked.id() + "/block",
                blocker.uid(),
                null,
                204);
    }

    /** A collector with a public binder, a private binder, public and private cards and a wish. */
    private record Page(
            Collector owner,
            String publicBinder,
            String privateBinder,
            String publicCard,
            String privateCard,
            String cardInPrivateBinder) {}

    private Page collectorWithListings(String prefix) {
        Collector owner = collector(prefix);
        privacy(owner, true, true);
        location(owner, true);
        UUID azure = printing(testUsers, "ygo-p001a");
        UUID ember = printing(testUsers, "pkm-p001a");
        UUID dragon = printing(testUsers, "ygo-p005a");
        String publicBinder = createBinder(owner, "Trade binder " + prefix, "PUBLIC");
        String privateBinder =
                createBinder(owner, "Private binder " + prefix, "PRIVATE", "pokemon");
        String publicCard = createItem(owner, azure, "PUBLIC", publicBinder, "85% TCG");
        String privateCard = createItem(owner, dragon, "PRIVATE", publicBinder, "$5");
        String hiddenByBinder = createItem(owner, ember, "PUBLIC", privateBinder, "$7");
        callJson(
                HttpMethod.POST,
                "/api/v1/wishlist",
                owner.uid(),
                Map.of("printingId", azure.toString(), "nearMintOnly", true),
                201);
        return new Page(
                owner, publicBinder, privateBinder, publicCard, privateCard, hiddenByBinder);
    }

    @Test
    void theSectionsShowOnlyPublicCardsBindersAndShownWishes() {
        Page page = collectorWithListings("r6-page");
        Collector viewer = collector("r6-page-viewer");
        String base = "/api/v1/collectors/" + page.owner().handle();

        JsonNode cards = get(base + "/inventory?size=10", viewer, 200);
        assertThat(ids(cards))
                .as("a private card, and a public card in a private binder, never show")
                .containsExactly(page.publicCard());
        assertThat(cards.path("items").get(0).path("askingPriceText").asString())
                .isEqualTo("85% TCG");

        JsonNode binders = get(base + "/binders", viewer, 200);
        assertThat(ids(binders)).containsExactly(page.publicBinder());
        assertThat(binders.get(0).path("itemCount").asLong()).isEqualTo(1);

        JsonNode wishes = get(base + "/wishlist", viewer, 200);
        assertThat(wishes).hasSize(1);
        assertThat(wishes.get(0).path("nearMintOnly").asBoolean()).isTrue();

        // "Let others see what you want" off: the wishes are the owner's alone.
        privacy(page.owner(), true, false);
        get(base + "/wishlist", viewer, 404);
        assertThat(get(base + "/wishlist", page.owner(), 200)).hasSize(1);

        // The owner's own page (the Profile tab) reads the same public lists.
        assertThat(ids(get(base + "/inventory?size=10", page.owner(), 200)))
                .containsExactly(page.publicCard());
        assertThat(ids(get(base + "/binders", page.owner(), 200)))
                .containsExactly(page.publicBinder());

        // Ratings and references (the section's summary and its 2 latest references).
        JsonNode ratings = get(base + "/ratings?limit=1", viewer, 200);
        assertThat(ratings.path("summary").path("count").asInt()).isZero();
        assertThat(get(base + "/references?limit=2", viewer, 200).path("items")).isEmpty();
    }

    @Test
    void theCardsOfADeckCoreStayOutOfTheCardsWhenAsked() {
        Page page = collectorWithListings("r6-core");
        Collector viewer = collector("r6-core-viewer");
        Map<String, Object> core =
                InventoryTestSupport.binder(
                        "Core " + page.owner().handle(),
                        "PUBLIC",
                        InventoryTestSupport.gameId(testUsers, "pokemon"));
        core.put("sellsAsCore", true);
        core.put("askingPriceText", "$95");
        String coreId =
                callJson(HttpMethod.POST, "/api/v1/binders", page.owner().uid(), core, 201)
                        .path("id")
                        .asString();
        String inCore =
                createItem(page.owner(), printing(testUsers, "pkm-p001a"), "PUBLIC", coreId, null);
        String base = "/api/v1/collectors/" + page.owner().handle() + "/inventory?size=10";

        assertThat(ids(get(base, viewer, 200)))
                .as("unchanged by default (the paused web lists them)")
                .containsExactlyInAnyOrder(page.publicCard(), inCore);
        JsonNode cards = get(base + "&excludeDeckCoreItems=true", viewer, 200);
        assertThat(ids(cards))
                .as("the profile's Cards: a deck core's cards sell only with it")
                .containsExactly(page.publicCard());
        assertThat(cards.path("totalItems").asLong()).isEqualTo(1);
        assertThat(
                        ids(
                                get(
                                        "/api/v1/collectors/" + page.owner().handle() + "/binders",
                                        viewer,
                                        200)))
                .contains(coreId);
    }

    @Test
    void aBlockLeavesTheBlockerTheHeaderOnlyAndTheBlockedNothing() {
        Page page = collectorWithListings("r6-block");
        Collector viewer = collector("r6-block-viewer");
        privacy(viewer, true, true);
        String ownerBase = "/api/v1/collectors/" + page.owner().handle();
        String viewerBase = "/api/v1/collectors/" + viewer.handle();

        for (boolean ownerBlocks : List.of(true, false)) {
            if (ownerBlocks) {
                block(page.owner(), viewer);
            } else {
                block(viewer, page.owner());
            }
            for (Collector[] pair :
                    List.of(
                            new Collector[] {viewer, page.owner()},
                            new Collector[] {page.owner(), viewer})) {
                Collector reader = pair[0];
                Collector shown = pair[1];
                String base = shown == page.owner() ? ownerBase : viewerBase;
                Collector blocker = ownerBlocks ? page.owner() : viewer;
                if (reader == blocker) {
                    JsonNode profile = get(base, reader, 200);
                    assertThat(profile.path("isBlocked").asBoolean())
                            .as("the blocker reads the header, flagged blocked")
                            .isTrue();
                    assertThat(profile.path("canMessage").asBoolean()).isFalse();
                } else {
                    // Owner decision of 2026-10-28: the blocker does not exist for the blocked.
                    get(base, reader, 404);
                    get(base + "/ratings", reader, 404);
                    get(base + "/references", reader, 404);
                }
                get(base + "/inventory?size=10", reader, 404);
                get(base + "/binders", reader, 404);
                get(base + "/wishlist", reader, 404);
            }
            if (ownerBlocks) {
                unblock(page.owner(), viewer);
            } else {
                unblock(viewer, page.owner());
            }
            assertThat(get(ownerBase, viewer, 200).path("isBlocked").asBoolean()).isFalse();
            assertThat(ids(get(ownerBase + "/inventory?size=10", viewer, 200)))
                    .containsExactly(page.publicCard());
        }
    }

    @Test
    void theCityShowsOnlyOnItsOwnersProfileWhileShown() {
        Page page = collectorWithListings("r6-city");
        Collector viewer = collector("r6-city-viewer");
        String base = "/api/v1/collectors/" + page.owner().handle();

        JsonNode location = get(base, viewer, 200).path("location");
        assertThat(location.path("city").asString()).isEqualTo(CITY);
        assertThat(location.path("subdivisionName").asString()).isEqualTo("Quebec");
        for (String section :
                List.of("/inventory?size=10", "/binders", "/wishlist", "/ratings", "/references")) {
            assertThat(get(base + section, viewer, 200).toString())
                    .as(section + " never carries the city")
                    .doesNotContain(CITY);
        }

        location(page.owner(), false);
        assertThat(get(base, viewer, 200).path("location").path("city").isNull()).isTrue();
        assertThat(get(base, page.owner(), 200).toString())
                .as("off: not on the owner's own page either")
                .doesNotContain(CITY);
    }

    @Test
    void theLastActivityComesInBucketsAndHidesWhenTheCollectorHidesIt() {
        Collector target = collector("r6-active");
        Collector viewer = collector("r6-active-viewer");
        privacy(target, true, false);
        String base = "/api/v1/collectors/" + target.handle();
        Map<Duration, String> buckets = new LinkedHashMap<>();
        buckets.put(Duration.ofHours(2), "TODAY");
        buckets.put(Duration.ofDays(3), "THIS_WEEK");
        buckets.put(Duration.ofDays(12), "THIS_MONTH");
        buckets.put(Duration.ofDays(45), "LONGER_AGO");
        for (Map.Entry<Duration, String> bucket : buckets.entrySet()) {
            testUsers.setLastActive(target.id(), Instant.now().minus(bucket.getKey()));
            assertThat(get(base, viewer, 200).path("lastActiveBucket").asString())
                    .as(bucket.getKey().toString())
                    .isEqualTo(bucket.getValue());
        }

        privacy(target, false, false);
        testUsers.setLastActive(target.id(), Instant.now().minus(Duration.ofDays(3)));
        assertThat(get(base, viewer, 200).path("lastActiveBucket").asString()).isEqualTo("HIDDEN");
        assertThat(get(base, target, 200).path("lastActiveBucket").asString())
                .as("the owner always sees their own")
                .isNotEqualTo("HIDDEN");
    }

    @Test
    void iHaveItFindsTheCallersOwnCopiesOfOneCardOnly() {
        Collector seller = collector("r6-have");
        Collector other = collector("r6-have-other");
        IsolatedCard card = InventoryTestSupport.isolatedCard(testUsers, "ygo-p001a");
        UUID sibling = InventoryTestSupport.siblingPrinting(testUsers, card, "ygo-p001a", null);
        UUID otherCard = printing(testUsers, "pkm-p001a");

        String publicCopy = createItem(seller, card.printingId(), "PUBLIC", null, "$12.50");
        String privateCopy = createItem(seller, sibling, "PRIVATE", null, null);
        String deleted = createItem(seller, card.printingId(), "PUBLIC", null, null);
        callJson(HttpMethod.DELETE, ITEMS + "/" + deleted, seller.uid(), null, 204);
        createItem(seller, otherCard, "PUBLIC", null, null);
        String othersCopy = createItem(other, card.printingId(), "PUBLIC", null, null);

        JsonNode mine = get(ITEMS + "?cardId=" + card.cardId() + "&size=50", seller, 200);
        assertThat(ids(mine))
                .as("both printings, private ones too (they are the caller's), never deleted")
                .containsExactlyInAnyOrder(publicCopy, privateCopy);
        assertThat(mine.path("totalItems").asLong()).isEqualTo(2);
        assertThat(ids(get(ITEMS + "?cardId=" + card.cardId(), other, 200)))
                .as("never another collector's copies")
                .containsExactly(othersCopy);
        assertThat(ids(get(ITEMS + "?cardId=" + UUID.randomUUID(), seller, 200))).isEmpty();
        // The filter adds to the others (here: only the public copies).
        assertThat(ids(get(ITEMS + "?cardId=" + card.cardId() + "&markedPublic=true", seller, 200)))
                .containsExactly(publicCopy);
        get(ITEMS + "?cardId=not-a-uuid", seller, 400);
    }
}
