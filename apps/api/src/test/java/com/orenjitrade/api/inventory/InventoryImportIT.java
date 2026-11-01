package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.ImportTestSupport.IMPORTS;
import static com.orenjitrade.api.inventory.InventoryTestSupport.SERVICE_TOKEN;
import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.inventory.ImportTestSupport.TestCard;
import com.orenjitrade.api.inventory.ImportTestSupport.TestPrinting;
import com.orenjitrade.api.inventory.ImportTestSupport.TestSet;
import com.orenjitrade.api.inventory.domain.imports.InventoryImportService;
import com.orenjitrade.api.inventory.domain.imports.InventoryImportSettings;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.MissingNode;

/**
 * The inventory import (stage S5): the preview of a YDK deck file and of a Collectr CSV export, its
 * edits, and the commit (PRIVATE items, merges, idempotency, chunks), with everything that guards
 * it: ownership, expiry and purge, the freemium limit, the file limits (admin settings read at run
 * time), and the two things an import must never do: log what a file holds, store a Collectr price.
 * Every card, set, passcode and price here is fictional.
 */
class InventoryImportIT extends AbstractIntegrationTest {

    private static final String ITEMS = "/api/v1/inventory/items";
    private static final String SETTINGS = "/api/v1/admin/inventory/import-settings";
    private static final String YUGIOH = "yugioh";

    @Autowired private InventoryImportService importService;
    @Autowired private InventoryImportSettings importSettings;
    @Autowired private UsageLimitService usageLimits;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;

    @AfterEach
    void defaultSettings() {
        // The settings are shared by the suite: every test leaves the seeded values behind.
        testUsers.update(
                "UPDATE platform_settings SET value = d.value::jsonb FROM (VALUES"
                        + " ('inventory.import.ydk_max_kb', '100'),"
                        + " ('inventory.import.ydk_max_lines', '500'),"
                        + " ('inventory.import.csv_max_kb', '2048'),"
                        + " ('inventory.import.csv_max_rows', '5000'),"
                        + " ('inventory.import.preview_ttl_minutes', '60')) AS d (key, value)"
                        + " WHERE platform_settings.key = d.key");
        importSettings.invalidate();
        // inventory.items.max has no number unless a test gives it one (limitInventory).
        testUsers.update(
                "UPDATE usage_limit SET max_value = NULL WHERE limit_key = 'inventory.items.max'");
        usageLimits.invalidate();
    }

    // ---------------------------------------------------------------------------------------
    // Preview
    // ---------------------------------------------------------------------------------------

