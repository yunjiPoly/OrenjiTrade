package com.orenjitrade.api.profiles;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/** {@code GET /tags} and {@code PUT /me/profile/tags}. */
class TagIT extends AbstractIntegrationTest {

    private UUID tagId(String slug) {
        return (UUID) testUsers.query("SELECT id FROM tag WHERE slug = ?", slug).get(0).get("id");
    }

    private int usage(String slug) {
        return testUsers.count("SELECT usage_count FROM tag WHERE slug = ?", slug);
    }

    private static Map<String, Object> tagsBody(List<UUID> ids, List<String> labels) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("tagIds", ids);
        body.put("customLabels", labels);
        return body;
    }

    @Test
    void searchIsAccentAndCaseInsensitiveAndFiltersByCategory() {
        String uid = uniqueUid("tag-search");
        provisionCompliant(uid);

        JsonNode trad = callJson(HttpMethod.GET, "/api/v1/tags?query=trad", uid, null, 200);
        assertThat(slugs(trad)).contains("trader");
        assertThat(trad.get(0).path("id").asString()).isNotEmpty();
        assertThat(trad.get(0).has("usageCount")).isTrue();

        assertThat(slugs(callJson(HttpMethod.GET, "/api/v1/tags?query=POKÉ", uid, null, 200)))
                .contains("pokemon");
        assertThat(slugs(callJson(HttpMethod.GET, "/api/v1/tags?query=pokemon", uid, null, 200)))
                .contains("pokemon");
        assertThat(slugs(callJson(HttpMethod.GET, "/api/v1/tags?query=local meet", uid, null, 200)))
                .contains("local-meetups");

        JsonNode languages =
                callJson(HttpMethod.GET, "/api/v1/tags?category=LANGUAGE&limit=50", uid, null, 200);
        assertThat(languages.size()).isGreaterThanOrEqualTo(2);
        languages.forEach(tag -> assertThat(tag.path("category").asString()).isEqualTo("LANGUAGE"));

        assertThat(callJson(HttpMethod.GET, "/api/v1/tags?limit=2", uid, null, 200).size())
                .isEqualTo(2);
        assertThat(callJson(HttpMethod.GET, "/api/v1/tags?query=%25", uid, null, 200).size())
                .as("LIKE wildcards are escaped")
                .isZero();

        callJson(HttpMethod.GET, "/api/v1/tags?limit=0", uid, null, 400);
        callJson(HttpMethod.GET, "/api/v1/tags?limit=51", uid, null, 400);
        callJson(HttpMethod.GET, "/api/v1/tags?category=NOPE", uid, null, 400);
        callJson(HttpMethod.GET, "/api/v1/tags", null, null, 401);
    }

    @Test
    void replacingTagsCreatesCustomTagsAndMaintainsUsageCounts() {
        String uid = uniqueUid("tag-replace");
        provisionCompliant(uid);
        String custom = "Cube drafter " + Long.toString(System.nanoTime() % 100_000);
        int traderBefore = usage("trader");

        JsonNode tags =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/profile/tags",
                        uid,
                        tagsBody(List.of(tagId("trader"), tagId("local-meetups")), List.of(custom)),
                        200);

        assertThat(tags.size()).isEqualTo(3);
        assertThat(slugs(tags)).contains("trader", "local-meetups");
        JsonNode created = null;
        for (JsonNode tag : tags) {
            if (tag.path("category").asString().equals("CUSTOM")) {
                created = tag;
            }
        }
        assertThat(created).isNotNull();
        assertThat(created.path("label").asString()).isEqualTo(custom);
        assertThat(created.path("slug").asString()).startsWith("cube-drafter-");
        assertThat(created.path("usageCount").asInt()).isEqualTo(1);
        assertThat(usage("trader")).isEqualTo(traderBefore + 1);

        JsonNode profile = callJson(HttpMethod.GET, "/api/v1/me/profile", uid, null, 200);
        assertThat(profile.path("tags").size()).isEqualTo(3);
        assertThat(me(uid).path("onboarding").path("interestsSet").asBoolean()).isTrue();

        // The custom tag is now searchable.
        assertThat(
                        slugs(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/tags?query=" + created.path("slug").asString(),
                                        uid,
                                        null,
                                        200)))
                .contains(created.path("slug").asString());

        // Clearing gives the counts back.
        assertThat(
                        callJson(
                                        HttpMethod.PUT,
                                        "/api/v1/me/profile/tags",
                                        uid,
                                        tagsBody(List.of(), List.of()),
                                        200)
                                .size())
                .isZero();
        assertThat(usage("trader")).isEqualTo(traderBefore);
        assertThat(me(uid).path("onboarding").path("interestsSet").asBoolean()).isFalse();
    }

    @Test
    void customLabelsAreReusedAcrossCollectorsAndMatchCuratedTags() {
        String label = "Retro binder " + Long.toString(System.nanoTime() % 100_000);
        String first = uniqueUid("tag-reuse-a");
        String second = uniqueUid("tag-reuse-b");
        provisionCompliant(first);
        provisionCompliant(second);

        String firstId =
                callJson(
                                HttpMethod.PUT,
                                "/api/v1/me/profile/tags",
                                first,
                                tagsBody(List.of(), List.of(label)),
                                200)
                        .get(0)
                        .path("id")
                        .asString();
        JsonNode secondTags =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/profile/tags",
                        second,
                        tagsBody(List.of(), List.of(label.toUpperCase(), "  Trader ")),
                        200);
        assertThat(secondTags.size()).isEqualTo(2);
        assertThat(ids(secondTags)).contains(firstId, tagId("trader").toString());
        for (JsonNode tag : secondTags) {
            if (tag.path("id").asString().equals(firstId)) {
                assertThat(tag.path("usageCount").asInt()).isEqualTo(2);
            }
        }
    }

    @Test
    void limitsModerationAndUnknownTagsAre400() {
        String uid = uniqueUid("tag-limits");
        provisionCompliant(uid);

        List<String> thirteen = new ArrayList<>();
        for (int i = 0; i < 13; i++) {
            thirteen.add("Label number " + i);
        }
        callJson(
                HttpMethod.PUT, "/api/v1/me/profile/tags", uid, tagsBody(List.of(), thirteen), 400);

        List<UUID> eight = new ArrayList<>();
        for (String slug :
                List.of(
                        "collector",
                        "player",
                        "trader",
                        "seller",
                        "buyer",
                        "vintage",
                        "casual",
                        "sealed")) {
            eight.add(tagId(slug));
        }
        List<String> five = List.of("Aaa one", "Bbb two", "Ccc three", "Ddd four", "Eee five");
        callJson(HttpMethod.PUT, "/api/v1/me/profile/tags", uid, tagsBody(eight, five), 400);

        JsonNode banned =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/profile/tags",
                        uid,
                        tagsBody(List.of(), List.of("Zorblax cards")),
                        400);
        assertThat(banned.path("errors").toString()).contains("customLabels[0]");

        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                uid,
                tagsBody(List.of(), List.of("A")),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                uid,
                tagsBody(List.of(), List.of("<b>bold</b>")),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                uid,
                tagsBody(List.of(UUID.randomUUID()), List.of()),
                400);

        // A hidden tag can no longer be selected.
        String hiddenLabel = "Hidden soon " + Long.toString(System.nanoTime() % 100_000);
        String hiddenId =
                callJson(
                                HttpMethod.PUT,
                                "/api/v1/me/profile/tags",
                                uid,
                                tagsBody(List.of(), List.of(hiddenLabel)),
                                200)
                        .get(0)
                        .path("id")
                        .asString();
        testUsers.update(
                "UPDATE tag SET status = 'HIDDEN' WHERE id = ?", UUID.fromString(hiddenId));
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                uid,
                tagsBody(List.of(UUID.fromString(hiddenId)), List.of()),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                uid,
                tagsBody(List.of(), List.of(hiddenLabel)),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                null,
                tagsBody(List.of(), List.of()),
                401);
    }

    private static List<String> slugs(JsonNode tags) {
        List<String> slugs = new ArrayList<>();
        tags.forEach(tag -> slugs.add(tag.path("slug").asString()));
        return slugs;
    }

    private static List<String> ids(JsonNode tags) {
        List<String> ids = new ArrayList<>();
        tags.forEach(tag -> ids.add(tag.path("id").asString()));
        return ids;
    }
}
