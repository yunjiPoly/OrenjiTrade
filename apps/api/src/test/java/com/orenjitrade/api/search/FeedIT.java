package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import com.orenjitrade.api.search.domain.FeedRules;
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
 * before, so they are the newest of the region whatever the other tests left.
 */
class FeedIT extends AbstractSearchIT {

    private static final String REGION = "americas-north";

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
        Instant base = Instant.now().minus(Duration.ofMinutes(20));
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
        cardListedAt(publicItem(blocked, printing("ygo-p006a"), Map.of()), base.plusSeconds(3000));
        cardListedAt(publicItem(blocker, printing("ygo-p008a"), Map.of()), base.plusSeconds(2000));
        String expected = publicItem(other, printing("ygo-p010a"), Map.of());
        cardListedAt(expected, base.plusSeconds(1000));
        String viewersCard = publicItem(viewer, printing("ygo-p015a"), Map.of());
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
        List<JsonNode> all = everything(viewer.uid(), "region=" + REGION + "&game=yugioh", 50);
        assertThat(of(all, blocked)).isEmpty();
        assertThat(of(all, blocker)).isEmpty();
        // Neither of them sees the viewer either.
        assertThat(postsOf(blocked.uid(), viewer, "yugioh")).isEmpty();
        assertThat(postsOf(blocker.uid(), viewer, "yugioh")).isEmpty();
        assertThat(postsOf(other.uid(), viewer, "yugioh")).hasSize(1);
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
