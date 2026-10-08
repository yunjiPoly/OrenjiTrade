package com.orenjitrade.api.wishlist;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.billing.domain.PlanService;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Wishlist CRUD (Phase 6 contract): card or printing target with GameSchema-validated filters,
 * defaults, partial updates, duplicates (409), the {@code wishlist.items.max} limit (429), no
 * radius any more (ADR 0017), owner-only access (404 for others, 401 anonymous), the public
 * wishlist summary gated by {@code wishlistVisible} and blocks, and the owner's export.
 */
class WishlistIT extends AbstractWishlistIT {

    @Autowired private PlanService planService;

    @Test
    void createListUpdateAndDeleteItems() {
        Collector owner = collector("wl-crud", americasNorth());
        UUID azure = printing(AZURE);
        UUID card = cardOf(azure);

        Map<String, Object> body = wish(azure, true);
        body.put("conditionMin", "lightly_played");
        body.put("maxPrice", new BigDecimal("60.00"));
        body.put("tradePreference", "SALE");
        body.put("notes", "For my Azure deck");
        JsonNode created = createWish(owner, body);
        String id = created.path("id").asString();
        assertThat(created.path("game").asString()).isEqualTo("yugioh");
        assertThat(created.path("card").path("id").asString()).isEqualTo(card.toString());
        assertThat(created.path("card").path("name").asString()).isEqualTo(cardNameOf(azure));
        assertThat(created.path("printing").path("id").asString()).isEqualTo(azure.toString());
        assertThat(created.path("printing").path("printingCode").asString())
                .isEqualTo(codeOf(azure));
        assertThat(created.path("conditionMin").asString()).isEqualTo("LIGHTLY_PLAYED");
        assertThat(created.path("maxPrice").decimalValue()).isEqualByComparingTo("60.00");
        assertThat(created.path("currency").asString()).isEqualTo("CAD");
        assertThat(created.has("radiusKm")).as("no radius any more").isFalse();
        assertThat(created.path("tradePreference").asString()).isEqualTo("SALE");
        assertThat(created.path("notes").asString()).isEqualTo("For my Azure deck");
        assertThat(created.path("active").asBoolean()).isTrue();
        assertThat(created.path("matchCount").asLong()).isZero();
        assertThat(created.path("lastMatchedAt").isNull()).isTrue();
        assertThat(created.path("rarity").isNull()).isTrue();

        // Any printing of a card: printing null, filters from the game's vocabularies.
        Map<String, Object> anyPrinting = wish(card, false);
        anyPrinting.put("language", "FR");
        anyPrinting.put("edition", "unlimited");
        anyPrinting.put("rarity", "Ultra Rare");
        anyPrinting.put("radiusKm", 10); // ignored: unknown member
        JsonNode second = createWish(owner, anyPrinting);
        assertThat(second.path("printing").isNull()).isTrue();
        assertThat(second.path("card").path("id").asString()).isEqualTo(card.toString());
        assertThat(second.path("language").asString()).isEqualTo("fr");
        assertThat(second.path("edition").asString()).isEqualTo("UNLIMITED");
        assertThat(second.path("rarity").asString()).isEqualTo("Ultra Rare");
        assertThat(second.has("radiusKm")).isFalse();
        assertThat(second.path("tradePreference").asString()).isEqualTo("ANY");

        JsonNode list = callJson(HttpMethod.GET, "/api/v1/wishlist", owner.uid(), null, 200);
        assertThat(list).hasSize(2);
        assertThat(list.get(0).path("id").asString())
                .as("newest first")
                .isEqualTo(second.path("id").asString());

        // PATCH: absent fields unchanged, nullable ones cleared with null.
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("conditionMin", null);
        patch.put("maxPrice", new BigDecimal("55.5"));
        patch.put("notes", "Still looking");
        patch.put("active", false);
        JsonNode updated =
                callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + id, owner.uid(), patch, 200);
        assertThat(updated.path("conditionMin").isNull()).isTrue();
        assertThat(updated.path("maxPrice").decimalValue()).isEqualByComparingTo("55.50");
        assertThat(updated.path("notes").asString()).isEqualTo("Still looking");
        assertThat(updated.path("active").asBoolean()).isFalse();
        assertThat(updated.path("tradePreference").asString()).isEqualTo("SALE");
        assertThat(updated.path("printing").path("id").asString()).isEqualTo(azure.toString());

