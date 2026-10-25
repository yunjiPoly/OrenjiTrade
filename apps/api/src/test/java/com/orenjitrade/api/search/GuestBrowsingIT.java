package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Browsing without an account (stage R15 of the phone redesign; owner prompt of 2026-10-20, section
 * R15): every discovery read a signed-out visitor can make answers without who a collector is (no
 * id, handle, display name, avatar, rating, last activity or presence) and with their state or
 * province and country, scoped by {@code region=} and {@code game=} as for members; collector name
 * search finds nobody for them (by name, by handle in binder search, in the suggestions); writes
 * stay 401; a member resolves the owner of a public card, binder or wish ({@code GET
 * /listings/owner}) to finish what they started as a guest.
 */
class GuestBrowsingIT extends AbstractSearchIT {

    private static final String REGION = "americas-north";

    /** Identity keys a signed-out caller never reads with a value. */
    private static final List<String> WHO = List.of("id", "handle", "displayName", "avatarUrl");

    private void showWishlist(Collector collector) {
        Map<String, Object> body = privacy(true, "MEMBERS");
        body.put("wishlistVisible", true);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", collector.uid(), body, 200);
    }

    private String wish(Collector collector, UUID cardId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cardId", cardId.toString());
        return callJson(HttpMethod.POST, "/api/v1/wishlist", collector.uid(), body, 201)
                .path("id")
                .asString();
    }

