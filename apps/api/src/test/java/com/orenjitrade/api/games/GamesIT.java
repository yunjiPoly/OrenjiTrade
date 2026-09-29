package com.orenjitrade.api.games;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.games.domain.GameService;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Games module: public listing with GameSchema, admin edits, DB-backed profile validation. */
class GamesIT extends AbstractIntegrationTest {

    @Autowired private GameService gameService;

    private static List<String> slugs(JsonNode games) {
        List<String> slugs = new ArrayList<>();
        games.forEach(game -> slugs.add(game.path("slug").asString()));
        return slugs;
    }

    @Test
    void publicGamesCarryTheirSchemaInDisplayOrder() {
        JsonNode games = callJson(HttpMethod.GET, "/api/v1/games", null, null, 200);
        assertThat(slugs(games)).containsExactly("yugioh", "pokemon", "mtg", "riftbound");
        JsonNode yugioh = games.get(0);
        assertThat(yugioh.path("shortName").asString()).isEqualTo("Yu-Gi-Oh!");
        assertThat(yugioh.path("publisher").asString()).isEqualTo("Konami");
        JsonNode schema = yugioh.path("schema");
        assertThat(schema.path("editions").toString()).contains("FIRST_EDITION", "UNLIMITED");
        assertThat(schema.path("conditions").get(1).asString()).isEqualTo("NEAR_MINT");
        assertThat(schema.path("summaryFields").toString())
                .contains("attribute", "level", "atk", "def");
        assertThat(schema.path("metadataFields").get(0).path("key").asString())
                .isEqualTo("attribute");
        assertThat(schema.path("metadataFields").get(0).path("type").asString())
                .isEqualTo("string");
        assertThat(schema.path("metadataFields").get(0).path("filterable").asBoolean()).isTrue();

        JsonNode pokemon = callJson(HttpMethod.GET, "/api/v1/games/pokemon", null, null, 200);
        assertThat(pokemon.path("name").asString()).isEqualTo("Pokémon Trading Card Game");
        assertThat(pokemon.path("schema").path("finishes").toString()).contains("REVERSE_HOLO");
        callJson(HttpMethod.GET, "/api/v1/games/chess", null, null, 404);
    }

    @Test
    void hidingAGameRemovesItFromPublicListsAndProfileChoices() {
        String admin = uniqueUid("games-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String collector = uniqueUid("games-collector");
        provisionCompliant(collector);
        JsonNode riftbound = callJson(HttpMethod.GET, "/api/v1/games/riftbound", null, null, 200);
        ObjectNode body = gameBody(riftbound);
        try {
            body.put("status", "HIDDEN");
            JsonNode hidden =
                    callJson(HttpMethod.PUT, "/api/v1/admin/games/riftbound", admin, body, 200);
            assertThat(hidden.path("status").asString()).isEqualTo("HIDDEN");
            assertThat(slugs(callJson(HttpMethod.GET, "/api/v1/games", null, null, 200)))
                    .doesNotContain("riftbound");
            callJson(HttpMethod.GET, "/api/v1/games/riftbound", null, null, 404);
            assertThat(slugs(callJson(HttpMethod.GET, "/api/v1/admin/games", admin, null, 200)))
                    .contains("riftbound");
            assertThat(gameService.isKnown("riftbound")).isFalse();

            Map<String, Object> profile = new LinkedHashMap<>();
            profile.put("handle", me(collector).path("handle").asString());
            profile.put("displayName", "Hidden game fan");
            profile.put("bio", "");
            profile.put("games", List.of("riftbound"));
            profile.put("languages", List.of());
            JsonNode rejected =
                    callJson(HttpMethod.PUT, "/api/v1/me/profile", collector, profile, 400);
            assertThat(rejected.path("errors").toString()).contains("\"field\":\"games\"");
        } finally {
            body.put("status", "ACTIVE");
            callJson(HttpMethod.PUT, "/api/v1/admin/games/riftbound", admin, body, 200);
        }
        assertThat(gameService.isKnown("riftbound")).isTrue();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action = 'game.update' AND"
                                        + " target_id = 'riftbound'"))
                .isGreaterThanOrEqualTo(2);
    }

    @Test
    void adminCreatesGamesWithValidatedSchemas() {
        String admin = uniqueUid("games-create-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String collector = uniqueUid("games-create-collector");
        provisionCompliant(collector);
        String slug = "test-game-" + Long.toHexString(System.nanoTime() & 0xfffffL);
        ObjectNode body = gameBody(callJson(HttpMethod.GET, "/api/v1/games/mtg", null, null, 200));
        body.put("slug", slug);
        body.put("name", "Test Game");
        body.put("status", "HIDDEN");

        callJson(HttpMethod.POST, "/api/v1/admin/games", null, body, 401);
        callJson(HttpMethod.POST, "/api/v1/admin/games", collector, body, 403);
        JsonNode created = callJson(HttpMethod.POST, "/api/v1/admin/games", admin, body, 201);
        assertThat(created.path("slug").asString()).isEqualTo(slug);
        assertThat(created.path("schema").path("metadataFields").size()).isEqualTo(6);
        callJson(HttpMethod.POST, "/api/v1/admin/games", admin, body, 409);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action = 'game.create' AND"
                                        + " target_id = ?",
                                slug))
                .isEqualTo(1);

        ObjectNode badSummary = body.deepCopy();
        badSummary.put("slug", slug + "-b");
        ((ObjectNode) badSummary.path("schema")).putArray("summaryFields").add("nope");
        callJson(HttpMethod.POST, "/api/v1/admin/games", admin, badSummary, 400);
        ObjectNode badSlug = body.deepCopy();
        badSlug.put("slug", "Not A Slug");
        callJson(HttpMethod.POST, "/api/v1/admin/games", admin, badSlug, 400);
        ObjectNode badType = body.deepCopy();
        badType.put("slug", slug + "-c");
        ((ObjectNode) badType.path("schema").path("metadataFields").get(0)).put("type", "date");
        callJson(HttpMethod.POST, "/api/v1/admin/games", admin, badType, 400);
        ObjectNode noSlug = body.deepCopy();
        noSlug.remove("slug");
        callJson(HttpMethod.POST, "/api/v1/admin/games", admin, noSlug, 400);
        callJson(HttpMethod.PUT, "/api/v1/admin/games/no-such-game", admin, body, 404);

        testUsers.update("DELETE FROM game WHERE slug = ?", slug);
        gameService.invalidate();
    }

    private ObjectNode gameBody(JsonNode game) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", game.path("name").asString());
        body.put("shortName", game.path("shortName").asString());
        body.put("publisher", game.path("publisher").asString());
        body.put("status", game.path("status").asString());
        body.put("sortOrder", game.path("sortOrder").asInt());
        ObjectNode node = jsonMapper.valueToTree(body);
        node.set("schema", game.path("schema").deepCopy());
        return node;
    }
}
