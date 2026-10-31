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
                    // The seller row's rating comes with the binder for members only (R15).
                    if (caller == null) {
                        assertThat(detail.path("ownerRating").isNull()).isTrue();
                    } else {
                        assertThat(detail.path("ownerRating").has("count")).isTrue();
                    }
                    // Every order of the items (web stage WD: "Recently added" is the web's).
                    fetch("/api/v1/public/binders/" + id + "/items?size=100", caller);
                    fetch("/api/v1/public/binders/" + id + "/items?size=100&sort=recent", caller);
                    fetch("/api/v1/public/binders/" + id + "/items?size=100&sort=price", caller);
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
            // A signed-out visitor never finds a collector by name (stage R15).
            if (caller == null) {
                assertThat(north.size()).isZero();
            } else {
                assertThat(north.size()).isPositive();
            }
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
        JsonNode wishes = fetch("/api/v1/wishlist", collector2);
        assertThat(wishes.size()).isPositive();
        for (JsonNode wish : wishes) {
            assertThat(wish.path("available").isBoolean()).as("%s", wish).isTrue();
        }
        for (String region : List.of("americas-north", "americas-south", "europe")) {
            JsonNode available =
                    fetch("/api/v1/wishlist/availability?region=" + region, collector2);
            assertThat(available.path("region").asString()).isEqualTo(region);
            assertThat(available.path("available").isArray()).isTrue();
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

    /**
     * One game at a time (stage G): every discovery endpoint the phone calls with {@code game=} for
     * each game (One Piece without cards included), signed out, as a fresh collector and as seed
     * collectors: the map's counts, the binders of the region and of a state, the collectors found
     * by name, card holders and deck cores of a card, the wishes available; the games with hasCards
     * and the caller's binders with their game. Places only, never a city outside its owner's
     * profile, a coordinate or a private note.
     */
    @Test
    void oneGameAtATimeCarriesPlacesOnly(CapturedOutput output) {
        String viewer = uniqueUid("geo-g");
        provisionCompliant(viewer);
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector5 = "seed-collector5:collector5@orenjitrade.test";
        UUID cardId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT card_id FROM card_printing WHERE external_ref ->>"
                                                + " 'id' = 'pkm-p001a'")
                                .get(0)
                                .get("card_id");
        JsonNode games = fetch("/api/v1/games", null);
        assertThat(games.findValuesAsString("slug")).contains("onepiece");
        for (String caller : Arrays.asList(null, viewer, collector1, collector5)) {
            for (String game : List.of("yugioh", "pokemon", "mtg", "onepiece", "riftbound")) {
                for (String region : List.of("americas-north", "americas-south", "europe")) {
                    fetch("/api/v1/regions/" + region + "/binder-counts?game=" + game, caller);
                    fetch("/api/v1/regions/" + region + "/binders?game=" + game, caller);
                    assertPlaces(
                            fetch(
                                    "/api/v1/search/collectors?q=collector&limit=10&region="
                                            + region
                                            + "&game="
                                            + game,
                                    caller));
                }
                fetch(
                        "/api/v1/regions/americas-north/subdivisions/CA-QC/binders?game=" + game,
                        caller);
                JsonNode holders =
                        fetch(
                                "/api/v1/search/card-holders?region=americas-north&sort=province"
                                        + "&excludeDeckCoreItems=true&cardId="
                                        + cardId
                                        + "&game="
                                        + game,
                                caller);
                for (JsonNode row : holders.path("items")) {
                    assertPlaces(jsonMapper.createArrayNode().add(row.path("collector")));
                }
                fetch(
                        "/api/v1/search/deck-cores?region=americas-north&cardId="
                                + cardId
                                + "&game="
                                + game,
                        caller);
                if (caller != null) {
                    fetch("/api/v1/wishlist/availability?game=" + game, caller);
                }
            }
        }
        JsonNode mine = fetch("/api/v1/binders", collector1);
        assertThat(mine.findValuesAsString("game")).contains("yugioh", "pokemon");
        for (Fetched document : fetched) {
            String text = document.body().toString();
            for (String handle : NOT_DISCOVERABLE) {
                assertThat(text)
                        .as("%s in %s", handle, document.path())
                        .doesNotContain("\"handle\":\"" + handle + "\"");
            }
            if (!document.path().startsWith("/api/v1/wishlist")) {
                assertNoPrivateNotes(document.body(), document.path());
            }
        }
        assertContract(output);
    }

    /**
     * The profile pages of stage R6 (mockup screens 19 to 21) as the phone reads them, signed in as
     * every seed collector: the profile, then each section (the first public cards, the binders,
     * the wishes when shown, the rating summary and the 2 latest references), and the caller's own
     * copies of a card for "I have it". The city only on its owner's profile while shown; never a
     * coordinate, a distance or a private note.
     */
    @Test
    void profilePagesOfStageR6CarryThePlaceOnly(CapturedOutput output) {
        UUID cardId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT card_id FROM card_printing WHERE external_ref ->>"
                                                + " 'id' = 'ygo-p001a'")
                                .get(0)
                                .get("card_id");
        for (String reader : DISCOVERABLE) {
            String caller =
                    reader.equals("premium_user")
                            ? "seed-premium-user:premium@orenjitrade.test"
                            : "seed-" + reader + ":" + reader + "@orenjitrade.test";
            for (String handle : DISCOVERABLE) {
                String base = "/api/v1/collectors/" + handle;
                JsonNode profile = fetch(base, caller);
                assertThat(profile.path("location").path("subdivisionName").asString())
                        .as("province of %s for %s", handle, reader)
                        .isEqualTo(PLACES.get(handle).split(", ")[0]);
                fetch(base + "/inventory?size=10&excludeDeckCoreItems=true", caller);
                // The web's profile (stage WE): 12 cards of one game, then pages of 24.
                fetch(base + "/inventory?size=12&excludeDeckCoreItems=true&game=yugioh", caller);
                fetch(
                        base + "/inventory?size=24&page=1&excludeDeckCoreItems=true&game=yugioh",
                        caller);
                fetch(base + "/binders", caller);
                fetch(base + "/ratings?limit=1", caller);
                fetch(base + "/references?limit=2", caller);
                JsonNode wishes = json(call(HttpMethod.GET, base + "/wishlist", caller, null));
                if (wishes.isArray()) {
                    fetched.add(new Fetched(base + "/wishlist", caller, wishes));
                }
            }
            JsonNode mine = fetch("/api/v1/inventory/items?size=50&cardId=" + cardId, caller);
            for (JsonNode item : mine.path("items")) {
                assertThat(item.path("card").path("id").asString()).isEqualTo(cardId.toString());
            }
        }
        for (Fetched document : fetched) {
            if (!document.path().startsWith("/api/v1/inventory/items")) {
                assertNoPrivateNotes(document.body(), document.path());
            }
        }
        assertContract(output);
    }

    /** Whether the account confirmed being 18 or older. */
    private boolean ageConfirmed(UUID userId) {
        return testUsers.count(
                        "SELECT count(*) FROM user_consent WHERE user_id = ? AND"
                                + " document_type = 'AGE_CONFIRMATION'",
                        userId)
                > 0;
    }

    /** Posts in americas-north-yugioh as {@code caller}; returns the post's id. */
    private String roomPost(String caller, String body) {
        JsonNode created =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/community/channels/americas-north-yugioh/posts",
                        caller,
                        Map.of("body", body),
                        201);
        fetched.add(new Fetched("POST americas-north-yugioh/posts", caller, created));
        assertThat(created.path("place").isNull()).as("place in the answer to a post").isTrue();
        return created.path("id").asString();
    }

    /** A privacy settings body (as {@code PUT /me/settings/privacy} takes it). */
    private static Map<String, Object> privacy(boolean discoverable, String profileVisibility) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", discoverable);
        body.put("showOnlineStatus", false);
        body.put("showLastActive", true);
        body.put("profileVisibility", profileVisibility);
        body.put("messagingPermission", "MEMBERS_WITH_PROFILE");
        body.put("wishlistVisible", false);
        body.put("searchDiscoverable", true);
        return body;
    }

    /** The token uid of a seed account, by handle. */
    private static String seedUid(String handle) {
        return handle.equals("premium_user")
                ? "seed-premium-user:premium@orenjitrade.test"
                : "seed-" + handle + ":" + handle + "@orenjitrade.test";
    }

    /**
     * Home's feed (stage R7, {@code GET /feed}) as every seed account reads it: every kind, every
     * region, every game. Each post's collector carries a state or province and a country (their
     * seeded place), never a city (not even their own, shown on their profile), a coordinate, a
     * distance or a private note; never the reader's own post; never a collector who is not
     * discoverable. The seed puts every kind in the Yu-Gi-Oh! feed of Americas (North).
     */
    /**
     * Stage R12: the welcome step's live handle check. Asked about every seed account's handle by a
     * newcomer, it answers the handle as typed and a status, never who holds it or where.
     */
    @Test
    void handleCheckOfStageR12CarriesNoPersonOrPlace(CapturedOutput output) {
        String newcomer = uniqueUid("geo-newcomer");
        provisionCompliant(newcomer);
        for (String handle : PLACES.keySet()) {
            JsonNode answer =
                    fetch("/api/v1/me/profile/handle-availability?handle=" + handle, newcomer);
            assertThat(answer.propertyNames())
                    .as("the answer about %s", handle)
                    .containsExactlyInAnyOrder("handle", "status", "available");
            assertThat(answer.path("status").asString()).as(handle).isEqualTo("TAKEN");
            assertThat(answer.toString())
                    .as("no place of %s", handle)
                    .doesNotContain(PLACES.get(handle).split(",")[0]);
        }
        JsonNode own =
                fetch(
                        "/api/v1/me/profile/handle-availability?handle=collector1",
                        "seed-collector1:collector1@orenjitrade.test");
        assertThat(own.path("status").asString()).isEqualTo("CURRENT");
        assertContract(output);
    }

    /**
     * Stage R13: Settings and Edit profile. The one save of Edit profile (`PUT /me/profile` with
     * the tags, sent back as read) answers the caller's own profile without a place; the values of
     * Settings' rows (blocked collectors, my reports) name people and never where they are. The
     * lists are read with people in them (review fix 1: collector1 had blocked and reported nobody,
     * so both were empty): collector1 blocks collector5 (a city shown on their profile) for the
     * test, and collector4's seeded report is read.
     */
    @Test
    void settingsOfStageR13CarryNoPlace(CapturedOutput output) {
        String caller = "seed-collector1:collector1@orenjitrade.test";
        JsonNode profile = fetch("/api/v1/me/profile", caller);
        List<String> tagIds = new ArrayList<>();
        List<String> customLabels = new ArrayList<>();
        for (JsonNode tag : profile.path("tags")) {
            if ("CUSTOM".equals(tag.path("category").asString())) {
                customLabels.add(tag.path("label").asString());
            } else {
                tagIds.add(tag.path("id").asString());
            }
        }
        List<String> games = new ArrayList<>();
        profile.path("games").forEach(game -> games.add(game.asString()));
        List<String> languages = new ArrayList<>();
        profile.path("languages").forEach(language -> languages.add(language.asString()));
        Map<String, Object> tags = new LinkedHashMap<>();
        tags.put("tagIds", tagIds);
        tags.put("customLabels", customLabels);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("handle", profile.path("handle").asString());
        body.put("displayName", profile.path("displayName").asString());
        body.put("bio", profile.path("bio").asString());
        body.put("games", games);
        body.put("languages", languages);
        body.put("tags", tags);
        JsonNode saved = callJson(HttpMethod.PUT, "/api/v1/me/profile", caller, body, 200);
        fetched.add(new Fetched("/api/v1/me/profile (PUT with tags)", caller, saved));
        assertThat(saved.path("tags").size()).isEqualTo(profile.path("tags").size());
        assertThat(saved.propertyNames())
                .as("the own profile's answer")
                .doesNotContain("place", "location", "city", "subdivisionCode", "countryCode");
        UUID blocked = idOf("collector5");
        callJson(HttpMethod.POST, "/api/v1/users/" + blocked + "/block", caller, null, 200);
        try {
            JsonNode blocks = fetch("/api/v1/me/blocks", caller);
            assertThat(blocks.size()).as("collector1's blocked collectors").isEqualTo(1);
            assertThat(blocks.get(0).path("handle").asString()).isEqualTo("collector5");
            assertThat(blocks.get(0).propertyNames())
                    .as("a blocked collector")
                    .doesNotContain("place", "location", "city", "subdivisionCode", "countryCode");
            JsonNode reports =
                    fetch("/api/v1/me/reports", "seed-collector4:collector4@orenjitrade.test");
            assertThat(reports.size()).as("collector4's reports").isGreaterThan(0);
            for (JsonNode report : reports) {
                assertThat(report.path("reportedUser").path("handle").asString()).isNotBlank();
            }
            fetch("/api/v1/me/reports", caller);
            assertContract(output);
        } finally {
            callJson(HttpMethod.DELETE, "/api/v1/users/" + blocked + "/block", caller, null, 204);
        }
    }

    @Test
    void homeFeedCarriesPlacesOnly(CapturedOutput output) {
        Set<String> kindsSeen = new java.util.HashSet<>();
        for (String reader : PLACES.keySet()) {
            String caller = seedUid(reader);
            for (String region : List.of("americas-north", "americas-south", "europe")) {
                for (String game : List.of("yugioh", "pokemon", "mtg", "onepiece", "riftbound")) {
                    checkFeed(
                            fetch(
                                    "/api/v1/feed?limit=50&region=" + region + "&game=" + game,
                                    caller),
                            reader,
                            kindsSeen);
                }
            }
            for (String kind : List.of("NEW_CARDS", "WANTED", "DECK_CORES")) {
                checkFeed(
                        fetch("/api/v1/feed?limit=50&game=yugioh&kind=" + kind, caller),
                        reader,
                        kindsSeen);
            }
            // The web's Home (stage WE): every chip with its 6 pictures per new-cards post.
            for (String kind : List.of("ALL", "NEW_CARDS", "WANTED", "DECK_CORES")) {
                checkFeed(
                        fetch(
                                "/api/v1/feed?limit=20&previews=6&region=americas-north"
                                        + "&game=yugioh&kind="
                                        + kind,
                                caller),
                        reader,
                        kindsSeen);
            }
        }
        assertThat(kindsSeen).containsExactlyInAnyOrder("NEW_CARDS", "WANTED", "DECK_CORE");
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
            for (String handle : NOT_DISCOVERABLE) {
                assertThat(document.body().toString())
                        .as("%s in %s", handle, document.path())
                        .doesNotContain("\"handle\":\"" + handle + "\"");
            }
        }
        assertContract(output);
    }

    private static void checkFeed(JsonNode page, String reader, Set<String> kindsSeen) {
        for (JsonNode post : page.path("items")) {
            String handle = post.path("collector").path("handle").asString();
            kindsSeen.add(post.path("kind").asString());
            assertThat(handle).as("%s reads their own post", reader).isNotEqualTo(reader);
            JsonNode place = post.path("place");
            assertThat(place.path("subdivisionName").asString()).isNotBlank();
            assertThat(place.path("countryName").asString()).isNotBlank();
            if (PLACES.containsKey(handle)) {
                assertThat(place.path("label").asString())
                        .as("place of %s for %s", handle, reader)
                        .isEqualTo(PLACES.get(handle));
            }
            assertThat(post.path("collector").has("city")).isFalse();
            assertThat(place.has("city")).isFalse();
        }
    }

    /**
     * Stage R15, "Browse without an account": a signed-out pass over every open discovery read, in
     * every region and game (Home's feed and its kinds, the map's counts, the binders of each
     * region and state, the holders and deck cores of every seeded public card, unified search,
     * binder search and the suggestions, by every seed handle and name, collector name search, each
     * public binder and its cards). No coordinate, distance or city, as for members; and nobody: no
     * handle, display name or avatar with a value, no account id of a collector anywhere, while the
     * places stay; collector name search finds nobody.
     */
    @Test
    void signedOutVisitorsReadPlacesAndNeverWhoACollectorIs(CapturedOutput output) {
        // Review fix 1 (P1, F1, F4): a photo on a seeded public card and on a seeded public deck
        // core, and the card owner's avatar, so the reads below carry photos and an avatar.
        Map<String, Object> card =
                testUsers
                        .query(
                                "SELECT i.id, u.handle FROM inventory_item i JOIN user_account u"
                                        + " ON u.id = i.owner_id WHERE i.visibility = 'PUBLIC'"
                                        + " AND i.deleted_at IS NULL AND i.binder_id IS NOT NULL"
                                        + " ORDER BY u.handle, i.id LIMIT 1")
                        .get(0);
        Map<String, Object> core =
                testUsers
                        .query(
                                "SELECT b.id, u.handle FROM binder b JOIN user_account u ON u.id"
                                        + " = b.owner_id WHERE b.sells_as_core AND b.visibility ="
                                        + " 'PUBLIC' ORDER BY u.handle, b.id LIMIT 1")
                        .get(0);
        String cardOwner = seedUid((String) card.get("handle"));
        String coreOwner = seedUid((String) core.get("handle"));
        String cardPhotos = "/api/v1/inventory/items/" + card.get("id") + "/images";
        String corePhotos = "/api/v1/binders/" + core.get("id") + "/images";
        JsonNode withPhoto = uploadPng(cardOwner, cardPhotos, 201);
        String cardPhoto =
                withPhoto
                        .path("images")
                        .get(withPhoto.path("images").size() - 1)
                        .path("id")
                        .asString();
        JsonNode coreWithPhoto = uploadPng(coreOwner, corePhotos, 201);
        String corePhoto =
                coreWithPhoto
                        .path("photos")
                        .get(coreWithPhoto.path("photos").size() - 1)
                        .path("id")
                        .asString();
        uploadPng(cardOwner, "/api/v1/me/profile/avatar", 200);
        try {
            readSignedOut(output);
        } finally {
            callJson(HttpMethod.DELETE, cardPhotos + "/" + cardPhoto, cardOwner, null, 204);
            callJson(HttpMethod.DELETE, corePhotos + "/" + corePhoto, coreOwner, null, 204);
            callJson(HttpMethod.DELETE, "/api/v1/me/profile/avatar", cardOwner, null, 204);
        }
    }

    /** The new-cards posts of a feed page with more than the phone's 4 pictures. */
    private static int widePostsOf(JsonNode page) {
        int wide = 0;
        for (JsonNode post : page.path("items")) {
            if (post.path("newCards").path("previews").size() > 4) {
                wide++;
            }
        }
        return wide;
    }

    private void readSignedOut(CapturedOutput output) {
        Map<String, String> userIds = new LinkedHashMap<>();
        List<String> names = new ArrayList<>();
        for (String handle : PLACES.keySet()) {
            userIds.put(handle, idOf(handle).toString());
            for (Map<String, Object> row :
                    testUsers.query(
                            "SELECT ua.display_name AS account_name, p.display_name AS"
                                    + " profile_name FROM user_account ua LEFT JOIN profile p ON"
                                    + " p.user_id = ua.id WHERE ua.handle = ?",
                            handle)) {
                for (Object name :
                        List.of(
                                row.getOrDefault("account_name", ""),
                                row.getOrDefault("profile_name", ""))) {
                    if (name instanceof String text && text.length() >= 4) {
                        names.add(text);
                    }
                }
            }
        }
        List<String> cardIds = new ArrayList<>();
        for (Map<String, Object> row :
                testUsers.query(
                        "SELECT DISTINCT p.card_id FROM inventory_item i JOIN card_printing p ON"
                                + " p.id = i.printing_id WHERE i.visibility = 'PUBLIC'")) {
            cardIds.add(row.get("card_id").toString());
        }
        assertThat(cardIds).as("seeded public cards").isNotEmpty();

        java.util.Set<String> binderIds = new java.util.LinkedHashSet<>();
        int places = 0;
        int widePosts = 0;
        for (String region : List.of("americas-north", "americas-south", "europe")) {
            for (String game : List.of("yugioh", "pokemon", "mtg", "onepiece", "riftbound")) {
                JsonNode feed =
                        fetch("/api/v1/feed?limit=50&region=" + region + "&game=" + game, null);
                for (JsonNode post : feed.path("items")) {
                    assertThat(post.path("place").path("label").asString()).isNotBlank();
                    places++;
                }
                fetch("/api/v1/regions/" + region + "/binders?limit=50&game=" + game, null);
                fetch("/api/v1/regions/" + region + "/binder-counts?game=" + game, null);
            }
            for (String kind : List.of("NEW_CARDS", "WANTED", "DECK_CORES")) {
                fetch("/api/v1/feed?limit=50&game=yugioh&region=" + region + "&kind=" + kind, null);
            }
            // The web's guest Home (stage WE): every game and chip with its 6 pictures per
            // new-cards post, which only `previews` returns (WE review P1).
            for (String game : List.of("yugioh", "pokemon", "mtg", "onepiece", "riftbound")) {
                for (String kind : List.of("ALL", "NEW_CARDS", "WANTED", "DECK_CORES")) {
                    JsonNode web =
                            fetch(
                                    "/api/v1/feed?limit=20&previews=6&region="
                                            + region
                                            + "&game="
                                            + game
                                            + "&kind="
                                            + kind,
                                    null);
                    widePosts += widePostsOf(web);
                }
            }
            // Every page of the web's new cards (the suite's own posts may push the seed's wide
            // posts past the first page): each one goes through the same checks.
            String newCards =
                    "/api/v1/feed?limit=50&previews=6&region="
                            + region
                            + "&game=yugioh&kind=NEW_CARDS";
            JsonNode page = fetch(newCards, null);
            widePosts += widePostsOf(page);
            for (int more = 0; more < 40 && page.path("hasMore").asBoolean(); more++) {
                page =
                        fetch(
                                newCards
                                        + "&cursor="
                                        + java.net.URLEncoder.encode(
                                                page.path("nextCursor").asString(),
                                                java.nio.charset.StandardCharsets.UTF_8),
                                null);
                widePosts += widePostsOf(page);
            }
            JsonNode counts = fetch("/api/v1/regions/" + region + "/binder-counts", null);
            for (JsonNode subdivision : counts.path("subdivisions")) {
                JsonNode binders =
                        fetch(
                                "/api/v1/regions/"
                                        + region
                                        + "/subdivisions/"
                                        + subdivision.path("code").asString()
                                        + "/binders?limit=50",
                                null);
                binders.path("items")
                        .forEach(binder -> binderIds.add(binder.path("id").asString()));
            }
            JsonNode all = fetch("/api/v1/regions/" + region + "/binders?limit=50", null);
            all.path("items").forEach(binder -> binderIds.add(binder.path("id").asString()));
            for (String cardId : cardIds) {
                JsonNode holders =
                        fetch(
                                "/api/v1/search/card-holders?size=50&region="
                                        + region
                                        + "&cardId="
                                        + cardId,
                                null);
                for (JsonNode row : holders.path("items")) {
                    assertThat(row.path("collector").path("place").path("label").asString())
                            .isNotBlank();
                    places++;
                }
                fetch(
                        "/api/v1/search/deck-cores?limit=10&region=" + region + "&cardId=" + cardId,
                        null);
            }
            for (String handle : PLACES.keySet()) {
                JsonNode byName =
                        fetch(
                                "/api/v1/search/collectors?region="
                                        + region
                                        + "&game=yugioh&q="
                                        + handle,
                                null);
                assertThat(byName).as("name search for %s in %s", handle, region).isEmpty();
                JsonNode unified = fetch("/api/v1/search?q=" + handle + "&region=" + region, null);
                assertThat(unified.path("collectors")).as("collectors named %s", handle).isEmpty();
                JsonNode suggest =
                        fetch("/api/v1/search/suggest?q=" + handle + "&region=" + region, null);
                assertThat(suggest)
                        .noneMatch(entry -> "COLLECTOR".equals(entry.path("type").asString()));
            }
            for (String text : List.of("binder", "core", "collector")) {
                JsonNode binders =
                        fetch("/api/v1/search?q=" + text + "&types=binders&region=" + region, null);
                binders.path("binders")
                        .forEach(binder -> binderIds.add(binder.path("id").asString()));
            }
        }
        for (String name : names) {
            fetch(
                    "/api/v1/search/collectors?region=americas-north&game=yugioh&q="
                            + java.net.URLEncoder.encode(
                                    name, java.nio.charset.StandardCharsets.UTF_8),
                    null);
        }
        assertThat(binderIds).as("public binders read by a guest").isNotEmpty();
        for (String binderId : binderIds) {
            JsonNode binder = fetch("/api/v1/public/binders/" + binderId, null);
            assertThat(binder.path("owner").path("place").path("label").asString()).isNotBlank();
            places++;
            fetch("/api/v1/public/binders/" + binderId + "/items?size=100", null);
        }
        assertThat(places).as("places read by a guest").isPositive();
        assertThat(widePosts)
                .as("new-cards posts with 5 or 6 pictures read by a guest (previews=6)")
                .isPositive();

        boolean itemPhotos = false;
        boolean binderPhotos = false;
        for (Fetched document : fetched) {
            String context = document.path() + " signed out";
            assertNobody(document.body(), context, Set.copyOf(userIds.values()));
            String text = document.body().toString();
            // Not even inside a value: a photo or an avatar URL never names an account.
            for (Map.Entry<String, String> account : userIds.entrySet()) {
                assertThat(text)
                        .as("the account id of %s inside %s", account.getKey(), context)
                        .doesNotContain(account.getValue());
            }
            itemPhotos |= text.contains("/api/v1/public/item-images/");
            binderPhotos |= text.contains("/api/v1/public/binder-images/");
            for (String name : names) {
                assertThat(text)
                        .as("the name %s in %s", name, context)
                        .doesNotContain("\"displayName\":\"" + name + "\"");
            }
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertThat(itemPhotos).as("a card's photo read by a guest").isTrue();
        assertThat(binderPhotos).as("a deck core's photo read by a guest").isTrue();
        assertContract(output);
    }

    /** Who a collector is never shows to a signed-out visitor: identity keys null, no user id. */
    private static void assertNobody(JsonNode node, String context, Set<String> userIds) {
        if (node.isString()) {
            assertThat(userIds)
                    .as("a collector's id in %s", context)
                    .doesNotContain(node.asString());
            return;
        }
        if (node.isObject()) {
            for (Map.Entry<String, JsonNode> entry : node.properties()) {
                String key = entry.getKey();
                if (Set.of("handle", "displayName", "avatarUrl").contains(key)) {
                    assertThat(entry.getValue().isNull()).as("%s in %s", key, context).isTrue();
                }
                if (Set.of("collector", "owner").contains(key) && entry.getValue().isObject()) {
                    assertThat(entry.getValue().path("id").isNull())
                            .as("the %s's id in %s", key, context)
                            .isTrue();
                    assertThat(
                                    entry.getValue().path("rating").isMissingNode()
                                            || entry.getValue().path("rating").isNull())
                            .as("the %s's rating in %s", key, context)
                            .isTrue();
                }
            }
        }
        for (JsonNode child : node) {
            assertNobody(child, context, userIds);
        }
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
     * links, blocks, community rooms, posts and replies); the seeded conversation and posts are
     * served as seeded; the 15 rooms of stage R11 exist and the old channels are archived. Every
     * seed account reads every room of every region: posts carry their author's place (state or
     * province and country) only for discoverable authors, never a city; the room list's newest
     * post carries no place.
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

        // Stage R11: one room per platform region and game; the old channels are archived. Every
        // seed account reads every room: a post carries its author's state or province and
        // country (discoverable authors only), never a city; the room list carries no place.
        JsonNode channels = fetch("/api/v1/community/channels", collector1);
        List<String> slugs = new ArrayList<>();
        channels.forEach(channel -> slugs.add(channel.path("slug").asString()));
        assertThat(slugs)
                .contains("americas-north-yugioh", "americas-south-pokemon", "europe-riftbound")
                .doesNotContain("americas-north", "general", "montreal-yugioh");

        // Every seeded post is by a discoverable collector: a collector who is not discoverable
        // (collector7) and a discoverable one with a PRIVATE profile post first, so the rule runs
        // for both (stage R11 review fix 1, P4). Both posts are deleted at the end.
        UUID seventh = idOf("collector7");
        boolean seventhConfirmed = ageConfirmed(seventh);
        testUsers.confirmAge(seventh);
        String secret = uniqueUid("geo-private");
        provisionCompliant(secret);
        setLocation(secret, "CA", "CA-BC", "Zqgeoprivatecity");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                secret,
                privacy(true, "PRIVATE"),
                200);
        String secretHandle = me(secret).path("handle").asString();
        Map<String, String> unplaced = new LinkedHashMap<>();
        Map<String, Integer> unplacedReads = new LinkedHashMap<>();
        try {
            unplaced.put(
                    roomPost(seedUid("collector7"), "Trading Yu-Gi-Oh! singles by mail"),
                    seedUid("collector7"));
            unplaced.put(roomPost(secret, "Yu-Gi-Oh! singles by mail, ask me"), secret);
            Set<String> seededRooms = new java.util.HashSet<>();
            for (String reader : PLACES.keySet()) {
                String caller = seedUid(reader);
                for (String region : List.of("americas-north", "americas-south", "europe")) {
                    for (JsonNode room :
                            fetch("/api/v1/community/channels?region=" + region, caller)) {
                        assertThat(room.path("lastPost").has("place")).isFalse();
                        String slug = room.path("slug").asString();
                        JsonNode posts =
                                fetch("/api/v1/community/channels/" + slug + "/posts", caller);
                        for (JsonNode post : posts.path("items")) {
                            seededRooms.add(slug);
                            String author = post.path("author").path("handle").asString();
                            JsonNode place = post.path("place");
                            if (NOT_DISCOVERABLE.contains(author) || author.equals(secretHandle)) {
                                assertThat(place.isNull())
                                        .as("place of %s for %s", author, reader)
                                        .isTrue();
                                unplacedReads.merge(author, 1, Integer::sum);
                            } else if (PLACES.containsKey(author)) {
                                assertThat(place.path("label").asString())
                                        .as("place of %s for %s", author, reader)
                                        .isEqualTo(PLACES.get(author));
                            }
                            assertThat(post.path("author").has("city")).isFalse();
                            assertThat(place.has("city")).isFalse();
                        }
                    }
                }
            }
            assertThat(seededRooms)
                    .as("rooms with seeded posts")
                    .contains("americas-north-yugioh", "europe-yugioh", "americas-south-pokemon");
            // Both posts were read (collector7's by collector7 too), and the PRIVATE profile reads
            // its own post without a place, as the others do (the author reads what others read).
            assertThat(unplacedReads).containsKeys("collector7");
            assertThat(unplacedReads.get("collector7")).isGreaterThan(1);
            JsonNode own =
                    fetch("/api/v1/community/channels/americas-north-yugioh/posts", secret)
                            .path("items");
            boolean ownSeen = false;
            for (JsonNode post : own) {
                if (post.path("author").path("handle").asString().equals(secretHandle)) {
                    assertThat(post.path("place").isNull()).as("own place").isTrue();
                    ownSeen = true;
                }
            }
            assertThat(ownSeen).as("the PRIVATE profile's own post").isTrue();
            assertThat(unplacedReads.get(secretHandle)).isGreaterThan(1);
            for (Fetched document : fetched) {
                assertThat(document.body().toString())
                        .as("the PRIVATE profile's place in %s", document.path())
                        .doesNotContain("British Columbia")
                        .doesNotContain("Zqgeoprivatecity");
            }
        } finally {
            for (Map.Entry<String, String> post : unplaced.entrySet()) {
                callJson(
                        HttpMethod.DELETE,
                        "/api/v1/community/posts/" + post.getKey(),
                        post.getValue(),
                        null,
                        204);
            }
            if (!seventhConfirmed) {
                testUsers.update(
                        "DELETE FROM user_consent WHERE user_id = ? AND document_type ="
                                + " 'AGE_CONFIRMATION'",
                        seventh);
            }
        }
        JsonNode seededPosts =
                fetch("/api/v1/community/channels/americas-north-yugioh/posts", collector2);
        for (JsonNode post : seededPosts.path("items")) {
            fetch("/api/v1/community/posts/" + post.path("id").asString() + "/replies", collector2);
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
        // WF review P3: the buyer rates the seller once, so the RATING_RECEIVED row RatingService
        // writes (with the rater's id since WF) is read through the contract; taken back after.
        UUID sellerId = idOf("collector5");
        String sellerSummary =
                (String)
                        testUsers
                                .query(
                                        "SELECT (SELECT row_to_json(s)::text FROM rating_summary s"
                                                + " WHERE s.user_id = ?) AS v",
                                        sellerId)
                                .get(0)
                                .get("v");
        String ratingId = null;
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
                // Stage R14: the rating form names the deal, and nothing else about the sale.
                String otherId = idOf(other).toString();
                JsonNode eligibility =
                        fetch("/api/v1/ratings/eligibility?userId=" + otherId, caller);
                JsonNode deal = null;
                for (JsonNode interaction : eligibility.path("interactions")) {
                    if ("SALE".equals(interaction.path("kind").asString())) {
                        deal = interaction;
                    }
                }
                assertThat(deal).as("the sale's interaction for %s", caller).isNotNull();
                assertThat(deal.path("dealName").asString()).isNotBlank();
                assertThat(deal.propertyNames())
                        .as("a sale's interaction")
                        .doesNotContain("trackingNumber", "place", "city", "sellerId", "buyerId");
                assertThat(eligibility.toString()).doesNotContain("LX123456789CA");
                if (caller.equals(buyer)) {
                    JsonNode rating =
                            callJson(
                                    HttpMethod.POST,
                                    "/api/v1/ratings",
                                    buyer,
                                    Map.of(
                                            "interactionId",
                                            deal.path("id").asString(),
                                            "overall",
                                            5),
                                    201);
                    fetched.add(new Fetched("/api/v1/ratings", buyer, rating));
                    ratingId = rating.path("id").asString();
                }
            }
            JsonNode sellerNotifications = fetch("/api/v1/notifications?limit=50", seller);
            JsonNode rated = null;
            for (JsonNode row : sellerNotifications.path("items")) {
                if ("RATING_RECEIVED".equals(row.path("type").asString())
                        && ratingId != null
                        && ratingId.equals(row.path("data").path("ratingId").asString())) {
                    rated = row;
                }
            }
            assertThat(rated).as("the seller's RATING_RECEIVED of the buyer's rating").isNotNull();
            assertThat(rated.path("data").path("raterId").asString()).isEqualTo(buyerId.toString());
            // The undo of a sale is closed once rated: the rating is taken back first.
            removeRating(ratingId, sellerId, sellerSummary);
            ratingId = null;
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
            if (ratingId != null) {
                removeRating(ratingId, sellerId, sellerSummary);
            }
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
     * Takes back a rating made by a test (WF review P3): the rating, its notification, and the
     * ratee's summary as it was before ({@code summary} its row as JSON, {@code null} for none).
     */
    private void removeRating(String ratingId, UUID rateeId, @Nullable String summary) {
        testUsers.update(
                "DELETE FROM notification WHERE type = 'RATING_RECEIVED' AND data->>'ratingId' = ?",
                ratingId);
        testUsers.update("DELETE FROM rating WHERE id = ?", UUID.fromString(ratingId));
        testUsers.update("DELETE FROM rating_summary WHERE user_id = ?", rateeId);
        if (summary != null) {
            testUsers.update(
                    "INSERT INTO rating_summary SELECT * FROM json_populate_record(NULL::"
                            + "rating_summary, CAST(? AS json))",
                    summary);
        }
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
                // Stage R9: the phone's row names the province only, never a city.
                JsonNode data = notification.path("data");
                assertThat(data.path("province").asString()).isEqualTo("Quebec");
                assertThat(data.path("collectorHandle").asString()).isEqualTo("collector1");
            }
        }
        assertThat(sawAlert).as("the seeded listing alerted collector2").isTrue();
        fetch("/api/v1/notifications", collector1);
        // Stage R9: the phone's bell and screen leave chats out (excludeTypes=MESSAGE).
        for (String caller : List.of(collector1, collector2)) {
            JsonNode phone = fetch("/api/v1/notifications?limit=50&excludeTypes=MESSAGE", caller);
            phone.path("items")
                    .forEach(n -> assertThat(n.path("type").asString()).isNotEqualTo("MESSAGE"));
            fetch("/api/v1/notifications/unread-count?excludeTypes=MESSAGE", caller);
        }
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
