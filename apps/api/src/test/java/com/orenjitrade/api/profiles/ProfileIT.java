package com.orenjitrade.api.profiles;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/** {@code GET|PUT /me/profile}, handle rules and the avatar upload / public media round trip. */
class ProfileIT extends AbstractIntegrationTest {

    private static Map<String, Object> profileBody(
            String handle,
            String displayName,
            String bio,
            List<String> games,
            List<String> languages) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("handle", handle);
        body.put("displayName", displayName);
        body.put("bio", bio);
        body.put("games", games);
        body.put("languages", languages);
        return body;
    }

    @Test
    void defaultsBeforeTheFirstSave() {
        String uid = uniqueUid("profile-defaults");
        UUID id = provisionCompliant(uid);

        JsonNode profile = callJson(HttpMethod.GET, "/api/v1/me/profile", uid, null, 200);
        assertThat(profile.path("id").asString()).isEqualTo(id.toString());
        assertThat(profile.path("handle").asString()).isEqualTo(me(uid).path("handle").asString());
        assertThat(profile.path("displayName").asString()).isNotBlank();
        assertThat(profile.path("bio").asString()).isEmpty();
        assertThat(profile.path("games").size()).isZero();
        assertThat(profile.path("tags").size()).isZero();
        assertThat(profile.path("avatarUrl").isNull()).isTrue();
        assertThat(profile.path("profileComplete").asBoolean()).isFalse();
        assertThat(me(uid).path("onboarding").path("profileComplete").asBoolean()).isFalse();
    }

    @Test
    void savingTheProfileNormalisesSyncsTheAccountAndCompletesOnboarding() {
        String uid = uniqueUid("profile-save");
        UUID id = provisionCompliant(uid);
        String handle = shortHandle("P_");

        JsonNode saved =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/profile",
                        uid,
                        profileBody(
                                "  " + handle + " ",
                                " Maïka Test ",
                                "Binders on the Plateau",
                                List.of("pokemon", "YUGIOH", "pokemon"),
                                List.of("FR", "en")),
                        200);

        assertThat(saved.path("handle").asString()).isEqualTo(handle.toLowerCase());
        assertThat(saved.path("displayName").asString()).isEqualTo("Maïka Test");
        assertThat(saved.path("games").toString()).isEqualTo("[\"pokemon\",\"yugioh\"]");
        assertThat(saved.path("languages").toString()).isEqualTo("[\"fr\",\"en\"]");
        assertThat(saved.path("profileComplete").asBoolean()).isTrue();

        JsonNode me = me(uid);
        assertThat(me.path("handle").asString()).isEqualTo(handle.toLowerCase());
        assertThat(me.path("displayName").asString()).isEqualTo("Maïka Test");
        assertThat(me.path("onboarding").path("profileComplete").asBoolean()).isTrue();
        assertThat(me.path("onboarding").path("interestsSet").asBoolean()).isTrue();

        assertThat(testUsers.auditRowsFor(id))
                .anySatisfy(row -> assertThat(row.get("action")).isEqualTo("user.handle.change"));

        // Keeping the same handle is always fine (no 409 against oneself).
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile",
                uid,
                profileBody(handle.toLowerCase(), "Maïka Test", "", List.of(), List.of()),
                200);
        assertThat(me(uid).path("onboarding").path("interestsSet").asBoolean()).isFalse();
    }

    @Test
    void takenAndReservedHandlesAre409AndMalformedOnes400() {
        String owner = uniqueUid("handle-owner");
        provisionCompliant(owner);
        String handle = shortHandle("taken_");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile",
                owner,
                profileBody(handle, "Owner", "", List.of(), List.of()),
                200);

        String other = uniqueUid("handle-other");
        provisionCompliant(other);
        JsonNode taken =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/profile",
                        other,
                        profileBody(handle.toUpperCase(), "Other", "", List.of(), List.of()),
                        409);
        assertThat(taken.path("errorCode").asString()).isEqualTo("HANDLE_TAKEN");

        JsonNode reserved =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/profile",
                        other,
                        profileBody("admin", "Other", "", List.of(), List.of()),
                        409);
        assertThat(reserved.path("errorCode").asString()).isEqualTo("HANDLE_TAKEN");

        for (String bad : List.of("ab", "bad-handle", "way_too_long_handle_for_rules", "émile")) {
            JsonNode invalid =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/me/profile",
                            other,
                            profileBody(bad, "Other", "", List.of(), List.of()),
                            400);
            assertThat(invalid.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
            assertThat(invalid.path("errors").toString()).contains("handle");
        }
    }

    @Test
    void validationOfGamesLanguagesTextAndModeration() {
        String uid = uniqueUid("profile-validation");
        provisionCompliant(uid);
        String handle = me(uid).path("handle").asString();

        assertField(profileBody(handle, "Name", "", List.of("chess"), List.of()), uid, "games");
        assertField(profileBody(handle, "Name", "", List.of(), List.of("xx")), uid, "languages");
        assertField(profileBody(handle, "Name", "", List.of(), List.of("fra")), uid, "languages");
        assertField(profileBody(handle, "  ", "", List.of(), List.of()), uid, "displayName");
        assertField(profileBody(handle, "Name", "b".repeat(501), List.of(), List.of()), uid, "bio");
        assertField(
                profileBody(handle, "Name", "Great ZORBLAX deals", List.of(), List.of()),
                uid,
                "bio");
        assertField(
                profileBody(handle, "Zorblax King", "", List.of(), List.of()), uid, "displayName");

        // FLAG rules accept the text.
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile",
                uid,
                profileBody(handle, "Name", "fnordpromo inside", List.of(), List.of()),
                200);

        http.put()
                .uri("/api/v1/me/profile")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .body("{not json")
                .exchange()
                .expectStatus()
                .isBadRequest();
    }

    private void assertField(Map<String, Object> body, String uid, String field) {
        JsonNode problem = callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, body, 400);
        assertThat(problem.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(problem.path("errors").toString()).contains("\"field\":\"" + field + "\"");
    }

    @Test
    void avatarUploadIsServedPubliciallyAndDeleted() throws IOException {
        String uid = uniqueUid("avatar");
        provisionCompliant(uid);

        EntityExchangeResult<byte[]> upload =
                upload(uid, png(900, 600), "photo.png", MediaType.IMAGE_PNG);
        assertThat(upload.getStatus().value()).isEqualTo(200);
        String avatarUrl = json(upload).path("avatarUrl").asString();
        assertThat(avatarUrl).contains("/api/v1/public/media/avatars/").endsWith(".jpg");
        assertThat(me(uid).path("avatarUrl").asString()).isEqualTo(avatarUrl);

        String path = URI.create(avatarUrl).getPath();
        EntityExchangeResult<byte[]> media =
                http.get().uri(path).exchange().expectStatus().isOk().expectBody().returnResult();
        assertThat(media.getResponseHeaders().getContentType()).isEqualTo(MediaType.IMAGE_JPEG);
        assertThat(media.getResponseHeaders().getCacheControl())
                .contains("immutable")
                .contains("public");
        BufferedImage stored = ImageIO.read(new ByteArrayInputStream(media.getResponseBody()));
        assertThat(stored.getWidth()).isEqualTo(512);
        assertThat(stored.getHeight()).isEqualTo(512);

        // Replacing the avatar deletes the previous object.
        String second =
                json(upload(uid, png(300, 300), "second.png", MediaType.IMAGE_PNG))
                        .path("avatarUrl")
                        .asString();
        assertThat(second).isNotEqualTo(avatarUrl);
        http.get().uri(path).exchange().expectStatus().isNotFound();

        http.delete()
                .uri("/api/v1/me/profile/avatar")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isNoContent();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/profile", uid, null, 200)
                                .path("avatarUrl")
                                .isNull())
                .isTrue();
        http.get().uri(URI.create(second).getPath()).exchange().expectStatus().isNotFound();
    }

    @Test
    void avatarRejections() throws IOException {
        String uid = uniqueUid("avatar-reject");
        provisionCompliant(uid);

        EntityExchangeResult<byte[]> gif =
                upload(
                        uid,
                        "GIF89a-fake".getBytes(StandardCharsets.US_ASCII),
                        "a.gif",
                        MediaType.IMAGE_GIF);
        assertThat(gif.getStatus().value()).isEqualTo(415);
        assertThat(json(gif).path("errorCode").asString()).isEqualTo("UNSUPPORTED_MEDIA_TYPE");

        byte[] big = new byte[5 * 1024 * 1024 + 10];
        big[0] = (byte) 0x89;
        EntityExchangeResult<byte[]> tooLarge = upload(uid, big, "big.png", MediaType.IMAGE_PNG);
        assertThat(tooLarge.getStatus().value()).isEqualTo(413);
        assertThat(json(tooLarge).path("errorCode").asString()).isEqualTo("PAYLOAD_TOO_LARGE");

        byte[] corrupt = new byte[200];
        corrupt[0] = (byte) 0xff;
        corrupt[1] = (byte) 0xd8;
        corrupt[2] = (byte) 0xff;
        EntityExchangeResult<byte[]> unreadable =
                upload(uid, corrupt, "x.jpg", MediaType.IMAGE_JPEG);
        assertThat(unreadable.getStatus().value()).isEqualTo(400);
        assertThat(json(unreadable).path("errors").toString()).contains("file");

        // No `file` part at all.
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("other", "value");
        http.post()
                .uri("/api/v1/me/profile/avatar")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(builder.build())
                .exchange()
                .expectStatus()
                .isBadRequest();
    }

    @Test
    void publicMediaOnlyServesValidExistingKeys() {
        http.get().uri("/api/v1/public/media/avatars/x.exe").exchange().expectStatus().isNotFound();
        http.get()
                .uri(
                        "/api/v1/public/media/avatars/"
                                + UUID.randomUUID()
                                + "/0123456789abcdef0123456789abcdef.jpg")
                .exchange()
                .expectStatus()
                .isNotFound();
        http.get().uri("/api/v1/public/media/").exchange().expectStatus().isNotFound();
    }

    @Test
    void anonymousCallsAre401() {
        http.get().uri("/api/v1/me/profile").exchange().expectStatus().isUnauthorized();
        http.put()
                .uri("/api/v1/me/profile")
                .contentType(MediaType.APPLICATION_JSON)
                .body(profileBody("anon_user", "Anon", "", List.of(), List.of()))
                .exchange()
                .expectStatus()
                .isUnauthorized();
        http.delete().uri("/api/v1/me/profile/avatar").exchange().expectStatus().isUnauthorized();
    }

    EntityExchangeResult<byte[]> upload(
            String uid, byte[] content, String filename, MediaType type) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(content) {
                            @Override
                            public String getFilename() {
                                return filename;
                            }
                        })
                .contentType(type);
        return http.post()
                .uri("/api/v1/me/profile/avatar")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(builder.build())
                .exchange()
                .expectBody()
                .returnResult();
    }

    /** {@code prefix} + random hex, at most 20 characters. */
    static String shortHandle(String prefix) {
        String candidate =
                prefix
                        + Long.toHexString(
                                java.util.concurrent.ThreadLocalRandom.current().nextLong());
        return candidate.substring(0, Math.min(20, candidate.length()));
    }

    static byte[] png(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(Color.ORANGE);
        graphics.fillRect(0, 0, width, height);
        graphics.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }
}
