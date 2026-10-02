package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportReport;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.SyncRunView;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

/**
 * YGOPRODeck import through the offline stub (ADR 0015): the complete metadata catalog is imported
 * whatever the cache state, the snapshot is reused while the provider database version is
 * unchanged, imports are idempotent (a second run downloads nothing), REFERENCED mode caches
 * exactly what members reference, a provider outage fails the run cleanly and the admin and
 * internal triggers work.
 */
class YgoProDeckImportIT extends AbstractCardImageIT {

    private int cards() {
        return count(
                "SELECT count(*) FROM card c JOIN game g ON g.id = c.game_id WHERE g.slug = ?",
                GAME);
    }

    private int printings() {
        return count(
                "SELECT count(*) FROM card_printing p JOIN card c ON c.id = p.card_id JOIN game g"
                        + " ON g.id = c.game_id WHERE g.slug = ?",
                GAME);
    }

    private Map<String, Object> card(String externalId) {
        return testUsers
                .query(
                        "SELECT c.*, c.metadata::text AS meta FROM card c WHERE external_ref ->>"
                                + " 'provider' = 'ygoprodeck' AND external_ref ->> 'id' = ?",
                        externalId)
                .get(0);
    }

    @Test
    void metadataIsImportedCompletelyWithImageReferencesAndASecondRunChangesNothing() {
        SyncRunView first = importCatalog(ImageMode.NONE, null);
        assertThat(first.status())
                .as(String.valueOf(first.error()))
                .isEqualTo(SyncRunStatus.SUCCEEDED);
        assertThat(first.providerDbVersion()).isEqualTo(STUB.version());
        assertThat(cards()).isEqualTo(YgoProDeckStub.TOTAL_CARDS);
        // 10 fixture printings (one duplicate claim and one invalid code skipped) + 60 fillers.
        assertThat(printings()).isEqualTo(70);
        assertThat(
                        count(
                                "SELECT count(*) FROM card_set s JOIN game g ON g.id = s.game_id"
                                        + " WHERE g.slug = ?",
                                GAME))
                .isEqualTo(4);

        // Generic model mapping.
        Map<String, Object> dragon = card("900000001");
        assertThat(dragon.get("name")).isEqualTo("Zephyrine Test Dragon");
        assertThat(dragon.get("card_type")).isEqualTo("Monster");
        assertThat(dragon.get("subtype")).isEqualTo("Normal");
        assertThat((String) dragon.get("meta"))
                .contains("\"level\": 8", "\"atk\": 3000", "\"monsterType\": \"Dragon\"")
                .contains("\"archetype\": \"Zephyrine\"", "\"konamiId\": 91001");
        assertThat((String) card("900000003").get("meta"))
                .contains("\"linkRating\": 3", "\"linkMarkers\"")
                .doesNotContain("\"def\"", "\"level\"");
        assertThat((String) card("900000004").get("meta"))
                .contains("\"rank\": 4")
                .doesNotContain("\"level\"");
        assertThat((String) card("900000005").get("meta")).contains("\"pendulumScale\": 8");
        assertThat((String) card("900000006").get("meta")).contains("\"property\": \"Field\"");
        assertThat(card("900000006").get("card_type")).isEqualTo("Spell");

        // One code in two rarities = two printings; unified rarity spelling; prices in USD.
        List<Map<String, Object>> ztst001 =
                testUsers.query(
                        "SELECT rarity, edition, language, finish, market_price,"
                                + " market_price_currency, metadata::text AS meta FROM"
                                + " card_printing WHERE printing_code = 'ZTST-EN001' ORDER BY"
                                + " rarity");
        assertThat(ztst001)
                .extracting(row -> row.get("rarity"))
                .containsExactly("Secret Rare", "Ultra Rare");
        assertThat(ztst001.get(1).get("edition")).isEqualTo("UNLIMITED");
        assertThat(ztst001.get(1).get("language")).isEqualTo("en");
        assertThat(ztst001.get(1).get("finish")).isEqualTo("NORMAL");
        assertThat(ztst001.get(1).get("market_price").toString()).isEqualTo("12.50");
        assertThat(ztst001.get(1).get("market_price_currency")).isEqualTo("USD");
        assertThat((String) ztst001.get(0).get("meta")).contains("Special Edition");
        assertThat(
                        testUsers
                                .query(
                                        "SELECT rarity FROM card_printing WHERE printing_code ="
                                                + " 'ZTST-EN099'")
                                .get(0)
                                .get("rarity"))
                .isEqualTo("Secret Rare");
        assertThat(count("SELECT count(*) FROM card_printing WHERE printing_code = 'ZTST-EN002'"))
                .as("a code claimed by two cards is kept once")
                .isEqualTo(1);

        // Artworks: one row per artwork, owned by the card, primary = first, source server-side.
        assertThat(
                        count(
                                "SELECT count(*) FROM card_image WHERE provider = 'ygoprodeck' AND"
                                        + " game_id = ?",
                                gameId()))
                .isEqualTo(YgoProDeckStub.TOTAL_IMAGES);
        Map<String, Object> primary = imageRow("900000001");
        Map<String, Object> alternate = imageRow("900000011");
        assertThat(primary.get("printing_id")).isNull();
        assertThat(primary.get("position")).isEqualTo(0);
        assertThat(alternate.get("position")).isEqualTo(1);
        assertThat(primary.get("cache_status")).isEqualTo("NOT_CACHED");
        assertThat((String) primary.get("source_url"))
                .isEqualTo(STUB.imageBaseUrl() + "900000001.jpg");
        assertThat(dragon.get("image_id")).isEqualTo(primary.get("id"));
        assertThat(card("900000007").get("image_id")).as("a card without artwork").isNull();
        assertThat(
                        count(
                                "SELECT count(*) FROM card_printing p JOIN card c ON c.id ="
                                        + " p.card_id WHERE c.external_ref ->> 'id' = '900000008'"))
                .as("OCG-only card without printings")
                .isZero();

        CatalogImportReport report = first.report();
        assertThat(report).isNotNull();
        assertThat(report.totalCardsProcessed()).isEqualTo(YgoProDeckStub.TOTAL_CARDS);
        assertThat(report.imagesReferenced()).isEqualTo(YgoProDeckStub.TOTAL_IMAGES);
        assertThat(report.imagesDownloaded()).isZero();
        assertThat(report.cacheLimitMb()).isEqualTo(cacheProperties.maxMb());
        assertThat(String.join(" ", report.warnings()))
                .contains("invalid printing code", "claimed by two cards", "invalid set code");

        // Second run: same provider version, snapshot reused, nothing changes, nothing downloaded.
        int cardInfoCalls = STUB.hits("/api/v7/cardinfo.php");
        int checks = STUB.hits("/api/v7/checkDBVer.php");
        SyncRunView second = importCatalog(ImageMode.ALL, null);
        assertThat(second.status()).isEqualTo(SyncRunStatus.SUCCEEDED);
        assertThat(STUB.hits("/api/v7/checkDBVer.php")).isEqualTo(checks + 1);
        assertThat(STUB.hits("/api/v7/cardinfo.php"))
                .as("snapshot reused")
                .isEqualTo(cardInfoCalls);
        assertThat(second.report().cardsCreated()).isZero();
        assertThat(second.report().cardsUpdated()).isZero();
        assertThat(second.report().cardsUnchanged()).isEqualTo(YgoProDeckStub.TOTAL_CARDS);
        assertThat(second.setsUpserted()).isZero();
        assertThat(second.printingsUpserted()).isZero();
        assertThat(second.report().imagesDownloaded()).isEqualTo(YgoProDeckStub.TOTAL_IMAGES);

        int imageHits = STUB.imageHits();
        SyncRunView third = importCatalog(ImageMode.ALL, null);
        assertThat(third.report().imagesDownloaded()).isZero();
        assertThat(third.report().imagesAlreadyCached()).isEqualTo(YgoProDeckStub.TOTAL_IMAGES);
        assertThat(STUB.imageHits()).as("running twice downloads nothing new").isEqualTo(imageHits);
        assertThat(third.cardsUpserted()).isZero();
    }