    private String publicBinder(Collector owner, String name, @Nullable String price) {
        Map<String, Object> body =
                binder(name, "PUBLIC", InventoryTestSupport.gameId(testUsers, "yugioh"));
        if (price != null) {
            body.put("sellsAsCore", true);
            body.put("askingPriceText", price);
        }
        return callJson(HttpMethod.POST, "/api/v1/binders", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    private String fileCard(Collector owner, String binderId, UUID printing) {
        Map<String, Object> body = item(printing);
        body.put("binderId", binderId);
        body.put("visibility", "PUBLIC");
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    /** Every post of the feed for {@code uid} (signed out when null), page by page. */
    private List<JsonNode> feed(@Nullable String uid, String query) {
        List<JsonNode> posts = new ArrayList<>();
        @Nullable String cursor = null;
        for (int page = 0; page < 500; page++) {
            JsonNode body =
                    cursor == null
                            ? get(uid, 200, "/api/v1/feed?limit=50&" + query)
                            : get(
                                    uid,
                                    200,
                                    "/api/v1/feed?limit=50&" + query + "&cursor={c}",
                                    cursor);
            body.path("items").forEach(posts::add);
            if (body.path("nextCursor").isNull()) {
                return posts;
            }
            cursor = body.path("nextCursor").asString();
        }
        throw new AssertionError("the feed never ended");
    }

    /** The post of the feed about the card, wish or binder {@code id}, if any. */
    private static @Nullable JsonNode postAbout(List<JsonNode> posts, String id) {
        for (JsonNode post : posts) {
            String text = post.toString();
            if (text.contains("\"itemId\":\"" + id + "\"")
                    || text.contains("\"wishId\":\"" + id + "\"")
                    || text.contains("\"binderId\":\"" + id + "\"")) {
                return post;
            }
        }
        return null;
    }

    /** A collector block (feed, holder, owner) as a signed-out visitor reads it. */
    private static void assertNobody(JsonNode person, String context) {
        for (String key : WHO) {
            assertThat(person.has(key)).as("%s keeps the key %s", context, key).isTrue();
            assertThat(person.path(key).isNull()).as("%s of %s", key, context).isTrue();
        }
    }

    private static void assertQuebec(JsonNode place, String context) {
        assertThat(place.path("subdivisionName").asString()).as(context).isEqualTo("Quebec");
        assertThat(place.path("countryName").asString()).as(context).isEqualTo("Canada");
        assertThat(place.has("city")).as(context).isFalse();
    }

    @Test
    void theFeedIsOpenWithThePlaceAndWithoutWhoPostedIt() {
        Collector seller = collector("guest-feed");
        showWishlist(seller);
        Collector member = collector("guest-feed-member");
        IsolatedCard card = isolatedPrinting("ygo-p001a");
        String itemId = publicItem(seller, card.printingId(), Map.of("askingPriceText", "$4.00"));
        String wishId = wish(seller, cardOf(printing("ygo-p003a")));
        String core = publicBinder(seller, token() + " core", "$40");
        fileCard(seller, core, printing("ygo-p012a"));

        List<JsonNode> guest = feed(null, "region=" + REGION + "&game=yugioh");
        for (String id : List.of(itemId, wishId, core)) {
            JsonNode post = postAbout(guest, id);
            assertThat(post).as("the guest's post about %s", id).isNotNull();
            assertNobody(post.path("collector"), "the post about " + id);
            assertQuebec(post.path("place"), "the post about " + id);
        }
        for (JsonNode post : guest) {
            assertNobody(post.path("collector"), "every guest post");
        }
        // A member reads who posted the same posts.
        JsonNode seen = postAbout(feed(member.uid(), "region=" + REGION + "&game=yugioh"), itemId);
        assertThat(seen).isNotNull();
        assertThat(seen.path("collector").path("handle").asString()).isEqualTo(seller.handle());
        assertThat(seen.path("collector").path("id").asString()).isEqualTo(seller.id().toString());

        // Without a region, a guest reads Americas (North); region= and game= scope every kind.
        assertThat(get(null, 200, "/api/v1/feed?game=yugioh").path("region").asString())
                .isEqualTo(REGION);
        assertThat(postAbout(feed(null, "game=yugioh"), wishId)).isNotNull();
        List<JsonNode> europe = feed(null, "region=europe&game=yugioh");
        List<JsonNode> pokemon = feed(null, "region=" + REGION + "&game=pokemon");
        for (String id : List.of(itemId, wishId, core)) {
            assertThat(postAbout(europe, id)).as("%s in europe", id).isNull();
            assertThat(postAbout(pokemon, id)).as("%s in pokemon", id).isNull();
        }
        get(null, 400, "/api/v1/feed?region=" + REGION);
    }

    @Test
    void cardHoldersAndSearchShowPlacesNeverWho() {
        Collector holder = collector("guest-holder");
        tags(holder, "trader");
        profile(holder, "Guestless " + token(), List.of("yugioh"));
        Collector member = collector("guest-holder-member");
        Collector elsewhere = collector("guest-holder-eu", "FR", "FR-IDF");
        IsolatedCard card = isolatedPrinting("ygo-p002a");
        String itemId = publicItem(holder, card.printingId(), Map.of("availability", "SALE"));
        publicItem(elsewhere, card.printingId(), Map.of("availability", "SALE"));

        String query =
                "/api/v1/search/card-holders?region="
                        + REGION
                        + "&game=yugioh&cardId="
                        + card.cardId();
        JsonNode guest = get(null, 200, query);
        assertThat(guest.path("items")).hasSize(1);
        JsonNode row = guest.path("items").get(0);
        assertThat(row.path("item").path("id").asString()).isEqualTo(itemId);
        JsonNode collector = row.path("collector");
        assertNobody(collector, "a holder");
        assertThat(collector.path("rating").isNull()).isTrue();
        assertThat(collector.path("lastActiveBucket").asString()).isEqualTo("HIDDEN");
        assertThat(collector.path("onlineStatus").asString()).isEqualTo("HIDDEN");
        assertQuebec(collector.path("place"), "a holder");
        assertThat(collector.path("games").toString()).contains("yugioh");
        assertThat(guest.toString()).doesNotContain(holder.handle()).doesNotContain("Guestless");

        JsonNode signedIn = get(member.uid(), 200, query);
        JsonNode marker = signedIn.path("items").get(0).path("collector");
        assertThat(marker.path("handle").asString()).isEqualTo(holder.handle());
        assertThat(marker.path("rating").isObject()).isTrue();
        assertThat(marker.path("lastActiveBucket").asString()).isNotEqualTo("HIDDEN");

        // The region and the game scope it for a guest as for a member.
        assertThat(
                        get(
                                        null,
                                        200,
                                        "/api/v1/search/card-holders?region=europe&cardId="
                                                + card.cardId())
                                .path("items"))
                .hasSize(1);
        assertThat(
                        get(
                                        null,
                                        200,
                                        "/api/v1/search/card-holders?region="
                                                + REGION
                                                + "&game=pokemon&cardId="
                                                + card.cardId())
                                .path("items"))
                .isEmpty();

        // The unified search of a resolved card lists its holders, without who they are.
        JsonNode unified =
                get(
                        null,
                        200,
                        "/api/v1/search?q={q}&region=" + REGION + "&game=yugioh",
                        card.code());
        assertThat(unified.path("collectors")).isNotEmpty();
        for (JsonNode found : unified.path("collectors")) {
            assertNobody(found, "a holder of the unified search");
            assertThat(found.path("place").path("label").asString()).isNotBlank();
        }
    }

    @Test
    void nameSearchFindsNobodyForAGuest() {
        Collector named = collector("guest-name");
        String name = "Zubeneschamali " + token();
        profile(named, name, List.of("yugioh"));
        IsolatedCard card = isolatedPrinting("ygo-p004a");
        String binderName = token() + " shelf";
        String binderId = publicBinder(named, binderName, null);
        fileCard(named, binderId, card.printingId());
        Collector member = collector("guest-name-member");

        String byName = "/api/v1/search/collectors?q={q}&region=" + REGION + "&game=yugioh";
        assertThat(get(null, 200, byName, named.handle())).isEmpty();
        assertThat(get(null, 200, byName, name)).isEmpty();
        assertThat(get(member.uid(), 200, byName, named.handle()).toString())
                .contains(named.handle());

        String unified = "/api/v1/search?q={q}&region=" + REGION;
        assertThat(get(null, 200, unified, named.handle()).path("collectors")).isEmpty();
        assertThat(handles(get(member.uid(), 200, unified, named.handle())))
                .contains(named.handle());

        // Binder search by the owner's handle: a member finds the binder, a guest does not; by
        // its own name a guest finds it, without its owner.
        assertThat(get(null, 200, unified + "&types=binders", named.handle()).path("binders"))
                .noneMatch(found -> found.path("id").asString().equals(binderId));
        assertThat(get(member.uid(), 200, unified + "&types=binders", named.handle()).toString())
                .contains(binderId);
        JsonNode byBinderName = get(null, 200, unified + "&types=binders", binderName);
        assertThat(byBinderName.path("binders")).hasSize(1);
        assertNobody(byBinderName.path("binders").get(0).path("owner"), "a binder's owner");
        assertQuebec(
                byBinderName.path("binders").get(0).path("owner").path("place"),
                "a binder's owner");
        String regionList = "/api/v1/regions/" + REGION + "/binders?game=yugioh&q={q}";
        assertThat(get(null, 200, regionList, named.handle()).path("items"))
                .noneMatch(found -> found.path("id").asString().equals(binderId));
        assertThat(get(member.uid(), 200, regionList, named.handle()).toString())
                .contains(binderId);

        // The suggestions hold no collector for a guest.
        String suggest = "/api/v1/search/suggest?q={q}&region=" + REGION;
        assertThat(get(null, 200, suggest, named.handle()))
                .noneMatch(entry -> entry.path("type").asString().equals("COLLECTOR"));
        assertThat(get(member.uid(), 200, suggest, named.handle()).toString())
                .contains("COLLECTOR");
    }

    @Test
    void binderListsAndAPublicBinderKeepTheOwnersPlaceOnly() {
        Collector owner = collector("guest-binders");
        Collector member = collector("guest-binders-member");
        IsolatedCard card = isolatedPrinting("ygo-p006a");
        String binderId = publicBinder(owner, token() + " folder", null);
        fileCard(owner, binderId, card.printingId());
        String core = publicBinder(owner, token() + " core", "Trade only");
        fileCard(owner, core, card.printingId());

        JsonNode state =
                get(
                        null,
                        200,
                        "/api/v1/regions/" + REGION + "/subdivisions/CA-QC/binders?limit=50");
        JsonNode region = get(null, 200, "/api/v1/regions/" + REGION + "/binders?limit=50");
        JsonNode cores =
                get(
                        null,
                        200,
                        "/api/v1/search/deck-cores?region="
                                + REGION
                                + "&limit=10&cardId="
                                + card.cardId());
        assertThat(cores).hasSize(1);
        List<JsonNode> owners = new ArrayList<>();
        state.path("items").forEach(found -> owners.add(found.path("owner")));
        region.path("items").forEach(found -> owners.add(found.path("owner")));
        cores.forEach(found -> owners.add(found.path("owner")));
        assertThat(owners).isNotEmpty();
        for (JsonNode found : owners) {
            assertNobody(found, "a listed binder's owner");
            assertThat(found.path("place").path("label").asString()).isNotBlank();
        }

        for (String id : List.of(binderId, core)) {
            JsonNode page = get(null, 200, "/api/v1/public/binders/" + id);
            assertNobody(page.path("owner"), "the owner of " + id);
            assertQuebec(page.path("owner").path("place"), "the owner of " + id);
            assertThat(page.toString()).doesNotContain(owner.handle());
            JsonNode items = get(null, 200, "/api/v1/public/binders/" + id + "/items");
            assertThat(items.path("items")).isNotEmpty();
            assertThat(items.toString()).doesNotContain(owner.handle());
            JsonNode members = get(member.uid(), 200, "/api/v1/public/binders/" + id);
            assertThat(members.path("owner").path("handle").asString()).isEqualTo(owner.handle());
        }

        // A read by a handle the caller already has stays as it is.
        assertThat(get(null, 200, "/api/v1/collectors/" + owner.handle() + "/binders").toString())
                .contains(binderId);
    }

    @Test
    void writesAndMemberReadsStay401ForAGuest() {
        Collector owner = collector("guest-writes");
        String itemId = publicItem(owner, printing("ygo-p007a"), Map.of());
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations",
                null,
                Map.of("recipientId", owner.id().toString(), "subjectItemId", itemId),
                401);
        callJson(
                HttpMethod.POST,
                "/api/v1/wishlist",
                null,
                Map.of("cardId", cardOf(printing("ygo-p007a")).toString()),
                401);
        callJson(
                HttpMethod.POST, "/api/v1/inventory/items", null, item(printing("ygo-p007a")), 401);
        callJson(HttpMethod.POST, "/api/v1/feed", null, Map.of(), 401);
        get(null, 401, "/api/v1/collectors/" + owner.handle());
        get(null, 401, "/api/v1/listings/owner?itemId=" + itemId);
        get(null, 401, "/api/v1/notifications");
        get(null, 401, "/api/v1/conversations");
    }

    @Test
    void aMemberLearnsWhoOwnsAPublicCardBinderOrWish() {
        Collector owner = collector("guest-owner");
        showWishlist(owner);
        Collector member = collector("guest-owner-member");
        IsolatedCard card = isolatedPrinting("ygo-p009a");
        String itemId = publicItem(owner, card.printingId(), Map.of());
        String core = publicBinder(owner, token() + " core", "$20");
        fileCard(owner, core, printing("ygo-p010a"));
        String wishId = wish(owner, cardOf(printing("ygo-p011a")));

        for (String query : List.of("itemId=" + itemId, "binderId=" + core, "wishId=" + wishId)) {
            JsonNode found = get(member.uid(), 200, "/api/v1/listings/owner?" + query);
            assertThat(found.path("id").asString()).as(query).isEqualTo(owner.id().toString());
            assertThat(found.path("handle").asString()).as(query).isEqualTo(owner.handle());
            assertThat(found.has("displayName")).isTrue();
            assertThat(found.has("place")).isFalse();
            InventoryGeo.assertNoPlace(found);
        }
        // The owner reads themselves.
        assertThat(
                        get(owner.uid(), 200, "/api/v1/listings/owner?itemId=" + itemId)
                                .path("handle")
                                .asString())
                .isEqualTo(owner.handle());

        // Exactly one reference; unknown, private or hidden listings are 404.
        get(member.uid(), 400, "/api/v1/listings/owner");
        get(member.uid(), 400, "/api/v1/listings/owner?itemId=" + itemId + "&binderId=" + core);
        get(member.uid(), 404, "/api/v1/listings/owner?itemId=" + UUID.randomUUID());
        String privateItem =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/inventory/items",
                                owner.uid(),
                                item(printing("ygo-p012a")),
                                201)
                        .path("id")
                        .asString();
        get(member.uid(), 404, "/api/v1/listings/owner?itemId=" + privateItem);
        Map<String, Object> hidden = privacy(true, "MEMBERS");
        hidden.put("wishlistVisible", false);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", owner.uid(), hidden, 200);
        get(member.uid(), 404, "/api/v1/listings/owner?wishId=" + wishId);
        showWishlist(owner);

        // A block, either way, hides the owner.
        callJson(
                HttpMethod.POST, "/api/v1/users/" + member.id() + "/block", owner.uid(), null, 200);
        for (String query : List.of("itemId=" + itemId, "binderId=" + core, "wishId=" + wishId)) {
            get(member.uid(), 404, "/api/v1/listings/owner?" + query);
        }
    }

    /** No place, city or coordinate in a person block. */
    private static final class InventoryGeo {
        static void assertNoPlace(JsonNode node) {
            String text = node.toString();
            assertThat(text)
                    .doesNotContain("\"city\"")
                    .doesNotContain("latitude")
                    .doesNotContain("subdivision");
        }
    }
}
