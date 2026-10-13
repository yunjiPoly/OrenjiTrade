package com.orenjitrade.api.cards;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.cards.infra.MockCardProvider;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * CatalogImportService + MockCardProvider: idempotent imports and the admin sync endpoints. Runs in
 * {@code catalogTest} (own JVM, fresh containers) so the per-test catalog proxies of other suites
 * never change the fixture counts.
 */
@Tag("catalog-fixture")
class CatalogImportIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;

    private int count(String sql, String game) {
        return testUsers.count(sql, game);
    }

    private int sets(String game) {
        return count(
                "SELECT count(*) FROM card_set s JOIN game g ON g.id = s.game_id WHERE g.slug = ?",
                game);
    }

    private int cards(String game) {
        return count(
                "SELECT count(*) FROM card c JOIN game g ON g.id = c.game_id WHERE g.slug = ?",
                game);
    }

    private int printings(String game) {
        return count(
                "SELECT count(*) FROM card_printing p JOIN card c ON c.id = p.card_id JOIN game g"
                        + " ON g.id = c.game_id WHERE g.slug = ?",
                game);
    }

    @Test
    void importingTwiceIsIdempotentAndOnlyRealChangesAreRewritten() {
        importService.importNow(MockCardProvider.PROVIDER_ID, "yugioh", SyncMode.FULL);
        assertThat(sets("yugioh")).isEqualTo(4);
        assertThat(cards("yugioh")).isEqualTo(20);
        assertThat(printings("yugioh")).isEqualTo(40);
        assertThat(
                        count(
                                "SELECT count(*) FROM card_image i JOIN card_printing p ON p.id ="
                                    + " i.printing_id JOIN card c ON c.id = p.card_id JOIN game g"
                                    + " ON g.id = c.game_id WHERE g.slug = ? AND i.kind = 'FRONT'"
                                    + " AND p.image_id = i.id",
                                "yugioh"))
                .isEqualTo(40);
        assertThat(
                        count(
                                "SELECT count(*) FROM card c JOIN game g ON g.id = c.game_id WHERE"
                                        + " g.slug = ? AND c.external_ref ->> 'provider' = 'mock'",
                                "yugioh"))
                .isEqualTo(20);

        SyncRunView second =
                importService.importNow(MockCardProvider.PROVIDER_ID, "yugioh", SyncMode.FULL);
        assertThat(second.status()).isEqualTo(SyncRunStatus.SUCCEEDED);
        assertThat(second.setsUpserted()).isZero();
        assertThat(second.cardsUpserted()).isZero();
        assertThat(second.printingsUpserted()).isZero();
        assertThat(second.startedAt()).isNotNull();
        assertThat(second.finishedAt()).isNotNull();
        assertThat(cards("yugioh")).isEqualTo(20);
        assertThat(printings("yugioh")).isEqualTo(40);

        // A drifted row is repaired by the next import; its slug never changes.
        Map<String, Object> before =
                testUsers
                        .query(
                                "SELECT c.id, c.slug FROM card c WHERE c.external_ref ->> 'id' ="
                                        + " 'ygo-c001'")
                        .get(0);
        testUsers.update("UPDATE card SET name = 'Drifted name' WHERE id = ?", before.get("id"));
        testUsers.update(
                "UPDATE card_printing SET market_price = 1.00 WHERE external_ref ->> 'id' ="
                        + " 'ygo-p001a'");
        SyncRunView repair =
                importService.importNow(
                        MockCardProvider.PROVIDER_ID, "yugioh", SyncMode.INCREMENTAL);
        assertThat(repair.cardsUpserted()).isEqualTo(1);
        assertThat(repair.printingsUpserted()).isEqualTo(1);
        Map<String, Object> after =
                testUsers
                        .query("SELECT name, slug FROM card WHERE id = ?", before.get("id"))
                        .get(0);
        assertThat(after.get("name")).isEqualTo("Azure-Eyes Sky Dragon");
        assertThat(after.get("slug"))
                .isEqualTo(before.get("slug"))
                .isEqualTo("azure-eyes-sky-dragon");
    }

    @Test
    void everyGameImportsItsFixture() {
        for (String game : MockCardProvider.GAMES) {
            SyncRunView run =
                    importService.importNow(MockCardProvider.PROVIDER_ID, game, SyncMode.FULL);
            assertThat(run.status()).as(game).isEqualTo(SyncRunStatus.SUCCEEDED);
            assertThat(sets(game)).as(game).isEqualTo(4);
            assertThat(cards(game)).as(game).isEqualTo(20);
            assertThat(printings(game)).as(game).isEqualTo(40);
        }
    }

    @Test
    void adminSyncIsQueuedRunsAsynchronouslyAndIsAudited() throws InterruptedException {
        String admin = uniqueUid("sync-admin");
        java.util.UUID adminId = provisionWithRoles(admin, Role.ADMIN);
        String collector = uniqueUid("sync-collector");
        provisionCompliant(collector);
        Map<String, Object> body =
                Map.of("gameSlug", "pokemon", "provider", "mock", "mode", "FULL");

        callJson(HttpMethod.POST, "/api/v1/admin/catalog/sync", null, body, 401);
        callJson(HttpMethod.POST, "/api/v1/admin/catalog/sync", collector, body, 403);
        JsonNode providers =
                callJson(HttpMethod.GET, "/api/v1/admin/catalog/providers", admin, null, 200);
        assertThat(providers.path("mock").toString())
                .contains("pokemon", "yugioh", "mtg", "riftbound");

        JsonNode queued = callJson(HttpMethod.POST, "/api/v1/admin/catalog/sync", admin, body, 202);
        assertThat(queued.path("status").asString()).isIn("QUEUED", "RUNNING", "SUCCEEDED");
        assertThat(queued.path("requestedBy").asString()).isEqualTo(adminId.toString());
        String runUri = "/api/v1/admin/catalog/sync-runs/" + queued.path("id").asString();

        JsonNode run = callJson(HttpMethod.GET, runUri, admin, null, 200);
        long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (!run.path("status").asString().equals("SUCCEEDED") && System.nanoTime() < deadline) {
            assertThat(run.path("status").asString()).isNotEqualTo("FAILED");
            Thread.sleep(200);
            run = callJson(HttpMethod.GET, runUri, admin, null, 200);
        }
        assertThat(run.path("status").asString()).isEqualTo("SUCCEEDED");
        assertThat(run.path("game").asString()).isEqualTo("pokemon");
        assertThat(run.path("provider").asString()).isEqualTo("mock");
        assertThat(printings("pokemon")).isEqualTo(40);

        // Redelivery of the same event does nothing.
        importService.execute(UUID.fromString(queued.path("id").asString()));
        assertThat(callJson(HttpMethod.GET, runUri, admin, null, 200).path("status").asString())
                .isEqualTo("SUCCEEDED");

        JsonNode runs =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/catalog/sync-runs?game=pokemon",
                        admin,
                        null,
                        200);
        assertThat(runs.path("totalItems").asLong()).isGreaterThanOrEqualTo(1);
        runs.path("items")
                .forEach(item -> assertThat(item.path("game").asString()).isEqualTo("pokemon"));
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action ="
                                        + " 'catalog.sync.request' AND target_id = ?",
                                queued.path("id").asString()))
                .isEqualTo(1);

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/catalog/sync",
                admin,
                Map.of("gameSlug", "pokemon", "provider", "scryfall", "mode", "FULL"),
                400);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/catalog/sync",
                admin,
                Map.of("gameSlug", "chess", "provider", "mock", "mode", "FULL"),
                400);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/catalog/sync",
                admin,
                Map.of("gameSlug", "pokemon", "provider", "mock", "mode", "SOMETIMES"),
                400);
        callJson(
                HttpMethod.GET,
                "/api/v1/admin/catalog/sync-runs/" + UUID.randomUUID(),
                admin,
                null,
                404);
        callJson(HttpMethod.GET, "/api/v1/admin/catalog/sync-runs?game=chess", admin, null, 404);
    }
}
