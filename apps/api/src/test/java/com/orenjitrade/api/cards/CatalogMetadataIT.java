package com.orenjitrade.api.cards;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * ADR 0005: game-specific attributes live in JSONB metadata typed by each game's GameSchema; card
 * summaries only carry the game's summary fields; containment queries use the GIN index.
 */
class CatalogMetadataIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;

    @BeforeEach
    void catalog() {
        CatalogTestSupport.ensureImported(importService);
    }

    private JsonNode firstCard(String game, String query) {
        JsonNode page =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/cards?game=" + game + "&query=" + query,
                        null,
                        null,
                        200);
        return page.path("items").get(0);
    }

    private JsonNode detail(JsonNode summary) {
        return callJson(
                HttpMethod.GET, "/api/v1/cards/" + summary.path("id").asString(), null, null, 200);
    }

    private static List<String> keys(JsonNode object) {
        return object.properties().stream().map(Map.Entry::getKey).toList();
    }

    @Test
    void yugiohMonstersCarryAttributeLevelAtkDef() {
        JsonNode summary = firstCard("yugioh", "Obsidian Magician");
        assertThat(keys(summary.path("metadata")))
                .containsExactlyInAnyOrder("attribute", "level", "atk", "def");
        JsonNode metadata = detail(summary).path("metadata");
        assertThat(metadata.path("attribute").asString()).isEqualTo("DARK");
        assertThat(metadata.path("level").isNumber()).isTrue();
        assertThat(metadata.path("atk").asInt()).isEqualTo(2500);
        assertThat(metadata.path("def").asInt()).isEqualTo(2100);
        assertThat(metadata.path("monsterType").asString()).isEqualTo("Spellcaster");
        // Spells and traps have no monster attributes.
        assertThat(detail(firstCard("yugioh", "Sudden Eclipse")).path("metadata").has("atk"))
                .isFalse();
    }

    @Test
    void pokemonCardsCarryHpTypesStageAndWeakness() {
        JsonNode summary = firstCard("pokemon", "Magmaw Tortoise");
        assertThat(keys(summary.path("metadata")))
                .containsExactlyInAnyOrder("hp", "types", "stage");
        JsonNode metadata = detail(summary).path("metadata");
        assertThat(metadata.path("hp").asInt()).isEqualTo(160);
        assertThat(metadata.path("types").isArray()).isTrue();
        assertThat(metadata.path("types").toString()).isEqualTo("[\"Fire\",\"Fighting\"]");
        assertThat(metadata.path("stage").asString()).isEqualTo("Stage 2");
        assertThat(metadata.path("weakness").asString()).isEqualTo("Water");
        // Holo and reverse-holo variants are separate printings.
        JsonNode printings = detail(summary).path("printings");
        assertThat(printings.toString())
                .contains("\"finish\":\"HOLO\"", "\"finish\":\"REVERSE_HOLO\"");
    }

    @Test
    void magicCardsCarryManaCostColorIdentityTypeLineAndStats() {
        JsonNode summary = firstCard("mtg", "Tidebinder Sovereign");
        assertThat(keys(summary.path("metadata")))
                .containsExactlyInAnyOrder("manaCost", "typeLine", "colorIdentity");
        JsonNode metadata = detail(summary).path("metadata");
        assertThat(metadata.path("manaCost").asString()).isEqualTo("{2}{U}{U}");
        assertThat(metadata.path("manaValue").asInt()).isEqualTo(4);
        assertThat(metadata.path("colorIdentity").toString()).isEqualTo("[\"U\"]");
        assertThat(metadata.path("typeLine").asString())
                .isEqualTo("Legendary Creature — Merfolk Noble");
        assertThat(metadata.path("power").asString()).isEqualTo("3");
        assertThat(metadata.path("toughness").asString()).isEqualTo("5");
        assertThat(detail(summary).path("printings").toString()).contains("\"finish\":\"FOIL\"");
    }

    @Test
    void riftboundCardsCarryDomainEnergyMightAndType() {
        JsonNode summary = firstCard("riftbound", "Bastion of Dawn");
        assertThat(keys(summary.path("metadata")))
                .containsExactlyInAnyOrder("domain", "energy", "might");
        JsonNode metadata = detail(summary).path("metadata");
        assertThat(metadata.path("domain").asString()).isEqualTo("Order");
        assertThat(metadata.path("energy").asInt()).isEqualTo(5);
        assertThat(metadata.path("might").asInt()).isEqualTo(6);
        assertThat(metadata.path("type").asString()).isEqualTo("Unit");
    }

    @Test
    void metadataIsStoredAsTypedJsonbAndFilteredWithContainment() {
        List<Map<String, Object>> rows =
                testUsers.query(
                        "SELECT jsonb_typeof(c.metadata -> 'level') AS level_type,"
                                + " jsonb_typeof(c.metadata -> 'attribute') AS attribute_type"
                                + " FROM card c JOIN game g ON g.id = c.game_id"
                                + " WHERE g.slug = 'yugioh' AND c.name = 'Azure-Eyes Sky Dragon'");
        assertThat(rows.get(0))
                .containsEntry("level_type", "number")
                .containsEntry("attribute_type", "string");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM card WHERE metadata @> '{\"types\":"
                                        + " [\"Fire\"]}'"))
                .isEqualTo(3);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM pg_indexes WHERE indexname IN"
                                    + " ('ix_card_metadata', 'ix_card_printing_metadata',"
                                    + " 'ix_card_search_vector', 'ix_card_normalized_name_trgm',"
                                    + " 'ix_card_set_name_trgm', 'ix_card_printing_code')"))
                .isEqualTo(6);
    }
}
