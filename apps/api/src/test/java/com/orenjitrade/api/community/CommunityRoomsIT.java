package com.orenjitrade.api.community;

import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.community.domain.CommunityService;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.moderation.domain.ModerationService;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Stage R11 of the phone redesign (Messages › Community: one simple room per game): the newest post
 * a caller may see on the room list (blocks, removals and suspended authors left out), posts with
 * up to 4 photos uploaded as COMMUNITY (3 MB each, photos only, EXIF and GPS stripped, deleted with
 * the post), the author's state or province (discoverable authors only, never a city), a shared
 * deck core with its badge, price and picture, and posts that never notify anyone.
 */
class CommunityRoomsIT extends AbstractIntegrationTest {

    private static final String UPLOADS = "/api/v1/uploads/images";

    @Autowired private CatalogImportService importService;
    @Autowired private ModerationService moderationService;
    @Autowired private ObjectStorage storage;
    @Autowired private CommunityService communityService;
    @Autowired private FeatureFlags featureFlags;

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

    /** A collector others find on the map: Quebec, with a city that only their profile shows. */
    private Member discoverable(String prefix) {
        Member member = member(prefix);
        setLocation(member.uid(), "CA", "CA-QC", "Zqroomcity");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                member.uid(),
                InventoryTestSupport.privacy(true, "MEMBERS"),
                200);
        return member;
    }

    private JsonNode post(Member author, String room, Map<String, Object> body, int status) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/community/channels/" + room + "/posts",
                author.uid(),
                body,
                status);
    }

    private JsonNode post(Member author, String room, String text) {
        return post(author, room, Map.of("body", text), 201);
    }

    private JsonNode room(Member viewer, String slug) {
        JsonNode channels =
                callJson(HttpMethod.GET, "/api/v1/community/channels", viewer.uid(), null, 200);
        for (JsonNode channel : channels) {
            if (channel.path("slug").asString().equals(slug)) {
                return channel;
            }
        }
        throw new AssertionError("room " + slug + " not listed");
    }

    private JsonNode postIn(Member viewer, String room, String postId) {
        JsonNode page =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/community/channels/" + room + "/posts?limit=50",
                        viewer.uid(),
                        null,
                        200);
        for (JsonNode item : page.path("items")) {
            if (item.path("id").asString().equals(postId)) {
                return item;
            }
        }
        throw new AssertionError("post " + postId + " not in " + room);
    }

    // -----------------------------------------------------------------------------------------
    // The room list
    // -----------------------------------------------------------------------------------------

    @Test
    void theRoomListShowsTheNewestPostTheCallerMaySee() {
        String slug = "americas-south-riftbound";
        Member a = member("last-a");
        Member b = member("last-b");
        Member c = member("last-c");
        String first = post(a, slug, "Riftbound singles by mail, ask me").path("id").asString();
        String longText = "Looking for the champion decks of the first set " + "x".repeat(200);
        String second = post(c, slug, longText).path("id").asString();

        JsonNode seenByB = room(b, slug).path("lastPost");
        assertThat(seenByB.path("id").asString()).isEqualTo(second);
        assertThat(seenByB.path("authorHandle").asString()).isEqualTo(c.handle());
        assertThat(seenByB.path("mine").asBoolean()).isFalse();
        assertThat(seenByB.path("body").asString())
                .hasSize(140)
                .startsWith("Looking for the champion decks")
                .endsWith("…");
        assertThat(seenByB.path("createdAt").asString()).isNotBlank();
        assertThat(seenByB.has("place")).isFalse();
        assertThat(room(c, slug).path("lastPost").path("mine").asBoolean()).isTrue();

        // B blocks C: C's post leaves B's room list (and C's), A's comes back.
        callJson(HttpMethod.POST, "/api/v1/users/" + c.id() + "/block", b.uid(), null, 200);
        assertThat(room(b, slug).path("lastPost").path("id").asString()).isEqualTo(first);
        assertThat(room(a, slug).path("lastPost").path("id").asString()).isEqualTo(second);

        // A suspended author is left out; a removed post too.
        testUsers.setStatus(a.id(), AccountStatus.SUSPENDED, Instant.now().plusSeconds(3600));
        assertThat(room(b, slug).path("lastPost").isNull()).isTrue();
        testUsers.setStatus(a.id(), AccountStatus.ACTIVE, null);
        Member moderator = member("last-mod", Role.MODERATOR);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + first + "/remove",
                moderator.uid(),
                Map.of("reason", "Test removal"),
                204);
        assertThat(room(b, slug).path("lastPost").isNull()).isTrue();
        assertThat(room(moderator, slug).path("lastPost").path("id").asString()).isEqualTo(second);
    }

    @Test
    void theRoomsPostCountLeavesOutWhatTheCallerCannotSee() {
        // Review fix 1 (P5): the 24 h count of a room follows the rules of its posts: blocks both
        // ways, suspended authors, removed posts.
        String slug = "americas-south-mtg";
        Member a = member("count-a");
        Member b = member("count-b");
        Member c = member("count-c");
        int before = room(a, slug).path("postCount24h").asInt();
        post(b, slug, "Magic singles by mail, ask me");
        post(c, slug, "Magic wants, ships tracked");
        String last = post(c, slug, "Magic trades by mail tonight").path("id").asString();
        assertThat(room(a, slug).path("postCount24h").asInt()).isEqualTo(before + 3);

        callJson(HttpMethod.POST, "/api/v1/users/" + c.id() + "/block", b.uid(), null, 200);
        assertThat(room(b, slug).path("postCount24h").asInt()).isEqualTo(before + 1);
        assertThat(room(c, slug).path("postCount24h").asInt()).isEqualTo(before + 2);
        assertThat(room(a, slug).path("postCount24h").asInt()).isEqualTo(before + 3);

        testUsers.setStatus(c.id(), AccountStatus.SUSPENDED, Instant.now().plusSeconds(3600));
        assertThat(room(a, slug).path("postCount24h").asInt()).isEqualTo(before + 1);
        testUsers.setStatus(c.id(), AccountStatus.ACTIVE, null);

        Member moderator = member("count-mod", Role.MODERATOR);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + last + "/remove",
                moderator.uid(),
                Map.of("reason", "Test removal"),
                204);
        assertThat(room(a, slug).path("postCount24h").asInt()).isEqualTo(before + 2);
    }

    // -----------------------------------------------------------------------------------------
    // Photos
    // -----------------------------------------------------------------------------------------

    @Test
    void aPostTakesUpToFourCommunityPhotosStrippedOfExifAndGps() {
        Member author = member("photo-author");
        Member other = member("photo-other");
        List<String> uploads = new ArrayList<>();
        uploads.add(
                upload(author.uid(), jpegWithGps(640, 480), "COMMUNITY", 201)
                        .path("uploadId")
                        .asString());
        for (int index = 1; index < 4; index++) {
            uploads.add(
                    upload(author.uid(), png(300 + index, 200), "COMMUNITY", 201)
                            .path("uploadId")
                            .asString());
        }
        String fifth =
                upload(author.uid(), png(50, 50), "COMMUNITY", 201).path("uploadId").asString();

        // Five photos are refused, and so are a message's upload and someone else's.
        List<String> five = new ArrayList<>(uploads);
        five.add(fifth);
        post(author, "europe-onepiece", Map.of("body", "Five photos", "photoUploadIds", five), 400);
        String messageUpload =
                upload(author.uid(), png(60, 60), "MESSAGE", 201).path("uploadId").asString();
        post(
                author,
                "europe-onepiece",
                Map.of("body", "A message photo", "photoUploadIds", List.of(messageUpload)),
                400);
        String othersUpload =
                upload(other.uid(), png(70, 70), "COMMUNITY", 201).path("uploadId").asString();
        post(
                author,
                "europe-onepiece",
                Map.of("body", "Someone else's photo", "photoUploadIds", List.of(othersUpload)),
                400);
        post(
                author,
                "europe-onepiece",
                Map.of(
                        "body",
                        "The same photo twice",
                        "photoUploadIds",
                        List.of(uploads.get(0), uploads.get(0))),
                400);
        // A community photo is not a message's.
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", author.handle());
        profile.put("displayName", "Photo Author");
        profile.put("games", List.of("onepiece"));
        profile.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", author.uid(), profile, 200);
        String conversation =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations",
                                author.uid(),
                                Map.of("recipientId", other.id().toString()),
                                201)
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversation + "/messages",
                author.uid(),
                Map.of("kind", "IMAGE", "imageUploadId", fifth),
                400);

        JsonNode created =
                post(
                        author,
                        "europe-onepiece",
                        Map.of(
                                "body",
                                "My One Piece binder, four photos",
                                "photoUploadIds",
                                uploads),
                        201);
        String postId = created.path("id").asString();
        JsonNode photos = created.path("payload").path("photos");
        assertThat(photos).hasSize(4);
        assertThat(photos.get(0).path("width").asInt()).isEqualTo(640);
        assertThat(photos.get(1).path("width").asInt()).isEqualTo(301);
        assertThat(photos.get(3).path("width").asInt()).isEqualTo(303);
        photos.forEach(photo -> assertThat(photo.path("url").asString()).startsWith("http"));
        assertThat(postIn(other, "europe-onepiece", postId).path("payload").path("photos"))
                .hasSize(4);

        // Stored as metadata-free JPEGs: no APP1 (EXIF) segment, no GPS tag.
        List<String> keys = photoKeys(postId);
        assertThat(keys).hasSize(4);
        for (String key : keys) {
            byte[] stored = storage.get(key).orElseThrow().content();
            assertThat(stored[0] & 0xff).isEqualTo(0xff);
            assertThat(stored[1] & 0xff).isEqualTo(0xd8);
            for (int i = 0; i + 1 < stored.length; i++) {
                assertThat((stored[i] & 0xff) == 0xff && (stored[i + 1] & 0xff) == 0xe1)
                        .as("APP1 marker at %s of %s", i, key)
                        .isFalse();
            }
            assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("GPS");
        }

        // An upload is used once.
        post(
                author,
                "europe-onepiece",
                Map.of("body", "Again", "photoUploadIds", List.of(uploads.get(1))),
                400);

        // Deleting the post deletes its photos and their files.
        callJson(HttpMethod.DELETE, "/api/v1/community/posts/" + postId, author.uid(), null, 204);
        assertThat(photoKeys(postId)).isEmpty();
        keys.forEach(key -> assertThat(storage.exists(key)).as("file %s", key).isFalse());
    }

    @Test
    void communityUploadsArePhotosOfThreeMegabytesAtMost() {
        Member author = member("photo-limits");
        JsonNode tooLarge =
                upload(author.uid(), padded(png(40, 40), 3 * 1024 * 1024 + 1), "COMMUNITY", 413);
        assertThat(tooLarge.path("errorCode").asString()).isEqualTo("PAYLOAD_TOO_LARGE");
        assertThat(tooLarge.path("message").asString()).contains("3 MB");
        // The same file is fine for a message (8 MB).
        upload(author.uid(), padded(png(40, 40), 3 * 1024 * 1024 + 1), "MESSAGE", 201);
        // A video is not a photo (type sniffed from the content).
        byte[] mp4 = new byte[64];
        byte[] header = {0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2'};
        System.arraycopy(header, 0, mp4, 0, header.length);
        assertThat(upload(author.uid(), mp4, "COMMUNITY", 415).path("errorCode").asString())
                .isEqualTo("UNSUPPORTED_MEDIA_TYPE");
    }

    @Test
    void communityPhotosAreRefusedWhileTheCommunityIsOff() {
        Member author = member("photo-flag-off");
        testUsers.update("UPDATE feature_flag SET enabled = false WHERE key = 'publicChat'");
        featureFlags.invalidate();
        try {
            JsonNode refused = upload(author.uid(), png(120, 90), "COMMUNITY", 404);
            assertThat(refused.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
            assertThat(refused.path("feature").asString()).isEqualTo("publicChat");
            // Photos of private messages do not depend on the community.
            upload(author.uid(), png(120, 90), "MESSAGE", 201);
        } finally {
            testUsers.update("UPDATE feature_flag SET enabled = true WHERE key = 'publicChat'");
            featureFlags.invalidate();
        }
        upload(author.uid(), png(120, 90), "COMMUNITY", 201);
    }

    @Test
    void removingAPostOrDeletingItsAuthorDeletesItsPhotos() {
        Member author = member("photo-purge");
        Member moderator = member("photo-mod", Role.MODERATOR);
        String removed =
                post(
                                author,
                                "americas-south-mtg",
                                Map.of(
                                        "body",
                                        "Photo of my Magic binder",
                                        "photoUploadIds",
                                        List.of(communityUpload(author))),
                                201)
                        .path("id")
                        .asString();
        List<String> removedKeys = photoKeys(removed);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/community/posts/" + removed + "/remove",
                moderator.uid(),
                Map.of("reason", "Test removal"),
                204);
        assertThat(photoKeys(removed)).isEmpty();
        removedKeys.forEach(key -> assertThat(storage.exists(key)).isFalse());

        String kept =
                post(
                                author,
                                "americas-south-mtg",
                                Map.of(
                                        "body",
                                        "Another photo of my binder",
                                        "photoUploadIds",
                                        List.of(communityUpload(author))),
                                201)
                        .path("id")
                        .asString();
        List<String> keptKeys = photoKeys(kept);
        assertThat(keptKeys).hasSize(1);
        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", author.uid(), null, 200);
        assertThat(export.path("sections").path("community").path("posts").toString())
                .contains("photos");
        // Account deletion: the photos and their files go with the posts' text.
        communityService.purge(author.id());
        assertThat(photoKeys(kept)).isEmpty();
        keptKeys.forEach(key -> assertThat(storage.exists(key)).isFalse());
    }

    // -----------------------------------------------------------------------------------------
    // Places, shared deck cores, no notifications
    // -----------------------------------------------------------------------------------------

    @Test
    void aPostCarriesItsAuthorsProvinceOnlyWhenTheAuthorIsDiscoverable() {
        Member shown = discoverable("place-shown");
        Member hidden = member("place-hidden");
        setLocation(hidden.uid(), "CA", "CA-ON", "Zqhiddencity");
        // Discoverable, but with a PRIVATE profile: nobody reads the province, the author neither.
        Member secret = discoverable("place-private");
        setLocation(secret.uid(), "CA", "CA-BC", "Zqsecretcity");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                secret.uid(),
                InventoryTestSupport.privacy(true, "PRIVATE"),
                200);
        Member reader = member("place-reader");
        String shownPost =
                post(shown, "europe-pokemon", "Pokémon trades by mail").path("id").asString();
        String hiddenPost =
                post(hidden, "europe-pokemon", "Pokémon wants by mail").path("id").asString();
        String secretPost =
                post(secret, "europe-pokemon", "Pokémon singles by mail").path("id").asString();

        JsonNode withPlace = postIn(reader, "europe-pokemon", shownPost);
        assertThat(withPlace.path("place").path("subdivisionName").asString()).isEqualTo("Quebec");
        assertThat(withPlace.path("place").path("label").asString()).isEqualTo("Quebec, Canada");
        assertThat(withPlace.toString()).doesNotContain("Zqroomcity");
        assertThat(withPlace.path("author").has("place")).isFalse();
        JsonNode withoutPlace = postIn(reader, "europe-pokemon", hiddenPost);
        assertThat(withoutPlace.has("place")).isTrue();
        assertThat(withoutPlace.path("place").isNull()).isTrue();
        assertThat(withoutPlace.toString())
                .doesNotContain("Ontario")
                .doesNotContain("Zqhiddencity");
        // The author reads what others read.
        assertThat(postIn(hidden, "europe-pokemon", hiddenPost).path("place").isNull()).isTrue();
        // A PRIVATE profile hides the province from every reader, its author included (review fix
        // 1: the author saw "British Columbia" on their own post that nobody else sees), in the
        // room and in the answer to a new post.
        for (Member viewer : List.of(reader, shown, secret)) {
            JsonNode read = postIn(viewer, "europe-pokemon", secretPost);
            assertThat(read.path("place").isNull()).as("place for %s", viewer.handle()).isTrue();
            assertThat(read.toString()).doesNotContain("British Columbia");
        }
        assertThat(
                        post(secret, "europe-pokemon", "Pokémon wants, ships tracked")
                                .path("place")
                                .isNull())
                .isTrue();
        assertThat(room(reader, "europe-pokemon").toString())
                .doesNotContain("Quebec")
                .doesNotContain("Zqroomcity");
    }

    @Test
    void aSharedDeckCoreShowsItsBadgePriceAndPictureWhileBuyersCanFindIt() {
        Member owner = discoverable("core-owner");
        Member reader = member("core-reader");
        UUID yugioh = InventoryTestSupport.gameId(testUsers, "yugioh");
        Map<String, Object> core = InventoryTestSupport.binder("Moth core", "PUBLIC", yugioh);
        core.put("sellsAsCore", true);
        core.put("askingPriceText", "$95");
        String coreId =
                callJson(HttpMethod.POST, "/api/v1/binders", owner.uid(), core, 201)
                        .path("id")
                        .asString();
        Map<String, Object> item = InventoryTestSupport.item(printing(testUsers, "ygo-p012a"));
        item.put("binderId", coreId);
        item.put("visibility", "PUBLIC");
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), item, 201);
        String plainId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner.uid(),
                                InventoryTestSupport.binder("Trade binder", "PUBLIC", yugioh),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> plainItem = InventoryTestSupport.item(printing(testUsers, "ygo-p001a"));
        plainItem.put("binderId", plainId);
        plainItem.put("visibility", "PUBLIC");
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), plainItem, 201);

        String corePost =
                post(
                                owner,
                                "americas-north-yugioh",
                                Map.of("body", "My Moth core is up", "binderId", coreId),
                                201)
                        .path("id")
                        .asString();
        String plainPost =
                post(
                                owner,
                                "americas-north-yugioh",
                                Map.of("body", "Trade binder updated", "binderId", plainId),
                                201)
                        .path("id")
                        .asString();

        JsonNode shared =
                postIn(reader, "americas-north-yugioh", corePost).path("payload").path("binder");
        assertThat(shared.path("id").asString()).isEqualTo(coreId);
        assertThat(shared.path("name").asString()).isEqualTo("Moth core");
        assertThat(shared.path("ownerHandle").asString()).isEqualTo(owner.handle());
        assertThat(shared.path("deckCore").asBoolean()).isTrue();
        assertThat(shared.path("askingPriceText").asString()).isEqualTo("$95");
        assertThat(shared.path("imageUrl").asString()).startsWith("http");
        JsonNode plain =
                postIn(reader, "americas-north-yugioh", plainPost).path("payload").path("binder");
        assertThat(plain.path("deckCore").asBoolean()).isFalse();
        assertThat(plain.has("askingPriceText")).isFalse();
        assertThat(plain.path("imageUrl").asString()).startsWith("http");
        assertThat(
                        postIn(reader, "americas-north-yugioh", plainPost)
                                .path("payload")
                                .has("binderUnavailable"))
                .isFalse();

        // Someone else shares the deck core. A block between the reader and its owner, in either
        // direction, hides all of it from the reader: no badge, price or picture, and not even the
        // name and the owner's handle stored with the post (review fix 1); the owner still reads
        // it.
        Member sharer = member("core-sharer");
        String sharedPost =
                post(
                                sharer,
                                "americas-north-yugioh",
                                Map.of("body", "Look at this Moth core", "binderId", coreId),
                                201)
                        .path("id")
                        .asString();
        assertUnavailable(reader, sharedPost, owner, false);
        callJson(
                HttpMethod.POST, "/api/v1/users/" + owner.id() + "/block", reader.uid(), null, 200);
        assertUnavailable(reader, sharedPost, owner, true);
        assertThat(
                        postIn(owner, "americas-north-yugioh", sharedPost)
                                .path("payload")
                                .path("binder")
                                .path("deckCore")
                                .asBoolean())
                .isTrue();
        callJson(
                HttpMethod.DELETE,
                "/api/v1/users/" + owner.id() + "/block",
                reader.uid(),
                null,
                204);
        callJson(
                HttpMethod.POST, "/api/v1/users/" + reader.id() + "/block", owner.uid(), null, 200);
        assertUnavailable(reader, sharedPost, owner, true);
        callJson(
                HttpMethod.DELETE,
                "/api/v1/users/" + reader.id() + "/block",
                owner.uid(),
                null,
                204);
        assertUnavailable(reader, sharedPost, owner, false);

        // A suspended owner: the same.
        testUsers.setStatus(owner.id(), AccountStatus.SUSPENDED, Instant.now().plusSeconds(3600));
        assertUnavailable(reader, sharedPost, owner, true);
        testUsers.setStatus(owner.id(), AccountStatus.ACTIVE, null);
        assertUnavailable(reader, sharedPost, owner, false);

        // A deck core that buyers can no longer find is no longer available, to its owner too.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/binders/" + coreId,
                owner.uid(),
                Map.of("visibility", "PRIVATE"),
                200);
        assertUnavailable(reader, corePost, owner, true);
        assertUnavailable(owner, corePost, owner, true);
    }

    /**
     * Whether {@code viewer} reads the binder of {@code postId} as no longer available: no {@code
     * binder} (so no name, owner's handle, badge, price or picture) and {@code binderUnavailable};
     * otherwise the deck core with its badge.
     */
    private void assertUnavailable(
            Member viewer, String postId, Member owner, boolean unavailable) {
        JsonNode payload = postIn(viewer, "americas-north-yugioh", postId).path("payload");
        if (unavailable) {
            assertThat(payload.has("binder")).as("binder for %s", viewer.handle()).isFalse();
            assertThat(payload.path("binderUnavailable").asBoolean()).isTrue();
            assertThat(payload.toString())
                    .doesNotContain("Moth core")
                    .doesNotContain(owner.handle())
                    .doesNotContain("$95");
        } else {
            assertThat(payload.path("binder").path("deckCore").asBoolean()).isTrue();
            assertThat(payload.path("binder").path("name").asString()).isEqualTo("Moth core");
            assertThat(payload.has("binderUnavailable")).isFalse();
        }
    }

    @Test
    void postsNeverNotifyAnyone() {
        Member author = discoverable("quiet-author");
        Member reader = member("quiet-reader");
        int before = testUsers.count("SELECT count(*) FROM notification");
        post(author, "americas-north-pokemon", "Anyone trading the new Pokémon set by mail?");
        callJson(HttpMethod.GET, "/api/v1/community/channels", reader.uid(), null, 200);
        assertThat(testUsers.count("SELECT count(*) FROM notification")).isEqualTo(before);
    }

    // -----------------------------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------------------------

    private List<String> photoKeys(String postId) {
        List<String> keys = new ArrayList<>();
        testUsers
                .query(
                        "SELECT storage_key FROM community_post_photo WHERE post_id = ?::uuid"
                                + " ORDER BY position",
                        postId)
                .forEach(row -> keys.add((String) row.get("storage_key")));
        return keys;
    }

    private String communityUpload(Member author) {
        return upload(author.uid(), png(120, 90), "COMMUNITY", 201).path("uploadId").asString();
    }

    private JsonNode upload(String uid, byte[] content, String kind, int expectedStatus) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(content) {
                            @Override
                            public String getFilename() {
                                return "photo.bin";
                            }
                        })
                .contentType(MediaType.APPLICATION_OCTET_STREAM);
        builder.part("kind", kind);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri(UPLOADS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value())
                .as(
                        "upload %s -> %s",
                        kind,
                        result.getResponseBody() == null
                                ? ""
                                : new String(result.getResponseBody(), StandardCharsets.UTF_8))
                .isEqualTo(expectedStatus);
        return json(result);
    }

    private static byte[] png(int width, int height) {
        return InventoryTestSupport.png(width, height);
    }

    /** A PNG followed by zero bytes up to {@code size} (decoders stop at IEND). */
    private static byte[] padded(byte[] image, int size) {
        byte[] result = new byte[size];
        System.arraycopy(image, 0, result, 0, image.length);
        return result;
    }

    /** A JPEG carrying an EXIF (APP1) segment with a GPS block, as a phone camera writes it. */
    static byte[] jpegWithGps(int width, int height) {
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        try {
            ImageIO.write(
                    new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "jpeg", encoded);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        byte[] jpeg = encoded.toByteArray();
        byte[] exif =
                ("Exif\0\0MM\0*\0\0\0\bGPSLatitude 45.5088 GPSLongitude -73.5878")
                        .getBytes(StandardCharsets.ISO_8859_1);
        int length = exif.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2); // SOI
        out.write(0xff);
        out.write(0xe1);
        out.write((length >> 8) & 0xff);
        out.write(length & 0xff);
        out.write(exif, 0, exif.length);
        out.write(jpeg, 2, jpeg.length - 2);
        byte[] result = out.toByteArray();
        assertThat(new String(result, StandardCharsets.ISO_8859_1)).contains("GPSLatitude");
        return result;
    }
}
