package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.delisting.domain.DelistPolicyService;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.domain.imports.InventoryImportSettings;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import com.orenjitrade.api.wishlist.domain.WishlistSettings;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Web stage WH2 (spec 15.8's rest): the rule pages name their last editor, audit entries name their
 * actor and a readable target (and an archived city channel never reaches staff, WH1's R2-1), the
 * staff search, each game's catalogue summary and the binders' deck-core filter.
 */
class AdminConsoleWh2IT extends AbstractIntegrationTest {

    /** V041's archived "Montréal / Yu-Gi-Oh!" channel (named after a city). */
    private static final String CITY_CHANNEL = "00000000-0000-4000-8e00-000000000001";

    @Autowired private AuditService auditService;
    @Autowired private CatalogImportService importService;
    @Autowired private UsageLimitService usageLimits;
    @Autowired private FeatureFlags featureFlags;
    @Autowired private InventoryImportSettings importSettings;
    @Autowired private WishlistSettings wishlistSettings;
    @Autowired private DelistPolicyService delistPolicies;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    private String superAdmin(String prefix, String name) {
        String uid = uniqueUid(prefix);
        UUID id = provisionWithRoles(uid, Role.SUPER_ADMIN);
        testUsers.update("UPDATE user_account SET display_name = ? WHERE id = ?", name, id);
        return uid;
    }

    private String handleOf(String uid) {
        return testUsers.row(testUsers.idOf(uid)).get("handle").toString();
    }

    /**
     * The editors are set in the database (and put back after): a PUT here would add audit rows on
     * the shared settings that other classes count.
     */
    @Test
    void rulePagesNameTheirLastEditor() {
        String admin = superAdmin("wh2-editor", "Rosa Lima");
        UUID adminId = testUsers.idOf(admin);
        String handle = handleOf(admin);
        String limitId = usageLimits.find("binder.views.per_day").orElseThrow().id().toString();
        List<Map<String, Object>> before =
                testUsers.query(
                        "SELECT 'usage_limit' AS t, id::text AS k, updated_by, updated_at FROM"
                                + " usage_limit WHERE id = ?::uuid UNION ALL SELECT 'feature_flag',"
                                + " key, updated_by, updated_at FROM feature_flag WHERE key ="
                                + " 'publicChat' UNION ALL SELECT 'platform_settings', key,"
                                + " updated_by, updated_at FROM platform_settings WHERE key LIKE"
                                + " 'inventory.import%' OR key LIKE 'wishlist%' UNION ALL SELECT"
                                + " 'delist_policy', id::text, updated_by, updated_at FROM"
                                + " delist_policy",
                        limitId);
        try {
            testUsers.update(
                    "UPDATE usage_limit SET updated_by = ? WHERE id = ?::uuid", adminId, limitId);
            testUsers.update(
                    "UPDATE feature_flag SET updated_by = ? WHERE key = 'publicChat'", adminId);
            testUsers.update(
                    "UPDATE platform_settings SET updated_by = ?, updated_at = now() WHERE key LIKE"
                            + " 'inventory.import%' OR key LIKE 'wishlist%'",
                    adminId);
            testUsers.update("UPDATE delist_policy SET updated_by = ?", adminId);
            invalidateCaches();

            JsonNode limit =
                    find(
                            callJson(
                                    HttpMethod.GET, "/api/v1/admin/usage-limits", admin, null, 200),
                            "id",
                            limitId);
            assertThat(limit.path("updatedByHandle").asString()).isEqualTo(handle);
            assertThat(limit.path("updatedByName").asString()).isEqualTo("Rosa Lima");
            JsonNode flag =
                    find(
                            callJson(
                                    HttpMethod.GET,
                                    "/api/v1/admin/feature-flags",
                                    admin,
                                    null,
                                    200),
                            "key",
                            "publicChat");
            assertThat(flag.path("updatedByHandle").asString()).isEqualTo(handle);
            assertThat(flag.path("updatedByName").asString()).isEqualTo("Rosa Lima");
            JsonNode imports =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/admin/inventory/import-settings",
                            admin,
                            null,
                            200);
            assertThat(imports.path("updatedByHandle").asString()).isEqualTo(handle);
            assertThat(imports.path("updatedByName").asString()).isEqualTo("Rosa Lima");
            JsonNode wishlist =
                    callJson(HttpMethod.GET, "/api/v1/admin/wishlist/settings", admin, null, 200);
            assertThat(wishlist.path("updatedByName").asString()).isEqualTo("Rosa Lima");
            JsonNode policy =
                    callJson(HttpMethod.GET, "/api/v1/admin/delist-policies", admin, null, 200)
                            .get(0);
            assertThat(policy.path("updatedByHandle").asString()).isEqualTo(handle);
            assertThat(policy.path("updatedByName").asString()).isEqualTo("Rosa Lima");
        } finally {
            for (Map<String, Object> row : before) {
                String table = row.get("t").toString();
                String column =
                        table.equals("feature_flag") || table.equals("platform_settings")
                                ? "key"
                                : "id::text";
                testUsers.update(
                        "UPDATE "
                                + table
                                + " SET updated_by = ?, updated_at = coalesce(?, updated_at) WHERE "
                                + column
                                + " = ?",
                        row.get("updated_by"),
                        row.get("updated_at"),
                        row.get("k"));
            }
            invalidateCaches();
        }
        // No editor: the names are null, never an id.
        String moderator = uniqueUid("wh2-editor-mod");
        provisionWithRoles(moderator, Role.MODERATOR);
        callJson(HttpMethod.GET, "/api/v1/admin/usage-limits", moderator, null, 403);
    }

    private void invalidateCaches() {
        usageLimits.invalidate();
        featureFlags.invalidate();
        importSettings.invalidate();
        wishlistSettings.invalidate();
        delistPolicies.invalidate();
    }

    @Test
    void auditEntriesNameTheirActorAndTargetAndFilterByThem() {
        String admin = superAdmin("wh2-auditor", "Alex Morin");
        UUID adminId = testUsers.idOf(admin);
        String collector = uniqueUid("wh2-audited");
        UUID collectorId = provisionCompliant(collector);
        String collectorHandle = handleOf(collector);
        UUID reportId = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO collector_report (id, reporter_id, reported_user_id, reason) VALUES"
                        + " (?, ?, ?, 'SPAM')",
                reportId,
                adminId,
                collectorId);
        long number =
                ((Number)
                                testUsers
                                        .query(
                                                "SELECT report_number FROM collector_report WHERE"
                                                        + " id = ?",
                                                reportId)
                                        .getFirst()
                                        .get("report_number"))
                        .longValue();
        String limitId = usageLimits.find("binder.views.per_day").orElseThrow().id().toString();
        String marker = "wh2-" + UUID.randomUUID().toString().substring(0, 8);
        auditService.record(
                ActorType.ADMIN,
                adminId,
                "report.assign",
                "REPORT",
                reportId.toString(),
                Map.of("marker", marker));
        auditService.record(
                ActorType.ADMIN,
                adminId,
                "user.suspend",
                AuditService.TARGET_USER,
                collectorId.toString(),
                Map.of("marker", marker));
        auditService.record(
                ActorType.ADMIN,
                adminId,
                "usage_limit.update",
                "USAGE_LIMIT",
                limitId,
                Map.of("limitKey", "binder.views.per_day", "marker", marker));
        auditService.record(
                ActorType.SYSTEM,
                null,
                "user.suspension.expired",
                AuditService.TARGET_USER,
                collectorId.toString(),
                Map.of("marker", marker));

        JsonNode byReport =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/audit-logs?target=" + number,
                        admin,
                        null,
                        200);
        JsonNode assign = byAction(byReport, "report.assign", marker);
        assertThat(assign.path("targetLabel").asString()).isEqualTo("Report #" + number);
        assertThat(assign.path("actor").path("handle").asString()).isEqualTo(handleOf(admin));
        assertThat(assign.path("actor").path("displayName").asString()).isEqualTo("Alex Morin");
        assertThat(assign.path("actor").path("role").asString()).isEqualTo("SUPER_ADMIN");

        JsonNode byHandle =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/audit-logs?target=@" + collectorHandle,
                        admin,
                        null,
                        200);
        JsonNode suspend = byAction(byHandle, "user.suspend", marker);
        assertThat(suspend.path("targetLabel").asString()).isEqualTo("@" + collectorHandle);
        assertThat(byAction(byHandle, "user.suspension.expired", marker).path("actor").path("type"))
                .hasToString("\"SYSTEM\"");

        JsonNode byKey =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/audit-logs?target=binder.views.per_day&size=100",
                        admin,
                        null,
                        200);
        assertThat(byAction(byKey, "usage_limit.update", marker).path("targetLabel").asString())
                .isEqualTo("binder.views.per_day");

        JsonNode system =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/audit-logs?actorType=SYSTEM&target=@" + collectorHandle,
                        admin,
                        null,
                        200);
        assertThat(system.path("items").size()).isEqualTo(1);
        assertThat(system.path("items").get(0).path("action").asString())
                .isEqualTo("user.suspension.expired");
        callJson(HttpMethod.GET, "/api/v1/admin/audit-logs?actorType=ROBOT", admin, null, 400);
        String moderator = uniqueUid("wh2-audit-mod");
        provisionWithRoles(moderator, Role.MODERATOR);
        callJson(HttpMethod.GET, "/api/v1/admin/audit-logs", moderator, null, 403);
    }

    /** WH1's R2-1: an archived city channel's slug never reaches staff through the audit log. */
    @Test
    void anArchivedCityChannelReadsAsArchivedInTheAuditLog() {
        String admin = superAdmin("wh2-city", "Jun Park");
        UUID adminId = testUsers.idOf(admin);
        String author = uniqueUid("wh2-city-author");
        UUID authorId = provisionCompliant(author);
        UUID post = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO community_post (id, channel_id, author_id, body, body_hash) VALUES"
                        + " (?, ?::uuid, ?, 'Old local trade post',"
                        + " encode(sha256(convert_to(?, 'UTF8')), 'hex'))",
                post,
                CITY_CHANNEL,
                authorId,
                "wh2-city-" + post);
        Map<String, Object> removal = new LinkedHashMap<>();
        removal.put("authorId", authorId.toString());
        removal.put("channel", "montreal-yugioh");
        removal.put("reason", "Spam");
        auditService.record(
                ActorType.ADMIN,
                adminId,
                "community.post.remove",
                "COMMUNITY_POST",
                post.toString(),
                removal);
        auditService.record(
                ActorType.ADMIN,
                adminId,
                "community.channel.update",
                "COMMUNITY_CHANNEL",
                CITY_CHANNEL,
                Map.of("slug", "montreal-yugioh", "status", "ARCHIVED"));
        String room =
                testUsers
                        .query(
                                "SELECT id::text AS id FROM community_channel WHERE slug ="
                                        + " 'americas-north-yugioh'")
                        .getFirst()
                        .get("id")
                        .toString();
        auditService.record(
                ActorType.ADMIN,
                adminId,
                "community.channel.update",
                "COMMUNITY_CHANNEL",
                room,
                Map.of("slug", "americas-north-yugioh", "status", "ACTIVE"));

        JsonNode removed =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/audit-logs?action=community.post.remove&actorId=" + adminId,
                        admin,
                        null,
                        200);
        JsonNode entry = removed.path("items").get(0);
        assertThat(entry.path("details").path("channel").asString()).isEqualTo("archived-channel");
        assertThat(entry.path("details").path("authorId").asString())
                .isEqualTo(authorId.toString());
        assertThat(entry.path("targetLabel").asString()).isEqualTo("A post in an archived channel");

        JsonNode channels =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/audit-logs?action=community.channel.update&actorId="
                                + adminId,
                        admin,
                        null,
                        200);
        assertThat(channels.path("items").size()).isEqualTo(2);
        for (JsonNode update : channels.path("items")) {
            if (update.path("targetId").asString().equals(CITY_CHANNEL)) {
                assertThat(update.path("targetLabel").asString()).isEqualTo("An archived channel");
                assertThat(update.path("details").path("slug").asString())
                        .isEqualTo("archived-channel");
            } else {
                assertThat(update.path("targetLabel").asString()).isNotBlank();
                assertThat(update.path("details").path("slug").asString())
                        .isEqualTo("americas-north-yugioh");
            }
        }
        assertThat((removed.toString() + channels).toLowerCase(Locale.ROOT))
                .doesNotContain("montr");
        // The stored record is evidence and stays as written.
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE target_id = ? AND details->>"
                                        + "'channel' = 'montreal-yugioh'",
                                post.toString()))
                .isEqualTo(1);
    }

    /** WH1's U17: a report about a post names its room, never an archived city channel. */
    @Test
    void aPostReportNamesItsRoomButNeverACityChannel() {
        String admin = superAdmin("wh2-post-report", "Post Admin");
        String author = uniqueUid("wh2-post-author");
        UUID authorId = provisionCompliant(author);
        String room =
                testUsers
                        .query(
                                "SELECT id::text AS id FROM community_channel WHERE slug ="
                                        + " 'americas-north-yugioh'")
                        .getFirst()
                        .get("id")
                        .toString();
        Map<String, String> reports = new LinkedHashMap<>();
        for (String channel : List.of(room, CITY_CHANNEL)) {
            // One open report per reporter and collector: a reporter per post.
            String reporter = uniqueUid("wh2-post-reporter");
            provisionCompliant(reporter);
            UUID post = UUID.randomUUID();
            testUsers.update(
                    "INSERT INTO community_post (id, channel_id, author_id, body, body_hash) VALUES"
                            + " (?, ?::uuid, ?, 'Reported post', encode(sha256(convert_to(?,"
                            + " 'UTF8')), 'hex'))",
                    post,
                    channel,
                    authorId,
                    "wh2-report-" + post);
            JsonNode filed =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/reports/collectors",
                            reporter,
                            Map.of(
                                    "reportedUserId",
                                    authorId.toString(),
                                    "reason",
                                    "SPAM",
                                    "details",
                                    "Spam in the room (WH2 test).",
                                    "context",
                                    Map.of("source", "POST", "postId", post.toString())),
                            201);
            reports.put(channel, filed.path("id").asString());
        }
        JsonNode inRoom =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/reports/" + reports.get(room),
                        admin,
                        null,
                        200);
        assertThat(inRoom.path("contextRoomSlug").asString()).isEqualTo("americas-north-yugioh");
        JsonNode inCity =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/reports/" + reports.get(CITY_CHANNEL),
                        admin,
                        null,
                        200);
        assertThat(inCity.path("contextRoomSlug").isNull()).isTrue();
        assertThat(inCity.toString().toLowerCase(Locale.ROOT)).doesNotContain("montr");
    }

    @Test
    void staffSearchFindsCollectorsCardsAndReportsForAdminsOnly() {
        String admin = superAdmin("wh2-search", "Search Admin");
        String target = uniqueUid("wh2-findme");
        UUID targetId = provisionCompliant(target);
        String handle = handleOf(target);
        testUsers.update(
                "UPDATE user_account SET display_name = 'Zelda Quintero' WHERE id = ?", targetId);
        UUID reportId = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO collector_report (id, reporter_id, reported_user_id, reason) VALUES"
                        + " (?, ?, ?, 'SCAM')",
                reportId,
                testUsers.idOf(admin),
                targetId);
        long number =
                ((Number)
                                testUsers
                                        .query(
                                                "SELECT report_number FROM collector_report WHERE"
                                                        + " id = ?",
                                                reportId)
                                        .getFirst()
                                        .get("report_number"))
                        .longValue();

        JsonNode byHandle =
                callJson(HttpMethod.GET, "/api/v1/admin/search?q=@" + handle, admin, null, 200);
        assertThat(byHandle.path("collectors").get(0).path("handle").asString()).isEqualTo(handle);
        assertThat(byHandle.path("cards").size()).isZero();
        JsonNode byName =
                callJson(HttpMethod.GET, "/api/v1/admin/search?q=zelda quin", admin, null, 200);
        assertThat(byName.path("collectors").get(0).path("displayName").asString())
                .isEqualTo("Zelda Quintero");
        assertThat(byName.path("collectors").get(0).has("email")).isTrue();
        assertThat(byName.path("collectors").get(0).has("locationLabel")).isFalse();

        JsonNode byNumber =
                callJson(HttpMethod.GET, "/api/v1/admin/search?q=" + number, admin, null, 200);
        assertThat(byNumber.path("reports").get(0).path("id").asString())
                .isEqualTo(reportId.toString());
        assertThat(byNumber.path("reports").get(0).path("reportedHandle").asString())
                .isEqualTo(handle);

        InventoryTestSupport.IsolatedCard card =
                InventoryTestSupport.isolatedCard(testUsers, "ygo-p007a");
        JsonNode byCode =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/search?q=" + card.code().toLowerCase(Locale.ROOT),
                        admin,
                        null,
                        200);
        assertThat(byCode.path("cards").get(0).path("printingCode").asString())
                .isEqualTo(card.code());
        assertThat(byCode.path("cards").get(0).path("id").asString())
                .isEqualTo(card.cardId().toString());
        JsonNode byCard =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/search?q="
                                + card.name().toLowerCase(Locale.ROOT).split(" ")[0],
                        admin,
                        null,
                        200);
        assertThat(byCard.path("cards").get(0).path("name").asString()).isEqualTo(card.name());
        assertThat(byCard.path("cards").get(0).path("printingCode").isNull()).isTrue();

        callJson(HttpMethod.GET, "/api/v1/admin/search?q=", admin, null, 400);
        String moderator = uniqueUid("wh2-search-mod");
        provisionWithRoles(moderator, Role.MODERATOR);
        callJson(HttpMethod.GET, "/api/v1/admin/search?q=" + handle, moderator, null, 403);
        callJson(HttpMethod.GET, "/api/v1/admin/search?q=" + handle, target, null, 403);
    }

    @Test
    void catalogGamesSummarizeEachGameAndBindersFilterDeckCores() {
        String admin = superAdmin("wh2-catalog", "Catalog Admin");
        JsonNode games = callJson(HttpMethod.GET, "/api/v1/admin/catalog/games", admin, null, 200);
        JsonNode yugioh = find(games, "game", "yugioh");
        long cards =
                testUsers.count(
                        "SELECT count(*) FROM card c JOIN game g ON g.id = c.game_id WHERE g.slug ="
                                + " 'yugioh'");
        assertThat(yugioh.path("cards").asLong()).isEqualTo(cards);
        assertThat(yugioh.path("providers").isArray()).isTrue();
        assertThat(yugioh.has("lastRun")).isTrue();
        String moderator = uniqueUid("wh2-catalog-mod");
        provisionWithRoles(moderator, Role.MODERATOR);
        callJson(HttpMethod.GET, "/api/v1/admin/catalog/games", moderator, null, 403);

        String owner = uniqueUid("wh2-binder-owner");
        UUID ownerId = provisionCompliant(owner);
        UUID yugiohId = InventoryTestSupport.gameId(testUsers, "yugioh");
        Map<String, Object> deck =
                InventoryTestSupport.binder("WH2 deck core", "PRIVATE", yugiohId);
        deck.put("kind", "DECK");
        callJson(HttpMethod.POST, "/api/v1/binders", owner, deck, 201);
        Map<String, Object> trade = InventoryTestSupport.binder("WH2 trades", "PRIVATE", yugiohId);
        trade.put("kind", "TRADE");
        callJson(HttpMethod.POST, "/api/v1/binders", owner, trade, 201);
        JsonNode mine =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/binders?deckCore=true&ownerId=" + ownerId,
                        admin,
                        null,
                        200);
        assertThat(mine.path("items").size()).isEqualTo(1);
        assertThat(mine.path("items").get(0).path("name").asString()).isEqualTo("WH2 deck core");
        assertThat(mine.path("items").get(0).path("game").asString()).isEqualTo("yugioh");
        JsonNode decks =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/binders?deckCore=true&size=100",
                        admin,
                        null,
                        200);
        decks.path("items")
                .forEach(binder -> assertThat(binder.path("kind").asString()).isEqualTo("DECK"));
        JsonNode binders =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/binders?deckCore=false&size=100",
                        admin,
                        null,
                        200);
        assertThat(binders.path("items").size()).isPositive();
        binders.path("items")
                .forEach(
                        binder -> {
                            assertThat(binder.path("kind").asString()).isNotEqualTo("DECK");
                            assertThat(binder.path("game").asString()).isNotBlank();
                        });
        assertThat(decks.path("totalItems").asLong() + binders.path("totalItems").asLong())
                .isEqualTo(
                        callJson(HttpMethod.GET, "/api/v1/admin/binders", admin, null, 200)
                                .path("totalItems")
                                .asLong());
        featureFlags.invalidate();
    }

    private static JsonNode find(JsonNode array, String field, String value) {
        for (JsonNode node : array) {
            if (node.path(field).asString().equals(value)) {
                return node;
            }
        }
        throw new AssertionError(field + "=" + value + " not in " + array);
    }

    private static JsonNode byAction(JsonNode page, String action, String marker) {
        for (JsonNode item : page.path("items")) {
            if (item.path("action").asString().equals(action)
                    && item.path("details").path("marker").asString().equals(marker)) {
                return item;
            }
        }
        throw new AssertionError(action + " with " + marker + " not in " + page);
    }
}
