package com.orenjitrade.api.location;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * ADR 0017 privacy contract over the seeded collectors and every response family of Phases 1-10: no
 * response anywhere carries a coordinate, a distance, a radius or a grid cell (no such key, no
 * number with more than 3 decimals, no "km away" text), and a collector's city appears only in
 * their own public profile ({@code GET /collectors/{handle}}) while "Show my city on my profile" is
 * on, never in lists, search, binders, offers, messages, notifications, admin views or logs (the
 * owner's own settings and export excepted). Every other surface shows state/province + country.
 * Shares the seeded context with {@code SeedDataRunnerIT}.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
@ExtendWith(OutputCaptureExtension.class)
class GeoPrivacyContractTest extends AbstractIntegrationTest {

    static final List<String> DISCOVERABLE =
            List.of(
                    "collector1",
                    "collector2",
                    "collector3",
                    "collector4",
                    "collector5",
                    "collector6",
                    "collector8",
                    "premium_user");

    static final List<String> NOT_DISCOVERABLE =
            List.of("collector7", "moderator", "admin", "superadmin");

    /** State/province + country of every seed account (db/seed/locations.json). */
    static final Map<String, String> PLACES =
            Map.ofEntries(
                    Map.entry("collector1", "Quebec, Canada"),
                    Map.entry("collector2", "Ontario, Canada"),
                    Map.entry("collector3", "Buenos Aires City, Argentina"),
                    Map.entry("collector4", "Community of Madrid, Spain"),
                    Map.entry("collector5", "California, United States"),
                    Map.entry("collector6", "Santiago Metropolitan Region, Chile"),
                    Map.entry("collector7", "New York, United States"),
                    Map.entry("collector8", "Île-de-France, France"),
                    Map.entry("premium_user", "São Paulo, Brazil"),
                    Map.entry("moderator", "Berlin, Germany"),
                    Map.entry("admin", "England, United Kingdom"),
                    Map.entry("superadmin", "Quebec, Canada"));

    /** Collectors who hide their city on their profile in this test. */
    static final Set<String> HIDE_CITY = Set.of("collector2", "collector6", "collector8");

    /** Keys that would describe a position, a distance or an area: never in any response. */
    static final Set<String> FORBIDDEN_KEYS =
            Set.of(
                    "lat",
                    "lng",
                    "lon",
                    "latitude",
                    "longitude",
                    "publicPoint",
                    "homePoint",
                    "tradingArea",
                    "center",
                    "centre",
                    "radiusKm",
                    "distanceBucket",
                    "distance",
                    "distanceKm",
                    "gridCell",
                    "geoCell",
                    "publicLabel");

    /**
     * A coordinate as it would appear in a log line: a decimal-degree pair ({@code 45.508,
     * -73.587}) or a {@code lat=}/{@code lng:}-style key with a number. Lone decimals are left
     * alone: log timestamps and durations have them.
     */
    static final Pattern COORDINATE_IN_LOGS =
            Pattern.compile(
                    "-?\\d{1,3}\\.\\d{3,}\\s*,\\s*-?\\d{1,3}\\.\\d{3,}"
                            + "|(?i)\\b(?:lat|lng|lon|latitude|longitude)\\b\"?\\s*[=:]\\s*-?\\d");

    /** Seed admin token uid with its real email (so the login does not rewrite the seed email). */
    static final String SEED_ADMIN = "seed-admin:admin@orenjitrade.test";

    @Autowired private FeatureFlags featureFlags;

    /** Original seeded city and switch per handle, restored after each test. */
    private final Map<String, Object[]> original = new LinkedHashMap<>();

    /** Every document checked by the current test, with what fetched it. */
    private final List<Fetched> fetched = new ArrayList<>();

    private record Fetched(String path, @Nullable String caller, JsonNode body) {}

    private UUID idOf(String handle) {
        return (UUID)
                testUsers
                        .query("SELECT id FROM user_account WHERE handle = ?", handle)
                        .get(0)
                        .get("id");
    }

    /** The distinctive city of a seed account in this test (letters only, moderated as usual). */
    static String cityOf(String handle) {
        return "Zqcity" + handle.replace("_", "").toLowerCase(Locale.ROOT);
    }

    @BeforeEach
    void distinctiveCities() {
        for (String handle : PLACES.keySet()) {
            UUID id = idOf(handle);
            Map<String, Object> stored = testUsers.locationOf(id);
            assertThat(stored).as("seeded location of %s", handle).isNotEmpty();
            original.put(handle, new Object[] {stored.get("city"), stored.get("show_city")});
            testUsers.update(
                    "UPDATE user_location SET city = ?, show_city = ? WHERE user_id = ?",
                    cityOf(handle),
                    !HIDE_CITY.contains(handle),
                    id);
        }
    }

    @AfterEach
    void restoreCities() {
        for (Map.Entry<String, Object[]> entry : original.entrySet()) {
            testUsers.update(
                    "UPDATE user_location SET city = ?, show_city = ? WHERE user_id = ?",
                    entry.getValue()[0],
                    entry.getValue()[1],
                    idOf(entry.getKey()));
        }
    }

    private JsonNode fetch(String path, @Nullable String caller) {
        JsonNode body = callJson(HttpMethod.GET, path, caller, null, 200);
        fetched.add(new Fetched(path, caller, body));
        return body;
    }

    /**
     * Every document of the test: no geography key, at most 3 decimals, no distance text, and a
     * city only in the public profile of a collector who shows it.
     */
    private void assertContract(CapturedOutput output) {
        assertThat(fetched).as("documents were checked").isNotEmpty();
        for (Fetched document : fetched) {
            String context = document.path() + " as " + document.caller();
            assertNoGeography(document.body(), context);
            String text = document.body().toString();
            for (String handle : PLACES.keySet()) {
                boolean ownProfile =
                        document.path().equals("/api/v1/collectors/" + handle)
                                && !HIDE_CITY.contains(handle);
                if (!ownProfile) {
                    assertThat(text)
                            .as("city of %s in %s", handle, context)
                            .doesNotContain(cityOf(handle));
                }
            }
        }
        String logs = output.getAll();
        for (String handle : PLACES.keySet()) {
            assertThat(logs).as("city of %s in the logs", handle).doesNotContain(cityOf(handle));
        }
        assertThat(COORDINATE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    @Test
    void profilesShowStateAndCountryAndTheCityOnlyOnTheirOwnPage(CapturedOutput output) {
        String viewer = uniqueUid("geo-viewer");
        provisionCompliant(viewer);

        for (String handle : DISCOVERABLE) {
            JsonNode profile = fetch("/api/v1/collectors/" + handle, viewer);
            JsonNode location = profile.path("location");
            assertThat(location.path("label").asString())
                    .as("place of %s", handle)
                    .isEqualTo(PLACES.get(handle));
            if (HIDE_CITY.contains(handle)) {
                assertThat(location.path("city").isNull())
                        .as("%s hides their city", handle)
                        .isTrue();
            } else {
                assertThat(location.path("city").asString()).isEqualTo(cityOf(handle));
            }
        }
        for (String handle : NOT_DISCOVERABLE) {
            JsonNode profile = fetch("/api/v1/collectors/" + handle, viewer);
            assertThat(profile.path("location").isNull())
                    .as("%s is not discoverable", handle)
                    .isTrue();
        }
        for (String handle : PLACES.keySet()) {
            JsonNode detail = fetch("/api/v1/admin/users/" + idOf(handle), SEED_ADMIN);
            assertThat(detail.path("locationLabel").asString())
                    .as("admin sees state/province + country of %s", handle)
                    .isEqualTo(PLACES.get(handle));
        }
        assertContract(output);
    }

    /**
     * Phase 3 public listings of the seeded collectors (binders, binder items, collector
     * inventory), anonymous and signed in: the owner block carries state/province + country only.
     */
    @Test
    void publicListingsCarryThePlaceNeverTheCityOrPrivateNotes(CapturedOutput output) {
        String viewer = uniqueUid("geo-listings");
        provisionCompliant(viewer);
        int publicBinders = 0;
        for (String handle : DISCOVERABLE) {
            for (String caller : Arrays.asList(null, viewer)) {
                JsonNode binders = fetch("/api/v1/collectors/" + handle + "/binders", caller);
                fetch("/api/v1/collectors/" + handle + "/inventory?size=100", caller);
                for (JsonNode binder : binders) {
                    String id = binder.path("id").asString();
                    JsonNode detail = fetch("/api/v1/public/binders/" + id, caller);
                    assertThat(detail.path("owner").path("place").path("label").asString())
                            .isEqualTo(PLACES.get(handle));
                    fetch("/api/v1/public/binders/" + id + "/items?size=100", caller);
                    publicBinders++;
                }
            }
        }
        assertThat(publicBinders).as("seeded public binders were checked").isPositive();
        assertThat(
                        fetch("/api/v1/collectors/collector7/inventory", viewer)
                                .path("totalItems")
                                .asLong())
                .isZero();
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    /**
     * Region search, card holders, suggestions and the map (binder counts and the binders of a
     * state), anonymous and signed in: collectors carry their state/province + country only;
     * non-discoverable collectors never appear.
     */
    @Test
    void searchAndMapResponsesCarryPlacesOnly(CapturedOutput output) {
        String viewer = uniqueUid("geo-map");
        provisionCompliant(viewer);
        UUID printingId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT id FROM card_printing WHERE external_ref ->>"
                                                + " 'id' = 'ygo-p001a'")
                                .get(0)
                                .get("id");
        for (String caller : Arrays.asList(null, viewer)) {
            JsonNode search = fetch("/api/v1/search?q=AZR-EN001&region=americas-north", caller);
            assertThat(search.path("collectors").size()).isPositive();
            assertPlaces(search.path("collectors"));
            JsonNode binders =
                    fetch(
                            "/api/v1/search?q=binder&types=binders,collectors&region=americas-north",
                            caller);
            assertThat(binders.path("binders").size()).isPositive();
            JsonNode holders =
                    fetch(
                            "/api/v1/search/card-holders?region=americas-north&printingId="
                                    + printingId,
                            caller);
            assertThat(holders.path("totalItems").asLong()).isPositive();
            for (JsonNode row : holders.path("items")) {
                assertPlaces(jsonMapper.createArrayNode().add(row.path("collector")));
            }
            fetch("/api/v1/search/suggest?q=collector&region=americas-north", caller);
            for (String region : List.of("americas-north", "americas-south", "europe")) {
                fetch("/api/v1/search?q=collector&types=collectors&region=" + region, caller);
                fetch("/api/v1/regions/" + region + "/binder-counts", caller);
            }
            JsonNode counts = fetch("/api/v1/regions/americas-north/binder-counts", caller);
            assertThat(counts.toString()).contains("\"CA-QC\"");
            JsonNode quebec =
                    fetch("/api/v1/regions/americas-north/subdivisions/CA-QC/binders", caller);
            assertThat(quebec.path("items").size()).isPositive();
            for (JsonNode binder : quebec.path("items")) {
                assertThat(binder.path("owner").path("place").path("label").asString())
                        .isEqualTo("Quebec, Canada");
            }
            fetch("/api/v1/regions/americas-south/subdivisions/BR-SP/binders", caller);
            fetch("/api/v1/regions/europe/subdivisions/FR-IDF/binders", caller);
        }
        fetch("/api/v1/regions", null);
        for (Fetched document : fetched) {
            String text = document.body().toString();
            for (String handle : NOT_DISCOVERABLE) {
                assertThat(text)
                        .as("%s in %s", handle, document.path())
                        .doesNotContain("\"handle\":\"" + handle + "\"");
            }
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    /**
     * Deck cores (stage R3): the deck core page, its key cards, the deck cores of a card, binder
     * search and the state and region lists filtered to deck cores, and the map's deck core counts,
     * anonymous and signed in. The seeded deck core of collector2 carries Ontario, Canada, never a
     * city or a private note.
     */
    @Test
    void deckCoresCarryThePlaceOnly(CapturedOutput output) {
        String viewer = uniqueUid("geo-cores");
        provisionCompliant(viewer);
        UUID cardId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT card_id FROM card_printing WHERE external_ref ->>"
                                                + " 'id' = 'ygo-p012a'")
                                .get(0)
                                .get("card_id");
        String seededCore = "00000000-0000-4000-8b00-000000000202";
        for (String caller : Arrays.asList(null, viewer)) {
            JsonNode page = fetch("/api/v1/public/binders/" + seededCore, caller);
            assertThat(page.path("sellsAsCore").asBoolean()).isTrue();
            assertThat(page.path("askingPriceText").asString()).isEqualTo("$95");
            assertThat(page.path("keyCards").size()).isPositive();
            assertThat(page.path("owner").path("place").path("label").asString())
                    .isEqualTo(PLACES.get("collector2"));
            JsonNode list = fetch("/api/v1/collectors/collector2/binders", caller);
            assertThat(list.toString()).contains(seededCore);
            JsonNode cores =
                    fetch(
                            "/api/v1/search/deck-cores?region=americas-north&limit=10&cardId="
                                    + cardId,
                            caller);
            assertThat(cores.toString()).contains(seededCore);
            for (JsonNode core : cores) {
                assertPlaces(jsonMapper.createArrayNode().add(core.path("owner")));
            }
            JsonNode search =
                    fetch(
                            "/api/v1/search?q=Verdant&types=binders&deckCore=true"
                                    + "&region=americas-north",
                            caller);
            assertThat(search.path("binders").toString()).contains(seededCore);
            fetch("/api/v1/regions/americas-north/binders?deckCore=true", caller);
            JsonNode ontario =
                    fetch(
                            "/api/v1/regions/americas-north/subdivisions/CA-ON/binders"
                                    + "?deckCore=true&q=Moth",
                            caller);
            assertThat(ontario.toString()).contains(seededCore);
            for (JsonNode binder : ontario.path("items")) {
                assertThat(binder.path("owner").path("place").path("label").asString())
                        .isEqualTo(PLACES.get("collector2"));
            }
            JsonNode counts = fetch("/api/v1/regions/americas-north/binder-counts", caller);
            long ontarioCores = 0;
            for (JsonNode entry : counts.path("subdivisions")) {
                if ("CA-ON".equals(entry.path("code").asString())) {
                    ontarioCores = entry.path("deckCoreCount").asLong();
                }
            }
            assertThat(ontarioCores).isPositive();
            fetch(
                    "/api/v1/search/card-holders?region=americas-north&excludeDeckCoreItems=true"
                            + "&cardId="
                            + cardId,
                    caller);
        }
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    /**
     * Search of stage R5 (the phone's Search tab): the collectors by name while a card is typed,
     * "Who has this card" grouped by province without a deck core's cards, and the wishlist with
     * "Available" in each region, anonymous, as a seed collector and as a new account. Places only:
     * a state or province and a country, never a city, a distance or a count of holders.
     */
    @Test
    void searchOfStageR5CarriesPlacesOnly(CapturedOutput output) {
        String viewer = uniqueUid("geo-r5");
        provisionCompliant(viewer);
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        UUID cardId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT card_id FROM card_printing WHERE external_ref ->>"
                                                + " 'id' = 'ygo-p001a'")
                                .get(0)
                                .get("card_id");
        for (String caller : Arrays.asList(null, viewer, collector1)) {
            for (String region : List.of("americas-north", "americas-south", "europe")) {
                JsonNode byName =
                        fetch(
                                "/api/v1/search/collectors?q=collector&limit=10&region=" + region,
                                caller);
                assertPlaces(byName);
            }
            JsonNode north =
                    fetch(
                            "/api/v1/search/collectors?q=collector&limit=10&region=americas-north",
                            caller);
            assertThat(north.size()).isPositive();
            JsonNode grouped =
                    fetch(
                            "/api/v1/search/card-holders?region=americas-north&sort=province"
                                    + "&excludeDeckCoreItems=true&cardId="
                                    + cardId,
                            caller);
            for (JsonNode row : grouped.path("items")) {
                assertPlaces(jsonMapper.createArrayNode().add(row.path("collector")));
            }
        }
        for (String region : List.of("americas-north", "americas-south", "europe")) {
            JsonNode wishes = fetch("/api/v1/wishlist?region=" + region, collector2);
            assertThat(wishes.size()).isPositive();
            for (JsonNode wish : wishes) {
                assertThat(wish.path("available").isBoolean()).as("%s", wish).isTrue();
            }
        }
        fetch("/api/v1/wishlist", viewer);
        for (Fetched document : fetched) {
            String text = document.body().toString();
            for (String handle : NOT_DISCOVERABLE) {
                assertThat(text)
                        .as("%s in %s", handle, document.path())
                        .doesNotContain("\"handle\":\"" + handle + "\"");
            }
            if (document.path().startsWith("/api/v1/wishlist")) {
                assertNoItemNotes(document.body(), document.path());
            } else {
                assertNoPrivateNotes(document.body(), document.path());
            }
        }
        assertContract(output);
    }

    /** Each collector of a search document carries the place of its seeded location. */
    private void assertPlaces(JsonNode collectors) {
        for (JsonNode collector : collectors) {
            String handle = collector.path("handle").asString();
            if (PLACES.containsKey(handle)) {
                assertThat(collector.path("place").path("label").asString())
                        .as("place of %s", handle)
                        .isEqualTo(PLACES.get(handle));
            }
            assertThat(collector.path("place").path("subdivisionCode").asString()).isNotBlank();
        }
    }

    /**
     * Phase 5 responses that carry other members (conversations, messages with card and binder
     * links, blocks, community channels, posts and replies); the seeded conversation and posts are
     * served as seeded; the platform region channels exist and the old city channels are archived.
     */
    @Test
    void messagingAndCommunityResponsesNeverCarryGeography(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String conversationId = "00000000-0000-4000-8d00-000000000001";

        JsonNode conversations = fetch("/api/v1/conversations", collector1);
        JsonNode seeded = null;
        for (JsonNode item : conversations.path("items")) {
            if (item.path("id").asString().equals(conversationId)) {
                seeded = item;
            }
        }
        assertThat(seeded).as("the seeded conversation of collector1").isNotNull();
        assertThat(seeded.path("other").path("handle").asString()).isEqualTo("collector2");
        JsonNode messages =
                fetch("/api/v1/conversations/" + conversationId + "/messages", collector2);
        assertThat(messages.path("items")).hasSize(6);
        fetch("/api/v1/conversations", collector2);

        JsonNode channels = fetch("/api/v1/community/channels", collector1);
        List<String> slugs = new ArrayList<>();
        channels.forEach(channel -> slugs.add(channel.path("slug").asString()));
        assertThat(slugs)
                .contains("americas-north", "americas-south", "europe")
                .doesNotContain("montreal-yugioh");
        for (String slug : List.of("looking-for", "new-listings", "general")) {
            JsonNode posts = fetch("/api/v1/community/channels/" + slug + "/posts", collector2);
            assertThat(posts.path("items")).as("seeded posts in %s", slug).isNotEmpty();
            for (JsonNode post : posts.path("items")) {
                fetch(
                        "/api/v1/community/posts/" + post.path("id").asString() + "/replies",
                        collector2);
            }
        }
        fetch("/api/v1/me/blocks", collector1);
        assertContract(output);
    }

    /**
     * Stage R4: the chat's subject (a card or a seeded deck core), the other collector's place in
     * the chat ("Online · {province}"), the sale's SYSTEM message and the buyer's notification, for
     * both collectors: a state and a country, never a city, a coordinate or a private note. The
     * sale is undone and the card deleted at the end, so the seed stays as it was.
     */
    @Test
    void chatSubjectsAndSalesCarryThePlaceOnly(CapturedOutput output) {
        String buyer = "seed-collector1:collector1@orenjitrade.test";
        String seller = "seed-collector5:collector5@orenjitrade.test";
        String seededCore = "00000000-0000-4000-8b00-000000000202";
        // The chat needs the buyer's 18+ confirmation; the seed holds none, so it is taken back.
        UUID buyerId = idOf("collector1");
        boolean confirmed =
                testUsers.count(
                                "SELECT count(*) FROM user_consent WHERE user_id = ? AND"
                                        + " document_type = 'AGE_CONFIRMATION'",
                                buyerId)
                        > 0;
        testUsers.confirmAge(buyerId);
        UUID printing =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT id FROM card_printing WHERE external_ref ->> 'id'"
                                                + " = 'ygo-p012a'")
                                .get(0)
                                .get("id");
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("printingId", printing.toString());
        item.put("quantity", 2);
        item.put("visibility", "PUBLIC");
        item.put("askingPriceText", "$14");
        item.put("notes", "geo-r4-private-note");
        String itemId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", seller, item, 201)
                        .path("id")
                        .asString();
        JsonNode started =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        buyer,
                        Map.of(
                                "recipientId",
                                idOf("collector5").toString(),
                                "subjectItemId",
                                itemId),
                        201);
        fetched.add(new Fetched("/api/v1/conversations (card)", buyer, started));
        String chatId = started.path("id").asString();
        try {
            JsonNode sale =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/conversations/" + chatId + "/sales",
                            seller,
                            Map.of("quantity", 1, "trackingNumber", "LX123456789CA"),
                            201);
            fetched.add(new Fetched("/api/v1/conversations/{id}/sales", seller, sale));
            for (String caller : List.of(buyer, seller)) {
                JsonNode chat = fetch("/api/v1/conversations/" + chatId, caller);
                assertThat(chat.path("subject").path("id").asString()).isEqualTo(itemId);
                String other = caller.equals(buyer) ? "collector5" : "collector1";
                assertThat(chat.path("other").path("place").path("label").asString())
                        .as("place of %s", other)
                        .isEqualTo(PLACES.get(other));
                JsonNode messages = fetch("/api/v1/conversations/" + chatId + "/messages", caller);
                assertThat(messages.toString()).contains("LX123456789CA");
                fetch("/api/v1/conversations", caller);
                fetch("/api/v1/notifications", caller);
            }
            // A seeded deck core as the subject, with its photo or card picture.
            JsonNode core =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/conversations",
                            buyer,
                            Map.of(
                                    "recipientId",
                                    idOf("collector2").toString(),
                                    "subjectBinderId",
                                    seededCore),
                            200);
            fetched.add(new Fetched("/api/v1/conversations (deck core)", buyer, core));
            assertThat(core.path("subject").path("kind").asString()).isEqualTo("DECK_CORE");
            assertThat(core.path("other").path("place").path("label").asString())
                    .isEqualTo(PLACES.get("collector2"));
            fetched.add(
                    new Fetched(
                            "/api/v1/sales/{id}/undo",
                            seller,
                            callJson(
                                    HttpMethod.POST,
                                    "/api/v1/sales/" + sale.path("id").asString() + "/undo",
                                    seller,
                                    null,
                                    200)));
        } finally {
            testUsers.update(
                    "UPDATE conversation SET subject_item_id = NULL, subject_binder_id = NULL,"
                            + " subject_set_at = NULL, subject_set_by = NULL WHERE id IN (?, ?)",
                    UUID.fromString(chatId),
                    UUID.fromString("00000000-0000-4000-8d00-000000000001"));
            callJson(HttpMethod.DELETE, "/api/v1/inventory/items/" + itemId, seller, null, 204);
            if (!confirmed) {
                testUsers.update(
                        "DELETE FROM user_consent WHERE user_id = ? AND document_type ="
                                + " 'AGE_CONFIRMATION'",
                        buyerId);
            }
        }
        for (Fetched document : fetched) {
            assertThat(document.body().toString())
                    .as("private note in %s", document.path())
                    .doesNotContain("geo-r4-private-note");
            assertNoPrivateNotes(document.body(), document.path());
        }
        // Spec section 13: the tracking number is the two collectors' only, never in the logs.
        assertThat(output.getAll())
                .as("tracking number in the logs")
                .doesNotContain("LX123456789CA");
        assertContract(output);
    }

    /**
     * Phase 6 / stage S2: the seeded wishlist of collector2 (items, public summary, price terms)
     * and the notification centre: the wishlist alert about collector1's listing names the
     * state/province + country, never a distance or a city.
     */
    @Test
    void wishlistAndNotificationResponsesCarryPlacesNotDistances(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String azureItem = "00000000-0000-4000-8c00-000000010101";

        JsonNode wishlist = fetch("/api/v1/wishlist", collector2);
        assertThat(wishlist).hasSizeGreaterThanOrEqualTo(3);
        fetch("/api/v1/wishlist/price-terms", collector2);
        fetch("/api/v1/collectors/collector2/wishlist", collector1);

        JsonNode notifications = fetch("/api/v1/notifications?limit=50", collector2);
        boolean sawAlert = false;
        for (JsonNode notification : notifications.path("items")) {
            if ("WISHLIST_ALERT".equals(notification.path("type").asString())
                    && azureItem.equals(
                            notification.path("data").path("inventoryItemId").asString())) {
                sawAlert = true;
                assertThat(notification.path("body").asString())
                        .contains("was just listed by @collector1 in Quebec, Canada");
            }
        }
        assertThat(sawAlert).as("the seeded listing alerted collector2").isTrue();
        fetch("/api/v1/notifications", collector1);
        for (Fetched document : fetched) {
            if (document.path().startsWith("/api/v1/wishlist")) {
                // collector2's own wishlist: public wish notes only; item notes still never
                // show.
                assertNoItemNotes(document.body(), document.path());
            } else {
                assertNoPrivateNotes(document.body(), document.path());
            }
        }
        assertContract(output);
    }

    /** Phase 7: ratings, references, reports, listing status and every admin console response. */
    @Test
    void ratingsReportsAndAdminConsoleResponsesNeverCarryGeography(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector4 = "seed-collector4:collector4@orenjitrade.test";
        String seededReport = "00000000-0000-4000-9e00-000000000001";
        UUID collector6 = idOf("collector6");

        JsonNode ratings = fetch("/api/v1/collectors/collector1/ratings", collector4);
        fetch("/api/v1/collectors/collector1/references", collector4);
        fetch("/api/v1/ratings/eligibility?userId=" + idOf("collector2"), collector1);
        fetch("/api/v1/me/reports", collector4);
        fetch("/api/v1/me/listings/status", collector1);
        fetch("/api/v1/public/report-reasons", null);
        JsonNode report = null;
        for (String path :
                List.of(
                        "/api/v1/admin/reports?size=100",
                        "/api/v1/admin/reports/" + seededReport,
                        "/api/v1/admin/users/" + collector6 + "/history",
                        "/api/v1/admin/users/" + collector6 + "/listing-status",
                        "/api/v1/admin/listings/stale?size=100",
                        "/api/v1/admin/listings?size=100",
                        "/api/v1/admin/binders?size=100",
                        "/api/v1/admin/ratings?size=100",
                        "/api/v1/admin/moderation/rules",
                        "/api/v1/admin/dashboard",
                        "/api/v1/admin/notifications/stats",
                        "/api/v1/admin/analytics/summary",
                        "/api/v1/admin/system/health",
                        "/api/v1/admin/regions",
                        "/api/v1/admin/users?size=100")) {
            JsonNode document = fetch(path, SEED_ADMIN);
            if (path.endsWith(seededReport)) {
                report = document;
            }
        }
        assertThat(ratings.path("summary").path("count").asInt())
                .as("collector1's seeded ratings")
                .isEqualTo(2);
        assertThat(report).isNotNull();
        assertThat(report.path("reportedUser").path("handle").asString()).isEqualTo("collector6");
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    @Test
    void offersAndTradesCarryPartyPlacesOnly(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String collector5 = "seed-collector5:collector5@orenjitrade.test";
        String collector6 = "seed-collector6:collector6@orenjitrade.test";
        String openOffer = "00000000-0000-4000-9c00-000000000003";
        String counterOffer = "00000000-0000-4000-9c00-000000000005";

        JsonNode open = fetch("/api/v1/offers/" + openOffer, collector1);
        fetch("/api/v1/offers/" + openOffer, collector5);
        fetch("/api/v1/offers?role=seller", collector1);
        fetch("/api/v1/offers/00000000-0000-4000-9c00-000000000001", collector2);
        JsonNode countered = fetch("/api/v1/offers/" + counterOffer, collector6);
        fetch("/api/v1/offers/00000000-0000-4000-9c00-000000000004", collector2);
        fetch("/api/v1/offers?role=buyer", collector6);
        fetch("/api/v1/trades", collector1);
        JsonNode completed =
                fetch("/api/v1/trades/00000000-0000-4000-9d00-000000000001", collector2);
        fetch("/api/v1/trades/00000000-0000-4000-9d00-000000000002", collector5);
        fetch("/api/v1/me/settings/offers", collector1);

        assertThat(open.path("status").asString()).isEqualTo("OPEN");
        assertThat(open.path("buyer").path("handle").asString()).isEqualTo("collector5");
        assertThat(open.path("seller").path("place").path("label").asString())
                .isEqualTo("Quebec, Canada");
        assertThat(open.path("buyer").path("place").path("label").asString())
                .isEqualTo("California, United States");
        assertThat(countered.path("status").asString()).isEqualTo("COUNTERED");
        assertThat(countered.path("currentTurn").asString()).isEqualTo("BUYER");
        assertThat(completed.path("status").asString()).isEqualTo("COMPLETED");
        assertThat(completed.path("meetup").asBoolean()).isTrue();
        callJson(HttpMethod.GET, "/api/v1/offers/" + openOffer, collector6, null, 404);
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    @Test
    void paymentsAndDisputesNeverCarryGeographyOrProviderAccounts(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String collector5 = "seed-collector5:collector5@orenjitrade.test";
        String collector8 = "seed-collector8:collector8@orenjitrade.test";
        String shippedTrade = "00000000-0000-4000-9d00-000000000003";
        String disputedTrade = "00000000-0000-4000-9d00-000000000004";
        String dispute = "00000000-0000-4000-9f00-000000000101";

        JsonNode shipped;
        JsonNode disputed;
        JsonNode disputeDocument;
        testUsers.update(
                "UPDATE feature_flag SET enabled = true, rollout_percent = 100 WHERE key ="
                        + " 'protectedPayments'");
        featureFlags.invalidate();
        try {
            shipped = fetch("/api/v1/trades/" + shippedTrade, collector8);
            fetch("/api/v1/trades/" + shippedTrade, collector1);
            disputed = fetch("/api/v1/trades/" + disputedTrade, collector5);
            disputeDocument = fetch("/api/v1/disputes/" + dispute, collector5);
            fetch("/api/v1/disputes/" + dispute, collector2);
            fetch("/api/v1/me/seller-account", collector1);
            callJson(HttpMethod.GET, "/api/v1/disputes/" + dispute, collector1, null, 404);
        } finally {
            testUsers.update(
                    "UPDATE feature_flag SET enabled = false WHERE key = 'protectedPayments'");
            featureFlags.invalidate();
        }
        for (String path :
                List.of(
                        "/api/v1/admin/disputes?size=100",
                        "/api/v1/admin/disputes/" + dispute,
                        "/api/v1/admin/transactions?size=100",
                        "/api/v1/admin/transactions/pending-confirmation?size=100",
                        "/api/v1/admin/payments?size=100",
                        "/api/v1/admin/payments/00000000-0000-4000-9f00-000000000001",
                        "/api/v1/admin/payments/webhooks?size=100",
                        "/api/v1/admin/payments/settings")) {
            fetch(path, SEED_ADMIN);
        }
        assertThat(shipped.path("status").asString()).isEqualTo("SHIPPED");
        assertThat(shipped.path("payment").path("status").asString()).isEqualTo("SECURED");
        assertThat(disputed.path("status").asString()).isEqualTo("DISPUTED");
        assertThat(disputeDocument.path("reason").asString()).isEqualTo("NOT_AS_DESCRIBED");
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
            assertThat(document.body().toString())
                    .as("provider accounts never leave the server")
                    .doesNotContain("fake_acct_")
                    .doesNotContain("storageKey");
        }
        assertContract(output);
    }

    /**
     * The usage limits (stage F1: the same caps for everyone, no plans) never carry a place, a plan
     * or a provider reference, for a member nor in the admin list.
     */
    @Test
    void usageLimitsNeverCarryGeography(CapturedOutput output) {
        String formerPremium = "seed-premium-user:premium@orenjitrade.test";
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        JsonNode mine = fetch("/api/v1/me/limits", formerPremium);
        JsonNode theirs = fetch("/api/v1/me/limits", collector1);
        JsonNode staff = fetch("/api/v1/me/limits", SEED_ADMIN);
        fetch("/api/v1/admin/usage-limits", SEED_ADMIN);
        // The same numbers for the former Premium account, a collector and a staff member.
        assertThat(limitNumbers(theirs)).isNotEmpty().containsKey("binders.max");
        assertThat(limitNumbers(mine)).isEqualTo(limitNumbers(theirs));
        assertThat(limitNumbers(staff)).isEqualTo(limitNumbers(theirs));
        for (Fetched document : fetched) {
            assertThat(document.body().toString())
                    .as("no plan, perk or provider reference")
                    .doesNotContain("planCode")
                    .doesNotContain("upgradeUrl")
                    .doesNotContain("fake_sub_")
                    .doesNotContain("map.radius");
        }
        assertContract(output);
    }

    /** Key to number ({@code null}: unlimited) of a {@code GET /me/limits} answer. */
    private static Map<String, @Nullable Integer> limitNumbers(JsonNode myLimits) {
        Map<String, @Nullable Integer> numbers = new LinkedHashMap<>();
        for (JsonNode limit : myLimits.path("limits")) {
            JsonNode max = limit.path("limit");
            numbers.put(limit.path("key").asString(), max.isNumber() ? max.asInt() : null);
        }
        return numbers;
    }

    /** No private notes of the seeded items in a document. */
    private static void assertNoPrivateNotes(JsonNode document, String context) {
        assertThat(document.toString())
                .as("private notes in %s", context)
                .doesNotContain("\"notes\"");
        assertNoItemNotes(document, context);
    }

    /** No private inventory notes of the seeded items in a document. */
    private static void assertNoItemNotes(JsonNode document, String context) {
        assertThat(document.toString())
                .as("private item notes in %s", context)
                .doesNotContain("Grading candidate")
                .doesNotContain("Pulled from a booster box in the spring");
    }

    /**
     * No key describing a position, a distance or an area anywhere in the document, every number
     * with at most 3 decimals, and no distance wording.
     */
    static void assertNoGeography(JsonNode node, String context) {
        if (node.isNumber()) {
            assertThat(decimals(node.decimalValue()))
                    .as("numeric value %s in %s", node, context)
                    .isLessThanOrEqualTo(3);
            return;
        }
        if (node.isString()) {
            assertThat(node.asString())
                    .as("distance wording in %s", context)
                    .doesNotContain("km away")
                    .doesNotContain("km radius");
            return;
        }
        if (node.isObject()) {
            for (String key : node.propertyNames()) {
                assertThat(FORBIDDEN_KEYS).as("key %s in %s", key, context).doesNotContain(key);
            }
        }
        for (JsonNode child : node) {
            assertNoGeography(child, context);
        }
    }

    private static int decimals(BigDecimal value) {
        return Math.max(0, value.stripTrailingZeros().scale());
    }
}