    @Test
    void referencedModeCachesOnlyWhatMembersSeeAndLimitModeIsDeterministic() {
        importCatalog(ImageMode.NONE, null);
        int selectedBefore = importCatalog(ImageMode.REFERENCED, null).report().imagesSelected();
        reference("ZTS2-EN004");

        SyncRunView referenced = importCatalog(ImageMode.REFERENCED, null);
        assertThat(referenced.report().imagesSelected()).isEqualTo(selectedBefore + 1);
        assertThat(referenced.report().imagesDownloaded()).isEqualTo(1);
        assertThat(imageRow("900000004").get("cache_status")).isEqualTo("CACHED");
        assertThat(
                        imageRow(String.valueOf(YgoProDeckStub.FIRST_FILLER_ID + 59))
                                .get("cache_status"))
                .as("not referenced")
                .isEqualTo("NOT_CACHED");

        SyncRunView again = importCatalog(ImageMode.REFERENCED, null);
        assertThat(again.report().imagesDownloaded()).isZero();
        assertThat(again.report().imagesAlreadyCached()).isEqualTo(selectedBefore + 1);

        // LIMIT: referenced artworks first, then by card name; the same selection every time.
        int limit = selectedBefore + 3;
        SyncRunView limited = importCatalog(ImageMode.LIMIT, limit);
        assertThat(limited.imageLimit()).isEqualTo(limit);
        assertThat(limited.report().imagesSelected()).isEqualTo(limit);
        assertThat(limited.report().imagesAlreadyCached()).isEqualTo(selectedBefore + 1);
        assertThat(limited.report().imagesDownloaded()).isEqualTo(2);
        SyncRunView limitedAgain = importCatalog(ImageMode.LIMIT, limit);
        assertThat(limitedAgain.report().imagesDownloaded()).isZero();
        assertThat(limitedAgain.report().imagesAlreadyCached()).isEqualTo(limit);
    }