        // Switching to another printing of the same card, then to any printing.
        UUID french = printing(AZURE_FR);
        JsonNode moved =
                callJson(
                        HttpMethod.PATCH,
                        "/api/v1/wishlist/" + id,
                        owner.uid(),
                        Map.of("printingId", french.toString()),
                        200);
        assertThat(moved.path("printing").path("id").asString()).isEqualTo(french.toString());
        Map<String, Object> anyOf = new LinkedHashMap<>();
        anyOf.put("printingId", null);
        assertThat(
                        callJson(
                                        HttpMethod.PATCH,
                                        "/api/v1/wishlist/" + id,
                                        owner.uid(),
                                        anyOf,
                                        200)
                                .path("printing")
                                .isNull())
                .isTrue();

        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, owner.uid(), null, 204);
        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, owner.uid(), null, 404);
        callJson(HttpMethod.GET, "/api/v1/wishlist/" + id + "/matches", owner.uid(), null, 404);
        assertThat(callJson(HttpMethod.GET, "/api/v1/wishlist", owner.uid(), null, 200)).hasSize(1);
    }

    @Test
    void invalidItemsAreRejected() {
        Collector owner = collector("wl-invalid", americasNorth());
        UUID azure = printing(AZURE);
        UUID card = cardOf(azure);
        UUID otherCardPrinting = printing("ygo-p002a");

        assertValidation(owner, Map.of(), "cardId");
        assertValidation(owner, Map.of("printingId", UUID.randomUUID().toString()), "printingId");
        assertValidation(owner, Map.of("cardId", UUID.randomUUID().toString()), "cardId");
        assertValidation(
                owner,
                Map.of("cardId", card.toString(), "printingId", otherCardPrinting.toString()),
                "printingId");
        assertValidation(
                owner, with(wish(azure, true), "conditionMin", "PRISTINE"), "conditionMin");
        assertValidation(owner, with(wish(azure, true), "edition", "GOLD"), "edition");
        assertValidation(owner, with(wish(azure, true), "language", "xx"), "language");
        assertValidation(owner, with(wish(azure, true), "rarity", "Mythic"), "rarity");
        assertValidation(owner, with(wish(azure, true), "currency", "C4D"), "currency");
        assertValidation(
                owner, with(wish(azure, true), "maxPrice", new BigDecimal("-1")), "maxPrice");
        assertValidation(
                owner, with(wish(azure, true), "maxPrice", new BigDecimal("1.234")), "maxPrice");
        assertValidation(owner, with(wish(azure, true), "notes", "x".repeat(501)), "notes");
        callJson(
                HttpMethod.POST,
                "/api/v1/wishlist",
                owner.uid(),
                with(wish(azure, true), "tradePreference", "BARTER"),
                400);

        // Exact duplicates are 409; another filter makes a different wish.
        createWish(owner, with(wish(azure, true), "conditionMin", "NEAR_MINT"));
        JsonNode conflict =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/wishlist",
                        owner.uid(),
                        with(wish(azure, true), "conditionMin", "near_mint"),
                        409);
        assertThat(conflict.path("errorCode").asString()).isEqualTo("CONFLICT");
        String other = createWish(owner, wish(azure, true)).path("id").asString();
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + other,
                owner.uid(),
                Map.of("conditionMin", "NEAR_MINT"),
                409);

        // PATCH validation: another card's printing, null for a non-nullable member.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + other,
                owner.uid(),
                Map.of("printingId", otherCardPrinting.toString()),
                400);
        Map<String, Object> nullCurrency = new LinkedHashMap<>();
        nullCurrency.put("currency", null);
        callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + other, owner.uid(), nullCurrency, 400);
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + other,
                owner.uid(),
                Map.of("conditionMin", "PRISTINE"),
                400);
    }

    @Test
    void itemsAreLimitedByThePlanAndNoRadiusExists() {
        Collector owner = collector("wl-limits", americasNorth());
        UUID azure = printing(AZURE);

        // A radius is no member any more: ignored (never a 429 or a stored value).
        JsonNode created = createWish(owner, with(wish(azure, true), "radiusKm", 26));
        assertThat(created.has("radiusKm")).isFalse();
        String id = created.path("id").asString();
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + id,
                owner.uid(),
                Map.of("radiusKm", 100),
                200);

        Collector premium = collector("wl-premium", americasNorth());
        testUsers.update(
                "UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", premium.id());
        createWish(premium, wish(azure, true));

        // wishlist.items.max (FREE 20 by default; lowered to 2 for the test).
        setFreeItemsMax(2);
        try {
            createWish(owner, with(wish(azure, true), "conditionMin", "MINT"));
            JsonNode limit =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/wishlist",
                            owner.uid(),
                            with(wish(azure, true), "conditionMin", "DAMAGED"),
                            429);
            assertThat(limit.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
            assertThat(limit.path("limitKey").asString()).isEqualTo("wishlist.items.max");
            assertThat(limit.path("limit").asInt()).isEqualTo(2);
            assertThat(limit.path("used").asInt()).isEqualTo(2);
            assertThat(limit.path("planCode").asString()).isEqualTo("FREE");

            // Deleting one frees a slot.
            callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, owner.uid(), null, 204);
            createWish(owner, with(wish(azure, true), "conditionMin", "DAMAGED"));

            // PREMIUM: 500.
            createWish(premium, with(wish(azure, true), "conditionMin", "MINT"));
            createWish(premium, with(wish(azure, true), "conditionMin", "DAMAGED"));
        } finally {
            setFreeItemsMax(20);
        }
    }

    @Test
    void itemsAndMatchesBelongToTheirOwnerOnly() {
        Place place = americasNorth();
        Collector owner = collector("wl-owner", place);
        Collector other = collector("wl-other", place);
        String id = createWish(owner, wish(printing(AZURE), true)).path("id").asString();

        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + id,
                other.uid(),
                Map.of("active", false),
                404);
        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, other.uid(), null, 404);
        callJson(HttpMethod.GET, "/api/v1/wishlist/" + id + "/matches", other.uid(), null, 404);
        assertThat(callJson(HttpMethod.GET, "/api/v1/wishlist", other.uid(), null, 200)).isEmpty();
        callJson(
                HttpMethod.POST,
                "/api/v1/wishlist/matches/" + UUID.randomUUID() + "/dismiss",
                owner.uid(),
                null,
                404);
        callJson(
                HttpMethod.GET,
                "/api/v1/wishlist/" + id + "/matches?limit=0",
                owner.uid(),
                null,
                400);
        callJson(
                HttpMethod.GET,
                "/api/v1/wishlist/" + id + "/matches?cursor=not-a-cursor",
                owner.uid(),
                null,
                400);

        callJson(HttpMethod.GET, "/api/v1/wishlist", null, null, 401);
        callJson(HttpMethod.POST, "/api/v1/wishlist", null, wish(printing(AZURE), true), 401);
        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, null, null, 401);
        callJson(HttpMethod.GET, "/api/v1/wishlist/" + id + "/matches", null, null, 401);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/" + owner.handle() + "/wishlist",
                null,
                null,
                401);
        assertThat(callJson(HttpMethod.GET, "/api/v1/wishlist", owner.uid(), null, 200)).hasSize(1);
    }

    @Test
    void publicSummaryFollowsWishlistVisibilityAndBlocks() {
        Place place = americasNorth();
        Collector owner = collector("wl-public", place);
        Collector viewer = collector("wl-viewer", place);
        UUID azure = printing(AZURE);
        Map<String, Object> body = with(wish(azure, true), "conditionMin", "NEAR_MINT");
        body.put("maxPrice", new BigDecimal("70.00"));
        body.put("notes", "Secret budget note");
        createWish(owner, body);
        Map<String, Object> inactive = with(wish(cardOf(azure), false), "active", false);
        createWish(owner, inactive);
        String summary = "/api/v1/collectors/" + owner.handle() + "/wishlist";

        // Hidden by default (privacy default wishlistVisible=false), except for the owner.
        callJson(HttpMethod.GET, summary, viewer.uid(), null, 404);
        assertThat(callJson(HttpMethod.GET, summary, owner.uid(), null, 200)).hasSize(1);

        wishlistVisible(owner, true);
        JsonNode entries = callJson(HttpMethod.GET, summary, viewer.uid(), null, 200);
        assertThat(entries).as("active items only").hasSize(1);
        JsonNode entry = entries.get(0);
        assertThat(entry.path("card").path("name").asString()).isEqualTo(cardNameOf(azure));
        assertThat(entry.path("printing").path("id").asString()).isEqualTo(azure.toString());
        assertThat(entry.path("conditionMin").asString()).isEqualTo("NEAR_MINT");
        assertThat(entries.toString())
                .doesNotContain("Secret budget note")
                .doesNotContain("maxPrice")
                .doesNotContain("radiusKm")
                .doesNotContain("notes");

        // A block in either direction hides it; unknown handles are 404.
        callJson(
                HttpMethod.POST, "/api/v1/users/" + viewer.id() + "/block", owner.uid(), null, 200);
        callJson(HttpMethod.GET, summary, viewer.uid(), null, 404);
        callJson(
                HttpMethod.DELETE,
                "/api/v1/users/" + viewer.id() + "/block",
                owner.uid(),
                null,
                204);
        callJson(HttpMethod.GET, summary, viewer.uid(), null, 200);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/no-such-collector-xyz/wishlist",
                viewer.uid(),
                null,
                404);

        // The owner's export carries the private notes (owner data), never other owners' data.
        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", owner.uid(), null, 200);
        JsonNode section = export.path("sections").path("wishlist");
        assertThat(section).hasSize(2);
        assertThat(section.toString()).contains("Secret budget note");
    }

    private void assertValidation(Collector owner, Map<String, Object> body, String field) {
        JsonNode problem = callJson(HttpMethod.POST, "/api/v1/wishlist", owner.uid(), body, 400);
        assertThat(problem.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        List<String> fields =
                problem.path("errors").findValues("field").stream()
                        .map(JsonNode::asString)
                        .toList();
        assertThat(fields).as("fields of %s", body).contains(field);
    }

    private static Map<String, Object> with(Map<String, Object> body, String key, Object value) {
        Map<String, Object> copy = new LinkedHashMap<>(body);
        copy.put(key, value);
        return copy;
    }

    private void setFreeItemsMax(int max) {
        testUsers.update(
                "UPDATE usage_limit l SET max_value = ? FROM plan p WHERE p.id = l.plan_id AND"
                        + " p.code = 'FREE' AND l.limit_key = 'wishlist.items.max'",
                max);
        planService.invalidate();
    }
}
