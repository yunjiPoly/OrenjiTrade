package com.orenjitrade.api.wishlist;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.wishlist.domain.WishlistSettings;
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
 * Wishlist CRUD (stage S2 model): which copy (any printing, any printing of one rarity, one
 * printing), the public note (plain text, at most 280 characters, moderated), "Near Mint only" and
 * one price term from the admin list; members of the old model are ignored and never stored;
 * duplicates (409), the {@code wishlist.items.max} limit (429), owner-only access (404 for others,
 * 401 anonymous), the public wishlist summary gated by {@code wishlistVisible} and blocks, the
 * owner's export, the admin price terms (validated, audited) and the removed matches feature (no
 * table, no endpoint).
 */
class WishlistIT extends AbstractWishlistIT {

    @Autowired private PlanService planService;
    @Autowired private WishlistSettings wishlistSettings;

    @Test
    void createListUpdateAndDeleteItems() {
        Collector owner = collector("wl-crud", americasNorth());
        UUID azure = printing(AZURE);
        UUID card = cardOf(azure);

        // A YGOPRODeck-imported price (TCGplayer-based USD) is labelled with its source.
        testUsers.update(
                "UPDATE card_printing SET market_price = 25.00, market_price_currency = 'USD',"
                    + " market_price_updated_at = now(), external_ref ="
                    + " jsonb_build_object('provider', 'ygoprodeck', 'id', ?::text) WHERE id = ?",
                "wl-" + azure,
                azure);
        Map<String, Object> body = wish(azure, true);
        body.put("note", "  For my Azure deck.\r\nSleeved copies welcome.  ");
        body.put("nearMintOnly", true);
        body.put("priceTerm", "85% TCG");
        JsonNode created = createWish(owner, body);
        String id = created.path("id").asString();
        assertThat(created.path("game").asString()).isEqualTo("yugioh");
        assertThat(created.path("card").path("id").asString()).isEqualTo(card.toString());
        assertThat(created.path("card").path("name").asString()).isEqualTo(cardNameOf(azure));
        assertThat(created.path("printing").path("id").asString()).isEqualTo(azure.toString());
        assertThat(created.path("printing").path("printingCode").asString())
                .isEqualTo(codeOf(azure));
        assertThat(created.path("printing").path("rarity").asString()).isEqualTo("Ultra Rare");
        assertThat(created.path("rarity").isNull()).as("a printing fixes its rarity").isTrue();
        assertThat(created.path("note").asString())
                .isEqualTo("For my Azure deck.\nSleeved copies welcome.");
        assertThat(created.path("nearMintOnly").asBoolean()).isTrue();
        assertThat(created.path("priceTerm").path("label").asString()).isEqualTo("85% TCG");
        assertThat(created.path("priceTerm").path("percent").asInt()).isEqualTo(85);
        assertThat(created.path("priceTerm").path("orMore").asBoolean()).isFalse();
        JsonNode marketPrice = created.path("printing").path("marketPrice");
        assertThat(marketPrice.path("source").asString()).isEqualTo("YGOPRODECK");
        assertThat(marketPrice.path("currency").asString()).isEqualTo("USD");
        assertThat(marketPrice.path("amount").decimalValue()).isEqualByComparingTo("25.00");
        assertThat(marketPrice.path("updatedAt").asString()).isNotBlank();

        // Any printing of a card, of one rarity of its printings.
        UUID secret = rarityPrinting(AZURE, "Secret Rare");
        Map<String, Object> anyPrinting = wish(card, false);
        anyPrinting.put("rarity", "Secret Rare");
        anyPrinting.put("priceTerm", " 100% TCG+ ");
        JsonNode second = createWish(owner, anyPrinting);
        assertThat(second.path("printing").isNull()).isTrue();
        assertThat(second.path("card").path("id").asString()).isEqualTo(card.toString());
        assertThat(second.path("rarity").asString()).isEqualTo(rarityOf(secret));
        assertThat(second.path("note").asString()).isEmpty();
        assertThat(second.path("nearMintOnly").asBoolean()).isFalse();
        assertThat(second.path("priceTerm").path("label").asString()).isEqualTo("100% TCG+");
        assertThat(second.path("priceTerm").path("orMore").asBoolean()).isTrue();

        // Any printing, any rarity.
        JsonNode third = createWish(owner, wish(card, false));
        assertThat(third.path("rarity").isNull()).isTrue();
        assertThat(third.path("priceTerm").isNull()).isTrue();

        JsonNode list = callJson(HttpMethod.GET, "/api/v1/wishlist", owner.uid(), null, 200);
        assertThat(list).hasSize(3);
        assertThat(list.get(0).path("id").asString())
                .as("newest first")
                .isEqualTo(third.path("id").asString());

        // PATCH: absent fields unchanged, nullable ones cleared with null.
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("note", null);
        patch.put("priceTerm", "90% TCG");
        JsonNode updated =
                callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + id, owner.uid(), patch, 200);
        assertThat(updated.path("note").asString()).isEmpty();
        assertThat(updated.path("priceTerm").path("label").asString()).isEqualTo("90% TCG");
        assertThat(updated.path("nearMintOnly").asBoolean()).isTrue();
        assertThat(updated.path("printing").path("id").asString()).isEqualTo(azure.toString());
        Map<String, Object> clearTerm = new LinkedHashMap<>();
        clearTerm.put("priceTerm", null);
        clearTerm.put("nearMintOnly", false);
        JsonNode cleared =
                callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + id, owner.uid(), clearTerm, 200);
        assertThat(cleared.path("priceTerm").isNull()).isTrue();
        assertThat(cleared.path("nearMintOnly").asBoolean()).isFalse();

        // Switching to another printing of the same card; then to any printing of one rarity.
        UUID french = printing(AZURE_FR);
        JsonNode moved =
                callJson(
                        HttpMethod.PATCH,
                        "/api/v1/wishlist/" + id,
                        owner.uid(),
                        Map.of("printingId", french.toString()),
                        200);
        assertThat(moved.path("printing").path("id").asString()).isEqualTo(french.toString());
        Map<String, Object> rarityOnly = new LinkedHashMap<>();
        rarityOnly.put("printingId", null);
        rarityOnly.put("rarity", "Ultra Rare");
        JsonNode rarityWish =
                callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + id, owner.uid(), rarityOnly, 200);
        assertThat(rarityWish.path("printing").isNull()).isTrue();
        assertThat(rarityWish.path("rarity").asString()).isEqualTo("Ultra Rare");
        // Back to one printing without a rarity: the stored rarity goes.
        JsonNode back =
                callJson(
                        HttpMethod.PATCH,
                        "/api/v1/wishlist/" + id,
                        owner.uid(),
                        Map.of("printingId", azure.toString()),
                        200);
        assertThat(back.path("rarity").isNull()).isTrue();

        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, owner.uid(), null, 204);
        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, owner.uid(), null, 404);
        assertThat(callJson(HttpMethod.GET, "/api/v1/wishlist", owner.uid(), null, 200)).hasSize(2);
    }

    @Test
    void membersOfTheOldModelAreIgnoredAndNeverStored() {
        Collector owner = collector("wl-old", americasNorth());
        UUID azure = printing(AZURE);
        Map<String, Object> body = wish(azure, true);
        body.put("conditionMin", "LIGHTLY_PLAYED");
        body.put("edition", "FIRST_EDITION");
        body.put("language", "fr");
        body.put("maxPrice", new BigDecimal("60.00"));
        body.put("currency", "USD");
        body.put("tradePreference", "SALE");
        body.put("notes", "Private budget note");
        body.put("active", false);
        body.put("radiusKm", 26);
        JsonNode created = createWish(owner, body);
        String id = created.path("id").asString();
        for (String removed :
                List.of(
                        "conditionMin",
                        "edition",
                        "language",
                        "maxPrice",
                        "currency",
                        "tradePreference",
                        "notes",
                        "active",
                        "radiusKm",
                        "matchCount",
                        "lastMatchedAt")) {
            assertThat(created.has(removed)).as(removed).isFalse();
        }
        assertThat(created.toString()).doesNotContain("Private budget note");
        assertThat(created.path("note").asString())
                .as("private notes never become the public note")
                .isEmpty();

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("maxPrice", 10);
        patch.put("tradePreference", "TRADE");
        patch.put("notes", "Another private note");
        patch.put("active", false);
        JsonNode updated =
                callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + id, owner.uid(), patch, 200);
        assertThat(updated.toString()).doesNotContain("Another private note");

        // No column exists for them.
        List<String> columns =
                testUsers
                        .query(
                                "SELECT column_name FROM information_schema.columns WHERE"
                                        + " table_name = 'wishlist_item'")
                        .stream()
                        .map(row -> row.get("column_name").toString())
                        .toList();
        assertThat(columns)
                .containsExactlyInAnyOrder(
                        "id",
                        "owner_id",
                        "game_slug",
                        "card_id",
                        "printing_id",
                        "rarity",
                        "public_note",
                        "near_mint_only",
                        "price_term",
                        "created_at",
                        "updated_at");
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
        // Rarity: one of the card's printings for "any printing"; a printing has its own.
        assertValidation(owner, with(wish(card, false), "rarity", "Secret Rare"), "rarity");
        assertValidation(owner, with(wish(azure, true), "rarity", "Common"), "rarity");
        assertThat(
                        createWish(owner, with(wish(azure, true), "rarity", "Ultra Rare"))
                                .path("rarity")
                                .isNull())
                .as("the printing's own rarity is accepted and not stored")
                .isTrue();
        // Price terms: only the admin list.
        assertValidation(owner, with(wish(card, false), "priceTerm", "75% TCG"), "priceTerm");
        assertValidation(owner, with(wish(card, false), "priceTerm", "cheap"), "priceTerm");
        // Note: length (code points), plain text, moderation (V004 test rule "zorblax").
        assertValidation(owner, with(wish(card, false), "note", "x".repeat(281)), "note");
        assertValidation(owner, with(wish(card, false), "note", "Bell\u0007 rings"), "note");
        assertValidation(owner, with(wish(card, false), "note", "Zorblax wanted"), "note");
        JsonNode longest = createWish(owner, with(wish(card, false), "note", "é".repeat(280)));
        assertThat(longest.path("note").asString()).hasSize(280);
        callJson(
                HttpMethod.POST,
                "/api/v1/wishlist",
                owner.uid(),
                with(wish(azure, true), "nearMintOnly", "sometimes"),
                400);

        // The same selection twice is 409, whatever the note, NM or term.
        JsonNode conflict =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/wishlist",
                        owner.uid(),
                        with(wish(azure, true), "nearMintOnly", true),
                        409);
        assertThat(conflict.path("errorCode").asString()).isEqualTo("CONFLICT");
        String other =
                createWish(owner, with(wish(card, false), "rarity", "Ultra Rare"))
                        .path("id")
                        .asString();
        Map<String, Object> toAny = new LinkedHashMap<>();
        toAny.put("rarity", null);
        callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + other, owner.uid(), toAny, 409);

        // PATCH validation: another card's printing, null for a non-nullable member, bad term.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + other,
                owner.uid(),
                Map.of("printingId", otherCardPrinting.toString()),
                400);
        Map<String, Object> nullNm = new LinkedHashMap<>();
        nullNm.put("nearMintOnly", null);
        callJson(HttpMethod.PATCH, "/api/v1/wishlist/" + other, owner.uid(), nullNm, 400);
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + other,
                owner.uid(),
                Map.of("priceTerm", "95% TCG"),
                400);
        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + other,
                owner.uid(),
                Map.of("note", "quuxspam deal"),
                400);
    }

    @Test
    void priceTermsComeFromTheAdminSettings() {
        Collector owner = collector("wl-terms", americasNorth());
        JsonNode terms =
                callJson(HttpMethod.GET, "/api/v1/wishlist/price-terms", owner.uid(), null, 200);
        assertThat(terms.path("terms").findValues("label").stream().map(JsonNode::asString))
                .containsExactly("80% TCG", "85% TCG", "90% TCG", "100% TCG", "100% TCG+");
        callJson(HttpMethod.GET, "/api/v1/wishlist/price-terms", null, null, 401);

        String admin = uniqueUid("wl-admin");
        provisionWithRoles(admin, Role.ADMIN);
        JsonNode settings =
                callJson(HttpMethod.GET, "/api/v1/admin/wishlist/settings", admin, null, 200);
        assertThat(settings.path("priceTerms")).hasSize(5);
        callJson(HttpMethod.GET, "/api/v1/admin/wishlist/settings", owner.uid(), null, 403);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/wishlist/settings",
                owner.uid(),
                Map.of("priceTerms", List.of("75% TCG")),
                403);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/wishlist/settings",
                admin,
                Map.of("priceTerms", List.of("75% TCG", "cheap")),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/wishlist/settings",
                admin,
                Map.of("priceTerms", List.of()),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/wishlist/settings",
                admin,
                Map.of("priceTerms", List.of("250% TCG")),
                400);

        UUID card = cardOf(printing(AZURE));
        String kept =
                createWish(owner, with(wish(card, false), "priceTerm", "85% TCG"))
                        .path("id")
                        .asString();
        try {
            JsonNode changed =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/admin/wishlist/settings",
                            admin,
                            Map.of("priceTerms", List.of("75% TCG", " 110% TCG+", "75% TCG")),
                            200);
            assertThat(changed.path("priceTerms").get(0).asString()).isEqualTo("75% TCG");
            assertThat(changed.path("priceTerms").get(1).asString()).isEqualTo("110% TCG+");
            assertThat(changed.path("priceTerms")).hasSize(2);
            assertThat(changed.path("updatedBy").asString()).isNotBlank();
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM audit_log WHERE action ="
                                            + " 'wishlist.settings.update'"))
                    .isPositive();

            // New terms are accepted, removed ones refused for new choices, kept on old wishes.
            UUID other = cardOf(printing("ygo-p002a"));
            assertThat(
                            createWish(owner, with(wish(other, false), "priceTerm", "75% TCG"))
                                    .path("priceTerm")
                                    .path("percent")
                                    .asInt())
                    .isEqualTo(75);
            callJson(
                    HttpMethod.PATCH,
                    "/api/v1/wishlist/" + kept,
                    owner.uid(),
                    Map.of("priceTerm", "85% TCG"),
                    400);
            JsonNode keptWish =
                    callJson(
                            HttpMethod.PATCH,
                            "/api/v1/wishlist/" + kept,
                            owner.uid(),
                            Map.of("nearMintOnly", true),
                            200);
            assertThat(keptWish.path("priceTerm").path("label").asString()).isEqualTo("85% TCG");
        } finally {
            testUsers.update(
                    "UPDATE platform_settings SET value = to_jsonb(?::text) WHERE key ="
                            + " 'wishlist.price_terms'",
                    String.join(",", WishlistSettings.DEFAULT_PRICE_TERMS));
            wishlistSettings.invalidate();
        }
    }

    @Test
    void itemsAreLimitedByThePlan() {
        Collector owner = collector("wl-limits", americasNorth());
        UUID azure = printing(AZURE);
        UUID french = printing(AZURE_FR);
        UUID card = cardOf(azure);
        String id = createWish(owner, wish(azure, true)).path("id").asString();

        Collector premium = collector("wl-premium", americasNorth());
        testUsers.update(
                "UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", premium.id());
        createWish(premium, wish(azure, true));

        // wishlist.items.max (FREE 20 by default; lowered to 2 for the test).
        setFreeItemsMax(2);
        try {
            createWish(owner, wish(french, true));
            JsonNode limit =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/wishlist",
                            owner.uid(),
                            wish(card, false),
                            429);
            assertThat(limit.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
            assertThat(limit.path("limitKey").asString()).isEqualTo("wishlist.items.max");
            assertThat(limit.path("limit").asInt()).isEqualTo(2);
            assertThat(limit.path("used").asInt()).isEqualTo(2);
            assertThat(limit.path("planCode").asString()).isEqualTo("FREE");

            // Deleting one frees a slot.
            callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, owner.uid(), null, 204);
            createWish(owner, wish(card, false));

            // PREMIUM: 500.
            createWish(premium, wish(french, true));
            createWish(premium, wish(card, false));
        } finally {
            setFreeItemsMax(20);
        }
    }

    @Test
    void itemsBelongToTheirOwnerOnlyAndTheMatchesFeatureIsGone() {
        Place place = americasNorth();
        Collector owner = collector("wl-owner", place);
        Collector other = collector("wl-other", place);
        String id = createWish(owner, wish(printing(AZURE), true)).path("id").asString();

        callJson(
                HttpMethod.PATCH,
                "/api/v1/wishlist/" + id,
                other.uid(),
                Map.of("nearMintOnly", true),
                404);
        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, other.uid(), null, 404);
        assertThat(callJson(HttpMethod.GET, "/api/v1/wishlist", other.uid(), null, 200)).isEmpty();

        callJson(HttpMethod.GET, "/api/v1/wishlist", null, null, 401);
        callJson(HttpMethod.POST, "/api/v1/wishlist", null, wish(printing(AZURE), true), 401);
        callJson(HttpMethod.DELETE, "/api/v1/wishlist/" + id, null, null, 401);
        callJson(
                HttpMethod.GET,
                "/api/v1/collectors/" + owner.handle() + "/wishlist",
                null,
                null,
                401);

        // No matches endpoint, no dismiss endpoint, no rematch job, no table.
        int matches = status(HttpMethod.GET, "/api/v1/wishlist/" + id + "/matches", owner.uid());
        assertThat(matches).isIn(404, 405);
        int dismiss =
                status(
                        HttpMethod.POST,
                        "/api/v1/wishlist/matches/" + UUID.randomUUID() + "/dismiss",
                        owner.uid());
        assertThat(dismiss).isIn(404, 405);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM information_schema.tables WHERE table_name"
                                        + " = 'wishlist_match'"))
                .isZero();
        assertThat(callJson(HttpMethod.GET, "/api/v1/wishlist", owner.uid(), null, 200)).hasSize(1);
    }

    @Test
    void publicSummaryFollowsWishlistVisibilityAndBlocks() {
        Place place = americasNorth();
        Collector owner = collector("wl-public", place);
        Collector viewer = collector("wl-viewer", place);
        UUID azure = printing(AZURE);
        Map<String, Object> body = wish(azure, true);
        body.put("note", "Trading binder welcome");
        body.put("nearMintOnly", true);
        body.put("priceTerm", "90% TCG");
        body.put("notes", "Secret budget note");
        createWish(owner, body);
        createWish(owner, with(wish(cardOf(azure), false), "rarity", "Ultra Rare"));
        String summary = "/api/v1/collectors/" + owner.handle() + "/wishlist";

        // Hidden by default (privacy default wishlistVisible=false), except for the owner.
        callJson(HttpMethod.GET, summary, viewer.uid(), null, 404);
        assertThat(callJson(HttpMethod.GET, summary, owner.uid(), null, 200)).hasSize(2);

        wishlistVisible(owner, true);
        JsonNode entries = callJson(HttpMethod.GET, summary, viewer.uid(), null, 200);
        assertThat(entries).hasSize(2);
        JsonNode entry = entries.get(1);
        assertThat(entry.path("card").path("name").asString()).isEqualTo(cardNameOf(azure));
        assertThat(entry.path("printing").path("id").asString()).isEqualTo(azure.toString());
        assertThat(entry.path("note").asString()).isEqualTo("Trading binder welcome");
        assertThat(entry.path("nearMintOnly").asBoolean()).isTrue();
        assertThat(entry.path("priceTerm").path("label").asString()).isEqualTo("90% TCG");
        assertThat(entries.get(0).path("rarity").asString()).isEqualTo("Ultra Rare");
        assertThat(entries.get(0).path("printing").isNull()).isTrue();
        assertThat(entries.toString())
                .doesNotContain("Secret budget note")
                .doesNotContain("maxPrice")
                .doesNotContain("radiusKm")
                .doesNotContain("\"place\"");

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

        // The owner's export carries every wish with its public note.
        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", owner.uid(), null, 200);
        JsonNode section = export.path("sections").path("wishlist");
        assertThat(section).hasSize(2);
        assertThat(section.toString())
                .contains("Trading binder welcome")
                .contains("90% TCG")
                .doesNotContain("Secret budget note");
    }

    private int status(HttpMethod method, String uri, String uid) {
        return call(method, uri, uid, null).getStatus().value();
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
