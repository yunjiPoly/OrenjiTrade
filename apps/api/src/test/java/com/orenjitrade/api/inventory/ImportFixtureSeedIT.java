package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.ImportTestSupport.IMPORTS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.infra.ImportFixtureSeedContributor;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.JsonNode;

/**
 * The fictional cards a YDK deck file can name in an end-to-end database ({@code
 * SEED_IMPORT_FIXTURES=true}): off by default, refused next to the real provider, idempotent. And
 * the two worked examples of {@code docs/api/contracts/s5-inventory-import.md}, file for file: the
 * deck against those fixtures, the Collectr export against the sample catalog of the seed. The
 * phone builder's end-to-end runs start from the same two files.
 */
class ImportFixtureSeedIT extends AbstractIntegrationTest {

    /** The deck file of the contract's worked example. */
    static final String DECK =
            """
            #created by a fictional player
            #main
            910000001
            910000001
            910000002
            #extra
            910000003
            !side
            910000002
            919999999
            """;

    @Autowired private JdbcClient jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private ApplicationContext context;
    @Autowired private CatalogImportService catalogImport;

    @Test
    void theFixturesAreOffUnlessAskedForAndNeverNextToTheRealProvider() {
        assertThat(context.getBeansOfType(ImportFixtureSeedContributor.class))
                .as("not a bean without orenji.seed.import-fixtures=true")
                .isEmpty();
        ImportFixtureSeedContributor withRealProvider =
                new ImportFixtureSeedContributor(jdbc, true, transactionManager);

        assertThatThrownBy(withRealProvider::seed)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("YGOPRODECK_ENABLED=false");
        assertThat(ImportFixtureSeedContributor.passcodes())
                .containsExactly("910000001", "910000002", "910000003");
    }

