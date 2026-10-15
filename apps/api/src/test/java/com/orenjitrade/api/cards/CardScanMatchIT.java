package com.orenjitrade.api.cards;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * {@code POST /api/v1/cards/scan-match} against the database, on its own small catalog ({@link
 * ScanTestCatalog}): look-alike codes, a code in several rarities, an old code, a French code that
 * stays NOT_FOUND even with a matching name, a name only, a name and a code that disagree, nothing;
 * 401 signed out, 404 while the flag is off, 400 for another game and bad bodies. What was read
 * never reaches the logs.
 */
@ExtendWith(OutputCaptureExtension.class)
class CardScanMatchIT extends AbstractIntegrationTest {

    private static final String SCAN = "/api/v1/cards/scan-match";

    @Autowired private FeatureFlags featureFlags;

    private String uid;

    @BeforeEach
    void catalogAndCollector() {
        ScanTestCatalog.ensure(testUsers);
        uid = uniqueUid("scan-match");
        provisionCompliant(uid);
    }

    @AfterEach
    void flagOn() {
        testUsers.update(
                "UPDATE feature_flag SET enabled = true, rollout_percent = 100, updated_by = NULL"
                        + " WHERE key = 'cardTextScan'");
        featureFlags.invalidate();
    }

    private static Map<String, Object> read(List<String> codes, List<String> names) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("game", "yugioh");
        body.put("codes", codes);
        body.put("names", names);
        return body;
    }

    private JsonNode scan(List<String> codes, List<String> names) {
        return callJson(HttpMethod.POST, SCAN, uid, read(codes, names), 200);
    }

    private static List<String> values(JsonNode array, String field) {
        List<String> values = new ArrayList<>();
        array.forEach(node -> values.add(node.path(field).asString()));
        return values;
    }

    @Test
    void aCleanReadIsFoundWithTheCardsEnglishPrintingsAndItsPicture() {
        JsonNode match = scan(List.of("ZACR-EN036"), List.of(ScanTestCatalog.YEW));

        assertThat(match.path("status").asString()).isEqualTo("FOUND");
        assertThat(match.has("reason")).as("reason is left out").isFalse();
        assertThat(match.path("card").path("id").asString())
                .isEqualTo(ScanTestCatalog.card(ScanTestCatalog.YEW).toString());
        assertThat(match.path("card").path("name").asString()).isEqualTo(ScanTestCatalog.YEW);
        // Pictures only through this API (cached artwork or placeholder), never a provider.
        assertThat(match.path("card").path("imageUrl").asString())
                .contains("/api/v1/public/")
                .doesNotContain("ygoprodeck");
        assertThat(match.path("printing").path("id").asString())
                .isEqualTo(ScanTestCatalog.printing("ZACR-EN036", "Secret Rare").toString());
        assertThat(match.path("printing").path("printingCode").asString()).isEqualTo("ZACR-EN036");
        assertThat(match.path("printing").path("setCode").asString()).isEqualTo("ZACR");
        assertThat(match.path("printing").path("setName").asString()).isEqualTo("Lantern Crisis");
        assertThat(match.path("printing").path("rarity").asString()).isEqualTo("Secret Rare");
        assertThat(match.path("rarities").size()).isZero();
        // Every English printing, newest set first; never the French one.
        assertThat(values(match.path("printings"), "printingCode"))
                .containsExactly("ZA01-EN008", "ZA01-EN008", "ZACR-EN036");
        // Lyra's ZACR-EN038 is one look-alike character (6/8) away.
        assertThat(values(match.path("otherMatches"), "cardId"))
                .contains(ScanTestCatalog.card(ScanTestCatalog.LYRA).toString());
        assertThat(match.path("read").path("codes").get(0).asString()).isEqualTo("ZACR-EN036");
        assertThat(match.path("read").path("names").get(0).asString())
                .isEqualTo(ScanTestCatalog.YEW);
    }

    @Test
    void lookAlikeCodesAreFoundWhenTheCatalogHasThem() {
        JsonNode interference = scan(List.of("ZAO1-ENO75"), List.of());
        assertThat(interference.path("status").asString()).isEqualTo("PICK_RARITY");
        assertThat(interference.path("card").path("name").asString())
                .isEqualTo(ScanTestCatalog.INTERFERENCE);
        assertThat(interference.path("read").path("codes").get(0).asString())
                .isEqualTo("ZAO1-ENO75");

        JsonNode yew = scan(List.of("zacr-en03g"), List.of("Yew Fl0wers & Velvet Breeze"));
        assertThat(yew.path("status").asString()).isEqualTo("FOUND");
        assertThat(yew.path("printing").path("printingCode").asString()).isEqualTo("ZACR-EN036");
    }

    @Test
    void aCodeInSeveralRaritiesAsksForTheRarity() {
        JsonNode match = scan(List.of("ZA01-EN075"), List.of(ScanTestCatalog.INTERFERENCE));

        assertThat(match.path("status").asString()).isEqualTo("PICK_RARITY");
        assertThat(match.has("printing")).as("printing is left out").isFalse();
        assertThat(values(match.path("rarities"), "rarity"))
                .containsExactlyInAnyOrder(ScanTestCatalog.ZA01_RARITIES);
        assertThat(values(match.path("rarities"), "printingCode")).containsOnly("ZA01-EN075");
        assertThat(values(match.path("rarities"), "id"))
                .contains(
                        ScanTestCatalog.printing("ZA01-EN075", "Platinum Secret Rare").toString());
        assertThat(values(match.path("printings"), "printingCode"))
                .hasSize(8)
                .endsWith("ZLOD-EN077");
    }

    @Test
    void anOldCodeIsFoundInItsOtherForm() {
        JsonNode match = scan(List.of("ZOB-005"), List.of());
        assertThat(match.path("status").asString()).isEqualTo("FOUND");
        assertThat(match.path("card").path("name").asString())
                .isEqualTo(ScanTestCatalog.DARK_MOONSEER);
        assertThat(match.path("printing").path("printingCode").asString()).isEqualTo("ZOB-EN005");
        assertThat(scan(List.of("ZOB-E005"), List.of()).path("status").asString())
                .isEqualTo("FOUND");
    }

    @Test
    void aFrenchCodeStaysNotFoundEvenWithAMatchingName() {
        JsonNode match = scan(List.of("ZACR-FR036"), List.of(ScanTestCatalog.YEW));

        assertThat(match.path("status").asString()).isEqualTo("NOT_FOUND");
        assertThat(match.path("reason").asString()).isEqualTo("OTHER_LANGUAGE");
        assertThat(match.has("card")).as("card is left out").isFalse();
        assertThat(match.path("printings").size()).isZero();
        assertThat(match.path("otherMatches").size()).as("never the English code").isZero();
    }

    @Test
    void aRegionOfAnotherLanguageReadWithLookAlikesStaysNotFoundEvenWithAMatchingName() {
        // Dark Moonseer has one English printing (ZOB-EN005) and its name is read clearly; the
        // German, Italian and Spanish regions misread (0E, 1T, 5P, the old 5) are still refused.
        for (String code : List.of("ZOB-0E005", "ZOB-1T005", "ZOB-5P005", "ZOB-5005")) {
            JsonNode match = scan(List.of(code), List.of(ScanTestCatalog.DARK_MOONSEER));
            assertThat(match.path("status").asString()).as(code).isEqualTo("NOT_FOUND");
            assertThat(match.path("reason").asString()).as(code).isEqualTo("OTHER_LANGUAGE");
            assertThat(match.has("card")).isFalse();
            assertThat(match.path("printings").size()).isZero();
            assertThat(match.path("otherMatches").size()).isZero();
        }
    }

    @Test
    void anotherLanguagesCodeWithoutItsDashOrWithASecondDashStaysNotFoundEvenWithAMatchingName() {
        // VR2-1: no English placement of the dash exists in the catalog, so a German code read
        // without its dash (as printed or misread) or with a dash before its number is refused.
        for (String code : List.of("ZOBDE005", "ZOB0E005", "ZOB-DE-005", "ZACRDE036")) {
            JsonNode match =
                    scan(
                            List.of(code),
                            List.of(
                                    code.startsWith("ZOB")
                                            ? ScanTestCatalog.DARK_MOONSEER
                                            : ScanTestCatalog.YEW));
            assertThat(match.path("status").asString()).as(code).isEqualTo("NOT_FOUND");
            assertThat(match.path("reason").asString()).as(code).isEqualTo("OTHER_LANGUAGE");
            assertThat(match.has("card")).as(code).isFalse();
            assertThat(match.path("printings").size()).as(code).isZero();
            assertThat(match.path("otherMatches").size()).as(code).isZero();
        }
        // An English code with the same dash lost is still found.
        assertThat(scan(List.of("ZOBEN005"), List.of()).path("status").asString())
                .isEqualTo("FOUND");
    }

    @Test
    void aReadInDoubtIsEnglishWhenTheCatalogKnowsOnlyTheSetOfItsEnglishPlace() {
        // W1: ZIROEN0O1 is ZIRO-EN0O1 or a German ZIR-DEN0O1 misread. The Yu-Gi-Oh! catalog has
        // the set ZIRO and no set ZIR (the Pokemon set ZIR never counts): English, look-alike
        // ZIRO-EN001 found, with the name or without.
        for (List<String> names : List.of(List.of(ScanTestCatalog.SENTRY), List.<String>of())) {
            JsonNode match = scan(List.of("ZIROEN0O1"), names);
            assertThat(match.path("status").asString()).as("%s", names).isEqualTo("FOUND");
            assertThat(match.path("card").path("name").asString())
                    .isEqualTo(ScanTestCatalog.SENTRY);
            assertThat(match.path("printing").path("printingCode").asString())
                    .isEqualTo("ZIRO-EN001");
        }
        // ZOB is a known set: ZOBDE0O5 stays another language's whatever its English place.
        JsonNode german = scan(List.of("ZOBDE0O5"), List.of(ScanTestCatalog.DARK_MOONSEER));
        assertThat(german.path("reason").asString()).isEqualTo("OTHER_LANGUAGE");
        assertThat(german.has("card")).isFalse();
    }

    @Test
    void aNameOnlyFindsTheCardAndItsPrintingWhenItHasOne() {
        JsonNode several = scan(List.of(), List.of("inkshade interference"));
        assertThat(several.path("status").asString()).isEqualTo("PICK_PRINTING");
        assertThat(several.path("card").path("name").asString())
                .isEqualTo(ScanTestCatalog.INTERFERENCE);
        assertThat(values(several.path("printings"), "printingCode"))
                .hasSize(8)
                .startsWith("ZA01-EN075");

        JsonNode single = scan(List.of(), List.of(ScanTestCatalog.LYRA));
        assertThat(single.path("status").asString()).isEqualTo("FOUND");
        assertThat(single.path("printing").path("printingCode").asString()).isEqualTo("ZACR-EN038");
    }

    @Test
    void aNameAndACodeThatDisagreeTheNameWins() {
        JsonNode match = scan(List.of("ZACR-EN038"), List.of(ScanTestCatalog.YEW));

        assertThat(match.path("status").asString()).isEqualTo("FOUND");
        assertThat(match.path("card").path("name").asString()).isEqualTo(ScanTestCatalog.YEW);
        assertThat(match.path("printing").path("printingCode").asString()).isEqualTo("ZACR-EN036");
        JsonNode lyra = match.path("otherMatches").get(0);
        assertThat(lyra.path("cardId").asString())
                .isEqualTo(ScanTestCatalog.card(ScanTestCatalog.LYRA).toString());
        assertThat(lyra.path("kind").asString()).isEqualTo("CODE");
        assertThat(lyra.path("printingCode").asString()).isEqualTo("ZACR-EN038");
        assertThat(lyra.path("printingId").asString())
                .isEqualTo(ScanTestCatalog.printing("ZACR-EN038", "Super Rare").toString());

        // Lyra has one printing, but the code read is Inkshade Interference's: Lyra's printing is
        // to pick, never found unchecked.
        JsonNode single = scan(List.of("ZA01-EN075"), List.of(ScanTestCatalog.LYRA));
        assertThat(single.path("status").asString()).isEqualTo("PICK_PRINTING");
        assertThat(single.path("card").path("name").asString()).isEqualTo(ScanTestCatalog.LYRA);
        assertThat(single.has("printing")).isFalse();
        assertThat(values(single.path("printings"), "printingCode")).containsExactly("ZACR-EN038");
        assertThat(single.path("otherMatches").get(0).path("cardId").asString())
                .isEqualTo(ScanTestCatalog.card(ScanTestCatalog.INTERFERENCE).toString());
    }

    @Test
    void nothingReadIsNotFound() {
        JsonNode nothing = scan(List.of(), List.of());
        assertThat(nothing.path("status").asString()).isEqualTo("NOT_FOUND");
        assertThat(nothing.path("reason").asString()).isEqualTo("NOTHING_READ");
        // The lists are optional in the body.
        JsonNode bare = callJson(HttpMethod.POST, SCAN, uid, Map.of("game", "yugioh"), 200);
        assertThat(bare.path("reason").asString()).isEqualTo("NOTHING_READ");
        assertThat(scan(List.of("ZZZZ-EN999"), List.of("qxqxqx")).path("reason").asString())
                .isEqualTo("NO_MATCH");
        // The passcode is never a code, not even with a stray dash or a look-alike letter.
        for (String passcode : List.of("19608153", "9955-8127", "9955812I")) {
            assertThat(scan(List.of(passcode), List.of()).path("reason").asString())
                    .as(passcode)
                    .isEqualTo("NOTHING_READ");
        }
    }

    @Test
    void signedOutIs401AndTheFlagOffIs404() {
        JsonNode signedOut = callJson(HttpMethod.POST, SCAN, null, read(List.of(), List.of()), 401);
        assertThat(signedOut.path("errorCode").asString()).isEqualTo("UNAUTHENTICATED");

        testUsers.update("UPDATE feature_flag SET enabled = false WHERE key = 'cardTextScan'");
        featureFlags.invalidate();
        JsonNode off =
                callJson(HttpMethod.POST, SCAN, uid, read(List.of("ZACR-EN036"), List.of()), 404);
        assertThat(off.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
        assertThat(off.path("feature").asString()).isEqualTo("cardTextScan");
        assertThat(off.path("requestId").asString()).isNotBlank();
    }

    @Test
    void anotherGameAndBadBodiesAre400() {
        Map<String, Object> pokemon = read(List.of("SVX-001"), List.of());
        pokemon.put("game", "pokemon");
        JsonNode game = callJson(HttpMethod.POST, SCAN, uid, pokemon, 400);
        assertThat(game.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(game.toString()).contains("game");

        callJson(
                HttpMethod.POST,
                SCAN,
                uid,
                read(List.of("A-01", "B-02", "C-03", "D-04"), List.of()),
                400);
        callJson(HttpMethod.POST, SCAN, uid, read(List.of("X".repeat(41)), List.of()), 400);
        callJson(HttpMethod.POST, SCAN, uid, read(List.of(), List.of("N".repeat(151))), 400);
        Map<String, Object> noGame = new LinkedHashMap<>(read(List.of(), List.of()));
        noGame.remove("game");
        callJson(HttpMethod.POST, SCAN, uid, noGame, 400);
        List<@Nullable String> withNull = new ArrayList<>();
        withNull.add(null);
        Map<String, Object> nullCode = new LinkedHashMap<>(read(List.of(), List.of()));
        nullCode.put("codes", withNull);
        callJson(HttpMethod.POST, SCAN, uid, nullCode, 400);

        EntityExchangeResult<byte[]> malformed =
                http.post()
                        .uri(SCAN)
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"game\": ")
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(malformed.getStatus().value()).isEqualTo(400);
        assertThat(new String(malformed.getResponseBody(), StandardCharsets.UTF_8))
                .contains("errorCode")
                .doesNotContain("Exception");
    }

    @Test
    void whatWasReadNeverReachesTheLogs(CapturedOutput output) {
        String name = "Zqscanprobe Wyrmling";
        String code = "ZQSP-EN777";
        scan(List.of(code), List.of(name));
        assertThat(output.getAll()).doesNotContain(name).doesNotContain(code);
    }

    @Test
    void aRejectedReadNeverReachesTheLogsEither(CapturedOutput output) {
        // Too many codes, a name too long, names sent as an object, a malformed body: the 400 is
        // logged (DEBUG in tests) with its request id and path, never with the values sent.
        callJson(
                HttpMethod.POST,
                SCAN,
                uid,
                read(List.of("ZQRA-EN001", "ZQRB-EN002", "ZQRC-EN003", "ZQRD-EN004"), List.of()),
                400);
        callJson(
                HttpMethod.POST,
                SCAN,
                uid,
                read(List.of(), List.of("Zqrejectprobe " + "N".repeat(150))),
                400);
        Map<String, Object> wrongType = new LinkedHashMap<>(read(List.of(), List.of()));
        wrongType.put("names", Map.of("zqobjectprobe", "Zqvalueprobe"));
        callJson(HttpMethod.POST, SCAN, uid, wrongType, 400);
        EntityExchangeResult<byte[]> malformed =
                http.post()
                        .uri(SCAN)
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"game\": \"yugioh\", \"codes\": [ZQRMALFORMED-EN005]}")
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(malformed.getStatus().value()).isEqualTo(400);

        assertThat(output.getAll())
                .contains("Request rejected")
                .contains("path=" + SCAN)
                .doesNotContain("ZQR")
                .doesNotContain("Zqrejectprobe")
                .doesNotContain("zqobjectprobe")
                .doesNotContain("Zqvalueprobe");
    }
}
