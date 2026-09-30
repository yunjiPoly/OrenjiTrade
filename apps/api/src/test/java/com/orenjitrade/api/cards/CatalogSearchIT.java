package com.orenjitrade.api.cards;

import static com.orenjitrade.api.cards.CatalogTestSupport.names;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Public catalog search (ADR 0012): full-text search, trigram typo tolerance, accent-insensitive
 * matching, printing-code short-circuit, filters, sets, details and autocomplete. Anonymous.
 */
class CatalogSearchIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;

    @BeforeEach
    void catalog() {
        CatalogTestSupport.ensureImported(importService);
    }

    private JsonNode get(String uri) {
        return callJson(HttpMethod.GET, uri, null, null, 200);
    }

    @Test
    void fullTextSearchRanksTheBestMatchFirstWithSummaryMetadata() {
        JsonNode page = get("/api/v1/cards?game=yugioh&query=azure");
        assertThat(page.path("totalItems").asLong()).isGreaterThanOrEqualTo(1);
        JsonNode first = page.path("items").get(0);
        assertThat(first.path("name").asString()).isEqualTo("Azure-Eyes Sky Dragon");
        assertThat(first.path("game").asString()).isEqualTo("yugioh");
        assertThat(first.path("slug").asString()).isEqualTo("azure-eyes-sky-dragon");
        assertThat(first.path("printingCount").asInt()).isEqualTo(2);
        assertThat(first.path("primaryImageUrl").asString())
                .startsWith("http://localhost:")
                .endsWith("/api/v1/public/placeholder-images/yugioh/azure-eyes-sky-dragon.svg");
        JsonNode metadata = first.path("metadata");
        assertThat(metadata.path("attribute").asString()).isEqualTo("LIGHT");
        assertThat(metadata.path("level").asInt()).isEqualTo(8);
        assertThat(metadata.path("atk").asInt()).isEqualTo(3000);
        assertThat(metadata.has("monsterType")).as("not a summary field").isFalse();

        assertThat(names(get("/api/v1/cards?game=yugioh&query=sky dragon")).get(0))
                .isEqualTo("Azure-Eyes Sky Dragon");
        // Rules text is searchable too (weight C).
        assertThat(names(get("/api/v1/cards?game=yugioh&query=piercing")))
                .contains("Thunderwing Roc");
        // Without a query: every card of the game, by name.
        JsonNode all = get("/api/v1/cards?game=mtg&size=100");
        assertThat(all.path("totalItems").asLong()).isEqualTo(20);
        assertThat(names(all).get(0)).isEqualTo("Aetherlight Beacon");
        JsonNode paged = get("/api/v1/cards?game=mtg&size=5&page=1");
        assertThat(paged.path("items").size()).isEqualTo(5);
        assertThat(paged.path("totalPages").asInt()).isEqualTo(4);
    }

    @Test
    void trigramFallbackToleratesTypos() {
        assertThat(names(get("/api/v1/cards?game=yugioh&query=Azur-Eyes Sky Dragn")).get(0))
                .isEqualTo("Azure-Eyes Sky Dragon");
        assertThat(names(get("/api/v1/cards?game=mtg&query=Tidebindr")))
                .contains("Tidebinder Sovereign");
        assertThat(names(get("/api/v1/cards?query=emberfng fox")))
                .contains("Emberfang Fox", "Emberfang Fox VMAX");
        assertThat(get("/api/v1/cards?game=yugioh&query=zzzqqqxxx").path("totalItems").asLong())
                .isZero();
    }

    @Test
    void matchingIsAccentInsensitiveBothWays() {
        assertThat(names(get("/api/v1/cards?game=pokemon&query=petalune")))
                .contains("Pétalune", "Pétalune ex");
        assertThat(names(get("/api/v1/cards?game=pokemon&query=Pétalune"))).contains("Pétalune");
        assertThat(names(get("/api/v1/cards?game=yugioh&query=chevalier epee")))
                .contains("Chevalier Épée-Miroir");
        assertThat(names(get("/api/v1/cards?game=mtg&query=requiem des marees")).get(0))
                .isEqualTo("Réquiem des Marées");
        assertThat(names(get("/api/v1/cards?game=riftbound&query=elan")))
                .contains("Élan the Unbound");
    }

    @Test
    void exactPrintingCodeShortCircuitsToThatCard() {
        JsonNode page = get("/api/v1/cards?query=AZR-EN001");
        assertThat(page.path("totalItems").asLong()).isEqualTo(1);
        assertThat(names(page)).containsExactly("Azure-Eyes Sky Dragon");
        assertThat(names(get("/api/v1/cards?query= azr-en001 ")))
                .containsExactly("Azure-Eyes Sky Dragon");
        assertThat(names(get("/api/v1/cards?game=mtg&query=TDX-001")))
                .containsExactly("Tidebinder Sovereign");
        // A code of another game with a game filter does not match.
        assertThat(names(get("/api/v1/cards?game=pokemon&query=AZR-EN001")))
                .doesNotContain("Azure-Eyes Sky Dragon");
    }

    @Test
    void filtersBySetRarityLanguageEditionAndMetadata() {
        JsonNode svx = get("/api/v1/cards?game=pokemon&set=svx&size=50");
        assertThat(svx.path("totalItems").asLong()).isEqualTo(5);
        assertThat(names(svx)).contains("Emberfang Fox VMAX").doesNotContain("Emberfang Fox");
        String svxId =
                get("/api/v1/sets?game=pokemon&query=SVX")
                        .path("items")
                        .get(0)
                        .path("id")
                        .asString();
        assertThat(get("/api/v1/cards?set=" + svxId).path("totalItems").asLong()).isEqualTo(5);

        assertThat(names(get("/api/v1/cards?game=pokemon&rarity=ultra rare")))
                .containsExactlyInAnyOrder("Emberfang Fox VMAX", "Aurora Stag VMAX");
        JsonNode french = get("/api/v1/cards?game=yugioh&language=fr");
        assertThat(french.path("totalItems").asLong()).isEqualTo(4);
        assertThat(names(french)).contains("Chevalier Épée-Miroir", "Azure-Eyes Sky Dragon");
        assertThat(
                        get("/api/v1/cards?game=yugioh&edition=first_edition")
                                .path("totalItems")
                                .asLong())
                .isEqualTo(20);
        assertThat(get("/api/v1/cards?game=mtg&edition=FIRST_EDITION").path("totalItems").asLong())
                .isZero();

        assertThat(names(get("/api/v1/cards?game=yugioh&metadata.attribute=dark")))
                .containsExactlyInAnyOrder(
                        "Obsidian Magician Adept", "Gravehollow Fiend", "Shadowvale Revenant King");
        assertThat(get("/api/v1/cards?game=yugioh&metadata.level=4").path("totalItems").asLong())
                .isEqualTo(4);
        assertThat(
                        names(
                                get(
                                        "/api/v1/cards?game=yugioh&metadata.level=4&metadata.attribute=WATER")))
                .containsExactly("Tidecaller Mermaid");
        assertThat(names(get("/api/v1/cards?game=pokemon&metadata.types=fire")))
                .containsExactlyInAnyOrder(
                        "Emberfang Fox VMAX", "Emberfang Fox", "Magmaw Tortoise");
        assertThat(
                        names(
                                get(
                                        "/api/v1/cards?game=pokemon&metadata.types=Fire&metadata.types=Fighting")))
                .containsExactly("Magmaw Tortoise");
        assertThat(
                        names(
                                get(
                                        "/api/v1/cards?game=mtg&metadata.colorIdentity=U&metadata.manaValue=4")))
                .containsExactlyInAnyOrder("Tidebinder Sovereign", "Rimefang Sentinel");
        assertThat(names(get("/api/v1/cards?game=riftbound&metadata.domain=calm&query=keeper")))
                .containsExactly("Tranquil Grove Keeper");
    }

    @Test
    void invalidFiltersAreRejected() {
        callJson(HttpMethod.GET, "/api/v1/cards?metadata.level=4", null, null, 400);
        JsonNode notFilterable =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/cards?game=pokemon&metadata.weakness=Water",
                        null,
                        null,
                        400);
        assertThat(notFilterable.path("errors").get(0).path("field").asString())
                .isEqualTo("metadata.weakness");
        callJson(HttpMethod.GET, "/api/v1/cards?game=yugioh&metadata.level=four", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/cards?game=yugioh&metadata.nope=1", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/cards?game=chess", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/cards?language=english", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/cards?set=%25%25", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/cards?size=101", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/cards?page=-1", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/sets?game=chess", null, null, 400);
    }

    @Test
    void setsCardDetailsAndPrintings() {
        JsonNode sets = get("/api/v1/sets?game=mtg");
        assertThat(sets.path("totalItems").asLong()).isEqualTo(4);
        assertThat(sets.path("items").get(0).path("code").asString()).isEqualTo("SKF");
        JsonNode tidebound = get("/api/v1/sets?game=mtg&query=tidebound");
        assertThat(tidebound.path("items").get(0).path("code").asString()).isEqualTo("TDX");
        JsonNode byCode = get("/api/v1/sets?query=tdx").path("items").get(0);
        assertThat(byCode.path("name").asString()).isEqualTo("Tidebound Expanse");
        assertThat(byCode.path("printingCount").asInt()).isEqualTo(10);
        assertThat(byCode.path("releaseDate").asString()).isEqualTo("2024-04-19");

        JsonNode set = get("/api/v1/sets/" + byCode.path("id").asString() + "?size=4");
        assertThat(set.path("set").path("code").asString()).isEqualTo("TDX");
        assertThat(set.path("metadata").path("block").asString()).isEqualTo("Orenji Saga");
        assertThat(set.path("printings").path("totalItems").asLong()).isEqualTo(10);
        assertThat(set.path("printings").path("items").size()).isEqualTo(4);

        String cardId =
                get("/api/v1/cards?query=AZR-EN001").path("items").get(0).path("id").asString();
        JsonNode card = get("/api/v1/cards/" + cardId);
        assertThat(card.path("text").asString()).contains("azure gaze");
        assertThat(card.path("metadata").path("monsterType").asString()).isEqualTo("Dragon");
        assertThat(card.path("printings").size()).isEqualTo(2);
        JsonNode firstEdition = card.path("printings").get(0);
        assertThat(firstEdition.path("printingCode").asString()).isEqualTo("AZR-EN001");
        assertThat(firstEdition.path("setName").asString()).isEqualTo("Azure Dawn");
        assertThat(firstEdition.path("images").get(0).path("kind").asString()).isEqualTo("FRONT");
        assertThat(firstEdition.path("images").get(0).path("url").asString())
                .startsWith("http://localhost:");
        assertThat(firstEdition.path("images").get(0).path("width").asInt()).isEqualTo(488);

        JsonNode printings = get("/api/v1/cards/" + cardId + "/printings");
        assertThat(printings.size()).isEqualTo(2);
        JsonNode priced = null;
        for (JsonNode printing : printings) {
            if (printing.path("edition").asString().equals("FIRST_EDITION")) {
                priced = printing;
            }
        }
        assertThat(priced).isNotNull();
        assertThat(priced.path("marketPrice").path("amount").decimalValue())
                .isEqualByComparingTo("42.00");
        assertThat(priced.path("marketPrice").path("currency").asString()).isEqualTo("CAD");

        JsonNode printing = get("/api/v1/printings/" + priced.path("id").asString());
        assertThat(printing.path("printing").path("printingCode").asString())
                .isEqualTo("AZR-EN001");
        assertThat(printing.path("card").path("name").asString())
                .isEqualTo("Azure-Eyes Sky Dragon");
        assertThat(printing.path("set").path("code").asString()).isEqualTo("AZR");
        assertThat(printing.path("metadata").path("artist").asString()).isEqualTo("Studio Orenji");

        String unknown = java.util.UUID.randomUUID().toString();
        callJson(HttpMethod.GET, "/api/v1/cards/" + unknown, null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/cards/" + unknown + "/printings", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/printings/" + unknown, null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/sets/" + unknown, null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/cards/not-a-uuid", null, null, 400);
    }

    @Test
    void suggestMixesPrintingCodesAndCardNames() {
        JsonNode codes = get("/api/v1/cards/suggest?q=AZR-EN0&limit=5");
        assertThat(codes.size()).isEqualTo(5);
        codes.forEach(
                entry -> {
                    assertThat(entry.path("kind").asString()).isEqualTo("PRINTING");
                    assertThat(entry.path("printingCode").asString()).startsWith("AZR-EN0");
                    assertThat(entry.path("printingId").asString()).isNotEmpty();
                });

        JsonNode azure = get("/api/v1/cards/suggest?q=azu&game=yugioh");
        assertThat(azure.get(0).path("kind").asString()).isEqualTo("CARD");
        assertThat(azure.get(0).path("name").asString()).isEqualTo("Azure-Eyes Sky Dragon");
        assertThat(azure.get(0).path("setCode").asString()).isEqualTo("AZR");
        assertThat(azure.get(0).path("printingCode").asString()).startsWith("AZR-");
        assertThat(azure.get(0).path("imageUrl").asString()).endsWith(".svg");

        assertThat(names(get("/api/v1/cards/suggest?q=emberf&game=pokemon")))
                .contains("Emberfang Fox", "Emberfang Fox VMAX");
        assertThat(get("/api/v1/cards/suggest?q=a&limit=3").size()).isLessThanOrEqualTo(3);
        callJson(HttpMethod.GET, "/api/v1/cards/suggest", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/cards/suggest?q=a&limit=21", null, null, 400);
    }

    @Test
    void catalogReadsNeitherNeedAnAccountNorAcceptedTerms() {
        String uid = uniqueUid("catalog-no-consent");
        provision(uid);
        callJson(HttpMethod.GET, "/api/v1/cards?query=azure", uid, null, 200);
        callJson(HttpMethod.GET, "/api/v1/games", uid, null, 200);
        callJson(HttpMethod.GET, "/api/v1/plans", uid, null, 200);
        // Writes on the same paths stay protected.
        callJson(HttpMethod.POST, "/api/v1/cards", null, java.util.Map.of("name", "x"), 401);
    }
}