    @Test
    void theFixtureDeckOfTheContractGivesItsWorkedExample() {
        ImportFixtureSeedContributor contributor =
                new ImportFixtureSeedContributor(jdbc, false, transactionManager);
        contributor.seed();
        contributor.seed(); // idempotent
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM card WHERE external_ref ->> 'provider' ="
                                        + " 'ygoprodeck' AND external_ref ->> 'id' IN"
                                        + " ('910000001', '910000002')"))
                .isEqualTo(2);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM card_printing WHERE printing_code IN"
                                        + " ('YDKF-EN001', 'YDKF-EN002', 'YDKR-EN002')"))
                .isEqualTo(3);
        String uid = uniqueUid("import-fixture");
        provisionCompliant(uid);

        JsonNode preview =
                json(
                        ImportTestSupport.upload(
                                http, bearer(uid), "YDK", DECK.getBytes(StandardCharsets.UTF_8)));

        String base = IMPORTS + "/" + preview.path("id").asString();
        JsonNode summary = preview.path("summary");
        assertThat(summary.path("rows").asInt()).isEqualTo(4);
        assertThat(summary.path("ready").asInt()).isEqualTo(1);
        assertThat(summary.path("toChoose").asInt()).isEqualTo(2);
        assertThat(summary.path("unmatched").asInt()).isEqualTo(1);
        assertThat(summary.path("copies").asInt()).isEqualTo(2);
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows.get(0).path("card").path("name").asString())
                .isEqualTo("Fixture Lantern Wisp");
        assertThat(rows.get(0).path("printing").path("printingCode").asString())
                .isEqualTo("YDKF-EN001");
        assertThat(rows.get(1).path("card").path("name").asString())
                .isEqualTo("Fixture Clockwork Heron");
        assertThat(rows.get(2).path("card").path("id").asString())
                .as("the alternate artwork is the same card")
                .isEqualTo(rows.get(1).path("card").path("id").asString());
        assertThat(rows.get(3).path("unmatchedReason").asString()).isEqualTo("UNKNOWN_PASSCODE");

        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        base + "/bulk",
                                        uid,
                                        Map.of("action", "SET_CONDITION", "condition", "NEAR_MINT"),
                                        200)
                                .path("updated")
                                .asInt())
                .isEqualTo(3);
        JsonNode recent =
                callJson(
                        HttpMethod.POST,
                        base + "/bulk",
                        uid,
                        Map.of("action", "USE_MOST_RECENT_PRINTING"),
                        200);
        assertThat(recent.path("updated").asInt()).isEqualTo(2);
        assertThat(recent.path("preview").path("summary").path("copies").asInt()).isEqualTo(5);
        assertThat(recent.path("preview").path("summary").path("items").asInt()).isEqualTo(2);
        rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows.get(1).path("printing").path("printingCode").asString())
                .as("the set of 2026-06-20 is the most recent")
                .isEqualTo("YDKR-EN002");
        JsonNode withoutSide =
                callJson(HttpMethod.PATCH, base, uid, Map.of("includeSide", false), 200);
        assertThat(withoutSide.path("summary").path("copies").asInt()).isEqualTo(4);

        JsonNode result =
                callJson(HttpMethod.POST, base + "/commit", uid, null, 200).path("result");

        assertThat(result.path("itemsCreated").asInt()).isEqualTo(2);
        assertThat(result.path("itemsMerged").asInt()).isZero();
        assertThat(result.path("copiesAdded").asInt()).isEqualTo(4);
        assertThat(result.path("rowsImported").asInt()).isEqualTo(3);
    }

    /** The Collectr export of the contract's worked example, matched to the sample catalog. */
    static final String EXPORT =
            """
            Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-10-01),Price Override,Watchlist,Date Added,Notes
            Main,Yu-Gi-Oh!,Azure Dawn,Azure-Eyes Sky Dragon,AZR-EN001,Ultra Rare,1st Edition,Ungraded,Near Mint,31.41,2,59.26,53.58,false,2026-09-30,
            Main,Yu-Gi-Oh!,,Mirrorblade Knight,,,,,Lightly Played,4.00,1,6.10,,false,2026-09-30,
            Main,Yu-Gi-Oh!,Some Set,Nobody Knows Me,EN404,Common,,,,1.00,3,1.20,,false,2026-09-30,
            """;

    @Test
    void theCollectrExportOfTheContractGivesItsWorkedExample() {
        InventoryTestSupport.ensureCatalog(catalogImport);
        String uid = uniqueUid("import-example");
        provisionCompliant(uid);
        UUID firstEdition = InventoryTestSupport.printing(testUsers, "ygo-p001a");
        UUID knightUnlimited = InventoryTestSupport.printing(testUsers, "ygo-p003b");
        // The collector already has two near mint first edition copies of AZR-EN001.
        Map<String, Object> owned = InventoryTestSupport.item(firstEdition);
        owned.put("quantity", 2);
        String ownedId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, owned, 201)
                        .path("id")
                        .asString();

        JsonNode preview =
                json(
                        ImportTestSupport.upload(
                                http,
                                bearer(uid),
                                "COLLECTR_CSV",
                                EXPORT.getBytes(StandardCharsets.UTF_8)));

        String base = IMPORTS + "/" + preview.path("id").asString();
        assertThat(preview.path("sections").isNull()).isTrue();
        JsonNode summary = preview.path("summary");
        assertThat(summary.path("rows").asInt()).isEqualTo(3);
        assertThat(summary.path("ready").asInt()).isEqualTo(1);
        assertThat(summary.path("toChoose").asInt()).isEqualTo(1);
        assertThat(summary.path("unmatched").asInt()).isEqualTo(1);
        assertThat(summary.path("copies").asInt()).isEqualTo(2);
        assertThat(summary.path("items").asInt()).isEqualTo(1);
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        JsonNode dragon = rows.get(0);
        assertThat(dragon.path("status").asString()).isEqualTo("READY");
        assertThat(dragon.path("printing").path("id").asString())
                .isEqualTo(firstEdition.toString());
        assertThat(dragon.path("printingChoice").asString()).isEqualTo("AUTO");
        assertThat(dragon.path("condition").asString()).isEqualTo("NEAR_MINT");
        assertThat(dragon.path("conditionSource").asString()).isEqualTo("FILE");
        assertThat(dragon.path("edition").asString()).isEqualTo("FIRST_EDITION");
        assertThat(dragon.path("quantity").asInt()).isEqualTo(2);
        assertThat(dragon.path("ownedQuantity").asInt()).isEqualTo(2);
        JsonNode knight = rows.get(1);
        assertThat(knight.path("status").asString()).isEqualTo("CHOOSE_PRINTING");
        assertThat(knight.path("printingCount").asInt()).isGreaterThanOrEqualTo(2);
        assertThat(knight.path("suggestedPrintingIds").isEmpty()).isTrue();
        assertThat(knight.path("condition").asString()).isEqualTo("LIGHTLY_PLAYED");
        JsonNode nobody = rows.get(2);
        assertThat(nobody.path("unmatchedReason").asString()).isEqualTo("UNKNOWN_CARD");
        assertThat(nobody.path("source").path("set").asString()).isEqualTo("Some Set");
        assertThat(nobody.path("source").path("number").asString()).isEqualTo("EN404");
        assertThat(nobody.path("source").path("rarity").asString()).isEqualTo("Common");
        assertThat(nobody.path("fileQuantity").asInt()).isEqualTo(3);

        JsonNode chosen =
                callJson(
                        HttpMethod.PATCH,
                        base + "/rows/" + knight.path("id").asString(),
                        uid,
                        Map.of("printingId", knightUnlimited.toString()),
                        200);
        assertThat(chosen.path("row").path("printingChoice").asString()).isEqualTo("MANUAL");
        assertThat(chosen.path("preview").path("summary").path("ready").asInt()).isEqualTo(2);
        assertThat(chosen.path("preview").path("summary").path("toChoose").asInt()).isZero();

        JsonNode result =
                callJson(HttpMethod.POST, base + "/commit", uid, null, 200).path("result");

        assertThat(result.path("itemsCreated").asInt()).isEqualTo(1);
        assertThat(result.path("itemsMerged").asInt()).isEqualTo(1);
        assertThat(result.path("copiesAdded").asInt()).isEqualTo(3);
        assertThat(result.path("rowsImported").asInt()).isEqualTo(2);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/inventory/items/" + ownedId,
                                        uid,
                                        null,
                                        200)
                                .path("quantity")
                                .asInt())
                .as("the two copies the collector had, and the two of the file")
                .isEqualTo(4);
    }
}
