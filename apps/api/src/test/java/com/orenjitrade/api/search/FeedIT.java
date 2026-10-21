package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import com.orenjitrade.api.search.domain.FeedRules;
import com.orenjitrade.api.search.infra.FeedRepository;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Home's feed, {@code GET /api/v1/feed} (stage R7 of the phone redesign; owner prompt of
 * 2026-10-19, sections 5 and 7): each kind, the grouping per hour, the 30-day window, paging
 * without a duplicate or a missing post, region and game scoping, the caller left out, blocks both
 * ways before the limit, hidden wishlists, private and stale cards, cards in a public deck core, a
 * sold deck core, a binder that becomes a deck core (V133), the validation.
 *
 * <p>The regions are shared by the whole suite, so a test reads only its own collectors' posts,
 * except where the head of the feed matters (blocks before the limit, paging): there the test's
 * posts are dated in the future ({@link #newestBase}), each such test further ahead than the one
 * before, so they are the newest of the region whatever the other tests left. Those are all
 * Yu-Gi-Oh! posts: Pokémon in the region keeps no post dated ahead of the clock, for the test that
 * needs the server's clock to pass its posts ({@link #laterPagesKeepTheFirstPagesTime}).
 */
class FeedIT extends AbstractSearchIT {

    private static final String REGION = "americas-north";

    @Autowired private FeedRepository feedRepository;

    private static final AtomicInteger AHEAD = new AtomicInteger();

    /**
     * A time in the future, each call a year further than the one before: the posts a test dates
     * from it are the newest of the region, whatever the tests before it left.
     */
    private static Instant newestBase() {
        return Instant.now()
                .truncatedTo(ChronoUnit.HOURS)
                .plus(Duration.ofDays(365L * AHEAD.incrementAndGet()));
    }

    private JsonNode feed(String uid, String query) {
        return get(uid, 200, "/api/v1/feed?" + query);
    }

    /** One page after {@code cursor}. */
    private JsonNode after(String uid, String query, String cursor) {
        return get(uid, 200, "/api/v1/feed?" + query + "&cursor={c}", cursor);
    }

    private static List<String> collectorIds(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(post -> ids.add(post.path("collector").path("id").asString()));
        return ids;
    }

    /** Every post of the feed, page by page ({@code limit} per page). */
    private List<JsonNode> everything(String uid, String query, int limit) {
        List<JsonNode> posts = new ArrayList<>();
        @Nullable String cursor = null;
        for (int page = 0; page < 500; page++) {
            JsonNode body =
                    cursor == null
                            ? feed(uid, query + "&limit=" + limit)
                            : get(
                                    uid,
                                    200,
                                    "/api/v1/feed?" + query + "&limit=" + limit + "&cursor={c}",
                                    cursor);
            body.path("items").forEach(posts::add);
            assertThat(body.path("items").size()).isLessThanOrEqualTo(limit);
            if (body.path("nextCursor").isNull()) {
                assertThat(body.path("hasMore").asBoolean()).isFalse();
                return posts;
            }
            assertThat(body.path("hasMore").asBoolean()).isTrue();
            cursor = body.path("nextCursor").asString();
        }
        throw new AssertionError("the feed never ended");
    }

    /** The posts of {@code collector} in a list of posts. */
    private static List<JsonNode> of(List<JsonNode> posts, Collector collector) {
        return posts.stream()
                .filter(
                        post ->
                                post.path("collector")
                                        .path("id")
                                        .asString()
                                        .equals(collector.id().toString()))
                .toList();
    }

    private List<JsonNode> postsOf(String viewerUid, Collector collector, String game) {
        return of(everything(viewerUid, "region=" + REGION + "&game=" + game, 50), collector);
    }

    private static List<String> kinds(List<JsonNode> posts) {
        return posts.stream().map(post -> post.path("kind").asString()).toList();
    }

    private void showWishlist(Collector collector) {
        Map<String, Object> body = privacy(true, "MEMBERS");
        body.put("wishlistVisible", true);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", collector.uid(), body, 200);
    }

    private String wish(Collector collector, UUID cardId, Map<String, Object> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cardId", cardId.toString());
        body.putAll(fields);
        return callJson(HttpMethod.POST, "/api/v1/wishlist", collector.uid(), body, 201)
                .path("id")
                .asString();
    }

    /** A public binder of {@code game}, a deck core when {@code price} is given. */
    private String publicBinder(
            Collector owner, String game, String name, @Nullable String price, String note) {
        Map<String, Object> body =
                binder(name, "PUBLIC", InventoryTestSupport.gameId(testUsers, game));
        body.put("description", note);
        if (price != null) {
            body.put("sellsAsCore", true);
            body.put("askingPriceText", price);
        }
        return callJson(HttpMethod.POST, "/api/v1/binders", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    private String fileCard(Collector owner, String binderId, UUID printing, String visibility) {
        Map<String, Object> body = item(printing);
        body.put("binderId", binderId);
        body.put("visibility", visibility);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    private void cardListedAt(String itemId, Instant at) {
        testUsers.update(
                "UPDATE inventory_item SET listing_changed_at = ? WHERE id = ?::uuid",
                Timestamp.from(at),
                itemId);
    }

    private void wishMadeAt(String wishId, Instant at) {
        testUsers.update(
                "UPDATE wishlist_item SET created_at = ? WHERE id = ?::uuid",
                Timestamp.from(at),
                wishId);
    }

    private void coreListedAt(String binderId, Instant at) {
        testUsers.update(
                "UPDATE binder SET listing_changed_at = ?, core_since = ? WHERE id = ?::uuid",
                Timestamp.from(at),
                Timestamp.from(at),
                binderId);
    }

    private static JsonNode only(List<JsonNode> posts, String kind) {
        List<JsonNode> matching =
                posts.stream().filter(post -> kind.equals(post.path("kind").asString())).toList();
        assertThat(matching).as("%s posts in %s", kind, posts).hasSize(1);
        return matching.get(0);
    }

    @Test
    void eachKindCarriesWhatThePhoneShowsAndAPlaceOnly() {
        Collector seller = collector("feed-kinds");
        showWishlist(seller);
        Collector viewer = collector("feed-kinds-viewer");
        IsolatedCard card = isolatedPrinting("ygo-p001a");
        String first = publicItem(seller, card.printingId(), Map.of("askingPriceText", "$12.50"));
        String second = publicItem(seller, printing("ygo-p005a"), Map.of());
        String wishId =
                wish(
                        seller,
                        cardOf(printing("ygo-p003a")),
                        Map.of("nearMintOnly", true, "priceTerm", "85% TCG"));
        String core =
                publicBinder(
                        seller,
                        "yugioh",
                        token() + " core",
                        "Trade only",
                        "14 cards, NM, in sleeves.\nShips tracked.");
        fileCard(seller, core, printing("ygo-p012a"), "PRIVATE");
        // Both cards inside one clock hour, whatever the time the test runs (R7 review F5: at
        // hh:20 the two cards fell into two hours, two posts).
        Instant base = Instant.now().truncatedTo(ChronoUnit.HOURS).minus(Duration.ofMinutes(30));
        cardListedAt(first, base.minusSeconds(60));
        cardListedAt(second, base);
        wishMadeAt(wishId, base.minus(Duration.ofHours(2)));
        coreListedAt(core, base.minus(Duration.ofHours(3)));

        List<JsonNode> posts = postsOf(viewer.uid(), seller, "yugioh");
        assertThat(kinds(posts)).containsExactly("NEW_CARDS", "WANTED", "DECK_CORE");

        JsonNode cards = only(posts, "NEW_CARDS");
        assertThat(cards.path("collector").path("handle").asString()).isEqualTo(seller.handle());
        assertThat(cards.path("collector").has("displayName")).isTrue();
        assertThat(cards.path("place").path("subdivisionName").asString()).isEqualTo("Quebec");
        assertThat(cards.path("place").path("countryName").asString()).isEqualTo("Canada");
        assertThat(cards.path("newCards").path("total").asLong()).isEqualTo(2);
        JsonNode previews = cards.path("newCards").path("previews");
        assertThat(previews).hasSize(2);
        // Newest first: the second card became public a minute after the first.
        assertThat(previews.get(0).path("itemId").asString()).isEqualTo(second);
        JsonNode priced = previews.get(1);
        assertThat(priced.path("itemId").asString()).isEqualTo(first);
        assertThat(priced.path("cardId").asString()).isEqualTo(card.cardId().toString());
        assertThat(priced.path("printingId").asString()).isEqualTo(card.printingId().toString());
        assertThat(priced.path("askingPriceText").asString()).isEqualTo("$12.50");
        assertThat(priced.path("printingCode").asString()).isNotBlank();
        assertThat(priced.path("rarity").asString()).isNotBlank();
        assertThat(priced.path("imageUrl").asString()).isNotBlank().doesNotContain("ygoprodeck");
        assertThat(cards.path("at").asString()).isNotBlank();
        assertThat(cards.path("wanted").isNull()).isTrue();
        assertThat(cards.path("deckCore").isNull()).isTrue();

        JsonNode wanted = only(posts, "WANTED").path("wanted");
        assertThat(wanted.path("wishId").asString()).isEqualTo(wishId);
        assertThat(wanted.path("name").asString()).isEqualTo("Mirrorblade Knight");
        assertThat(wanted.path("printing").isNull()).isTrue();
        assertThat(wanted.path("nearMintOnly").asBoolean()).isTrue();
        assertThat(wanted.path("priceTerm").path("label").asString()).isEqualTo("85% TCG");
        assertThat(wanted.path("imageUrl").asString()).isNotBlank();

        JsonNode deckCore = only(posts, "DECK_CORE").path("deckCore");
        assertThat(deckCore.path("binderId").asString()).isEqualTo(core);
        assertThat(deckCore.path("askingPriceText").asString()).isEqualTo("Trade only");
        assertThat(deckCore.path("photoCount").asInt()).isZero();
        assertThat(deckCore.path("photoUrl").isNull()).isTrue();
        // No photo: the key cards' pictures (the private card of a deck core is a key card).
        assertThat(deckCore.path("previewImages")).hasSize(1);
        assertThat(deckCore.path("noteFirstLine").asString())
                .isEqualTo("14 cards, NM, in sleeves.");

        // Kind by kind.
        String query = "region=" + REGION + "&game=yugioh&kind=";
        assertThat(kinds(of(everything(viewer.uid(), query + "NEW_CARDS", 50), seller)))
                .containsExactly("NEW_CARDS");
        assertThat(kinds(of(everything(viewer.uid(), query + "WANTED", 50), seller)))
                .containsExactly("WANTED");
        assertThat(kinds(of(everything(viewer.uid(), query + "DECK_CORES", 50), seller)))
                .containsExactly("DECK_CORE");
        JsonNode page = feed(viewer.uid(), query + "WANTED");
        assertThat(page.path("kind").asString()).isEqualTo("WANTED");
        assertThat(page.path("windowDays").asInt()).isEqualTo(30);
        assertThat(page.path("region").asString()).isEqualTo(REGION);
        assertThat(page.path("game").asString()).isEqualTo("yugioh");
        assertThat(page.path("gameHasPosts").asBoolean()).isTrue();
        assertThat(page.path("regionHasPosts").asBoolean()).isTrue();
        assertThat(page.toString()).doesNotContain("\"city\"").doesNotContain("latitude");
    }

    @Test
    void oneCollectorsCardsOfOneHourAreOnePostAndTheNextHourAnother() {
        Collector seller = collector("feed-hours");
        Collector viewer = collector("feed-hours-viewer");
        Instant hour = Instant.now().truncatedTo(ChronoUnit.HOURS).minus(Duration.ofHours(3));
        List<String> early = new ArrayList<>();
        for (String ref :
                List.of("ygo-p006a", "ygo-p008a", "ygo-p010a", "ygo-p015a", "ygo-p016a")) {
            early.add(publicItem(seller, printing(ref), Map.of()));
        }
        for (int i = 0; i < early.size(); i++) {
            cardListedAt(early.get(i), hour.plus(Duration.ofMinutes(5 + 10 * i)));
        }
        String later = publicItem(seller, printing("ygo-p017a"), Map.of());
        cardListedAt(later, hour.plus(Duration.ofMinutes(65)));

        List<JsonNode> posts = postsOf(viewer.uid(), seller, "yugioh");
        assertThat(kinds(posts)).containsExactly("NEW_CARDS", "NEW_CARDS");
        JsonNode single = posts.get(0);
        assertThat(single.path("newCards").path("total").asLong()).isEqualTo(1);
        assertThat(single.path("newCards").path("previews").get(0).path("itemId").asString())
                .isEqualTo(later);
        JsonNode group = posts.get(1);
        assertThat(group.path("newCards").path("total").asLong()).isEqualTo(5);
        JsonNode previews = group.path("newCards").path("previews");
        assertThat(previews).hasSize(FeedRules.PREVIEWS_MAX);
        assertThat(previews.get(0).path("itemId").asString()).isEqualTo(early.get(4));
        assertThat(previews.get(3).path("itemId").asString()).isEqualTo(early.get(1));
        // The post is dated by its newest card; its id is the Java rule's (SQL and Java agree).
        assertThat(Instant.parse(group.path("at").asString()))
                .isEqualTo(hour.plus(Duration.ofMinutes(45)));
        long groupHour = FeedRules.hourOf(hour);
        assertThat(group.path("id").asString())
                .isEqualTo(FeedRules.cardsPostId(seller.id(), groupHour).toString());
        assertThat(single.path("id").asString())
                .isEqualTo(FeedRules.cardsPostId(seller.id(), groupHour + 1).toString());
    }

    @Test
    void nothingOlderThanTheWindowEverAppears() {
        Collector seller = collector("feed-window");
        showWishlist(seller);
        Collector viewer = collector("feed-window-viewer");
        Instant now = Instant.now();
        String oldCard = publicItem(seller, printing("ygo-p006a"), Map.of());
        String recentCard = publicItem(seller, printing("ygo-p008a"), Map.of());
        String oldWish = wish(seller, cardOf(printing("ygo-p010a")), Map.of());
        String recentWish = wish(seller, cardOf(printing("ygo-p013a")), Map.of());
        String oldCore = publicBinder(seller, "yugioh", token() + " old core", "$40", "");
        String recentCore = publicBinder(seller, "yugioh", token() + " new core", "$50", "");
        cardListedAt(oldCard, now.minus(Duration.ofDays(31)));
        cardListedAt(recentCard, now.minus(Duration.ofDays(29)));
        wishMadeAt(oldWish, now.minus(Duration.ofDays(31)));
        wishMadeAt(recentWish, now.minus(Duration.ofDays(29)).plusSeconds(10));
        coreListedAt(oldCore, now.minus(Duration.ofDays(30)).minusSeconds(5));
        coreListedAt(recentCore, now.minus(Duration.ofDays(29)).plusSeconds(20));

        List<JsonNode> posts = postsOf(viewer.uid(), seller, "yugioh");
        assertThat(kinds(posts)).containsExactly("DECK_CORE", "WANTED", "NEW_CARDS");
        assertThat(only(posts, "DECK_CORE").path("deckCore").path("binderId").asString())
                .isEqualTo(recentCore);
        assertThat(only(posts, "WANTED").path("wanted").path("wishId").asString())
                .isEqualTo(recentWish);
        assertThat(
                        only(posts, "NEW_CARDS")
                                .path("newCards")
                                .path("previews")
                                .get(0)
                                .path("itemId")
                                .asString())
                .isEqualTo(recentCard);
        // A deck core of an old binder: the later of the two times dates it (V133).
        coreListedAt(oldCore, now.minus(Duration.ofDays(60)));
        testUsers.update(
                "UPDATE binder SET core_since = ? WHERE id = ?::uuid",
                Timestamp.from(now.minus(Duration.ofDays(1))),
                oldCore);
        assertThat(
                        postsOf(viewer.uid(), seller, "yugioh").stream()
                                .map(post -> post.path("deckCore").path("binderId").asString())
                                .toList())
                .contains(oldCore, recentCore);
    }

    @Test
    void aPublicBinderTurnedIntoADeckCoreIsNewFromThatMoment() {
        Collector seller = collector("feed-turned");
        Collector viewer = collector("feed-turned-viewer");
        String binderId = publicBinder(seller, "yugioh", token() + " binder", null, "");
        fileCard(seller, binderId, printing("ygo-p019a"), "PUBLIC");
        testUsers.update(
                "UPDATE binder SET listing_changed_at = now() - interval '90 days', created_at ="
                        + " now() - interval '90 days' WHERE id = ?::uuid",
                binderId);
        testUsers.update(
                "UPDATE inventory_item SET listing_changed_at = now() - interval '90 days' WHERE"
                        + " binder_id = ?::uuid",
                binderId);
        assertThat(postsOf(viewer.uid(), seller, "yugioh")).isEmpty();

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("sellsAsCore", true);
        patch.put("askingPriceText", "$80");
        callJson(HttpMethod.PATCH, "/api/v1/binders/" + binderId, seller.uid(), patch, 200);
        List<JsonNode> posts = postsOf(viewer.uid(), seller, "yugioh");
        assertThat(kinds(posts)).containsExactly("DECK_CORE");
        assertThat(Instant.parse(posts.get(0).path("at").asString()))
                .isAfter(Instant.now().minus(Duration.ofMinutes(5)));
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM binder WHERE id = ?::uuid AND core_since IS"
                                        + " NOT NULL",
                                binderId))
                .isEqualTo(1);

        // Off again: no deck core, no post (and no time kept for it).
        Map<String, Object> off = new LinkedHashMap<>();
        off.put("sellsAsCore", false);
        callJson(HttpMethod.PATCH, "/api/v1/binders/" + binderId, seller.uid(), off, 200);
        assertThat(postsOf(viewer.uid(), seller, "yugioh")).isEmpty();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM binder WHERE id = ?::uuid AND core_since IS"
                                        + " NULL",
                                binderId))
                .isEqualTo(1);
    }

    @Test
    void pagesHoldEveryPostOnceInOrder() {
        Collector a = collector("feed-pages-a");
        showWishlist(a);
        Collector b = collector("feed-pages-b");
        Collector viewer = collector("feed-pages-viewer");
        Instant base = newestBase();
        List<String> mine = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            String itemId = publicItem(b, printing("ygo-p00" + (i + 6) + "a"), Map.of());
            // One card per hour: four posts.
            cardListedAt(itemId, base.plus(Duration.ofHours(i)));
        }
        for (String ref : List.of("ygo-p013a", "ygo-p015a", "ygo-p016a")) {
            String wishId = wish(a, cardOf(printing(ref)), Map.of());
            wishMadeAt(wishId, base.plus(Duration.ofMinutes(30 + mine.size() * 60)));
            mine.add(wishId);
        }
        String core = publicBinder(a, "yugioh", token() + " core", "$70", "");
        coreListedAt(core, base.plus(Duration.ofMinutes(15)));

        String query = "region=" + REGION + "&game=yugioh";
        List<JsonNode> big = everything(viewer.uid(), query, 50);
        List<JsonNode> small = everything(viewer.uid(), query, 3);
        List<String> bigIds = big.stream().map(post -> post.path("id").asString()).toList();
        List<String> smallIds = small.stream().map(post -> post.path("id").asString()).toList();
        assertThat(smallIds).isEqualTo(bigIds);
        assertThat(new HashSet<>(bigIds)).hasSameSizeAs(bigIds);
        // Newest first, ties by id: the order is the key's.
        for (int i = 1; i < big.size(); i++) {
            Instant previous = Instant.parse(big.get(i - 1).path("at").asString());
            Instant current = Instant.parse(big.get(i).path("at").asString());
            assertThat(current).isBeforeOrEqualTo(previous);
        }
        // The test's eight posts are the newest of the region, in their order.
        List<JsonNode> head = big.subList(0, 8);
        assertThat(head.stream().map(post -> post.path("collector").path("id").asString()))
                .allMatch(id -> id.equals(a.id().toString()) || id.equals(b.id().toString()));
        assertThat(kinds(head))
                .containsExactly(
                        "NEW_CARDS",
                        "WANTED",
                        "NEW_CARDS",
                        "WANTED",
                        "NEW_CARDS",
                        "WANTED",
                        "DECK_CORE",
                        "NEW_CARDS");
        // A cursor is opaque but checked.
        get(viewer.uid(), 400, "/api/v1/feed?" + query + "&cursor=not-a-cursor");
    }

    @Test
    void theRegionAndTheGameScopeEveryKind() {
        Collector quebec = collector("feed-scope-qc");
        showWishlist(quebec);
        Collector madrid = collector("feed-scope-es", "ES", "ES-MD");
        Collector viewer = collector("feed-scope-viewer");
        publicItem(madrid, printing("ygo-p006a"), Map.of());
        publicItem(quebec, printing("pkm-p002a"), Map.of());
        wish(quebec, cardOf(printing("pkm-p001a")), Map.of());
        String pokemonCore = publicBinder(quebec, "pokemon", token() + " core", "$30", "");
        fileCard(quebec, pokemonCore, printing("pkm-p013a"), "PUBLIC");

        assertThat(postsOf(viewer.uid(), madrid, "yugioh")).isEmpty();
        assertThat(kinds(of(everything(viewer.uid(), "region=europe&game=yugioh", 50), madrid)))
                .containsExactly("NEW_CARDS");
        // Pokémon cards, wishes and deck cores never show for Yu-Gi-Oh!.
        assertThat(postsOf(viewer.uid(), quebec, "yugioh")).isEmpty();
        assertThat(kinds(postsOf(viewer.uid(), quebec, "pokemon")))
                .containsExactlyInAnyOrder("NEW_CARDS", "WANTED", "DECK_CORE");
        // The deck core's own card is no new-card post: the deck core covers it.
        JsonNode cards = only(postsOf(viewer.uid(), quebec, "pokemon"), "NEW_CARDS");
        assertThat(cards.path("newCards").path("total").asLong()).isEqualTo(1);
        // A game without a post: the empty state says the game is quiet, not the region.
        JsonNode quiet = feed(viewer.uid(), "region=" + REGION + "&game=onepiece");
        assertThat(quiet.path("items")).isEmpty();
        assertThat(quiet.path("nextCursor").isNull()).isTrue();
        assertThat(quiet.path("gameHasPosts").asBoolean()).isFalse();
        assertThat(quiet.path("regionHasPosts").asBoolean()).isTrue();
    }

    @Test
    void theCallerNeverSeesTheirOwnPosts() {
        Collector seller = collector("feed-own");
        showWishlist(seller);
        publicItem(seller, printing("ygo-p006a"), Map.of());
        wish(seller, cardOf(printing("ygo-p013a")), Map.of());
        publicBinder(seller, "yugioh", token() + " core", "$20", "");
        Collector viewer = collector("feed-own-viewer");
        assertThat(postsOf(viewer.uid(), seller, "yugioh")).hasSize(3);
        assertThat(postsOf(seller.uid(), seller, "yugioh")).isEmpty();
    }

    @Test
    void blocksBothWaysAreLeftOutBeforeTheLimit() {
        Collector viewer = collector("feed-block-viewer");
        Collector blocked = collector("feed-block-blocked");
        Collector blocker = collector("feed-block-blocker");
        Collector other = collector("feed-block-other");
        Instant base = newestBase();
        // Each of the three has a post of each kind; the blocked pair's are the newer ones, so a
        // block applied after the limit would leave a page short (R7 review P2: wishes and deck
        // cores were checked by no test).
        Map<Collector, Integer> offsets = Map.of(blocked, 3000, blocker, 2000, other, 1000);
        Map<Collector, String> wishes = new LinkedHashMap<>();
        Map<Collector, String> cores = new LinkedHashMap<>();
        String[][] refs = {
            {"ygo-p006a", "ygo-p013a"}, {"ygo-p008a", "ygo-p015a"}, {"ygo-p010a", "ygo-p016a"}
        };
        int index = 0;
        for (Collector poster : List.of(blocked, blocker, other)) {
            showWishlist(poster);
            int offset = offsets.get(poster);
            cardListedAt(
                    publicItem(poster, printing(refs[index][0]), Map.of()),
                    base.plusSeconds(offset));
            String wishId = wish(poster, cardOf(printing(refs[index][1])), Map.of());
            wishMadeAt(wishId, base.plusSeconds(offset + 100));
            wishes.put(poster, wishId);
            String core = publicBinder(poster, "yugioh", token() + " core", "$45", "");
            coreListedAt(core, base.plusSeconds(offset + 200));
            cores.put(poster, core);
            index++;
        }
        String viewersCard = publicItem(viewer, printing("ygo-p017a"), Map.of());
        cardListedAt(viewersCard, base.plusSeconds(500));
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + blocked.id() + "/block",
                viewer.uid(),
                null,
                200);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + viewer.id() + "/block",
                blocker.uid(),
                null,
                200);

        String query = "region=" + REGION + "&game=yugioh&limit=1";
        JsonNode first = feed(viewer.uid(), query);
        assertThat(first.path("items")).hasSize(1);
        assertThat(first.path("items").get(0).path("collector").path("id").asString())
                .isEqualTo(other.id().toString());
        assertThat(first.path("hasMore").asBoolean()).isTrue();
        // Chip by chip, the first post is still the other collector's, of that kind.
        for (String kind : List.of("NEW_CARDS", "WANTED", "DECK_CORES")) {
            JsonNode page = feed(viewer.uid(), query + "&kind=" + kind);
            assertThat(collectorIds(page)).as(kind).containsExactly(other.id().toString());
        }
        assertThat(
                        feed(viewer.uid(), query + "&kind=WANTED")
                                .path("items")
                                .get(0)
                                .path("wanted")
                                .path("wishId")
                                .asString())
                .isEqualTo(wishes.get(other));
        assertThat(
                        feed(viewer.uid(), query + "&kind=DECK_CORES")
                                .path("items")
                                .get(0)
                                .path("deckCore")
                                .path("binderId")
                                .asString())
                .isEqualTo(cores.get(other));
        List<JsonNode> all = everything(viewer.uid(), "region=" + REGION + "&game=yugioh", 50);
        assertThat(of(all, blocked)).isEmpty();
        assertThat(of(all, blocker)).isEmpty();
        // Neither of them sees the viewer either.
        assertThat(postsOf(blocked.uid(), viewer, "yugioh")).isEmpty();
        assertThat(postsOf(blocker.uid(), viewer, "yugioh")).isEmpty();
        assertThat(postsOf(other.uid(), viewer, "yugioh")).hasSize(1);
    }

    @Test
    void aCollectorOffTheMapIsLeftOutBeforeTheLimitAndCountsForNothing() {
        // R7 review P4: the SQL's discoverable rule was hidden by the Java re-check after the
        // limit (short pages) and nothing checked it in the "anything in the window" question.
        Collector viewer = collector("feed-offmap-viewer");
        Collector hidden = collector("feed-offmap-hidden");
        Collector other = collector("feed-offmap-other");
        showWishlist(other);
        showWishlist(hidden);
        Instant base = newestBase();
        cardListedAt(publicItem(other, printing("ygo-p006a"), Map.of()), base.plusSeconds(1000));
        wishMadeAt(wish(other, cardOf(printing("ygo-p013a")), Map.of()), base.plusSeconds(1100));
        coreListedAt(
                publicBinder(other, "yugioh", token() + " core", "$30", ""),
                base.plusSeconds(1200));
        cardListedAt(publicItem(hidden, printing("ygo-p008a"), Map.of()), base.plusSeconds(3000));
        wishMadeAt(wish(hidden, cardOf(printing("ygo-p015a")), Map.of()), base.plusSeconds(3100));
        coreListedAt(
                publicBinder(hidden, "yugioh", token() + " core", "$35", ""),
                base.plusSeconds(3200));
        // Only the hidden collector's posts are this recent.
        FeedRepository.Scope recent =
                new FeedRepository.Scope(
                        REGION, "yugioh", viewer.id(), base.plusSeconds(2000), Instant.now(), null);
        assertThat(feedRepository.any(recent, false)).isTrue();

        // Off the map, with a public profile: their cards, wish and deck core stay public on the
        // profile (the stored flags too), but Home shows nothing of theirs.
        Map<String, Object> offMap = privacy(false, "PUBLIC");
        offMap.put("wishlistVisible", true);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", hidden.uid(), offMap, 200);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND"
                                        + " publicly_listed",
                                hidden.id()))
                .isEqualTo(1);

        String query = "region=" + REGION + "&game=yugioh&limit=1";
        assertThat(collectorIds(feed(viewer.uid(), query))).containsExactly(other.id().toString());
        for (String kind : List.of("NEW_CARDS", "WANTED", "DECK_CORES")) {
            assertThat(collectorIds(feed(viewer.uid(), query + "&kind=" + kind)))
                    .as(kind)
                    .containsExactly(other.id().toString());
        }
        // Nothing of theirs counts as a post of the game or of the region.
        assertThat(feedRepository.any(recent, false)).isFalse();
        assertThat(feedRepository.any(recent, true)).isFalse();
    }

    @Test
    void anExpiredTemporarilyPublicCardOrDeckCoreIsLeftOutBeforeTheLimit() {
        // R7 review P4: the live public rules decide, not the stored flag the expiry job refreshes
        // later; a Java re-check after the limit would leave the page short.
        Collector viewer = collector("feed-expired-viewer");
        Collector seller = collector("feed-expired");
        Collector other = collector("feed-expired-other");
        Instant base = newestBase();
        cardListedAt(publicItem(other, printing("ygo-p006a"), Map.of()), base.plusSeconds(1000));
        coreListedAt(
                publicBinder(other, "yugioh", token() + " core", "$30", ""),
                base.plusSeconds(1200));
        String card = publicItem(seller, printing("ygo-p008a"), Map.of());
        cardListedAt(card, base.plusSeconds(3000));
        String core = publicBinder(seller, "yugioh", token() + " core", "$35", "");
        coreListedAt(core, base.plusSeconds(3200));
        testUsers.update(
                "UPDATE inventory_item SET visibility = 'TEMPORARILY_PUBLIC', public_until = now()"
                        + " - interval '1 minute' WHERE id = ?::uuid",
                card);
        testUsers.update(
                "UPDATE binder SET visibility = 'TEMPORARILY_PUBLIC', public_until = now() -"
                        + " interval '1 minute' WHERE id = ?::uuid",
                core);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ?::uuid AND"
                                        + " publicly_listed",
                                card))
                .isEqualTo(1);

        String query = "region=" + REGION + "&game=yugioh&limit=1&kind=";
        assertThat(collectorIds(feed(viewer.uid(), query + "NEW_CARDS")))
                .containsExactly(other.id().toString());
        assertThat(collectorIds(feed(viewer.uid(), query + "DECK_CORES")))
                .containsExactly(other.id().toString());
        assertThat(postsOf(viewer.uid(), seller, "yugioh")).isEmpty();
    }

    @Test
    void aCardListedBetweenPagesNeverHidesAPostNotSeenYet() {
        // R7 review F2: a new-card post is dated by its newest card; a card listed in its hour
        // after the first page lifted it above the cursor, and no page ever returned it.
        Collector viewer = collector("feed-moving-viewer");
        Collector lister = collector("feed-moving-lister");
        Collector newer = collector("feed-moving-newer");
        Instant base = newestBase();
        cardListedAt(publicItem(lister, printing("ygo-p006a"), Map.of()), base.plusSeconds(60));
        cardListedAt(publicItem(newer, printing("ygo-p008a"), Map.of()), base.plusSeconds(120));
        String query = "region=" + REGION + "&game=yugioh&limit=1";
        JsonNode first = feed(viewer.uid(), query);
        assertThat(collectorIds(first)).containsExactly(newer.id().toString());
        String groupId = FeedRules.cardsPostId(lister.id(), FeedRules.hourOf(base)).toString();

        // The lister lists one more card in the same hour, after the first page was read.
        cardListedAt(publicItem(lister, printing("ygo-p010a"), Map.of()), base.plusSeconds(300));
        JsonNode second = after(viewer.uid(), query, first.path("nextCursor").asString());
        assertThat(second.path("items")).hasSize(1);
        JsonNode post = second.path("items").get(0);
        assertThat(post.path("id").asString()).isEqualTo(groupId);
        // Dated, and counted, as when the first page was read.
        assertThat(Instant.parse(post.path("at").asString())).isEqualTo(base.plusSeconds(60));
        assertThat(post.path("newCards").path("total").asLong()).isEqualTo(1);

        // A refresh shows it at the top, with its new card.
        JsonNode refreshed = feed(viewer.uid(), query);
        assertThat(refreshed.path("items").get(0).path("id").asString()).isEqualTo(groupId);
        assertThat(Instant.parse(refreshed.path("items").get(0).path("at").asString()))
                .isEqualTo(base.plusSeconds(300));
        assertThat(refreshed.path("items").get(0).path("newCards").path("total").asLong())
                .isEqualTo(2);
    }

    @Test
    void laterPagesKeepTheFirstPagesTime() {
        // R7 review fix 2 (R1-1): page 3 and later count the cards listed until the first page was
        // read, as page 2 does. A cursor that took each page's own time let a card listed after
        // page 1 lift a post not seen yet above page 2's cursor from page 3 on, out of every page.
        // Here the server's clock passes the posts, as in real use (Pokémon: no post of the
        // region is dated ahead), so the first page's time is the time it was read.
        Collector viewer = collector("feed-third-viewer");
        Collector lister = collector("feed-third-lister");
        Collector middle = collector("feed-third-middle");
        Collector newest = collector("feed-third-newest");
        String firstCard = publicItem(lister, printing("pkm-p002a"), Map.of());
        String middleCard = publicItem(middle, printing("pkm-p003a"), Map.of());
        String newestCard = publicItem(newest, printing("pkm-p004a"), Map.of());
        // Newer than every other post of the region (all listed before this test began), older
        // than the first page's read, in this order.
        Instant listed = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant firstAt = listed.minusMillis(3);
        cardListedAt(firstCard, firstAt);
        cardListedAt(middleCard, listed.minusMillis(2));
        cardListedAt(newestCard, listed.minusMillis(1));
        String query = "region=" + REGION + "&game=pokemon";
        JsonNode first = feed(viewer.uid(), query + "&limit=1");
        assertThat(collectorIds(first)).containsExactly(newest.id().toString());
        String groupId = FeedRules.cardsPostId(lister.id(), FeedRules.hourOf(firstAt)).toString();

        // The lister lists one more card after the first page was read (dated by the same clock
        // as the server's), then the second page is read.
        String later = publicItem(lister, printing("pkm-p005a"), Map.of());
        cardListedAt(later, Instant.now().truncatedTo(ChronoUnit.MICROS));
        JsonNode second =
                after(viewer.uid(), query + "&limit=1", first.path("nextCursor").asString());
        assertThat(collectorIds(second)).containsExactly(middle.id().toString());
        assertThat(second.path("hasMore").asBoolean()).isTrue();

        // Every page after the second still counts the cards of the first page's time: the
        // lister's post comes once, dated and counted as when the first page was read.
        List<JsonNode> rest = new ArrayList<>();
        @Nullable String cursor = second.path("nextCursor").asString();
        for (int page = 0; cursor != null; page++) {
            assertThat(page).as("the feed never ended").isLessThan(500);
            JsonNode body = after(viewer.uid(), query + "&limit=50", cursor);
            body.path("items").forEach(rest::add);
            cursor = body.path("nextCursor").isNull() ? null : body.path("nextCursor").asString();
        }
        List<JsonNode> listers = of(rest, lister);
        assertThat(listers).hasSize(1);
        assertThat(listers.get(0).path("id").asString()).isEqualTo(groupId);
        assertThat(Instant.parse(listers.get(0).path("at").asString())).isEqualTo(firstAt);
        assertThat(listers.get(0).path("newCards").path("total").asLong()).isEqualTo(1);

        // A refresh shows the lister's new card at the top.
        assertThat(collectorIds(feed(viewer.uid(), query + "&limit=1")))
                .containsExactly(lister.id().toString());
    }

    @Test
    void aPostWhoseNewestCardLeavesBetweenPagesComesBackWithItsNewTime() {
        // R7 review F2 and P5: its time moves down past the cursor, so a later page returns its
        // id again (the contract says so; clients keep the copy they show). It is never lost.
        Collector viewer = collector("feed-leaving-viewer");
        Collector seller = collector("feed-leaving");
        Collector middle = collector("feed-leaving-middle");
        Instant base = newestBase();
        cardListedAt(publicItem(seller, printing("ygo-p006a"), Map.of()), base.plusSeconds(60));
        String newest = publicItem(seller, printing("ygo-p008a"), Map.of());
        cardListedAt(newest, base.plusSeconds(600));
        cardListedAt(publicItem(middle, printing("ygo-p010a"), Map.of()), base.plusSeconds(300));
        String query = "region=" + REGION + "&game=yugioh&limit=2";
        JsonNode first = feed(viewer.uid(), query.replace("limit=2", "limit=1"));
        String groupId = FeedRules.cardsPostId(seller.id(), FeedRules.hourOf(base)).toString();
        assertThat(first.path("items").get(0).path("id").asString()).isEqualTo(groupId);

        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + newest,
                seller.uid(),
                Map.of("visibility", "PRIVATE"),
                200);
        JsonNode second = after(viewer.uid(), query, first.path("nextCursor").asString());
        assertThat(collectorIds(second))
                .containsExactly(middle.id().toString(), seller.id().toString());
        JsonNode again = second.path("items").get(1);
        assertThat(again.path("id").asString()).isEqualTo(groupId);
        assertThat(Instant.parse(again.path("at").asString())).isEqualTo(base.plusSeconds(60));
        assertThat(again.path("newCards").path("total").asLong()).isEqualTo(1);
    }

    @Test
    void hiddenWishlistsPrivateAndStaleCardsAndSoldDeckCoresStayOut() {
        Collector seller = collector("feed-hidden");
        Collector viewer = collector("feed-hidden-viewer");
        // The wishlist is hidden (the default): the wish is no post.
        wish(seller, cardOf(printing("ygo-p013a")), Map.of());
        Map<String, Object> privateCard = item(printing("ygo-p006a"));
        privateCard.put("visibility", "PRIVATE");
        callJson(HttpMethod.POST, "/api/v1/inventory/items", seller.uid(), privateCard, 201);
        String stale = publicItem(seller, printing("ygo-p008a"), Map.of());
        freshness(stale, "STALE", 35);
        String core = publicBinder(seller, "yugioh", token() + " sold core", "$60", "");
        String inCore = fileCard(seller, core, printing("ygo-p016a"), "PUBLIC");
        assertThat(kinds(postsOf(viewer.uid(), seller, "yugioh"))).containsExactly("DECK_CORE");
        assertThat(postsOf(viewer.uid(), seller, "yugioh").toString())
                .doesNotContain(inCore)
                .doesNotContain(stale);

        testUsers.update("UPDATE binder SET sold_at = now() WHERE id = ?::uuid", core);
        assertThat(postsOf(viewer.uid(), seller, "yugioh")).isEmpty();

        // Shown again, the wish is a post; a collector who leaves the map takes every post away.
        showWishlist(seller);
        assertThat(kinds(postsOf(viewer.uid(), seller, "yugioh"))).containsExactly("WANTED");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                seller.uid(),
                privacy(false, "MEMBERS"),
                200);
        assertThat(postsOf(viewer.uid(), seller, "yugioh")).isEmpty();
    }

    @Test
    void theRequestIsChecked() {
        Collector viewer = collector("feed-checks");
        JsonNode missing = get(viewer.uid(), 400, "/api/v1/feed?region=" + REGION);
        assertThat(missing.toString()).contains("game");
        get(viewer.uid(), 400, "/api/v1/feed?region=" + REGION + "&game=chess");
        get(viewer.uid(), 400, "/api/v1/feed?region=" + REGION + "&game=yugioh&kind=EVERYTHING");
        get(viewer.uid(), 400, "/api/v1/feed?region=atlantis&game=yugioh");
        get(viewer.uid(), 400, "/api/v1/feed?region=" + REGION + "&game=yugioh&limit=0");
        get(viewer.uid(), 400, "/api/v1/feed?region=" + REGION + "&game=yugioh&limit=51");
        get(null, 401, "/api/v1/feed?region=" + REGION + "&game=yugioh");
        // Without a region: the caller's home region.
        JsonNode home = get(viewer.uid(), 200, "/api/v1/feed?game=yugioh&kind=deck_cores");
        assertThat(home.path("region").asString()).isEqualTo(REGION);
        assertThat(home.path("kind").asString()).isEqualTo("DECK_CORES");
        Set<String> keys = new HashSet<>();
        home.properties().forEach(entry -> keys.add(entry.getKey()));
        assertThat(keys)
                .contains(
                        "region",
                        "game",
                        "kind",
                        "windowDays",
                        "items",
                        "nextCursor",
                        "hasMore",
                        "gameHasPosts",
                        "regionHasPosts");
    }
}