    @Test
    void aDeckFileBecomesAPreviewAndNothingIsAddedYet() {
        String uid = uniqueUid("import-ydk");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String unknown = ImportTestSupport.passcode();
        String file =
                "#created by a fictional player\r\n#main\r\n"
                        + deck.single.passcode()
                        + "\r\n"
                        + deck.single.passcode()
                        + "\r\n"
                        + deck.twin.passcode()
                        + "\r\n0"
                        + deck.single.passcode()
                        + "\r\nnot a passcode\r\n#extra\r\n"
                        + deck.alternate
                        + "\r\n\r\n!side\r\n"
                        + deck.twin.passcode()
                        + "\r\n"
                        + unknown
                        + "\r\n";

        JsonNode preview = upload(uid, "YDK", file, 201);

        String id = preview.path("id").asString();
        assertThat(preview.path("source").asString()).isEqualTo("YDK");
        assertThat(preview.path("status").asString()).isEqualTo("PENDING");
        assertThat(preview.path("committedAt").isNull()).isTrue();
        assertThat(preview.has("result")).isTrue();
        assertThat(preview.path("result").isNull()).isTrue();
        assertThat(preview.path("ignoredLines").asInt()).isEqualTo(1);
        assertThat(preview.path("sections").path("includeMain").asBoolean()).isTrue();
        assertThat(preview.path("sections").path("includeExtra").asBoolean()).isTrue();
        assertThat(preview.path("sections").path("includeSide").asBoolean()).isTrue();
        assertThat(preview.path("sections").path("mainCopies").asInt())
                .as("the copies the file holds in the main deck")
                .isEqualTo(4);
        assertThat(preview.path("sections").path("extraCopies").asInt()).isEqualTo(1);
        assertThat(preview.path("sections").path("sideCopies").asInt())
                .as("an unknown passcode is still a copy of the side deck")
                .isEqualTo(2);
        assertThat(Instant.parse(preview.path("expiresAt").asString()))
                .isBetween(
                        Instant.now().plus(Duration.ofMinutes(55)),
                        Instant.now().plus(Duration.ofMinutes(61)));
        JsonNode summary = preview.path("summary");
        assertThat(summary.path("rows").asInt()).isEqualTo(4);
        assertThat(summary.path("ready").asInt()).isEqualTo(1);
        assertThat(summary.path("toChoose").asInt()).isEqualTo(2);
        assertThat(summary.path("unmatched").asInt()).isEqualTo(1);
        assertThat(summary.path("leftOut").asInt()).isZero();
        assertThat(summary.path("copies").asInt()).isEqualTo(3);
        assertThat(summary.path("items").asInt()).isEqualTo(1);
        assertThat(summary.path("mergedItems").asInt()).as("nothing owned yet").isZero();
        assertThat(summary.path("defaultConditions").asInt())
                .as("a deck file names no condition: every matched row has the default")
                .isEqualTo(3);

        JsonNode page = callJson(HttpMethod.GET, IMPORTS + "/" + id + "/rows", uid, null, 200);
        assertThat(page.path("totalItems").asInt()).isEqualTo(4);
        JsonNode rows = page.path("items");
        JsonNode single = rows.get(0);
        assertThat(single.path("position").asInt()).isZero();
        assertThat(single.path("status").asString()).isEqualTo("READY");
        assertThat(single.path("unmatchedReason").isNull()).isTrue();
        assertThat(single.path("source").path("passcode").asString())
                .isEqualTo(deck.single.passcode());
        assertThat(single.path("source").path("name").isNull()).isTrue();
        assertThat(single.path("deck").path("main").asInt())
                .as("three lines of the main deck, one of them with a leading zero")
                .isEqualTo(3);
        assertThat(single.path("card").path("id").asString())
                .isEqualTo(deck.single.id().toString());
        assertThat(single.path("card").path("name").asString()).isEqualTo(deck.single.name());
        assertThat(single.path("card").path("game").asString()).isEqualTo(YUGIOH);
        assertThat(single.path("card").path("imageUrl").asString())
                .as("OrenjiTrade's own picture URL, never the provider's")
                .contains("/api/v1/public/");
        assertThat(single.path("printing").path("id").asString())
                .as("a card with a single printing needs no choice")
                .isEqualTo(deck.only.id().toString());
        assertThat(single.path("printingChoice").asString()).isEqualTo("AUTO");
        assertThat(single.path("printingCount").asInt()).isEqualTo(1);
        assertThat(single.path("condition").asString())
                .as("a deck file names no condition: the grade that claims least")
                .isEqualTo("DAMAGED");
        assertThat(single.path("conditionSource").asString()).isEqualTo("DEFAULT");
        assertThat(single.path("language").asString()).isEqualTo("en");
        assertThat(single.path("edition").asString()).isEqualTo("UNLIMITED");
        assertThat(single.path("quantity").asInt()).isEqualTo(3);
        assertThat(single.path("fileQuantity").asInt()).isEqualTo(3);
        assertThat(single.path("quantityEdited").asBoolean()).isFalse();
        assertThat(single.path("included").asBoolean()).isTrue();
        assertThat(single.path("inScope").asBoolean()).isTrue();
        assertThat(single.path("willImport").asBoolean()).isTrue();
        assertThat(single.path("ownedQuantity").asInt()).isZero();

        JsonNode twin = rows.get(1);
        assertThat(twin.path("status").asString()).isEqualTo("CHOOSE_PRINTING");
        assertThat(twin.path("printing").isNull()).as("a deck file names no printing").isTrue();
        assertThat(twin.path("printingChoice").isNull()).isTrue();
        assertThat(twin.path("printingCount").asInt()).isEqualTo(2);
        assertThat(twin.path("suggestedPrintingIds").isEmpty()).isTrue();
        assertThat(twin.path("deck").path("main").asInt()).isEqualTo(1);
        assertThat(twin.path("deck").path("side").asInt()).isEqualTo(1);
        assertThat(twin.path("quantity").asInt()).isEqualTo(2);
        assertThat(twin.path("willImport").asBoolean()).isFalse();
        assertThat(twin.path("language").isNull()).isTrue();

        JsonNode alternate = rows.get(2);
        assertThat(alternate.path("source").path("passcode").asString()).isEqualTo(deck.alternate);
        assertThat(alternate.path("status").asString()).isEqualTo("CHOOSE_PRINTING");
        assertThat(alternate.path("card").path("id").asString())
                .as("the passcode of an alternate artwork is the card of that artwork")
                .isEqualTo(deck.twin.id().toString());
        assertThat(alternate.path("deck").path("extra").asInt()).isEqualTo(1);

        JsonNode missing = rows.get(3);
        assertThat(missing.path("status").asString()).isEqualTo("UNMATCHED");
        assertThat(missing.path("unmatchedReason").asString()).isEqualTo("UNKNOWN_PASSCODE");
        assertThat(missing.path("source").path("passcode").asString()).isEqualTo(unknown);
        assertThat(missing.path("card").isNull()).isTrue();
        assertThat(missing.path("condition").isNull()).isTrue();
        assertThat(missing.path("willImport").asBoolean()).isFalse();

        JsonNode unmatched =
                callJson(
                        HttpMethod.GET,
                        IMPORTS + "/" + id + "/rows?status=UNMATCHED&size=1",
                        uid,
                        null,
                        200);
        assertThat(unmatched.path("totalItems").asInt()).isEqualTo(1);
        assertThat(unmatched.path("items").get(0).path("id").asString())
                .isEqualTo(missing.path("id").asString());
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        IMPORTS + "/" + id + "/rows?status=CHOOSE_PRINTING",
                                        uid,
                                        null,
                                        200)
                                .path("totalItems")
                                .asInt())
                .isEqualTo(2);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        IMPORTS + "/" + id + "/rows?page=1&size=3",
                                        uid,
                                        null,
                                        200)
                                .path("items")
                                .size())
                .isEqualTo(1);
        assertThat(liveItems(ownerId)).as("a preview adds nothing").isZero();
    }

    @Test
    void aCollectrExportBecomesAPreviewAndItsPricesAreNowhere() {
        String uid = uniqueUid("import-csv");
        UUID ownerId = provisionCompliant(uid);
        TestSet older = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2024, 3, 1));
        TestSet newer = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2025, 6, 1));
        TestCard exact = ImportTestSupport.card(testUsers, YUGIOH, null);
        TestPrinting exactOlder =
                ImportTestSupport.printing(testUsers, exact, older, "EN001", "Ultra Rare");
        ImportTestSupport.printing(testUsers, exact, newer, "EN001", "Ultra Rare");
        TestCard several = ImportTestSupport.card(testUsers, YUGIOH, null);
        TestPrinting severalRare =
                ImportTestSupport.printing(testUsers, several, older, "EN002", "Rare");
        TestPrinting severalSecret =
                ImportTestSupport.printing(testUsers, several, older, "EN002", "Secret Rare");
        ImportTestSupport.printing(testUsers, several, newer, "EN002", "Rare");
        String nobody = InventoryTestSupport.token() + " Nobody";
        String file =
                "Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,"
                        + "Card Condition,Average Cost Paid,Quantity,Market Price (As of"
                        + " 2026-10-01),Price Override,Watchlist,Date Added,Notes\n"
                        + "Zqportfolio,Yu-Gi-Oh!,\""
                        + older.name()
                        + "\","
                        + exact.name()
                        + ","
                        + exactOlder.code()
                        + ",Ultra Rare,1st Edition,Ungraded,Near Mint,7731.41,2,7759.26,7753.58,"
                        + "false,2019-01-31,zqnote one\n"
                        + "Zqportfolio,Yu-Gi-Oh!,"
                        + older.code()
                        + ",\""
                        + several.name()
                        + "\",,,,,,7712.00,,7713.00,,false,2019-01-31,\n"
                        + "Zqportfolio,Yu-Gi-Oh!,Some Set,"
                        + nobody
                        + ",EN404,Common,,,Lightly Played,7701.00,3,7702.00,,false,2019-01-31,\n"
                        + "Zqportfolio,Baseball Cards,1989 Series,"
                        + exact.name()
                        + ",12,,,,,7705.00,1,7706.00,,false,2019-01-31,\n";

        JsonNode preview = upload(uid, "COLLECTR_CSV", file, 201);

        String id = preview.path("id").asString();
        assertThat(preview.path("source").asString()).isEqualTo("COLLECTR_CSV");
        assertThat(preview.path("sections").isNull()).as("no deck sections in a CSV").isTrue();
        JsonNode summary = preview.path("summary");
        assertThat(summary.path("rows").asInt()).isEqualTo(4);
        assertThat(summary.path("ready").asInt()).isEqualTo(1);
        assertThat(summary.path("toChoose").asInt()).isEqualTo(1);
        assertThat(summary.path("unmatched").asInt()).isEqualTo(2);
        assertThat(summary.path("copies").asInt()).isEqualTo(2);

        JsonNode rows =
                callJson(HttpMethod.GET, IMPORTS + "/" + id + "/rows", uid, null, 200)
                        .path("items");
        JsonNode ready = rows.get(0);
        assertThat(ready.path("status").asString()).isEqualTo("READY");
        assertThat(ready.path("printing").path("id").asString())
                .as("set, code and rarity fit exactly one printing")
                .isEqualTo(exactOlder.id().toString());
        assertThat(ready.path("printingChoice").asString()).isEqualTo("AUTO");
        assertThat(ready.path("printingCount").asInt()).isEqualTo(2);
        assertThat(ready.path("deck").isNull()).isTrue();
        assertThat(ready.path("source").path("name").asString()).isEqualTo(exact.name());
        assertThat(ready.path("source").path("set").asString()).isEqualTo(older.name());
        assertThat(ready.path("source").path("number").asString()).isEqualTo(exactOlder.code());
        assertThat(ready.path("source").path("rarity").asString()).isEqualTo("Ultra Rare");
        assertThat(ready.path("source").path("passcode").isNull()).isTrue();
        assertThat(ready.path("condition").asString()).isEqualTo("NEAR_MINT");
        assertThat(ready.path("conditionSource").asString()).isEqualTo("FILE");
        assertThat(ready.path("edition").asString())
                .as("the copy is a first edition: the file says so, no printing does")
                .isEqualTo("FIRST_EDITION");
        assertThat(ready.path("language").asString()).isEqualTo("en");
        assertThat(ready.path("quantity").asInt()).isEqualTo(2);

        JsonNode toChoose = rows.get(1);
        assertThat(toChoose.path("status").asString()).isEqualTo("CHOOSE_PRINTING");
        assertThat(toChoose.path("card").path("id").asString()).isEqualTo(several.id().toString());
        assertThat(toChoose.path("printingCount").asInt()).isEqualTo(3);
        List<String> suggested = new ArrayList<>();
        toChoose.path("suggestedPrintingIds").forEach(node -> suggested.add(node.asString()));
        assertThat(suggested)
                .as("the printings of the set the row names")
                .containsExactlyInAnyOrder(
                        severalRare.id().toString(), severalSecret.id().toString());
        assertThat(toChoose.path("condition").asString()).isEqualTo("DAMAGED");
        assertThat(toChoose.path("conditionSource").asString()).isEqualTo("DEFAULT");
        assertThat(toChoose.path("quantity").asInt()).as("no quantity: one copy").isEqualTo(1);

        JsonNode unknown = rows.get(2);
        assertThat(unknown.path("status").asString()).isEqualTo("UNMATCHED");
        assertThat(unknown.path("unmatchedReason").asString()).isEqualTo("UNKNOWN_CARD");
        assertThat(unknown.path("source").path("name").asString()).isEqualTo(nobody);
        assertThat(unknown.path("source").path("set").asString()).isEqualTo("Some Set");
        assertThat(unknown.path("source").path("number").asString()).isEqualTo("EN404");
        assertThat(unknown.path("fileQuantity").asInt()).isEqualTo(3);
        assertThat(rows.get(3).path("unmatchedReason").asString()).isEqualTo("UNKNOWN_GAME");

        callJson(
                HttpMethod.POST,
                IMPORTS + "/" + id + "/commit",
                uid,
                Map.of("skipUnresolved", true),
                200);

        // Nothing of the price columns, the portfolio, the dates or the notes reached the
        // database: not the preview, not its rows, not the item.
        List<String> stored = new ArrayList<>();
        for (String sql :
                List.of(
                        "SELECT row_to_json(i)::text AS doc FROM inventory_import i WHERE"
                                + " i.owner_id = ?",
                        "SELECT row_to_json(r)::text AS doc FROM inventory_import_row r JOIN"
                                + " inventory_import i ON i.id = r.import_id WHERE i.owner_id = ?",
                        "SELECT row_to_json(t)::text AS doc FROM inventory_item t WHERE"
                                + " t.owner_id = ?")) {
            testUsers.query(sql, ownerId).forEach(row -> stored.add((String) row.get("doc")));
        }
        assertThat(stored).hasSize(1 + 4 + 1);
        assertThat(stored)
                .allSatisfy(
                        document ->
                                assertThat(document)
                                        .doesNotContain(
                                                "7731.41",
                                                "7759.26",
                                                "7753.58",
                                                "7712.00",
                                                "7713.00",
                                                "7701.00",
                                                "7702.00",
                                                "7705.00",
                                                "7706.00",
                                                "Zqportfolio",
                                                "zqnote",
                                                "2019-01-31"));
        JsonNode item = callJson(HttpMethod.GET, ITEMS, uid, null, 200).path("items").get(0);
        assertThat(item.path("askingPrice").isNull()).as("an import never sets a price").isTrue();
        assertThat(item.path("notes").asString()).isEmpty();
        assertThat(item.path("edition").asString()).isEqualTo("FIRST_EDITION");
        assertThat(item.path("condition").asString()).isEqualTo("NEAR_MINT");
    }

    // ---------------------------------------------------------------------------------------
    // Edits
    // ---------------------------------------------------------------------------------------

    @Test
    void theCollectorEditsThePreview() {
        String uid = uniqueUid("import-edit");
        provisionCompliant(uid);
        Deck deck = deck();
        String unknown = ImportTestSupport.passcode();
        JsonNode preview =
                upload(
                        uid,
                        "YDK",
                        "#main\n"
                                + deck.single.passcode()
                                + "\n"
                                + deck.single.passcode()
                                + "\n"
                                + deck.twin.passcode()
                                + "\n!side\n"
                                + deck.single.passcode()
                                + "\n"
                                + deck.alternate
                                + "\n"
                                + unknown
                                + "\n",
                        201);
        String id = preview.path("id").asString();
        String base = IMPORTS + "/" + id;
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        String single = rows.get(0).path("id").asString();
        String twin = rows.get(1).path("id").asString();
        String alternate = rows.get(2).path("id").asString();
        String unmatched = rows.get(3).path("id").asString();
        assertThat(preview.path("summary").path("copies").asInt()).isEqualTo(3);

        // Sections: the side deck no longer counts.
        JsonNode withoutSide =
                callJson(HttpMethod.PATCH, base, uid, Map.of("includeSide", false), 200);
        assertThat(withoutSide.path("sections").path("includeSide").asBoolean()).isFalse();
        assertThat(withoutSide.path("sections").path("includeMain").asBoolean()).isTrue();
        assertThat(withoutSide.path("sections").path("sideCopies").asInt())
                .as("what the file holds, whether the section counts or not")
                .isEqualTo(3);
        assertThat(withoutSide.path("summary").path("copies").asInt())
                .as("the side copy of the single card is gone")
                .isEqualTo(2);
        assertThat(withoutSide.path("summary").path("toChoose").asInt())
                .as("the alternate artwork is only in the side deck")
                .isEqualTo(1);
        assertThat(withoutSide.path("summary").path("leftOut").asInt()).isEqualTo(1);
        JsonNode sideOnly = row(uid, base, alternate);
        assertThat(sideOnly.path("inScope").asBoolean()).isFalse();
        assertThat(sideOnly.path("willImport").asBoolean()).isFalse();
        assertThat(sideOnly.path("quantity").asInt()).isZero();
        assertThat(row(uid, base, single).path("quantity").asInt()).isEqualTo(2);
        callJson(HttpMethod.PATCH, base, uid, Map.of("includeSide", true), 200);

        // A printing of the row's card, and only of that card.
        JsonNode chosen =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + twin,
                        uid,
                        Map.of("printingId", deck.older.id().toString()),
                        200);
        assertThat(chosen.path("row").path("status").asString()).isEqualTo("READY");
        assertThat(chosen.path("row").path("printing").path("id").asString())
                .isEqualTo(deck.older.id().toString());
        assertThat(chosen.path("row").path("printingChoice").asString()).isEqualTo("MANUAL");
        assertThat(chosen.path("row").path("language").asString()).isEqualTo("en");
        assertThat(chosen.path("preview").path("summary").path("ready").asInt()).isEqualTo(2);
        assertThat(chosen.path("preview").path("summary").path("toChoose").asInt()).isEqualTo(1);
        JsonNode foreign =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + twin,
                        uid,
                        Map.of("printingId", deck.only.id().toString()),
                        400);
        assertThat(foreign.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(foreign.path("errors").get(0).path("field").asString()).isEqualTo("printingId");
        Map<String, Object> clear = new LinkedHashMap<>();
        clear.put("printingId", null);
        JsonNode cleared = callJson(HttpMethod.PATCH, base + "/rows/" + twin, uid, clear, 200);
        assertThat(cleared.path("row").path("status").asString()).isEqualTo("CHOOSE_PRINTING");
        assertThat(cleared.path("row").path("printingChoice").isNull()).isTrue();

        // The condition: one of the game's.
        JsonNode nearMint =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + single,
                        uid,
                        Map.of("condition", "near_mint"),
                        200);
        assertThat(nearMint.path("row").path("condition").asString()).isEqualTo("NEAR_MINT");
        assertThat(nearMint.path("row").path("conditionSource").asString()).isEqualTo("EDITED");
        assertThat(nearMint.path("preview").path("summary").path("defaultConditions").asInt())
                .as("one row less has the condition nobody chose")
                .isEqualTo(2);
        JsonNode badCondition =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + single,
                        uid,
                        Map.of("condition", "PRISTINE"),
                        400);
        assertThat(badCondition.path("errors").get(0).path("field").asString())
                .isEqualTo("condition");
        assertThat(badCondition.path("errors").get(0).path("message").asString())
                .contains("NEAR_MINT", "DAMAGED");

        // The copies: the collector's number, until it is taken back.
        JsonNode five =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + single,
                        uid,
                        Map.of("quantity", 5),
                        200);
        assertThat(five.path("row").path("quantity").asInt()).isEqualTo(5);
        assertThat(five.path("row").path("fileQuantity").asInt()).isEqualTo(3);
        assertThat(five.path("row").path("quantityEdited").asBoolean()).isTrue();
        assertThat(five.path("preview").path("summary").path("copies").asInt()).isEqualTo(5);
        for (int invalid : new int[] {0, 10_000}) {
            assertThat(
                            callJson(
                                            HttpMethod.PATCH,
                                            base + "/rows/" + single,
                                            uid,
                                            Map.of("quantity", invalid),
                                            400)
                                    .path("errors")
                                    .get(0)
                                    .path("field")
                                    .asString())
                    .isEqualTo("quantity");
        }
        Map<String, Object> reset = new LinkedHashMap<>();
        reset.put("quantity", null);
        JsonNode back = callJson(HttpMethod.PATCH, base + "/rows/" + single, uid, reset, 200);
        assertThat(back.path("row").path("quantity").asInt()).isEqualTo(3);
        assertThat(back.path("row").path("quantityEdited").asBoolean()).isFalse();
        assertThat(back.path("row").path("condition").asString())
                .as("a field that was not sent is unchanged")
                .isEqualTo("NEAR_MINT");

        // In or out.
        JsonNode out =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + single,
                        uid,
                        Map.of("included", false),
                        200);
        assertThat(out.path("row").path("included").asBoolean()).isFalse();
        assertThat(out.path("row").path("willImport").asBoolean()).isFalse();
        assertThat(out.path("row").path("status").asString()).isEqualTo("READY");
        assertThat(out.path("preview").path("summary").path("ready").asInt()).isZero();
        assertThat(out.path("preview").path("summary").path("leftOut").asInt()).isEqualTo(1);
        assertThat(out.path("preview").path("summary").path("copies").asInt()).isZero();

        // A row that fits nothing is reported, never edited; an unknown row is 404.
        JsonNode refused =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + unmatched,
                        uid,
                        Map.of("included", false),
                        409);
        assertThat(refused.path("errorCode").asString()).isEqualTo("CONFLICT");
        assertThat(
                        callJson(
                                        HttpMethod.PATCH,
                                        base + "/rows/" + UUID.randomUUID(),
                                        uid,
                                        Map.of("included", false),
                                        404)
                                .path("errorCode")
                                .asString())
                .isEqualTo("NOT_FOUND");
    }

    @Test
    void theBulkActionsChooseTheMostRecentPrintingAndSetTheCondition() {
        String uid = uniqueUid("import-bulk");
        provisionCompliant(uid);
        TestSet oldest = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2023, 1, 15));
        TestSet middle = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2024, 7, 20));
        TestSet newest = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2026, 2, 5));
        TestSet undated = ImportTestSupport.set(testUsers, YUGIOH, null);
        TestCard first = ImportTestSupport.card(testUsers, YUGIOH, null);
        ImportTestSupport.printing(testUsers, first, oldest, "EN010", "Rare");
        TestPrinting firstNewest =
                ImportTestSupport.printing(testUsers, first, newest, "EN010", "Rare");
        ImportTestSupport.printing(testUsers, first, middle, "EN010", "Rare");
        ImportTestSupport.printing(testUsers, first, undated, "EN010", "Rare");
        TestCard second = ImportTestSupport.card(testUsers, YUGIOH, null);
        TestPrinting secondOldest =
                ImportTestSupport.printing(testUsers, second, oldest, "EN011", "Rare");
        TestPrinting secondMiddle =
                ImportTestSupport.printing(testUsers, second, middle, "EN011", "Rare");
        ImportTestSupport.printing(testUsers, second, newest, "EN011", "Common");
        TestCard third = ImportTestSupport.card(testUsers, YUGIOH, null);
        TestPrinting thirdOldest =
                ImportTestSupport.printing(testUsers, third, oldest, "EN012", "Rare");
        ImportTestSupport.printing(testUsers, third, newest, "EN012", "Rare");
        String nobody = InventoryTestSupport.token() + " Nobody";
        // The second card's rows name a rarity only two of its three printings have.
        String file =
                "Product Name,Rarity,Card Condition,Quantity\n"
                        + first.name()
                        + ",,,1\n"
                        + second.name()
                        + ",Rare,Lightly Played,1\n"
                        + third.name()
                        + ",,,1\n"
                        + nobody
                        + ",,,1\n";
        String id = upload(uid, "COLLECTR_CSV", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        String thirdRow = rows.get(2).path("id").asString();
        assertThat(rows.get(1).path("suggestedPrintingIds").size()).isEqualTo(2);
        JsonNode counts = callJson(HttpMethod.GET, base, uid, null, 200).path("summary");
        assertThat(counts.path("defaultConditions").asInt()).isEqualTo(2);
        assertThat(counts.path("defaultCondition").asString())
                .as("the rows without a condition all start at the lowest grade")
                .isEqualTo("DAMAGED");
        // The collector chose the third card's printing by hand: the bulk action leaves it.
        callJson(
                HttpMethod.PATCH,
                base + "/rows/" + thirdRow,
                uid,
                Map.of("printingId", thirdOldest.id().toString()),
                200);

        JsonNode recent =
                callJson(
                        HttpMethod.POST,
                        base + "/bulk",
                        uid,
                        Map.of("action", "USE_MOST_RECENT_PRINTING"),
                        200);

        assertThat(recent.path("updated").asInt()).isEqualTo(2);
        assertThat(recent.path("assumed").asInt())
                .as("each of these cards has one printing of its most recent date")
                .isZero();
        assertThat(recent.path("undecided").asInt()).isZero();
        assertThat(recent.path("preview").path("summary").path("ready").asInt()).isEqualTo(3);
        assertThat(recent.path("preview").path("summary").path("toChoose").asInt()).isZero();
        rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows.get(0).path("printing").path("id").asString())
                .as("by the release date of the set; a set without a date is the oldest")
                .isEqualTo(firstNewest.id().toString());
        assertThat(rows.get(0).path("printingChoice").asString()).isEqualTo("MOST_RECENT");
        assertThat(rows.get(1).path("printing").path("id").asString())
                .as("the most recent among the printings the file narrowed the row to")
                .isEqualTo(secondMiddle.id().toString());
        assertThat(rows.get(1).path("printing").path("id").asString())
                .isNotEqualTo(secondOldest.id().toString());
        assertThat(rows.get(2).path("printing").path("id").asString())
                .isEqualTo(thirdOldest.id().toString());
        assertThat(rows.get(2).path("printingChoice").asString()).isEqualTo("MANUAL");
        assertThat(rows.get(3).path("status").asString()).isEqualTo("UNMATCHED");
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        base + "/bulk",
                                        uid,
                                        Map.of("action", "USE_MOST_RECENT_PRINTING"),
                                        200)
                                .path("updated")
                                .asInt())
                .as("nothing left to choose")
                .isZero();

        // The condition of every row nobody gave one.
        callJson(
                HttpMethod.PATCH,
                base + "/rows/" + thirdRow,
                uid,
                Map.of("condition", "MINT"),
                200);
        JsonNode conditioned =
                callJson(
                        HttpMethod.POST,
                        base + "/bulk",
                        uid,
                        Map.of("action", "SET_CONDITION", "condition", "near_mint"),
                        200);
        assertThat(conditioned.path("updated").asInt()).isEqualTo(1);
        assertThat(conditioned.path("undecided").asInt()).isZero();
        assertThat(conditioned.path("preview").path("summary").path("defaultConditions").asInt())
                .isEqualTo(1);
        assertThat(conditioned.path("preview").path("summary").path("defaultCondition").asString())
                .as("what the rows nobody gave a condition are set to now")
                .isEqualTo("NEAR_MINT");
        rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows.get(0).path("condition").asString()).isEqualTo("NEAR_MINT");
        assertThat(rows.get(0).path("conditionSource").asString())
                .as("still nobody's choice for this row: another bulk action may change it")
                .isEqualTo("DEFAULT");
        assertThat(rows.get(1).path("condition").asString())
                .as("the file's condition stays")
                .isEqualTo("LIGHTLY_PLAYED");
        assertThat(rows.get(2).path("condition").asString())
                .as("the collector's condition stays")
                .isEqualTo("MINT");
        for (Map<String, Object> invalid :
                List.<Map<String, Object>>of(
                        Map.of("action", "SET_CONDITION"),
                        Map.of("action", "SET_CONDITION", "condition", "PRISTINE"),
                        Map.of("condition", "MINT"),
                        Map.of("action", "EXPLODE"))) {
            assertThat(
                            callJson(HttpMethod.POST, base + "/bulk", uid, invalid, 400)
                                    .path("errorCode")
                                    .asString())
                    .isEqualTo("VALIDATION_FAILED");
        }
        assertThat(
                        callJson(HttpMethod.PATCH, base, uid, Map.of("includeSide", false), 400)
                                .path("errorCode")
                                .asString())
                .as("a CSV has no deck sections")
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void theMostRecentPrintingTakesThePlainCopyOfSeveralVersionsAndGuessesNothingElse() {
        String uid = uniqueUid("import-tie");
        provisionCompliant(uid);
        TestSet older = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2024, 7, 20));
        TestSet newest = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2026, 2, 5));
        // One set, a 1st Edition and an Unlimited copy: the everyday case of the game. The
        // catalog lists the 1st Edition first.
        TestCard versions = ImportTestSupport.card(testUsers, YUGIOH, null);
        TestPrinting firstEdition =
                ImportTestSupport.printing(
                        testUsers, versions, newest, "EN020", "Rare", "FIRST_EDITION", "en");
        TestPrinting unlimited =
                ImportTestSupport.printing(
                        testUsers, versions, newest, "EN020", "Rare", "UNLIMITED", "en");
        ImportTestSupport.printing(testUsers, versions, older, "EN020", "Common");
        // One set, two rarities: nothing says which one the collector has.
        TestCard rarities = ImportTestSupport.card(testUsers, YUGIOH, null);
        ImportTestSupport.printing(testUsers, rarities, newest, "EN022", "Super Rare");
        ImportTestSupport.printing(testUsers, rarities, newest, "EN022", "Secret Rare");
        TestCard clear = ImportTestSupport.card(testUsers, YUGIOH, null);
        ImportTestSupport.printing(testUsers, clear, older, "EN021", "Rare");
        TestPrinting clearNewest =
                ImportTestSupport.printing(testUsers, clear, newest, "EN021", "Rare");
        String file =
                "Product Name,Quantity\n"
                        + versions.name()
                        + ",1\n"
                        + rarities.name()
                        + ",1\n"
                        + clear.name()
                        + ",1\n";
        String id = upload(uid, "COLLECTR_CSV", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;

        JsonNode recent =
                callJson(
                        HttpMethod.POST,
                        base + "/bulk",
                        uid,
                        Map.of("action", "USE_MOST_RECENT_PRINTING"),
                        200);

        assertThat(recent.path("updated").asInt()).isEqualTo(2);
        assertThat(recent.path("assumed").asInt())
                .as("two versions of one printing: the plain copy, and it is said")
                .isEqualTo(1);
        assertThat(recent.path("undecided").asInt())
                .as("two rarities of the most recent date: the date decides nothing")
                .isEqualTo(1);
        assertThat(recent.path("preview").path("summary").path("toChoose").asInt()).isEqualTo(1);
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows.get(0).path("printing").path("id").asString())
                .as("the Unlimited copy, not the 1st Edition the catalog lists first")
                .isEqualTo(unlimited.id().toString());
        assertThat(rows.get(0).path("printing").path("id").asString())
                .isNotEqualTo(firstEdition.id().toString());
        assertThat(rows.get(0).path("printingChoice").asString())
                .as("the row says the copy was assumed")
                .isEqualTo("MOST_RECENT_ASSUMED");
        assertThat(rows.get(1).path("status").asString())
                .as("neither rarity was taken for the collector")
                .isEqualTo("CHOOSE_PRINTING");
        assertThat(rows.get(1).path("printing").isNull()).isTrue();
        assertThat(rows.get(2).path("printing").path("id").asString())
                .isEqualTo(clearNewest.id().toString());
        assertThat(rows.get(2).path("printingChoice").asString()).isEqualTo("MOST_RECENT");
        JsonNode again =
                callJson(
                        HttpMethod.POST,
                        base + "/bulk",
                        uid,
                        Map.of("action", "USE_MOST_RECENT_PRINTING"),
                        200);
        assertThat(again.path("updated").asInt()).isZero();
        assertThat(again.path("assumed").asInt()).isZero();
        assertThat(again.path("undecided").asInt()).as("said every time").isEqualTo(1);

        // The collector's own choice replaces the assumption, and the import goes in as that copy.
        JsonNode chosen =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + rows.get(0).path("id").asString(),
                        uid,
                        Map.of("printingId", firstEdition.id().toString()),
                        200);
        assertThat(chosen.path("row").path("printingChoice").asString()).isEqualTo("MANUAL");
        callJson(HttpMethod.POST, base + "/commit", uid, Map.of("skipUnresolved", true), 200);
        assertThat(
                        testUsers.query(
                                "SELECT printing_id, edition FROM inventory_item WHERE owner_id ="
                                        + " (SELECT owner_id FROM inventory_import WHERE id = ?)"
                                        + " AND printing_id IN (?, ?)",
                                UUID.fromString(id),
                                firstEdition.id(),
                                unlimited.id()))
                .singleElement()
                .satisfies(
                        item -> {
                            assertThat(item.get("printing_id")).isEqualTo(firstEdition.id());
                            assertThat(item.get("edition")).isEqualTo("FIRST_EDITION");
                        });
    }

    @Test
    void theRowsWhoseCopyWasAssumedAreCountedAndCanBeListedUntilEachIsChecked() {
        String uid = uniqueUid("import-assumed");
        provisionCompliant(uid);
        TestSet older = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2024, 7, 20));
        TestSet newest = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2026, 2, 5));
        // Two cards their most recent set holds as a 1st Edition and an Unlimited copy, with a
        // card the date decides and one nothing decides between them in the file.
        TestCard versionsA = ImportTestSupport.card(testUsers, YUGIOH, null);
        ImportTestSupport.printing(
                testUsers, versionsA, newest, "EN030", "Rare", "FIRST_EDITION", "en");
        TestPrinting plainA =
                ImportTestSupport.printing(
                        testUsers, versionsA, newest, "EN030", "Rare", "UNLIMITED", "en");
        TestCard clear = ImportTestSupport.card(testUsers, YUGIOH, null);
        ImportTestSupport.printing(testUsers, clear, older, "EN031", "Rare");
        ImportTestSupport.printing(testUsers, clear, newest, "EN031", "Rare");
        TestCard versionsB = ImportTestSupport.card(testUsers, YUGIOH, null);
        ImportTestSupport.printing(
                testUsers, versionsB, newest, "EN032", "Rare", "FIRST_EDITION", "en");
        TestPrinting plainB =
                ImportTestSupport.printing(
                        testUsers, versionsB, newest, "EN032", "Rare", "UNLIMITED", "en");
        TestCard rarities = ImportTestSupport.card(testUsers, YUGIOH, null);
        ImportTestSupport.printing(testUsers, rarities, newest, "EN033", "Super Rare");
        ImportTestSupport.printing(testUsers, rarities, newest, "EN033", "Secret Rare");
        String file =
                "Product Name,Quantity\n"
                        + versionsA.name()
                        + ",1\n"
                        + clear.name()
                        + ",1\n"
                        + versionsB.name()
                        + ",1\n"
                        + rarities.name()
                        + ",1\n"
                        + InventoryTestSupport.token()
                        + " Nobody,1\n";
        String id = upload(uid, "COLLECTR_CSV", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;
        String assumedRows = base + "/rows?printingChoice=MOST_RECENT_ASSUMED";
        assertThat(assumedPrintings(uid, base)).as("nothing was assumed yet").isZero();
        assertThat(callJson(HttpMethod.GET, assumedRows, uid, null, 200).path("totalItems").asInt())
                .isZero();

        JsonNode recent =
                callJson(
                        HttpMethod.POST,
                        base + "/bulk",
                        uid,
                        Map.of("action", "USE_MOST_RECENT_PRINTING"),
                        200);

        assertThat(recent.path("assumed").asInt()).isEqualTo(2);
        assertThat(recent.path("preview").path("summary").path("assumedPrintings").asInt())
                .as("the count stays on the preview after the answer of the bulk action is gone")
                .isEqualTo(2);
        assertThat(assumedPrintings(uid, base)).isEqualTo(2);
        JsonNode listed = callJson(HttpMethod.GET, assumedRows, uid, null, 200);
        assertThat(listed.path("totalItems").asInt()).isEqualTo(2);
        assertThat(positions(listed))
                .as("the rows to check, in file order, and only those")
                .containsExactly(0, 2);
        for (JsonNode row : listed.path("items")) {
            assertThat(row.path("printingChoice").asString()).isEqualTo("MOST_RECENT_ASSUMED");
        }
        assertThat(listed.path("items").get(0).path("printing").path("id").asString())
                .isEqualTo(plainA.id().toString());
        assertThat(
                        positions(
                                callJson(
                                        HttpMethod.GET,
                                        base + "/rows?printingChoice=MOST_RECENT",
                                        uid,
                                        null,
                                        200)))
                .as("the row the release date decided is not one to check")
                .containsExactly(1);
        assertThat(
                        positions(
                                callJson(
                                        HttpMethod.GET,
                                        assumedRows + "&status=READY&size=1&page=1",
                                        uid,
                                        null,
                                        200)))
                .as("paged like every list of rows, and with a status when one is asked")
                .containsExactly(2);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        assumedRows + "&status=CHOOSE_PRINTING",
                                        uid,
                                        null,
                                        200)
                                .path("totalItems")
                                .asInt())
                .isZero();
        callJson(HttpMethod.GET, base + "/rows?printingChoice=GUESSED", uid, null, 400);

        // A row left out is still one whose copy was assumed: it is listed until it is checked.
        String rowA = listed.path("items").get(0).path("id").asString();
        String rowB = listed.path("items").get(1).path("id").asString();
        JsonNode leftOut =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + rowA,
                        uid,
                        Map.of("included", false),
                        200);
        assertThat(leftOut.path("preview").path("summary").path("assumedPrintings").asInt())
                .isEqualTo(2);
        assertThat(positions(callJson(HttpMethod.GET, assumedRows, uid, null, 200)))
                .containsExactly(0, 2);

        // The collector confirms the plain copy of the first row: it is their choice from here on.
        JsonNode confirmed =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + rowA,
                        uid,
                        Map.of("printingId", plainA.id().toString()),
                        200);
        assertThat(confirmed.path("row").path("printingChoice").asString()).isEqualTo("MANUAL");
        assertThat(confirmed.path("preview").path("summary").path("assumedPrintings").asInt())
                .isEqualTo(1);
        assertThat(positions(callJson(HttpMethod.GET, assumedRows, uid, null, 200)))
                .containsExactly(2);

        // "Decide later" takes the copy away: the row is to choose, no longer to check.
        Map<String, Object> noPrinting = new LinkedHashMap<>();
        noPrinting.put("printingId", null);
        JsonNode later = callJson(HttpMethod.PATCH, base + "/rows/" + rowB, uid, noPrinting, 200);
        assertThat(later.path("preview").path("summary").path("assumedPrintings").asInt()).isZero();
        assertThat(callJson(HttpMethod.GET, assumedRows, uid, null, 200).path("totalItems").asInt())
                .isZero();

        // The bulk action again: the row is assumed again. Then its printing leaves the catalog,
        // which leaves the row without one: to choose again, not to check.
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        base + "/bulk",
                                        uid,
                                        Map.of("action", "USE_MOST_RECENT_PRINTING"),
                                        200)
                                .path("preview")
                                .path("summary")
                                .path("assumedPrintings")
                                .asInt())
                .isEqualTo(1);
        testUsers.update("DELETE FROM card_printing WHERE id = ?", plainB.id());
        assertThat(assumedPrintings(uid, base)).isZero();
        assertThat(callJson(HttpMethod.GET, assumedRows, uid, null, 200).path("totalItems").asInt())
                .isZero();
        assertThat(
                        positions(
                                callJson(
                                        HttpMethod.GET,
                                        base + "/rows?status=CHOOSE_PRINTING",
                                        uid,
                                        null,
                                        200)))
                .containsExactly(2, 3);
    }

    private int assumedPrintings(String uid, String base) {
        return callJson(HttpMethod.GET, base, uid, null, 200)
                .path("summary")
                .path("assumedPrintings")
                .asInt(-1);
    }

    private static List<Integer> positions(JsonNode page) {
        List<Integer> positions = new ArrayList<>();
        for (JsonNode row : page.path("items")) {
            positions.add(row.path("position").asInt());
        }
        return positions;
    }

    // ---------------------------------------------------------------------------------------
    // Commit
    // ---------------------------------------------------------------------------------------

    @Test
    void theCommitAddsPrivateItemsMergesEqualRowsAndIsIdempotent() {
        String uid = uniqueUid("import-commit");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        // The collector already has two damaged copies of the single card, filed in a public
        // binder and kept private: the card an import adds its copies to.
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                InventoryTestSupport.binder("Trades", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> existing = InventoryTestSupport.item(deck.only.id());
        existing.put("condition", "DAMAGED");
        existing.put("quantity", 2);
        existing.put("binderId", binderId);
        existing.put("visibility", "PRIVATE");
        String existingId =
                callJson(HttpMethod.POST, ITEMS, uid, existing, 201).path("id").asString();
        // And a near mint copy: another condition, so another item.
        Map<String, Object> other = InventoryTestSupport.item(deck.only.id());
        other.put("quantity", 4);
        String otherId = callJson(HttpMethod.POST, ITEMS, uid, other, 201).path("id").asString();

        String id =
                upload(
                                uid,
                                "YDK",
                                "#main\n"
                                        + deck.single.passcode()
                                        + "\n"
                                        + deck.single.passcode()
                                        + "\n"
                                        + deck.single.passcode()
                                        + "\n"
                                        + deck.twin.passcode()
                                        + "\n"
                                        + deck.twin.passcode()
                                        + "\n#extra\n"
                                        + deck.alternate
                                        + "\n",
                                201)
                        .path("id")
                        .asString();
        String base = IMPORTS + "/" + id;
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows.get(0).path("ownedQuantity").asInt())
                .as("the damaged copies the row will be added to")
                .isEqualTo(2);
        // The card and its alternate artwork get the same printing: equal rows, one item.
        for (int index : new int[] {1, 2}) {
            callJson(
                    HttpMethod.PATCH,
                    base + "/rows/" + rows.get(index).path("id").asString(),
                    uid,
                    Map.of("printingId", deck.newer.id().toString()),
                    200);
        }
        JsonNode before = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(before.path("summary").path("ready").asInt()).isEqualTo(3);
        assertThat(before.path("summary").path("copies").asInt()).isEqualTo(6);
        assertThat(before.path("summary").path("items").asInt())
                .as("two of the three rows are equal")
                .isEqualTo(2);
        assertThat(before.path("summary").path("mergedItems").asInt())
                .as("one of the two items is equal to the damaged copies already owned")
                .isEqualTo(1);
        // A row left out no longer counts as merged, and counts again once it is back.
        String ownedRow = base + "/rows/" + rows.get(0).path("id").asString();
        assertThat(
                        callJson(HttpMethod.PATCH, ownedRow, uid, Map.of("included", false), 200)
                                .path("preview")
                                .path("summary")
                                .path("mergedItems")
                                .asInt())
                .isZero();
        // Another condition than the owned copies is another item: nothing to merge into.
        assertThat(
                        callJson(
                                        HttpMethod.PATCH,
                                        ownedRow,
                                        uid,
                                        Map.of("included", true, "condition", "LIGHTLY_PLAYED"),
                                        200)
                                .path("preview")
                                .path("summary")
                                .path("mergedItems")
                                .asInt())
                .isZero();
        assertThat(
                        callJson(
                                        HttpMethod.PATCH,
                                        ownedRow,
                                        uid,
                                        Map.of("condition", "DAMAGED"),
                                        200)
                                .path("preview")
                                .path("summary")
                                .path("mergedItems")
                                .asInt())
                .isEqualTo(1);

        JsonNode committed = callJson(HttpMethod.POST, base + "/commit", uid, null, 200);

        assertThat(committed.path("status").asString()).isEqualTo("COMMITTED");
        assertThat(committed.path("committedAt").isNull()).isFalse();
        JsonNode result = committed.path("result");
        assertThat(result.path("itemsCreated").asInt()).isEqualTo(1);
        assertThat(result.path("itemsMerged").asInt()).isEqualTo(1);
        assertThat(result.path("copiesAdded").asInt()).isEqualTo(6);
        assertThat(result.path("rowsImported").asInt()).isEqualTo(3);
        assertThat(result.path("chunksDone").asInt()).isEqualTo(1);
        assertThat(result.path("totalChunks").asInt()).isEqualTo(1);

        assertThat(liveItems(ownerId)).isEqualTo(3);
        JsonNode merged = callJson(HttpMethod.GET, ITEMS + "/" + existingId, uid, null, 200);
        assertThat(merged.path("quantity").asInt()).as("2 + 3, not a second item").isEqualTo(5);
        assertThat(merged.path("binder").path("id").asString()).isEqualTo(binderId);
        assertThat(merged.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(merged.path("effectivePublic").asBoolean()).isFalse();
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + otherId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .as("another condition is another item")
                .isEqualTo(4);
        JsonNode created = null;
        for (JsonNode item : callJson(HttpMethod.GET, ITEMS, uid, null, 200).path("items")) {
            if (item.path("printing").path("id").asString().equals(deck.newer.id().toString())) {
                created = item;
            }
        }
        assertThat(created).isNotNull();
        assertThat(created.path("quantity").asInt()).as("2 + 1 of the equal rows").isEqualTo(3);
        assertThat(created.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(created.path("effectivePublic").asBoolean()).isFalse();
        assertThat(created.path("binder").isNull()).isTrue();
        assertThat(created.path("condition").asString()).isEqualTo("DAMAGED");
        assertThat(created.path("availability").asString()).isEqualTo("COLLECTION_ONLY");
        assertThat(created.path("acceptsOffers").asBoolean()).isFalse();
        assertThat(created.path("askingPrice").isNull()).isTrue();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND"
                                        + " publicly_listed AND printing_id = ?",
                                ownerId,
                                deck.newer.id()))
                .isZero();

        // A second commit adds nothing and answers the same.
        JsonNode again = callJson(HttpMethod.POST, base + "/commit", uid, null, 200);
        assertThat(again.path("result")).isEqualTo(committed.path("result"));
        assertThat(again.path("committedAt").asString())
                .isEqualTo(committed.path("committedAt").asString());
        assertThat(liveItems(ownerId)).isEqualTo(3);
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + existingId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .isEqualTo(5);
        assertThat(callJson(HttpMethod.GET, base, uid, null, 200).path("result"))
                .isEqualTo(committed.path("result"));

        // Committed: no edit, no discard.
        String rowId = rows.get(0).path("id").asString();
        for (JsonNode refused :
                List.of(
                        callJson(
                                HttpMethod.PATCH,
                                base + "/rows/" + rowId,
                                uid,
                                Map.of("quantity", 9),
                                409),
                        callJson(HttpMethod.PATCH, base, uid, Map.of("includeSide", false), 409),
                        callJson(
                                HttpMethod.POST,
                                base + "/bulk",
                                uid,
                                Map.of("action", "USE_MOST_RECENT_PRINTING"),
                                409),
                        callJson(HttpMethod.DELETE, base, uid, null, 409))) {
            assertThat(refused.path("errorCode").asString()).isEqualTo("IMPORT_ALREADY_COMMITTED");
            assertThat(refused.path("currentStatus").asString()).isEqualTo("COMMITTED");
        }
    }

    @Test
    void anEqualPrivateItemTakesTheCopiesBeforeAPublicOne() {
        String uid = uniqueUid("import-private");
        provisionCompliant(uid);
        Deck deck = deck();
        Map<String, Object> shown = InventoryTestSupport.item(deck.only.id());
        shown.put("condition", "DAMAGED");
        shown.put("visibility", "PUBLIC");
        String publicId = callJson(HttpMethod.POST, ITEMS, uid, shown, 201).path("id").asString();
        Map<String, Object> kept = InventoryTestSupport.item(deck.only.id());
        kept.put("condition", "DAMAGED");
        String privateId = callJson(HttpMethod.POST, ITEMS, uid, kept, 201).path("id").asString();
        String id =
                upload(uid, "YDK", "#main\n" + deck.single.passcode() + "\n", 201)
                        .path("id")
                        .asString();

        JsonNode committed =
                callJson(HttpMethod.POST, IMPORTS + "/" + id + "/commit", uid, null, 200);

        assertThat(committed.path("result").path("itemsMerged").asInt()).isEqualTo(1);
        assertThat(committed.path("result").path("itemsCreated").asInt()).isZero();
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + privateId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .as("an imported copy never becomes public by being merged")
                .isEqualTo(2);
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + publicId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .isEqualTo(1);
    }

    @Test
    void anImportNeverRaisesACardTheCollectorShows() {
        String uid = uniqueUid("import-shown");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        // The collector shows one damaged copy; the deck holds two more of that card.
        Map<String, Object> shown = InventoryTestSupport.item(deck.only.id());
        shown.put("condition", "DAMAGED");
        shown.put("visibility", "PUBLIC");
        String publicId = callJson(HttpMethod.POST, ITEMS, uid, shown, 201).path("id").asString();
        String file = "#main\n" + deck.single.passcode() + "\n" + deck.single.passcode() + "\n";
        String id = upload(uid, "YDK", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;

        JsonNode preview = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(preview.path("summary").path("items").asInt()).isEqualTo(1);
        assertThat(preview.path("summary").path("mergedItems").asInt())
                .as("the copies do not join the card the collector shows")
                .isZero();
        JsonNode row =
                callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items").get(0);
        assertThat(row.path("ownedQuantity").asInt()).isZero();
        assertThat(row.path("shownQuantity").asInt())
                .as("the preview says the collector shows a copy of this card")
                .isEqualTo(1);

        JsonNode committed = callJson(HttpMethod.POST, base + "/commit", uid, null, 200);

        assertThat(committed.path("result").path("itemsCreated").asInt()).isEqualTo(1);
        assertThat(committed.path("result").path("itemsMerged").asInt()).isZero();
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + publicId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .as("the public card is as its owner left it")
                .isEqualTo(1);
        assertThat(
                        testUsers.query(
                                "SELECT quantity, visibility, publicly_listed FROM inventory_item"
                                        + " WHERE owner_id = ? AND id <> ? AND deleted_at IS NULL",
                                ownerId,
                                UUID.fromString(publicId)))
                .as("the imported copies are a private card of their own")
                .singleElement()
                .satisfies(
                        item -> {
                            assertThat(item.get("quantity")).isEqualTo(2);
                            assertThat(item.get("visibility")).isEqualTo("PRIVATE");
                            assertThat(item.get("publicly_listed")).isEqualTo(false);
                        });

        // The same deck again: its copies join the private card, still not the public one.
        String again = upload(uid, "YDK", file, 201).path("id").asString();
        JsonNode second =
                callJson(HttpMethod.GET, IMPORTS + "/" + again + "/rows", uid, null, 200)
                        .path("items")
                        .get(0);
        assertThat(second.path("ownedQuantity").asInt()).isEqualTo(2);
        assertThat(second.path("shownQuantity").asInt()).isEqualTo(1);
        JsonNode merged =
                callJson(HttpMethod.POST, IMPORTS + "/" + again + "/commit", uid, null, 200);
        assertThat(merged.path("result").path("itemsMerged").asInt()).isEqualTo(1);
        assertThat(merged.path("result").path("itemsCreated").asInt()).isZero();
        assertThat(liveItems(ownerId)).isEqualTo(2);
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + publicId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .isEqualTo(1);
    }

    @Test
    void copiesAboveWhatOneCardHoldsAreReportedNotLostSilently() {
        String uid = uniqueUid("import-cap");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        Map<String, Object> owned = InventoryTestSupport.item(deck.only.id());
        owned.put("quantity", 9990);
        String ownedId = callJson(HttpMethod.POST, ITEMS, uid, owned, 201).path("id").asString();
        // Two equal rows: 20 and 9,999 near mint copies of a card the collector has 9,990 of.
        String file =
                "Product Name,Card Condition,Quantity\n"
                        + deck.single.name()
                        + ",Near Mint,20\n"
                        + deck.single.name()
                        + ",Near Mint,9999\n"
                        + deck.single.name()
                        + ",Near Mint,10000\n";
        String id = upload(uid, "COLLECTR_CSV", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows.get(2).path("status").asString())
                .as("more copies than a card holds: reported, not cut down to 9,999")
                .isEqualTo("UNMATCHED");
        assertThat(rows.get(2).path("unmatchedReason").asString()).isEqualTo("INVALID_QUANTITY");

        JsonNode result =
                callJson(HttpMethod.POST, base + "/commit", uid, null, 200).path("result");

        assertThat(result.path("itemsMerged").asInt()).isEqualTo(1);
        assertThat(result.path("rowsImported").asInt()).isEqualTo(2);
        assertThat(result.path("copiesAdded").asInt()).isEqualTo(9);
        assertThat(result.path("copiesNotAdded").asInt())
                .as("10,019 copies asked for, 9 added: the rest is said")
                .isEqualTo(10_010);
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + ownedId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .isEqualTo(9999);
        assertThat(liveItems(ownerId)).isEqualTo(1);
        assertThat(callJson(HttpMethod.POST, base + "/commit", uid, null, 200).path("result"))
                .as("a repeated commit answers the same")
                .isEqualTo(result);
    }

    @Test
    void twoCommitsAtOnceWriteTheImportOnce() throws Exception {
        String uid = uniqueUid("import-twice");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String id =
                upload(
                                uid,
                                "YDK",
                                "#main\n"
                                        + deck.single.passcode()
                                        + "\n"
                                        + deck.single.passcode()
                                        + "\n",
                                201)
                        .path("id")
                        .asString();
        int callers = 4;
        ExecutorService pool = Executors.newFixedThreadPool(callers);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<JsonNode>> answers = new ArrayList<>();
            for (int index = 0; index < callers; index++) {
                answers.add(
                        pool.submit(
                                () -> {
                                    start.await(30, TimeUnit.SECONDS);
                                    return callJson(
                                            HttpMethod.POST,
                                            IMPORTS + "/" + id + "/commit",
                                            uid,
                                            null,
                                            200);
                                }));
            }
            start.countDown();
            JsonNode first = answers.get(0).get(60, TimeUnit.SECONDS);
            for (Future<JsonNode> answer : answers) {
                JsonNode body = answer.get(60, TimeUnit.SECONDS);
                assertThat(body.path("status").asString()).isEqualTo("COMMITTED");
                assertThat(body.path("result")).isEqualTo(first.path("result"));
            }
            assertThat(first.path("result").path("itemsCreated").asInt()).isEqualTo(1);
            assertThat(first.path("result").path("copiesAdded").asInt()).isEqualTo(2);
        } finally {
            pool.shutdownNow();
        }
        assertThat(liveItems(ownerId)).isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT sum(quantity) FROM inventory_item WHERE owner_id = ?",
                                ownerId))
                .as("the copies went in once")
                .isEqualTo(2);
    }

    @Test
    void rowsThatStillNeedAPrintingRefuseTheCommitUnlessTheyAreLeftOut() {
        String uid = uniqueUid("import-unresolved");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String file =
                "#main\n"
                        + deck.single.passcode()
                        + "\n"
                        + deck.twin.passcode()
                        + "\n"
                        + deck.alternate
                        + "\n";
        String id = upload(uid, "YDK", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;

        JsonNode refused = callJson(HttpMethod.POST, base + "/commit", uid, null, 409);

        assertThat(refused.path("errorCode").asString()).isEqualTo("IMPORT_ROWS_UNRESOLVED");
        assertThat(refused.path("unresolved").asInt()).isEqualTo(2);
        assertThat(refused.path("message").asString()).contains("2 rows");
        assertThat(liveItems(ownerId)).isZero();
        assertThat(callJson(HttpMethod.GET, base, uid, null, 200).path("status").asString())
                .isEqualTo("PENDING");
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        base + "/commit",
                                        uid,
                                        Map.of("skipUnresolved", false),
                                        409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("IMPORT_ROWS_UNRESOLVED");

        JsonNode committed =
                callJson(
                        HttpMethod.POST,
                        base + "/commit",
                        uid,
                        Map.of("skipUnresolved", true),
                        200);

        assertThat(committed.path("result").path("rowsImported").asInt()).isEqualTo(1);
        assertThat(committed.path("result").path("itemsCreated").asInt()).isEqualTo(1);
        assertThat(liveItems(ownerId)).isEqualTo(1);

        // Nothing ready at all: nothing to import, with or without the option.
        String empty =
                upload(uid, "YDK", "#main\n" + deck.twin.passcode() + "\n", 201)
                        .path("id")
                        .asString();
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        IMPORTS + "/" + empty + "/commit",
                                        uid,
                                        Map.of("skipUnresolved", true),
                                        409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("IMPORT_EMPTY");
        assertThat(liveItems(ownerId)).isEqualTo(1);
    }

    @Test
    void aCardThatLeftTheCatalogIsReportedAndNeverImported() {
        String uid = uniqueUid("import-removed");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String id =
                upload(uid, "YDK", "#main\n" + deck.single.passcode() + "\n", 201)
                        .path("id")
                        .asString();
        String base = IMPORTS + "/" + id;
        assertThat(
                        callJson(HttpMethod.GET, base, uid, null, 200)
                                .path("summary")
                                .path("ready")
                                .asInt())
                .isEqualTo(1);

        testUsers.update("DELETE FROM card WHERE id = ?", deck.single.id());

        JsonNode row =
                callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items").get(0);
        assertThat(row.path("status").asString()).isEqualTo("UNMATCHED");
        assertThat(row.path("unmatchedReason").asString()).isEqualTo("CARD_REMOVED");
        assertThat(row.path("printing").isNull()).isTrue();
        assertThat(
                        callJson(HttpMethod.POST, base + "/commit", uid, null, 409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("IMPORT_EMPTY");
        assertThat(liveItems(ownerId)).isZero();
    }

    // ---------------------------------------------------------------------------------------
    // Ownership, expiry, purge
    // ---------------------------------------------------------------------------------------

    @Test
    void anImportBelongsToItsCollector() {
        String uid = uniqueUid("import-owner");
        UUID ownerId = provisionCompliant(uid);
        String stranger = uniqueUid("import-stranger");
        UUID strangerId = provisionCompliant(stranger);
        Deck deck = deck();
        String id =
                upload(uid, "YDK", "#main\n" + deck.single.passcode() + "\n", 201)
                        .path("id")
                        .asString();
        String base = IMPORTS + "/" + id;
        String rowId =
                callJson(HttpMethod.GET, base + "/rows", uid, null, 200)
                        .path("items")
                        .get(0)
                        .path("id")
                        .asString();

        List<JsonNode> answers =
                List.of(
                        callJson(HttpMethod.GET, base, stranger, null, 404),
                        callJson(HttpMethod.GET, base + "/rows", stranger, null, 404),
                        callJson(
                                HttpMethod.PATCH,
                                base,
                                stranger,
                                Map.of("includeSide", false),
                                404),
                        callJson(
                                HttpMethod.PATCH,
                                base + "/rows/" + rowId,
                                stranger,
                                Map.of("quantity", 9),
                                404),
                        callJson(
                                HttpMethod.POST,
                                base + "/bulk",
                                stranger,
                                Map.of("action", "USE_MOST_RECENT_PRINTING"),
                                404),
                        callJson(HttpMethod.POST, base + "/commit", stranger, null, 404),
                        callJson(HttpMethod.DELETE, base, stranger, null, 404));

        JsonNode unknown =
                callJson(HttpMethod.GET, IMPORTS + "/" + UUID.randomUUID(), stranger, null, 404);
        for (JsonNode answer : answers) {
            assertThat(answer.path("errorCode").asString()).isEqualTo("NOT_FOUND");
            assertThat(answer.path("message").asString())
                    .as("another collector's import answers like one that does not exist")
                    .isEqualTo(unknown.path("message").asString());
        }
        assertThat(liveItems(strangerId)).isZero();
        assertThat(liveItems(ownerId)).isZero();
        JsonNode untouched = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(untouched.path("status").asString()).isEqualTo("PENDING");
        assertThat(untouched.path("sections").path("includeSide").asBoolean()).isTrue();
        assertThat(row(uid, base, rowId).path("quantity").asInt()).isEqualTo(1);

        // Signed out: 401, like every route of the inventory.
        assertThat(call(HttpMethod.GET, base, null, null).getStatus().value()).isEqualTo(401);
        assertThat(call(HttpMethod.POST, base + "/commit", null, null).getStatus().value())
                .isEqualTo(401);
    }

    @Test
    void aPreviewExpiresAndThePurgeRemovesIt() {
        String uid = uniqueUid("import-expiry");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String file = "#main\n" + deck.single.passcode() + "\n";
        String id = upload(uid, "YDK", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;
        String rowId =
                callJson(HttpMethod.GET, base + "/rows", uid, null, 200)
                        .path("items")
                        .get(0)
                        .path("id")
                        .asString();
        // A committed import of another collector, long past its time to live, and one whose
        // commit nobody finished: an hour late is not enough to purge that one.
        String otherUid = uniqueUid("import-expiry-other");
        provisionCompliant(otherUid);
        String done = upload(otherUid, "YDK", file, 201).path("id").asString();
        callJson(HttpMethod.POST, IMPORTS + "/" + done + "/commit", otherUid, null, 200);
        String unfinishedUid = uniqueUid("import-expiry-unfinished");
        provisionCompliant(unfinishedUid);
        String unfinished = upload(unfinishedUid, "YDK", file, 201).path("id").asString();
        testUsers.update(
                "UPDATE inventory_import SET status = 'COMMITTING', total_chunks = 2,"
                        + " chunks_done = 1, expires_at = now() - interval '1 hour' WHERE id = ?",
                UUID.fromString(unfinished));

        testUsers.update(
                "UPDATE inventory_import SET expires_at = now() - interval '1 second' WHERE id"
                        + " IN (?, ?)",
                UUID.fromString(id),
                UUID.fromString(done));

        for (JsonNode expired :
                List.of(
                        callJson(HttpMethod.GET, base, uid, null, 410),
                        callJson(HttpMethod.GET, base + "/rows", uid, null, 410),
                        callJson(HttpMethod.PATCH, base, uid, Map.of("includeSide", false), 410),
                        callJson(
                                HttpMethod.PATCH,
                                base + "/rows/" + rowId,
                                uid,
                                Map.of("quantity", 2),
                                410),
                        callJson(
                                HttpMethod.POST,
                                base + "/bulk",
                                uid,
                                Map.of("action", "USE_MOST_RECENT_PRINTING"),
                                410),
                        callJson(HttpMethod.POST, base + "/commit", uid, null, 410))) {
            assertThat(expired.path("errorCode").asString()).isEqualTo("IMPORT_EXPIRED");
            assertThat(expired.path("status").asInt()).isEqualTo(410);
        }
        assertThat(liveItems(ownerId)).as("an expired preview adds nothing").isZero();
        assertThat(
                        callJson(HttpMethod.GET, IMPORTS + "/" + done, otherUid, null, 200)
                                .path("status")
                                .asString())
                .as("the result of a finished import stays readable until the purge")
                .isEqualTo("COMMITTED");

        JsonNode job =
                json(
                        http.post()
                                .uri("/internal/jobs/inventory-import-purge")
                                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                                .exchange()
                                .expectStatus()
                                .isOk()
                                .expectBody()
                                .returnResult());

        assertThat(job.path("removed").asInt()).isGreaterThanOrEqualTo(2);
        assertThat(callJson(HttpMethod.GET, base, uid, null, 404).path("errorCode").asString())
                .isEqualTo("NOT_FOUND");
        callJson(HttpMethod.GET, IMPORTS + "/" + done, otherUid, null, 404);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_import_row WHERE import_id IN"
                                        + " (?, ?)",
                                UUID.fromString(id),
                                UUID.fromString(done)))
                .as("the rows go with their import")
                .isZero();
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        IMPORTS + "/" + unfinished,
                                        unfinishedUid,
                                        null,
                                        200)
                                .path("status")
                                .asString())
                .isEqualTo("COMMITTING");
        assertThat(testUsers.jobRuns("inventory-import-purge")).isNotEmpty();
        testUsers.update(
                "UPDATE inventory_import SET expires_at = now() - interval '8 days' WHERE id = ?",
                UUID.fromString(unfinished));
        assertThat(importService.purgeExpired(500)).isGreaterThanOrEqualTo(1);
        callJson(HttpMethod.GET, IMPORTS + "/" + unfinished, unfinishedUid, null, 404);
        // The hourly freshness trigger runs the same purge: no schedule of its own is needed.
        String late = upload(uid, "YDK", file, 201).path("id").asString();
        testUsers.update(
                "UPDATE inventory_import SET expires_at = now() - interval '1 second' WHERE id = ?",
                UUID.fromString(late));
        http.post()
                .uri("/internal/jobs/freshness")
                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                .exchange()
                .expectStatus()
                .isOk();
        callJson(HttpMethod.GET, IMPORTS + "/" + late, uid, null, 404);
        // The job needs the service token.
        http.post()
                .uri("/internal/jobs/inventory-import-purge")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .value(status -> assertThat(status).isIn(401, 403));
    }

    @Test
    void aNewUploadReplacesThePreviewNoCommitStartedAndAPreviewCanBeDiscarded() {
        String uid = uniqueUid("import-replace");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String file = "#main\n" + deck.single.passcode() + "\n";
        String committed = upload(uid, "YDK", file, 201).path("id").asString();
        callJson(HttpMethod.POST, IMPORTS + "/" + committed + "/commit", uid, null, 200);
        String first = upload(uid, "YDK", file, 201).path("id").asString();

        String second = upload(uid, "YDK", file, 201).path("id").asString();

        callJson(HttpMethod.GET, IMPORTS + "/" + first, uid, null, 404);
        callJson(HttpMethod.GET, IMPORTS + "/" + second, uid, null, 200);
        JsonNode mine = callJson(HttpMethod.GET, IMPORTS, uid, null, 200);
        assertThat(mine.size()).as("the open preview, then the finished import").isEqualTo(2);
        assertThat(mine.get(0).path("id").asString()).isEqualTo(second);
        assertThat(mine.get(0).path("status").asString()).isEqualTo("PENDING");
        assertThat(mine.get(0).path("summary").path("ready").asInt()).isEqualTo(1);
        assertThat(mine.get(1).path("id").asString()).isEqualTo(committed);
        assertThat(mine.get(1).path("result").path("itemsCreated").asInt()).isEqualTo(1);
        String nobody = uniqueUid("import-replace-other");
        provisionCompliant(nobody);
        assertThat(callJson(HttpMethod.GET, IMPORTS, nobody, null, 200).isEmpty())
                .as("a collector only ever lists their own imports")
                .isTrue();
        testUsers.update(
                "UPDATE inventory_import SET expires_at = now() - interval '1 second' WHERE id = ?",
                UUID.fromString(second));
        assertThat(callJson(HttpMethod.GET, IMPORTS, uid, null, 200).size())
                .as("an expired preview is no longer listed")
                .isEqualTo(1);
        testUsers.update(
                "UPDATE inventory_import SET expires_at = now() + interval '1 hour' WHERE id = ?",
                UUID.fromString(second));
        assertThat(
                        callJson(HttpMethod.GET, IMPORTS + "/" + committed, uid, null, 200)
                                .path("status")
                                .asString())
                .as("a finished import is not a preview: it stays")
                .isEqualTo("COMMITTED");

        callJson(HttpMethod.DELETE, IMPORTS + "/" + second, uid, null, 204);
        callJson(HttpMethod.GET, IMPORTS + "/" + second, uid, null, 404);
        callJson(HttpMethod.DELETE, IMPORTS + "/" + second, uid, null, 404);
        assertThat(liveItems(ownerId)).isEqualTo(1);

        // The account purge takes the imports with the inventory.
        assertThat(importService.purge(ownerId)).isEqualTo(1);
        callJson(HttpMethod.GET, IMPORTS + "/" + committed, uid, null, 404);
    }

    @Test
    void uploadsOfOneCollectorAtTheSameMomentLeaveOnePreview() throws Exception {
        String uid = uniqueUid("import-uploads");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String file = "#main\n" + deck.single.passcode() + "\n";
        int callers = 6;
        ExecutorService pool = Executors.newFixedThreadPool(callers);
        try {
            for (int round = 0; round < 3; round++) {
                CountDownLatch start = new CountDownLatch(1);
                List<Future<JsonNode>> answers = new ArrayList<>();
                for (int index = 0; index < callers; index++) {
                    answers.add(
                            pool.submit(
                                    () -> {
                                        start.await(30, TimeUnit.SECONDS);
                                        return upload(uid, "YDK", file, 201);
                                    }));
                }
                start.countDown();
                for (Future<JsonNode> answer : answers) {
                    answer.get(60, TimeUnit.SECONDS);
                }
                assertThat(
                                testUsers.count(
                                        "SELECT count(*) FROM inventory_import WHERE owner_id = ?"
                                                + " AND status = 'PENDING'",
                                        ownerId))
                        .as("a collector has one open preview, however the uploads arrive")
                        .isEqualTo(1);
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(callJson(HttpMethod.GET, IMPORTS, uid, null, 200)).hasSize(1);
    }

    @Test
    void aNewUploadWaitsForAnEditOfThePreviewItReplaces() throws Exception {
        String uid = uniqueUid("import-upload-edit");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        String file = "#main\n" + deck.single.passcode() + "\n";
        String first = upload(uid, "YDK", file, 201).path("id").asString();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch held = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            // An edit of the first preview that is still being saved: it holds the import row.
            Future<?> edit =
                    pool.submit(
                            () ->
                                    transaction.executeWithoutResult(
                                            status -> {
                                                jdbc.queryForObject(
                                                        "SELECT id FROM inventory_import WHERE id"
                                                                + " = ? FOR UPDATE",
                                                        UUID.class,
                                                        UUID.fromString(first));
                                                held.countDown();
                                                try {
                                                    release.await(30, TimeUnit.SECONDS);
                                                } catch (InterruptedException e) {
                                                    Thread.currentThread().interrupt();
                                                }
                                            }));
            assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();
            Future<JsonNode> second = pool.submit(() -> upload(uid, "YDK", file, 201));
            try {
                second.get(400, TimeUnit.MILLISECONDS);
            } catch (java.util.concurrent.TimeoutException expected) {
                // The upload waits for the edit instead of leaving a second open preview behind.
            }
            release.countDown();
            edit.get(30, TimeUnit.SECONDS);
            String replaced = second.get(30, TimeUnit.SECONDS).path("id").asString();

            assertThat(
                            testUsers.query(
                                    "SELECT id FROM inventory_import WHERE owner_id = ? AND status"
                                            + " = 'PENDING'",
                                    ownerId))
                    .as("the preview that was being edited is replaced, not left next to the new")
                    .extracting(row -> row.get("id").toString())
                    .containsExactly(replaced);
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------------------------------------------------------------------------------------
    // Limits
    // ---------------------------------------------------------------------------------------

    @Test
    void theInventoryLimitIsCheckedForTheWholeImportBeforeAnythingIsWritten() {
        String uid = uniqueUid("import-limit");
        UUID ownerId = provisionCompliant(uid);
        Deck deck = deck();
        TestCard extra = ImportTestSupport.card(testUsers, YUGIOH, ImportTestSupport.passcode());
        TestPrinting extraOnly =
                ImportTestSupport.printing(
                        testUsers,
                        extra,
                        ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2025, 1, 1)),
                        "EN030",
                        "Rare");
        // Two items already; the inventory limit allows three.
        Map<String, Object> owned = InventoryTestSupport.item(deck.only.id());
        owned.put("condition", "DAMAGED");
        String ownedId = callJson(HttpMethod.POST, ITEMS, uid, owned, 201).path("id").asString();
        callJson(HttpMethod.POST, ITEMS, uid, InventoryTestSupport.item(deck.older.id()), 201);
        limitInventory(ownerId, 3);
        // One row is added to an item the collector has; two rows would be new items.
        String file =
                "#main\n"
                        + deck.single.passcode()
                        + "\n"
                        + deck.twin.passcode()
                        + "\n"
                        + extra.passcode()
                        + "\n";
        String id = upload(uid, "YDK", file, 201).path("id").asString();
        String base = IMPORTS + "/" + id;
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        String twinRow = rows.get(1).path("id").asString();
        callJson(
                HttpMethod.PATCH,
                base + "/rows/" + twinRow,
                uid,
                Map.of("printingId", deck.newer.id().toString()),
                200);

        JsonNode refused = callJson(HttpMethod.POST, base + "/commit", uid, null, 429);

        assertThat(refused.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(refused.path("limitKey").asString()).isEqualTo("inventory.items.max");
        assertThat(refused.path("limit").asInt()).isEqualTo(3);
        assertThat(refused.path("used").asInt()).isEqualTo(2);
        assertThat(refused.path("requested").asInt()).isEqualTo(2);
        assertThat(refused.has("planCode")).isFalse();
        assertThat(refused.has("upgradeUrl")).isFalse();
        assertThat(refused.has("resetsAt")).as("a total never resets").isFalse();
        assertThat(liveItems(ownerId)).as("nothing was written").isEqualTo(2);
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + ownedId, uid, null, 200)
                                .path("quantity")
                                .asInt())
                .as("not even the row that only raises a quantity")
                .isEqualTo(1);
        JsonNode still = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(still.path("status").asString()).as("still a preview").isEqualTo("PENDING");
        assertThat(still.path("result").isNull()).isTrue();

        // One row out: one new item, and the import fits.
        callJson(HttpMethod.PATCH, base + "/rows/" + twinRow, uid, Map.of("included", false), 200);
        JsonNode committed = callJson(HttpMethod.POST, base + "/commit", uid, null, 200);
        assertThat(committed.path("result").path("itemsCreated").asInt()).isEqualTo(1);
        assertThat(committed.path("result").path("itemsMerged").asInt()).isEqualTo(1);
        assertThat(liveItems(ownerId)).isEqualTo(3);

        // At the limit: a row that only raises a quantity still goes in, a new item does not,
        // through the import and through the form alike.
        String merging =
                upload(uid, "YDK", "#main\n" + extra.passcode() + "\n", 201).path("id").asString();
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        IMPORTS + "/" + merging + "/commit",
                                        uid,
                                        null,
                                        200)
                                .path("result")
                                .path("itemsMerged")
                                .asInt())
                .isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT quantity FROM inventory_item WHERE owner_id = ? AND"
                                        + " printing_id = ?",
                                ownerId,
                                extraOnly.id()))
                .isEqualTo(2);
        JsonNode form =
                callJson(
                        HttpMethod.POST,
                        ITEMS,
                        uid,
                        InventoryTestSupport.item(deck.newer.id()),
                        429);
        assertThat(form.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(form.path("limitKey").asString()).isEqualTo("inventory.items.max");
        assertThat(form.path("used").asInt()).isEqualTo(3);
        assertThat(liveItems(ownerId)).isEqualTo(3);
    }

    @Test
    void anImportOfSeveralChunksIsRefusedAsAWholeBeyondTheLimit() {
        String uid = uniqueUid("import-limit-chunks");
        UUID ownerId = provisionCompliant(uid);
        int cards = 1000;
        String word = bulkCards(cards);
        limitInventory(ownerId, 600);
        String id =
                upload(uid, "COLLECTR_CSV", bulkFile(word, 1, cards), 201).path("id").asString();
        String base = IMPORTS + "/" + id;

        JsonNode refused = callJson(HttpMethod.POST, base + "/commit", uid, null, 429);

        assertThat(refused.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(refused.path("limit").asInt()).isEqualTo(600);
        assertThat(refused.path("used").asInt()).isZero();
        assertThat(refused.path("requested").asInt())
                .as("every chunk of the import counts, not the first 500 lines")
                .isEqualTo(cards);
        assertThat(liveItems(ownerId)).as("nothing was written").isZero();
        JsonNode still = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(still.path("status").asString()).isEqualTo("PENDING");
        assertThat(still.path("result").isNull()).isTrue();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_import_row WHERE import_id = ? AND"
                                        + " commit_chunk IS NOT NULL",
                                UUID.fromString(id)))
                .as("no row was given a chunk")
                .isZero();
    }

    @Test
    void theCardsACommitHasStillToWriteKeepTheirRoomUnderTheLimit() {
        String uid = uniqueUid("import-reserve");
        UUID ownerId = provisionCompliant(uid);
        int cards = 520;
        String word = bulkCards(cards);
        Deck deck = deck();
        limitInventory(ownerId, cards);
        String id =
                upload(uid, "COLLECTR_CSV", bulkFile(word, 1, cards), 201).path("id").asString();
        String base = IMPORTS + "/" + id;

        // The second chunk fails once: 500 cards are in, 20 are still to come.
        try (AutoCloseable failure = refusedItem("INSERT", bulkPrinting(word, cards))) {
            assertThat(call(HttpMethod.POST, base + "/commit", uid, null).getStatus().value())
                    .isEqualTo(500);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        assertThat(liveItems(ownerId)).isEqualTo(500);
        assertThat(callJson(HttpMethod.GET, base, uid, null, 200).path("status").asString())
                .isEqualTo("COMMITTING");
        assertThat(
                        testUsers.query(
                                "SELECT chunk_new_items::text AS reserved FROM inventory_import"
                                        + " WHERE id = ?",
                                UUID.fromString(id)))
                .extracting(row -> row.get("reserved"))
                .as("the new cards each chunk creates, recorded when the commit started")
                .containsExactly("{500,20}");

        // A card added by hand does not take the room of the 20 cards still to come.
        JsonNode form =
                callJson(
                        HttpMethod.POST,
                        ITEMS,
                        uid,
                        InventoryTestSupport.item(deck.only.id()),
                        429);
        assertThat(form.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(form.path("limit").asInt()).isEqualTo(cards);
        assertThat(form.path("used").asInt())
                .as("500 cards in the inventory and 20 the commit has still to write")
                .isEqualTo(cards);
        JsonNode status = null;
        for (JsonNode candidate :
                callJson(HttpMethod.GET, "/api/v1/me/limits", uid, null, 200).path("limits")) {
            if (candidate.path("key").asString().equals("inventory.items.max")) {
                status = candidate;
            }
        }
        assertThat(status).isNotNull();
        assertThat(status.path("used").asInt()).isEqualTo(cards);
        assertThat(status.path("remaining").asInt()).isZero();

        // Neither does a second import.
        String other =
                upload(uid, "YDK", "#main\n" + deck.single.passcode() + "\n", 201)
                        .path("id")
                        .asString();
        JsonNode second =
                callJson(HttpMethod.POST, IMPORTS + "/" + other + "/commit", uid, null, 429);
        assertThat(second.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(second.path("used").asInt()).isEqualTo(cards);
        assertThat(second.path("requested").asInt()).isEqualTo(1);
        assertThat(liveItems(ownerId)).isEqualTo(500);

        // The repeat finishes the first import: exactly the limit, never beyond.
        JsonNode done = callJson(HttpMethod.POST, base + "/commit", uid, null, 200);
        assertThat(done.path("status").asString()).isEqualTo("COMMITTED");
        assertThat(done.path("result").path("itemsCreated").asInt()).isEqualTo(cards);
        assertThat(liveItems(ownerId)).isEqualTo(cards);
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        ITEMS,
                                        uid,
                                        InventoryTestSupport.item(deck.only.id()),
                                        429)
                                .path("used")
                                .asInt())
                .as("nothing is reserved once the import is in")
                .isEqualTo(cards);
        assertThat(liveItems(ownerId)).isEqualTo(cards);
    }

    @Test
    void cardsAddedByHandWhileAnImportIsWrittenNeverPassTheLimit() throws Exception {
        String uid = uniqueUid("import-race");
        UUID ownerId = provisionCompliant(uid);
        int cards = 1040;
        String word = bulkCards(cards);
        Deck deck = deck();
        limitInventory(ownerId, cards);
        String id =
                upload(uid, "COLLECTR_CSV", bulkFile(word, 1, cards), 201).path("id").asString();
        int callers = 8;
        ExecutorService pool = Executors.newFixedThreadPool(callers + 1);
        try {
            Future<JsonNode> committing =
                    pool.submit(
                            () ->
                                    callJson(
                                            HttpMethod.POST,
                                            IMPORTS + "/" + id + "/commit",
                                            uid,
                                            null,
                                            200));
            List<Future<Integer>> accepted = new ArrayList<>();
            for (int index = 0; index < callers; index++) {
                accepted.add(
                        pool.submit(
                                () -> {
                                    int created = 0;
                                    // From the first chunk on, until the import is in.
                                    while (!committing.isDone()) {
                                        if (testUsers.count(
                                                        "SELECT count(*) FROM inventory_import"
                                                                + " WHERE id = ? AND status ="
                                                                + " 'PENDING'",
                                                        UUID.fromString(id))
                                                > 0) {
                                            continue;
                                        }
                                        if (call(
                                                                HttpMethod.POST,
                                                                ITEMS,
                                                                uid,
                                                                InventoryTestSupport.item(
                                                                        deck.only.id()))
                                                        .getStatus()
                                                        .value()
                                                == 201) {
                                            created++;
                                        }
                                    }
                                    return created;
                                }));
            }
            JsonNode done = committing.get(120, TimeUnit.SECONDS);
            assertThat(done.path("result").path("totalChunks").asInt()).isEqualTo(3);
            assertThat(done.path("result").path("itemsCreated").asInt()).isEqualTo(cards);
            int byHand = 0;
            for (Future<Integer> creator : accepted) {
                byHand += creator.get(60, TimeUnit.SECONDS);
            }
            assertThat(byHand)
                    .as("no card took the room of a chunk that was still to come")
                    .isZero();
        } finally {
            pool.shutdownNow();
        }
        assertThat(liveItems(ownerId)).as("the limit, never beyond").isEqualTo(cards);
    }

    @Test
    void aChunkThatNeedsMoreRoomThanItsCommitReservedWaitsForIt() {
        String uid = uniqueUid("import-guard");
        UUID ownerId = provisionCompliant(uid);
        int cards = 520;
        String word = bulkCards(cards);
        Deck deck = deck();
        // The collector has the last card of the file: its line raises that card, 519 are new.
        UUID lastPrinting = bulkPrinting(word, cards);
        String ownedId =
                callJson(HttpMethod.POST, ITEMS, uid, InventoryTestSupport.item(lastPrinting), 201)
                        .path("id")
                        .asString();
        limitInventory(ownerId, cards);
        String id =
                upload(uid, "COLLECTR_CSV", bulkFile(word, 1, cards), 201).path("id").asString();
        String base = IMPORTS + "/" + id;
        assertThat(
                        callJson(HttpMethod.GET, base, uid, null, 200)
                                .path("summary")
                                .path("mergedItems")
                                .asInt())
                .isEqualTo(1);
        try (AutoCloseable failure = refusedItem("UPDATE", lastPrinting)) {
            assertThat(call(HttpMethod.POST, base + "/commit", uid, null).getStatus().value())
                    .isEqualTo(500);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        assertThat(liveItems(ownerId)).as("the card owned and the first chunk").isEqualTo(501);
        assertThat(
                        testUsers.query(
                                "SELECT chunk_new_items::text AS reserved FROM inventory_import"
                                        + " WHERE id = ?",
                                UUID.fromString(id)))
                .extracting(row -> row.get("reserved"))
                .containsExactly("{500,19}");

        // The collector deletes the card the import was going to raise and gives its room away.
        callJson(HttpMethod.DELETE, ITEMS + "/" + ownedId, uid, null, 204);
        String takerId =
                callJson(
                                HttpMethod.POST,
                                ITEMS,
                                uid,
                                InventoryTestSupport.item(deck.only.id()),
                                201)
                        .path("id")
                        .asString();
        assertThat(liveItems(ownerId)).isEqualTo(501);

        // The second chunk now holds 20 new cards and reserved room for 19: it is not written.
        JsonNode refused = callJson(HttpMethod.POST, base + "/commit", uid, null, 429);
        assertThat(refused.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(refused.path("limit").asInt()).isEqualTo(cards);
        assertThat(refused.path("used").asInt()).isEqualTo(cards);
        assertThat(refused.path("requested").asInt()).isEqualTo(1);
        assertThat(liveItems(ownerId)).as("nothing of the chunk was written").isEqualTo(501);
        JsonNode waiting = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(waiting.path("status").asString()).isEqualTo("COMMITTING");
        assertThat(waiting.path("result").path("chunksDone").asInt()).isEqualTo(1);

        // With room again the repeat finishes the import, at the limit.
        callJson(HttpMethod.DELETE, ITEMS + "/" + takerId, uid, null, 204);
        JsonNode done = callJson(HttpMethod.POST, base + "/commit", uid, null, 200);
        assertThat(done.path("status").asString()).isEqualTo("COMMITTED");
        assertThat(done.path("result").path("itemsCreated").asInt()).isEqualTo(cards);
        assertThat(done.path("result").path("itemsMerged").asInt()).isZero();
        assertThat(liveItems(ownerId)).isEqualTo(cards);
    }

    @Test
    void nothingLimitsTheInventoryUntilAnAdminGivesTheLimitANumber() {
        assertThat(
                        testUsers.query(
                                "SELECT kind, limit_window, max_value FROM usage_limit WHERE"
                                        + " limit_key = 'inventory.items.max'"))
                .as("V113: the limit exists without a number (one row for everyone since V123)")
                .hasSize(1)
                .allSatisfy(
                        row -> {
                            assertThat(row.get("kind")).isEqualTo("COUNTER");
                            assertThat(row.get("limit_window")).isEqualTo("TOTAL");
                            assertThat(row.get("max_value")).isNull();
                        });
        String uid = uniqueUid("import-unlimited");
        provisionCompliant(uid);
        JsonNode limit = null;
        for (JsonNode candidate :
                callJson(HttpMethod.GET, "/api/v1/me/limits", uid, null, 200).path("limits")) {
            if (candidate.path("key").asString().equals("inventory.items.max")) {
                limit = candidate;
            }
        }
        assertThat(limit).isNotNull();
        assertThat(limit.path("limit").isNull() || !limit.has("limit")).isTrue();
        assertThat(limit.path("allowed").asBoolean()).isTrue();
    }

    @Test
    void eachFileLimitIsAnAdminSettingReadAtRunTime() {
        String admin = uniqueUid("import-admin");
        UUID adminId = provisionWithRoles(admin, Role.ADMIN);
        String uid = uniqueUid("import-files");
        provisionCompliant(uid);
        Deck deck = deck();
        String ydk = "#main\n" + deck.single.passcode() + "\n";

        JsonNode defaults = callJson(HttpMethod.GET, SETTINGS, admin, null, 200);
        assertThat(defaults.path("ydkMaxKb").asInt()).isEqualTo(100);
        assertThat(defaults.path("ydkMaxLines").asInt()).isEqualTo(500);
        assertThat(defaults.path("csvMaxKb").asInt()).isEqualTo(2048);
        assertThat(defaults.path("csvMaxRows").asInt()).isEqualTo(5000);
        assertThat(defaults.path("previewTtlMinutes").asInt()).isEqualTo(60);
        assertThat(defaults.path("updatedBy").isNull()).isTrue();
        JsonNode limits = callJson(HttpMethod.GET, IMPORTS + "/limits", uid, null, 200);
        assertThat(limits.path("ydkMaxBytes").asInt()).isEqualTo(100 * 1024);
        assertThat(limits.path("ydkMaxLines").asInt()).isEqualTo(500);
        assertThat(limits.path("csvMaxBytes").asInt()).isEqualTo(2048 * 1024);
        assertThat(limits.path("csvMaxRows").asInt()).isEqualTo(5000);
        assertThat(limits.path("previewTtlMinutes").asInt()).isEqualTo(60);

        // The defaults: a deck of 100 kB and 500 lines.
        String comment = "#" + "x".repeat(98) + "\n";
        JsonNode tooLarge = upload(uid, "YDK", ydk + comment.repeat(1100), 413);
        assertThat(tooLarge.path("errorCode").asString()).isEqualTo("PAYLOAD_TOO_LARGE");
        assertThat(tooLarge.path("reason").asString()).isEqualTo("TOO_LARGE");
        assertThat(tooLarge.path("fileLimit").asInt()).isEqualTo(100 * 1024);
        assertThat(tooLarge.path("message").asString()).contains("100 kB");
        upload(uid, "YDK", ydk + "\n".repeat(498), 201);
        JsonNode tooLong = upload(uid, "YDK", ydk + "\n".repeat(499), 400);
        assertThat(tooLong.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(tooLong.path("reason").asString()).isEqualTo("TOO_MANY_LINES");
        assertThat(tooLong.path("fileLimit").asInt()).isEqualTo(500);
        assertThat(tooLong.path("errors").get(0).path("field").asString()).isEqualTo("file");
        assertThat(tooLong.path("message").asString()).contains("500 lines");

        // An admin changes them: the next upload is measured against the new numbers.
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("ydkMaxKb", 1);
        change.put("ydkMaxLines", 10);
        change.put("csvMaxKb", 16);
        change.put("csvMaxRows", 10);
        change.put("previewTtlMinutes", 5);
        JsonNode changed = callJson(HttpMethod.PUT, SETTINGS, admin, change, 200);
        assertThat(changed.path("ydkMaxKb").asInt()).isEqualTo(1);
        assertThat(changed.path("csvMaxRows").asInt()).isEqualTo(10);
        assertThat(changed.path("updatedBy").asString()).isEqualTo(adminId.toString());
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action ="
                                        + " 'inventory.import.settings.update' AND actor_user_id ="
                                        + " ?",
                                adminId))
                .isEqualTo(1);
        assertThat(
                        callJson(HttpMethod.GET, IMPORTS + "/limits", uid, null, 200)
                                .path("ydkMaxBytes")
                                .asInt())
                .isEqualTo(1024);

        assertThat(upload(uid, "YDK", ydk + comment.repeat(11), 413).path("fileLimit").asInt())
                .isEqualTo(1024);
        assertThat(upload(uid, "YDK", ydk + "\n".repeat(9), 400).path("fileLimit").asInt())
                .isEqualTo(10);
        JsonNode short1 = upload(uid, "YDK", ydk + "\n".repeat(8), 201);
        assertThat(Instant.parse(short1.path("expiresAt").asString()))
                .as("the time to live is a setting too")
                .isBetween(
                        Instant.now().plus(Duration.ofMinutes(4)),
                        Instant.now().plus(Duration.ofMinutes(6)));
        String header = "Product Name,Quantity\n";
        JsonNode tooManyRows = upload(uid, "COLLECTR_CSV", header + "Somebody,1\n".repeat(11), 400);
        assertThat(tooManyRows.path("reason").asString()).isEqualTo("TOO_MANY_ROWS");
        assertThat(tooManyRows.path("fileLimit").asInt()).isEqualTo(10);
        upload(uid, "COLLECTR_CSV", header + "Somebody,1\n".repeat(10), 201);
        JsonNode csvTooLarge =
                upload(
                        uid,
                        "COLLECTR_CSV",
                        header + ("\"" + "y".repeat(2000) + "\",1\n").repeat(9),
                        413);
        assertThat(csvTooLarge.path("fileLimit").asInt()).isEqualTo(16 * 1024);

        // What is not a text file, whatever the client calls it.
        JsonNode binary =
                uploadBytes(
                        uid,
                        "YDK",
                        new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0},
                        "deck.ydk",
                        MediaType.TEXT_PLAIN,
                        null,
                        415);
        assertThat(binary.path("errorCode").asString()).isEqualTo("UNSUPPORTED_MEDIA_TYPE");
        assertThat(binary.path("reason").asString()).isEqualTo("NOT_TEXT");
        assertThat(
                        uploadBytes(
                                        uid,
                                        "COLLECTR_CSV",
                                        "Product Name\nCafé Golem\n"
                                                .getBytes(StandardCharsets.ISO_8859_1),
                                        "export.csv",
                                        MediaType.parseMediaType("text/csv"),
                                        null,
                                        415)
                                .path("reason")
                                .asString())
                .as("another encoding than UTF-8")
                .isEqualTo("NOT_TEXT");
        // A text file of the other kind, or of no kind, is refused by what it holds.
        JsonNode noColumn = upload(uid, "COLLECTR_CSV", ydk, 400);
        assertThat(noColumn.path("reason").asString()).isEqualTo("MISSING_COLUMNS");
        assertThat(noColumn.path("missingColumns").get(0).asString()).isEqualTo("card name");
        assertThat(noColumn.path("message").asString()).contains("card name", "Product Name");
        assertThat(upload(uid, "YDK", header + "Somebody,1\n", 400).path("reason").asString())
                .isEqualTo("NO_CARDS");
        assertThat(upload(uid, "YDK", "", 400).path("reason").asString()).isEqualTo("EMPTY_FILE");
        assertThat(
                        upload(uid, "COLLECTR_CSV", header + "\"never closed,1\n", 400)
                                .path("reason")
                                .asString())
                .isEqualTo("MALFORMED");
        // The source and the game are checked too.
        assertThat(upload(uid, "SPREADSHEET", ydk, 400).path("errorCode").asString())
                .isEqualTo("VALIDATION_FAILED");
        assertThat(
                        uploadBytes(
                                        uid,
                                        "COLLECTR_CSV",
                                        (header + "Somebody,1\n").getBytes(StandardCharsets.UTF_8),
                                        "export.csv",
                                        MediaType.TEXT_PLAIN,
                                        "chess",
                                        400)
                                .path("errors")
                                .get(0)
                                .path("field")
                                .asString())
                .isEqualTo("game");

        // Bounds, and who may change them.
        for (Map<String, Object> invalid :
                List.<Map<String, Object>>of(
                        Map.of("ydkMaxKb", 0),
                        Map.of("ydkMaxLines", 5001),
                        Map.of("csvMaxKb", 8193),
                        Map.of("csvMaxRows", 9),
                        Map.of("previewTtlMinutes", 1441))) {
            JsonNode problem = callJson(HttpMethod.PUT, SETTINGS, admin, invalid, 400);
            assertThat(problem.path("errors").get(0).path("field").asString())
                    .isEqualTo(invalid.keySet().iterator().next());
        }
        assertThat(callJson(HttpMethod.GET, SETTINGS, admin, null, 200).path("ydkMaxKb").asInt())
                .as("a refused change changes nothing")
                .isEqualTo(1);
        callJson(HttpMethod.PUT, SETTINGS, uid, Map.of("ydkMaxKb", 1024), 403);
        callJson(HttpMethod.GET, SETTINGS, uid, null, 403);
    }

    @Test
    void anImportOfMoreThan500ItemsIsWrittenInChunksAndARepeatContinues() {
        String uid = uniqueUid("import-chunks");
        UUID ownerId = provisionCompliant(uid);
        int cards = 520;
        TestSet set = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2025, 5, 5));
        String word = InventoryTestSupport.token();
        // 520 cards with one printing each, in two statements.
        testUsers.update(
                "INSERT INTO card (id, game_id, name, slug, card_type, text) SELECT"
                        + " gen_random_uuid(), g.id, ? || ' Bulk ' || n, lower(?) || '-bulk-' || n,"
                        + " 'Monster', '' FROM game g, generate_series(1, ?) AS n WHERE g.slug ="
                        + " 'yugioh'",
                word,
                word,
                cards);
        testUsers.update(
                "INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity,"
                        + " edition, language, finish, printing_code)"
                        + " SELECT gen_random_uuid(), c.id, ?, 'EN' || lpad(split_part(c.name,"
                        + " ' Bulk ', 2), 3, '0'), 'Common', 'UNLIMITED', 'en', 'NORMAL', ? ||"
                        + " '-EN' || lpad(split_part(c.name, ' Bulk ', 2), 3, '0') FROM card c"
                        + " WHERE c.name LIKE ? || ' Bulk %'",
                set.id(), set.code(), word);
        StringBuilder file = new StringBuilder("Product Name,Quantity,Card Condition\n");
        for (int n = 1; n <= cards; n++) {
            file.append(word).append(" Bulk ").append(n).append(",1,Near Mint\n");
        }
        // The first card twice: equal rows are one item, also across the whole file.
        file.append(word).append(" Bulk 1,2,Near Mint\n");
        String id = upload(uid, "COLLECTR_CSV", file.toString(), 201).path("id").asString();
        String base = IMPORTS + "/" + id;
        JsonNode preview = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(preview.path("summary").path("rows").asInt()).isEqualTo(cards + 1);
        assertThat(preview.path("summary").path("ready").asInt()).isEqualTo(cards + 1);
        assertThat(preview.path("summary").path("items").asInt()).isEqualTo(cards);
        assertThat(preview.path("summary").path("copies").asInt()).isEqualTo(cards + 2);

        // The second chunk fails once: a trigger refuses the item of the last card.
        UUID lastPrinting =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT p.id FROM card_printing p JOIN card c ON c.id ="
                                                + " p.card_id WHERE c.name = ?",
                                        word + " Bulk " + cards)
                                .get(0)
                                .get("id");
        String trigger = "trg_" + word.toLowerCase(java.util.Locale.ROOT);
        testUsers.update(
                "CREATE FUNCTION "
                        + trigger
                        + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION"
                        + " 'simulated failure of an import chunk'; END; $$");
        testUsers.update(
                "CREATE TRIGGER "
                        + trigger
                        + " BEFORE INSERT ON inventory_item FOR EACH ROW WHEN (NEW.printing_id = '"
                        + lastPrinting
                        + "') EXECUTE FUNCTION "
                        + trigger
                        + "()");
        try {
            assertThat(call(HttpMethod.POST, base + "/commit", uid, null).getStatus().value())
                    .isEqualTo(500);
        } finally {
            testUsers.update("DROP TRIGGER " + trigger + " ON inventory_item");
            testUsers.update("DROP FUNCTION " + trigger + "()");
        }

        // The first chunk is in, in its own transaction; the import says where it stands.
        assertThat(liveItems(ownerId)).isEqualTo(500);
        JsonNode cut = callJson(HttpMethod.GET, base, uid, null, 200);
        assertThat(cut.path("status").asString()).isEqualTo("COMMITTING");
        assertThat(cut.path("committedAt").isNull()).isTrue();
        assertThat(cut.path("result").path("chunksDone").asInt()).isEqualTo(1);
        assertThat(cut.path("result").path("totalChunks").asInt()).isEqualTo(2);
        assertThat(cut.path("result").path("itemsCreated").asInt()).isEqualTo(500);
        assertThat(cut.path("result").path("rowsImported").asInt()).isEqualTo(cards + 1);
        assertThat(
                        callJson(HttpMethod.PATCH, base, uid, Map.of("includeSide", false), 409)
                                .path("currentStatus")
                                .asString())
                .as("a commit that started freezes the preview")
                .isEqualTo("COMMITTING");

        // The repeat continues after the first chunk and writes nothing of it again.
        JsonNode done = callJson(HttpMethod.POST, base + "/commit", uid, null, 200);

        assertThat(done.path("status").asString()).isEqualTo("COMMITTED");
        assertThat(done.path("result").path("chunksDone").asInt()).isEqualTo(2);
        assertThat(done.path("result").path("itemsCreated").asInt()).isEqualTo(cards);
        assertThat(done.path("result").path("itemsMerged").asInt()).isZero();
        assertThat(done.path("result").path("copiesAdded").asInt()).isEqualTo(cards + 2);
        assertThat(liveItems(ownerId)).isEqualTo(cards);
        assertThat(
                        testUsers.query(
                                "SELECT quantity, count(*) AS items FROM inventory_item WHERE"
                                        + " owner_id = ? GROUP BY quantity ORDER BY quantity",
                                ownerId))
                .as("one copy each, three of the card the file lists twice: nothing doubled")
                .extracting(row -> row.get("quantity") + "x" + row.get("items"))
                .containsExactly("1x" + (cards - 1), "3x1");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND"
                                        + " (visibility <> 'PRIVATE' OR binder_id IS NOT NULL OR"
                                        + " publicly_listed)",
                                ownerId))
                .isZero();
        assertThat(
                        testUsers.query(
                                "SELECT commit_chunk, count(*) AS rows FROM inventory_import_row"
                                        + " WHERE import_id = ? GROUP BY commit_chunk ORDER BY"
                                        + " commit_chunk",
                                UUID.fromString(id)))
                .extracting(row -> row.get("commit_chunk") + ":" + row.get("rows"))
                .as("chunks of 500 items in file order; the two rows of one item share a chunk")
                .containsExactly("1:501", "2:20");
        assertThat(callJson(HttpMethod.POST, base + "/commit", uid, null, 200).path("result"))
                .isEqualTo(done.path("result"));
        assertThat(liveItems(ownerId)).isEqualTo(cards);
    }

    // ---------------------------------------------------------------------------------------
    // Logs
    // ---------------------------------------------------------------------------------------

    @Test
    void nothingOfAFileIsEverLogged() {
        String uid = uniqueUid("import-log");
        provisionCompliant(uid);
        Deck deck = deck();
        String unknownPasscode = ImportTestSupport.passcode();
        String marker = InventoryTestSupport.token().toLowerCase(java.util.Locale.ROOT);
        String ydk =
                "#created by "
                        + marker
                        + "author\n#main\n"
                        + deck.single.passcode()
                        + "\n"
                        + unknownPasscode
                        + "\n"
                        + marker
                        + "junkline\n";
        String csv =
                "Product Name,Set,Card Number,Quantity,Market Price,Notes,"
                        + marker
                        + "column\n"
                        + deck.single.name()
                        + ",,,1,8811.22,"
                        + marker
                        + "note,x\n"
                        + marker
                        + "unknowncard,"
                        + marker
                        + "set,"
                        + marker
                        + "nr,2,8833.44,,y\n";

        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        Logger ours = (Logger) LoggerFactory.getLogger("com.orenjitrade");
        Level before = ours.getLevel();
        ListAppender<ILoggingEvent> captured = new ListAppender<>();
        captured.start();
        root.addAppender(captured);
        ours.setLevel(Level.TRACE);
        try {
            String deckId = upload(uid, "YDK", ydk, 201).path("id").asString();
            callJson(HttpMethod.GET, IMPORTS + "/" + deckId + "/rows", uid, null, 200);
            callJson(HttpMethod.POST, IMPORTS + "/" + deckId + "/commit", uid, null, 200);
            String sheetId = upload(uid, "COLLECTR_CSV", csv, 201).path("id").asString();
            JsonNode rows =
                    callJson(HttpMethod.GET, IMPORTS + "/" + sheetId + "/rows", uid, null, 200)
                            .path("items");
            callJson(
                    HttpMethod.PATCH,
                    IMPORTS + "/" + sheetId + "/rows/" + rows.get(0).path("id").asString(),
                    uid,
                    Map.of("quantity", 2),
                    200);
            callJson(
                    HttpMethod.PATCH,
                    IMPORTS + "/" + sheetId + "/rows/" + rows.get(1).path("id").asString(),
                    uid,
                    Map.of("quantity", 2),
                    409);
            callJson(
                    HttpMethod.POST,
                    IMPORTS + "/" + sheetId + "/bulk",
                    uid,
                    Map.of("action", "SET_CONDITION", "condition", "MINT"),
                    200);
            callJson(HttpMethod.POST, IMPORTS + "/" + sheetId + "/commit", uid, null, 200);
            // Refusals are logged too: with their reason, never with the file.
            upload(uid, "COLLECTR_CSV", marker + "title," + marker + "other\n1,2\n", 400);
            upload(uid, "YDK", "#main\n" + marker + "onlyjunk\n", 400);
            upload(uid, "COLLECTR_CSV", "Product Name\n\"" + marker + "unclosed\n", 400);
            uploadBytes(
                    uid,
                    "YDK",
                    ("#main\n" + marker + "\u0000binary\n").getBytes(StandardCharsets.UTF_8),
                    marker + "filename.ydk",
                    MediaType.TEXT_PLAIN,
                    null,
                    415);
            importService.purgeExpired(10);
        } finally {
            root.detachAppender(captured);
            ours.setLevel(before);
        }

        List<String> lines = new ArrayList<>();
        for (ILoggingEvent event : captured.list) {
            StringBuilder line = new StringBuilder(event.getFormattedMessage());
            for (IThrowableProxy cause = event.getThrowableProxy();
                    cause != null;
                    cause = cause.getCause()) {
                line.append(' ')
                        .append(cause.getClassName())
                        .append(' ')
                        .append(cause.getMessage());
            }
            lines.add(line.toString());
        }
        assertThat(lines)
                .as("the import was logged at all (ids and counts)")
                .anyMatch(line -> line.contains("Inventory import preview"))
                .anyMatch(line -> line.contains("Inventory import committed"));
        assertThat(lines)
                .as("no line of the log, at any level, holds anything a file held")
                .noneMatch(
                        line ->
                                line.contains(marker)
                                        || line.contains(unknownPasscode)
                                        || line.contains(deck.single.passcode())
                                        || line.contains(deck.single.name())
                                        || line.contains("8811.22")
                                        || line.contains("8833.44"));
    }

    // ---------------------------------------------------------------------------------------
    // Fixtures and helpers
    // ---------------------------------------------------------------------------------------

    /**
     * The cards of one test: {@code single} has one printing, {@code twin} has two (the newer set
     * second), and {@code alternate} is the passcode of an alternate artwork of {@code twin}.
     */
    private record Deck(
            TestCard single,
            TestPrinting only,
            TestCard twin,
            TestPrinting older,
            TestPrinting newer,
            String alternate) {}

    private Deck deck() {
        TestSet first = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2024, 2, 9));
        TestSet second = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2025, 9, 12));
        TestCard single = ImportTestSupport.card(testUsers, YUGIOH, ImportTestSupport.passcode());
        TestPrinting only = ImportTestSupport.printing(testUsers, single, first, "EN001", "Rare");
        TestCard twin = ImportTestSupport.card(testUsers, YUGIOH, ImportTestSupport.passcode());
        TestPrinting older = ImportTestSupport.printing(testUsers, twin, first, "EN002", "Rare");
        TestPrinting newer =
                ImportTestSupport.printing(testUsers, twin, second, "EN002", "Ultra Rare");
        String alternate = ImportTestSupport.passcode();
        ImportTestSupport.artwork(testUsers, twin, alternate);
        return new Deck(single, only, twin, older, newer, alternate);
    }

    /**
     * {@code count} cards named "{word} Bulk n" (n from 1) with one printing each, in two
     * statements; returns {@code word}.
     */
    private String bulkCards(int count) {
        TestSet set = ImportTestSupport.set(testUsers, YUGIOH, LocalDate.of(2025, 5, 5));
        String word = InventoryTestSupport.token();
        testUsers.update(
                "INSERT INTO card (id, game_id, name, slug, card_type, text) SELECT"
                        + " gen_random_uuid(), g.id, ? || ' Bulk ' || n, lower(?) || '-bulk-' || n,"
                        + " 'Monster', '' FROM game g, generate_series(1, ?) AS n WHERE g.slug ="
                        + " 'yugioh'",
                word,
                word,
                count);
        testUsers.update(
                "INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity,"
                        + " edition, language, finish, printing_code)"
                        + " SELECT gen_random_uuid(), c.id, ?, 'EN' || lpad(split_part(c.name,"
                        + " ' Bulk ', 2), 4, '0'), 'Common', 'UNLIMITED', 'en', 'NORMAL', ? ||"
                        + " '-EN' || lpad(split_part(c.name, ' Bulk ', 2), 4, '0') FROM card c"
                        + " WHERE c.name LIKE ? || ' Bulk %'",
                set.id(), set.code(), word);
        return word;
    }

    /** A Collectr CSV with one near mint copy of each bulk card from {@code from} to {@code to}. */
    private static String bulkFile(String word, int from, int to) {
        StringBuilder file = new StringBuilder("Product Name,Quantity,Card Condition\n");
        for (int n = from; n <= to; n++) {
            file.append(word).append(" Bulk ").append(n).append(",1,Near Mint\n");
        }
        return file.toString();
    }

    /** The printing of bulk card {@code n}. */
    private UUID bulkPrinting(String word, int n) {
        return (UUID)
                testUsers
                        .query(
                                "SELECT p.id FROM card_printing p JOIN card c ON c.id = p.card_id"
                                        + " WHERE c.name = ?",
                                word + " Bulk " + n)
                        .get(0)
                        .get("id");
    }

    /**
     * While open, every {@code INSERT} (or {@code UPDATE}) of an inventory item of this printing
     * fails: the chunk of an import that writes it fails as a whole, as a crash would make it.
     */
    private AutoCloseable refusedItem(String event, UUID printingId) {
        String trigger = "trg_" + InventoryTestSupport.token().toLowerCase(java.util.Locale.ROOT);
        testUsers.update(
                "CREATE FUNCTION "
                        + trigger
                        + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION"
                        + " 'simulated failure of an import chunk'; END; $$");
        testUsers.update(
                "CREATE TRIGGER "
                        + trigger
                        + " BEFORE "
                        + event
                        + " ON inventory_item FOR EACH ROW WHEN (NEW.printing_id = '"
                        + printingId
                        + "') EXECUTE FUNCTION "
                        + trigger
                        + "()");
        return () -> {
            testUsers.update("DROP TRIGGER " + trigger + " ON inventory_item");
            testUsers.update("DROP FUNCTION " + trigger + "()");
        };
    }

    /**
     * Gives the inventory limit a number for this test, through the admin route as a SUPER_ADMIN
     * would (the limit is the same for every collector; {@link #defaultSettings} removes it).
     */
    private void limitInventory(UUID ownerId, int max) {
        String superAdmin = uniqueUid("import-limit-admin");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        UUID limitId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT id FROM usage_limit WHERE limit_key ="
                                                + " 'inventory.items.max'")
                                .get(0)
                                .get("id");
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/usage-limits/" + limitId,
                superAdmin,
                Map.of("unlimited", false, "maxValue", max),
                200);
        assertThat(usageLimits.find("inventory.items.max").orElseThrow().maxValue())
                .as("for %s and everyone else", ownerId)
                .isEqualTo(max);
    }

    private int liveItems(UUID ownerId) {
        return testUsers.count(
                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND deleted_at IS NULL",
                ownerId);
    }

    private JsonNode row(String uid, String base, String rowId) {
        for (JsonNode row :
                callJson(HttpMethod.GET, base + "/rows?size=100", uid, null, 200).path("items")) {
            if (row.path("id").asString().equals(rowId)) {
                return row;
            }
        }
        throw new AssertionError("No row " + rowId);
    }

    private JsonNode upload(String uid, String source, String text, int expectedStatus) {
        return uploadBytes(
                uid,
                source,
                text.getBytes(StandardCharsets.UTF_8),
                "upload.bin",
                MediaType.APPLICATION_OCTET_STREAM,
                null,
                expectedStatus);
    }

    private JsonNode uploadBytes(
            String uid,
            String source,
            byte[] content,
            String fileName,
            MediaType type,
            @Nullable String game,
            int expectedStatus) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(content) {
                            @Override
                            public String getFilename() {
                                return fileName;
                            }
                        })
                .contentType(type);
        builder.part("source", source);
        if (game != null) {
            builder.part("game", game);
        }
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri(IMPORTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        byte[] bytes = result.getResponseBody();
        String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        assertThat(result.getStatus().value()).as("upload -> %s", text).isEqualTo(expectedStatus);
        return text.isEmpty() ? MissingNode.getInstance() : jsonMapper.readTree(text);
    }
}