    private void reference(String... printingCodes) {
        UUID owner = provisionCompliant(uniqueUid("img-ref"));
        for (String code : printingCodes) {
            testUsers.update(
                    """
                    INSERT INTO inventory_item (id, owner_id, printing_id, quantity, condition,
                        language, edition, finish, visibility)
                    VALUES (gen_random_uuid(), ?, ?, 1, 'NEAR_MINT', 'en', 'UNLIMITED', 'NORMAL',
                        'PRIVATE')
                    """,
                    owner,
                    printingId(code));
        }
    }

    @Test
    void imageProblemsAreReportedWithoutFailingTheRun() {
        importCatalog(ImageMode.NONE, null);
        reference("ZTST-EN001", "ZTST-EN002", "ZTST-EN003");
        STUB.behave("900000001", YgoProDeckStub.Behaviour.NOT_FOUND);
        STUB.behave("900000002", YgoProDeckStub.Behaviour.HTML);
        STUB.behave("900000003", YgoProDeckStub.Behaviour.SERVER_ERROR_ONCE);
        SyncRunView run = importCatalog(ImageMode.REFERENCED, null);
        assertThat(run.status()).isEqualTo(SyncRunStatus.SUCCEEDED);
        CatalogImportReport report = run.report();
        assertThat(report.imagesMissingAtSource()).isEqualTo(1);
        assertThat(report.imagesFailed()).isEqualTo(1);
        assertThat(String.join(" ", report.errors())).contains("unexpected content type text/html");
        assertThat(imageRow("900000001").get("cache_status")).isEqualTo("MISSING_AT_SOURCE");
        assertThat(imageRow("900000002").get("cache_status")).isEqualTo("FAILED");
        assertThat(imageRow("900000003").get("cache_status"))
                .as("a transient 503 is retried by the provider client")
                .isEqualTo("CACHED");
        assertThat(tempFiles()).isEmpty();
        assertThat(reservedBytes()).isZero();

        // MISSING_AT_SOURCE is not retried by the next run.
        int hits = STUB.hits("/images/cards/900000001.jpg");
        SyncRunView next = importCatalog(ImageMode.REFERENCED, null);
        assertThat(STUB.hits("/images/cards/900000001.jpg")).isEqualTo(hits);
        assertThat(next.report().imagesMissingAtSource()).isEqualTo(1);
    }

