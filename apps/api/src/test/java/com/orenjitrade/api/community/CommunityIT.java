package com.orenjitrade.api.community;

import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.community.events.CommunityPostCreated;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.moderation.domain.ModerationService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Public community chat (Phase 5 contract "Community chat"): seeded channels and filters, posts,
 * replies, edits and deletions with their authorization, the publicChat feature flag (404
 * FEATURE_DISABLED), duplicate detection (409), the per-channel rate limit (429), moderation (422
 * POST_BLOCKED, FLAGGED posts), audited moderator removals and channel management, block hiding and
 * one region channel per platform region (ADR 0017; the old city channels are archived).
 */
class CommunityIT extends AbstractIntegrationTest {

    static final List<String> SEEDED =
            List.of(
                    "americas-north",
                    "americas-south",
                    "europe",
                    "looking-for",
                    "new-listings",
                    "trades",
                    "general");

    @Autowired private CatalogImportService importService;
    @Autowired private FeatureFlags featureFlags;
    @Autowired private ModerationService moderationService;
    @Autowired private RecordedDomainEvents recordedEvents;

    private record Member(String uid, UUID id, String handle) {}

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        moderationService.invalidate();
    }

    private Member member(String prefix, Role... roles) {
        String uid = uniqueUid(prefix);
        UUID id = roles.length == 0 ? provisionCompliant(uid) : provisionWithRoles(uid, roles);
        return new Member(uid, id, me(uid).path("handle").asString());
    }

    private JsonNode post(Member author, String channel, String body, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/community/channels/" + channel + "/posts",
                author.uid(),
                Map.of("body", body),
                expectedStatus);
    }

    private List<String> postIds(Member viewer, String channel) {
        JsonNode page =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/community/channels/" + channel + "/posts?limit=50",
                        viewer.uid(),
                        null,
                        200);
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(item -> ids.add(item.path("id").asString()));
        return ids;
    }

    @Test
    void theLaunchChannelsAreListedAndFilterable() {
        Member viewer = member("chan-view");
        JsonNode channels =
                callJson(HttpMethod.GET, "/api/v1/community/channels", viewer.uid(), null, 200);
        List<String> slugs = new ArrayList<>();
        channels.forEach(channel -> slugs.add(channel.path("slug").asString()));
        assertThat(slugs).containsSubsequence(SEEDED);
        assertThat(slugs).doesNotContain("montreal-pokemon");
        JsonNode north = channels.get(slugs.indexOf("americas-north"));
        assertThat(north.path("name").asString()).isEqualTo("Americas (North)");
        assertThat(north.path("kind").asString()).isEqualTo("REGION");
        assertThat(north.path("game").isNull()).isTrue();
        assertThat(north.path("regionLabel").asString()).isEqualTo("americas-north");
        assertThat(north.path("postCount24h").isInt()).isTrue();
        JsonNode general = channels.get(slugs.indexOf("general"));
        assertThat(general.path("kind").asString()).isEqualTo("GENERAL");
        assertThat(general.path("game").isNull()).isTrue();

        JsonNode byGame =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/community/channels?game=yugioh",
                        viewer.uid(),
                        null,
                        200);
        byGame.forEach(channel -> assertThat(channel.path("game").asString()).isEqualTo("yugioh"));
        JsonNode byRegion =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/community/channels?region=americas-south",
                        viewer.uid(),
                        null,
                        200);
        List<String> regional = new ArrayList<>();
        byRegion.forEach(channel -> regional.add(channel.path("slug").asString()));
        assertThat(regional).containsExactly("americas-south");
        assertThat(
                        call(HttpMethod.GET, "/api/v1/community/channels", null, null)
                                .getStatus()
                                .value())
                .isEqualTo(401);
    }

    @Test
    void postsRepliesEditsAndDeletions() {
        Member author = member("post-author");
        Member other = member("post-other");
        Member moderator = member("post-mod", Role.MODERATOR);
        UUID printingId = printing(testUsers, "ygo-p001a");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("body", "Who is trading at the Old Port on Sunday?");
        body.put("cardPrintingId", printingId.toString());
        JsonNode created =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/community/channels/general/posts",
                        author.uid(),
                        body,
                        201);
        String postId = created.path("id").asString();
        assertThat(created.path("channelSlug").asString()).isEqualTo("general");
        assertThat(created.path("author").path("handle").asString()).isEqualTo(author.handle());
        assertThat(created.path("author").has("location")).isFalse();
        assertThat(created.path("payload").path("card").path("id").asString())
                .isEqualTo(printingId.toString());
        assertThat(created.path("payload").path("card").path("imageUrl").asString())
                .startsWith("http");
        assertThat(created.path("canEdit").asBoolean()).isTrue();
        assertThat(created.path("canDelete").asBoolean()).isTrue();
        assertThat(created.path("replyCount").asInt()).isZero();
        assertThat(created.path("moderationState").asString()).isEqualTo("OK");
        assertThat(
                        recordedEvents.of(
                                CommunityPostCreated.class,
                                event -> event.postId().toString().equals(postId)))
                .singleElement()
                .satisfies(event -> assertThat(event.channelSlug()).isEqualTo("general"));

        JsonNode seenByOther =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/community/channels/general/posts?limit=50",
                        other.uid(),
                        null,
                        200);
        JsonNode mine = find(seenByOther, postId);
        assertThat(mine.path("canEdit").asBoolean()).isFalse();
        assertThat(mine.path("canDelete").asBoolean()).isFalse();

        JsonNode reply =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/community/posts/" + postId + "/replies",
                        other.uid(),
                        Map.of("body", "Count me in!"),
                        201);
        assertThat(reply.path("postId").asString()).isEqualTo(postId);
        assertThat(reply.path("canDelete").asBoolean()).isTrue();
        JsonNode replies =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/community/posts/" + postId + "/replies",
                        author.uid(),
                        null,
                        200);
        assertThat(replies.path("items")).hasSize(1);
        assertThat(replies.path("items").get(0).path("canDelete").asBoolean()).isFalse();
        JsonNode withReply =
                find(
                        callJson(
                                HttpMethod.GET,
                                "/api/v1/community/channels/general/posts?limit=50",
                                author.uid(),
                                null,
                                200),
                        postId);
        assertThat(withReply.path("replyCount").asInt()).isEqualTo(1);
        assertThat(withReply.path("lastReplyAt").asString()).isNotBlank();

        callJson(
                HttpMethod.PATCH,
                "/api/v1/community/posts/" + postId,
                other.uid(),
                Map.of("body", "Hijack"),
                403);
        JsonNode edited =
                callJson(
                        HttpMethod.PATCH,
                        "/api/v1/community/posts/" + postId,
                        author.uid(),
                        Map.of("body", "Who is trading at the Old Port on Saturday?"),
                        200);
        assertThat(edited.path("body").asString()).endsWith("Saturday?");
        assertThat(edited.path("editedAt").asString()).isNotBlank();

        callJson(HttpMethod.DELETE, "/api/v1/community/posts/" + postId, other.uid(), null, 403);
        callJson(
                HttpMethod.DELETE,
                "/api/v1/community/replies/" + reply.path("id").asString(),
                moderator.uid(),
                null,
                204);
        assertThat(
                        testUsers.query(
                                "SELECT action FROM audit_log WHERE target_type = 'COMMUNITY_REPLY'"
                                        + " AND target_id = ?",
                                reply.path("id").asString()))
                .extracting(row -> row.get("action"))
                .containsExactly("community.reply.delete");
        assertThat(
                        find(
                                        callJson(
                                                HttpMethod.GET,
                                                "/api/v1/community/channels/general/posts?limit=50",
                                                author.uid(),
                                                null,
                                                200),
                                        postId)
                                .path("replyCount")
                                .asInt())
                .isZero();
        callJson(HttpMethod.DELETE, "/api/v1/community/posts/" + postId, author.uid(), null, 204);
        assertThat(postIds(author, "general")).doesNotContain(postId);
        callJson(
                HttpMethod.GET,
                "/api/v1/community/posts/" + postId + "/replies",
                author.uid(),
                null,
                404);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE target_type ="
                                        + " 'COMMUNITY_POST' AND target_id = ?",
                                postId))
                .as("an author deleting their own post is not an admin action")
                .isZero();

        post(author, "general", "   ", 400);
        post(author, "general", "x".repeat(2001), 400);
        post(author, "no-such-channel", "Hello", 404);
        callJson(
                HttpMethod.POST,
                "/api/v1/community/posts/" + UUID.randomUUID() + "/replies",
                author.uid(),
                Map.of("body", "Hi"),
                404);
        Map<String, Object> privateBinder = new LinkedHashMap<>();
        privateBinder.put("body", "My binder");
        privateBinder.put(
                "binderId",
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                author.uid(),
                                InventoryTestSupport.binder("Private", "PRIVATE"),
                                201)
                        .path("id")
                        .asString());
        callJson(
                HttpMethod.POST,
                "/api/v1/community/channels/general/posts",
                author.uid(),
                privateBinder,
                400);
    }

    @Test
    void theCommunityIsHiddenWhileThePublicChatFlagIsOff() {
        Member member = member("flag-off");
        testUsers.update("UPDATE feature_flag SET enabled = false WHERE key = 'publicChat'");
        featureFlags.invalidate();
        try {
            JsonNode problem =
                    callJson(HttpMethod.GET, "/api/v1/community/channels", member.uid(), null, 404);
            assertThat(problem.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
            assertThat(problem.path("feature").asString()).isEqualTo("publicChat");
            assertThat(post(member, "general", "Anyone?", 404).path("errorCode").asString())
                    .isEqualTo("FEATURE_DISABLED");
            callJson(
                    HttpMethod.GET,
                    "/api/v1/community/channels/general/posts",
                    member.uid(),
                    null,
                    404);
        } finally {
            testUsers.update("UPDATE feature_flag SET enabled = true WHERE key = 'publicChat'");
            featureFlags.invalidate();
        }
        callJson(HttpMethod.GET, "/api/v1/community/channels", member.uid(), null, 200);
    }

    @Test
    void duplicatesAre409AndTheChannelRateLimitIs429() {
        Member author = member("dup-author");
        post(author, "general", "Selling a sealed booster box, DM me", 201);
        JsonNode duplicate = post(author, "trades", "selling a SEALED booster   box, dm me", 409);
        assertThat(duplicate.path("errorCode").asString()).isEqualTo("DUPLICATE_POST");
        // Another member may say the same thing.
        post(member("dup-other"), "general", "Selling a sealed booster box, DM me", 201);

        Member moderator = member("rate-mod", Role.MODERATOR);
        String slug = "rate-test-" + UUID.randomUUID().toString().substring(0, 8);
        Map<String, Object> channel = new LinkedHashMap<>();
        channel.put("slug", slug);
        channel.put("name", "Rate test");
        channel.put("kind", "GENERAL");
        channel.put("postRateLimitPerHour", 2);
        callJson(
                HttpMethod.POST, "/api/v1/admin/community/channels", moderator.uid(), channel, 201);
        Member poster = member("rate-poster");
        post(poster, slug, "First post in the channel", 201);
        post(poster, slug, "Second post in the channel", 201);
        JsonNode limited = post(poster, slug, "Third post in the channel", 429);
        assertThat(limited.path("errorCode").asString()).isEqualTo("RATE_LIMITED");
        assertThat(limited.path("retryAfterSeconds").asInt()).isEqualTo(3600);
        // The limit is per channel.
        post(poster, "general", "Posting elsewhere is fine", 201);
    }

    @Test
    void moderationBlocksFlagsAndModeratorsRemoveWithAnAudit() {
        Member author = member("mod-author");
        Member moderator = member("mod-mod", Role.MODERATOR);
        JsonNode blocked = post(author, "general", "Cheap cards at ZÖRBLAX dot shop", 422);
        assertThat(blocked.path("errorCode").asString()).isEqualTo("POST_BLOCKED");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM community_post WHERE author_id = ?",
                                author.id()))
                .isZero();

        JsonNode flagged = post(author, "general", "Visit fnordpromo for binder deals", 201);
        String postId = flagged.path("id").asString();
        assertThat(flagged.path("moderationState").asString()).isEqualTo("FLAGGED");
        assertThat(
                        testUsers.query(
                                "SELECT reason, rule_id FROM moderation_flag WHERE subject_type ="
                                    + " 'COMMUNITY_POST' AND subject_id = ?::uuid AND resolved_at"
                                    + " IS NULL",
                                postId))
                .singleElement()
                .satisfies(
                        row -> {
                            assertThat(row.get("reason")).isEqualTo("BANNED_TERM");
                            assertThat(row.get("rule_id")).isNotNull();
                        });
        callJson(
                HttpMethod.POST,
                "/api/v1/community/posts/" + postId + "/replies",
                moderator.uid(),
                Map.of("body", "No quuxspam here"),
                422);

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + postId + "/remove",
                author.uid(),
                Map.of("reason", "x"),
                403);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + postId + "/remove",
                moderator.uid(),
                Map.of(),
                400);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + postId + "/remove",
                moderator.uid(),
                Map.of("reason", "Advertising"),
                204);
        assertThat(postIds(author, "general")).doesNotContain(postId);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM moderation_flag WHERE subject_id = ?::uuid"
                                        + " AND resolved_at IS NOT NULL AND resolved_by = ?",
                                postId,
                                moderator.id()))
                .isEqualTo(1);
        List<Map<String, Object>> audit =
                testUsers.query(
                        "SELECT action, actor_user_id, details::text AS details FROM audit_log"
                                + " WHERE target_type = 'COMMUNITY_POST' AND target_id = ?",
                        postId);
        assertThat(audit)
                .singleElement()
                .satisfies(
                        row -> {
                            assertThat(row.get("action")).isEqualTo("community.post.remove");
                            assertThat(row.get("actor_user_id")).isEqualTo(moderator.id());
                            assertThat((String) row.get("details")).contains("Advertising");
                        });
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + postId + "/remove",
                moderator.uid(),
                Map.of("reason", "Again"),
                409);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + UUID.randomUUID() + "/remove",
                moderator.uid(),
                Map.of("reason", "Missing"),
                404);

        // Replies can be removed as well.
        String visible =
                post(author, "general", "A normal question about sleeves", 201)
                        .path("id")
                        .asString();
        String replyId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/community/posts/" + visible + "/replies",
                                member("mod-replier").uid(),
                                Map.of("body", "Use perfect fits"),
                                201)
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/replies/" + replyId + "/remove",
                moderator.uid(),
                Map.of("reason", "Off topic"),
                204);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/community/posts/" + visible + "/replies",
                                        author.uid(),
                                        null,
                                        200)
                                .path("items"))
                .isEmpty();
    }

    @Test
    void blockedCollectorsDoNotSeeEachOthersPosts() {
        Member a = member("cblock-a");
        Member b = member("cblock-b");
        Member c = member("cblock-c");
        String postOfB = post(b, "general", "Post of B about binders", 201).path("id").asString();
        String postOfA = post(a, "general", "Post of A about sleeves", 201).path("id").asString();
        callJson(HttpMethod.POST, "/api/v1/users/" + b.id() + "/block", a.uid(), null, 200);

        assertThat(postIds(a, "general")).doesNotContain(postOfB).contains(postOfA);
        assertThat(postIds(b, "general")).doesNotContain(postOfA).contains(postOfB);
        assertThat(postIds(c, "general")).contains(postOfA, postOfB);
        callJson(
                HttpMethod.GET,
                "/api/v1/community/posts/" + postOfB + "/replies",
                a.uid(),
                null,
                404);
        callJson(
                HttpMethod.POST,
                "/api/v1/community/posts/" + postOfA + "/replies",
                b.uid(),
                Map.of("body", "hi"),
                404);
    }

    @Test
    void moderatorsManageChannelsWithAnAudit() {
        Member moderator = member("chan-mod", Role.MODERATOR);
        Member collector = member("chan-user");
        String slug = "quebec-pokemon-" + UUID.randomUUID().toString().substring(0, 6);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("slug", slug);
        body.put("name", "Québec / Pokémon");
        body.put("kind", "REGION");
        body.put("game", "pokemon");
        body.put("regionLabel", "Québec");
        body.put("description", "Pokémon around Québec City");
        callJson(HttpMethod.POST, "/api/v1/admin/community/channels", collector.uid(), body, 403);
        JsonNode created =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/community/channels",
                        moderator.uid(),
                        body,
                        201);
        String id = created.path("id").asString();
        assertThat(created.path("status").asString()).isEqualTo("ACTIVE");
        assertThat(created.path("postRateLimitPerHour").asInt()).isEqualTo(10);
        callJson(HttpMethod.POST, "/api/v1/admin/community/channels", moderator.uid(), body, 409);
        Map<String, Object> badGame = new LinkedHashMap<>(body);
        badGame.put("slug", slug + "-x");
        badGame.put("game", "chess");
        callJson(
                HttpMethod.POST, "/api/v1/admin/community/channels", moderator.uid(), badGame, 400);
        Map<String, Object> badSlug = new LinkedHashMap<>(body);
        badSlug.put("slug", "Not A Slug");
        callJson(
                HttpMethod.POST, "/api/v1/admin/community/channels", moderator.uid(), badSlug, 400);

        post(collector, slug, "First in Québec", 201);
        JsonNode archived =
                callJson(
                        HttpMethod.PATCH,
                        "/api/v1/admin/community/channels/" + id,
                        moderator.uid(),
                        Map.of("status", "ARCHIVED", "postRateLimitPerHour", 5),
                        200);
        assertThat(archived.path("status").asString()).isEqualTo("ARCHIVED");
        assertThat(archived.path("postRateLimitPerHour").asInt()).isEqualTo(5);
        callJson(
                HttpMethod.GET,
                "/api/v1/community/channels/" + slug + "/posts",
                collector.uid(),
                null,
                404);
        post(collector, slug, "Second in Québec", 404);
        JsonNode admin =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/community/channels",
                        moderator.uid(),
                        null,
                        200);
        List<String> adminSlugs = new ArrayList<>();
        admin.forEach(channel -> adminSlugs.add(channel.path("slug").asString()));
        assertThat(adminSlugs).contains(slug);
        callJson(HttpMethod.GET, "/api/v1/admin/community/channels", collector.uid(), null, 403);
        callJson(
                HttpMethod.PATCH,
                "/api/v1/admin/community/channels/" + UUID.randomUUID(),
                moderator.uid(),
                Map.of("name", "X"),
                404);

        assertThat(
                        testUsers.query(
                                "SELECT action FROM audit_log WHERE target_type ="
                                    + " 'COMMUNITY_CHANNEL' AND target_id = ? ORDER BY occurred_at",
                                id))
                .extracting(row -> row.get("action"))
                .containsExactly("community.channel.create", "community.channel.update");
    }

    @Test
    void regionChannelsAreThePlatformRegionsAndLocationsCreateNone() {
        int regionChannels =
                testUsers.count("SELECT count(*) FROM community_channel WHERE kind = 'REGION'");
        Member collector = member("region-loc");
        setLocation(collector.uid(), "CA", "CA-QC", "Trois-Rivières");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                collector.uid(),
                InventoryTestSupport.privacy(true, "MEMBERS"),
                200);
        assertThat(testUsers.count("SELECT count(*) FROM community_channel WHERE kind = 'REGION'"))
                .as("no channel is created from a location (ADR 0017)")
                .isEqualTo(regionChannels);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM community_channel WHERE slug LIKE"
                                        + " 'montreal-%' AND status = 'ARCHIVED'"))
                .as("the old city channels are archived, not deleted")
                .isEqualTo(4);
        JsonNode channels =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/community/channels?region=europe",
                        collector.uid(),
                        null,
                        200);
        assertThat(channels)
                .singleElement()
                .satisfies(
                        channel -> {
                            assertThat(channel.path("slug").asString()).isEqualTo("europe");
                            assertThat(channel.path("name").asString()).isEqualTo("Europe");
                            assertThat(channel.path("kind").asString()).isEqualTo("REGION");
                        });
    }

    private static JsonNode find(JsonNode page, String id) {
        for (JsonNode item : page.path("items")) {
            if (item.path("id").asString().equals(id)) {
                return item;
            }
        }
        throw new AssertionError("post " + id + " not found");
    }
}