    @Test
    void aProviderOutageFailsTheRunAndKeepsTheImportedCatalog() {
        importCatalog(ImageMode.NONE, null);
        int before = cards();
        STUB.apiDown(true);
        SyncRunView run = importCatalog(ImageMode.REFERENCED, null);
        assertThat(run.status()).isEqualTo(SyncRunStatus.FAILED);
        assertThat(run.error()).contains("ygoprodeck is unavailable", "kept");
        assertThat(run.report()).isNotNull();
        assertThat(cards()).isEqualTo(before);
    }

    @Test
    void adminAndInternalTriggersQueueRunsWithReports() throws InterruptedException {
        String admin = uniqueUid("img-admin");
        provisionWithRoles(admin, Role.ADMIN);
        JsonNode providers =
                callJson(HttpMethod.GET, "/api/v1/admin/catalog/providers", admin, null, 200);
        assertThat(providers.path("ygoprodeck").toString()).contains(GAME);

        JsonNode queued =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/catalog/sync",
                        admin,
                        Map.of("gameSlug", GAME, "provider", PROVIDER, "mode", "FULL"),
                        202);
        assertThat(queued.path("imageMode").asString()).isEqualTo("REFERENCED");
        JsonNode done =
                waitFor(
                        "/api/v1/admin/catalog/sync-runs/" + queued.path("id").asString(),
                        admin,
                        null);
        assertThat(done.path("status").asString()).isEqualTo("SUCCEEDED");
        JsonNode report =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/catalog/sync-runs/"
                                + queued.path("id").asString()
                                + "/report",
                        admin,
                        null,
                        200);
        assertThat(report.path("totalCardsProcessed").asInt())
                .isEqualTo(YgoProDeckStub.TOTAL_CARDS);
        assertThat(report.has("cacheLimitReached")).isTrue();
        assertNoProviderUrl(report.toString().replace("\"provider\":\"ygoprodeck\"", ""));

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/catalog/sync",
                admin,
                Map.of(
                        "gameSlug",
                        GAME,
                        "provider",
                        PROVIDER,
                        "mode",
                        "FULL",
                        "imageMode",
                        "LIMIT"),
                400);

        // Internal trigger with the service token (npm run catalog:import).
        var result =
                http.post()
                        .uri("/internal/jobs/catalog-import")
                        .header("X-Service-Token", "local-service-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(
                                Map.of(
                                        "gameSlug",
                                        GAME,
                                        "provider",
                                        PROVIDER,
                                        "mode",
                                        "FULL",
                                        "imageMode",
                                        "LIMIT",
                                        "imageLimit",
                                        2))
                        .exchange()
                        .expectStatus()
                        .isEqualTo(202)
                        .expectBody()
                        .returnResult();
        JsonNode internal = json(result);
        JsonNode internalDone =
                waitFor(
                        "/internal/jobs/catalog-import/" + internal.path("id").asString(),
                        null,
                        "local-service-token");
        assertThat(internalDone.path("report").path("imagesSelected").asInt()).isEqualTo(2);
        http.post()
                .uri("/internal/jobs/catalog-import")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("gameSlug", GAME, "provider", PROVIDER, "mode", "FULL"))
                .exchange()
                .expectStatus()
                .isUnauthorized();
        assertThat(
                        count(
                                "SELECT count(*) FROM audit_log WHERE action ="
                                        + " 'catalog.sync.request' AND target_id = ?",
                                internal.path("id").asString()))
                .isEqualTo(1);
    }

    private JsonNode waitFor(
            String uri,
            @org.jspecify.annotations.Nullable String admin,
            @org.jspecify.annotations.Nullable String serviceToken)
            throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
        JsonNode run;
        do {
            run =
                    json(
                            http.get()
                                    .uri(uri)
                                    .headers(
                                            headers -> {
                                                if (admin != null) {
                                                    headers.set(
                                                            HttpHeaders.AUTHORIZATION,
                                                            bearer(admin));
                                                }
                                                if (serviceToken != null) {
                                                    headers.set("X-Service-Token", serviceToken);
                                                }
                                            })
                                    .exchange()
                                    .expectStatus()
                                    .isOk()
                                    .expectBody()
                                    .returnResult());
            String status = run.path("status").asString();
            if (status.equals("SUCCEEDED") || status.equals("FAILED")) {
                return run;
            }
            Thread.sleep(200);
        } while (System.nanoTime() < deadline);
        return run;
    }
}
