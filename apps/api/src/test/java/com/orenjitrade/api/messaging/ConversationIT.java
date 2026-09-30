package com.orenjitrade.api.messaging;

import static com.orenjitrade.api.inventory.InventoryTestSupport.SERVICE_TOKEN;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.messaging.MessagingTestSupport.message;
import static com.orenjitrade.api.messaging.MessagingTestSupport.text;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.messaging.MessagingTestSupport.Member;
import com.orenjitrade.api.messaging.events.MessageRead;
import com.orenjitrade.api.messaging.events.MessageSent;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
 * Private conversations (Phase 5 contract "Private messaging"): idempotent start, cursor pages,
 * read markers and receipts state, card/binder/photo messages, uploads and their cleanup job,
 * mute/archive, validation, the 30/min rate rule, domain events and the export section.
 */
class ConversationIT extends AbstractMessagingIT {

    @Autowired private CatalogImportService importService;
    @Autowired private RecordedDomainEvents recordedEvents;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    @Test
    void startIsIdempotentPerPairAndEmptyConversationsOnlyShowForTheirCreator() {
        Member a = member("conv-a");
        Member b = member("conv-b");

        EntityExchangeResult<byte[]> created =
                call(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        a.uid(),
                        Map.of("recipientId", b.id().toString()));
        assertThat(created.getStatus().value()).isEqualTo(201);
        JsonNode summary = json(created);
        String id = summary.path("id").asString();
        assertThat(created.getResponseHeaders().getLocation())
                .hasPath("/api/v1/conversations/" + id);
        assertThat(summary.path("other").path("id").asString()).isEqualTo(b.id().toString());
        assertThat(summary.path("other").path("handle").asString()).isEqualTo(b.handle());
        assertThat(summary.path("other").path("displayName").asString())
                .isEqualTo("Collector " + b.handle());
        assertThat(summary.path("other").path("onlineStatus").asString()).isEqualTo("HIDDEN");
        assertThat(summary.path("lastMessage").isNull()).isTrue();
        assertThat(summary.path("unreadCount").asInt()).isZero();
        assertThat(summary.path("muted").asBoolean()).isFalse();
        assertThat(summary.path("archived").asBoolean()).isFalse();

        assertThat(start(a, b, 200)).isEqualTo(id);
        assertThat(start(b, a, 200)).isEqualTo(id);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM conversation_participant WHERE"
                                        + " conversation_id = ?::uuid",
                                id))
                .isEqualTo(2);

        assertThat(summaryOf(a, id).isMissingNode()).isFalse();
        assertThat(summaryOf(b, id).isMissingNode())
                .as("an empty conversation started by the other participant is not listed")
                .isTrue();
        sendText(a, id, "Hello there");
        assertThat(summaryOf(b, id).path("unreadCount").asInt()).isEqualTo(1);
    }

    @Test
    void messagesArePagedNewestFirstAndReadMarkersMoveForwardOnly() {
        Member a = member("page-a");
        Member b = member("page-b");
        String id = start(a, b, 201);
        List<String> sent = new ArrayList<>();
        for (int index = 1; index <= 5; index++) {
            sent.add(sendText(a, id, "Message number " + index).path("id").asString());
        }

        JsonNode first =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/conversations/" + id + "/messages?limit=2",
                        b.uid(),
                        null,
                        200);
        assertThat(ids(first)).containsExactly(sent.get(4), sent.get(3));
        assertThat(first.path("hasMore").asBoolean()).isTrue();
        String cursor = first.path("nextCursor").asString();
        JsonNode second =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/conversations/" + id + "/messages?limit=2&cursor=" + cursor,
                        b.uid(),
                        null,
                        200);
        assertThat(ids(second)).containsExactly(sent.get(2), sent.get(1));
        JsonNode third =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/conversations/"
                                + id
                                + "/messages?limit=2&cursor="
                                + second.path("nextCursor").asString(),
                        b.uid(),
                        null,
                        200);
        assertThat(ids(third)).containsExactly(sent.get(0));
        assertThat(third.path("hasMore").asBoolean()).isFalse();
        assertThat(third.path("nextCursor").isMissingNode() || third.path("nextCursor").isNull())
                .isTrue();

        JsonNode message = first.path("items").get(0);
        assertThat(message.path("conversationId").asString()).isEqualTo(id);
        assertThat(message.path("senderId").asString()).isEqualTo(a.id().toString());
        assertThat(message.path("kind").asString()).isEqualTo("TEXT");
        assertThat(message.path("body").asString()).isEqualTo("Message number 5");
        assertThat(message.path("moderationState").asString()).isEqualTo("OK");
        assertThat(message.path("readByOther").asBoolean()).isFalse();
        assertThat(message.path("editedAt").isNull()).isTrue();
        assertThat(summaryOf(b, id).path("unreadCount").asInt()).isEqualTo(5);
        JsonNode last = summaryOf(b, id).path("lastMessage");
        assertThat(last.path("id").asString()).isEqualTo(sent.get(4));
        assertThat(last.path("preview").asString()).isEqualTo("Message number 5");
        assertThat(last.path("kind").asString()).isEqualTo("TEXT");
        assertThat(last.path("senderId").asString()).isEqualTo(a.id().toString());

        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + id + "/read",
                b.uid(),
                Map.of("lastReadMessageId", sent.get(2)),
                204);
        assertThat(summaryOf(b, id).path("unreadCount").asInt()).isEqualTo(2);
        JsonNode seenByA = messages(a, id);
        assertThat(readByOther(seenByA, sent.get(2))).isTrue();
        assertThat(readByOther(seenByA, sent.get(3))).isFalse();
        // Backwards is a no-op.
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + id + "/read",
                b.uid(),
                Map.of("lastReadMessageId", sent.get(0)),
                204);
        assertThat(summaryOf(b, id).path("unreadCount").asInt()).isEqualTo(2);
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + id + "/read",
                b.uid(),
                Map.of("lastReadMessageId", sent.get(4)),
                204);
        assertThat(summaryOf(b, id).path("unreadCount").asInt()).isZero();

        // A reply marks everything before it read for its sender.
        String reply = sendText(b, id, "Thanks, all read").path("id").asString();
        assertThat(summaryOf(a, id).path("unreadCount").asInt()).isEqualTo(1);
        assertThat(summaryOf(b, id).path("unreadCount").asInt()).isZero();
        assertThat(readByOther(messages(b, id), reply)).isFalse();

        // A message of another conversation is not a valid marker.
        Member c = member("page-c");
        String other = start(a, c, 201);
        String foreign = sendText(a, other, "Elsewhere").path("id").asString();
        JsonNode problem =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + id + "/read",
                        b.uid(),
                        Map.of("lastReadMessageId", foreign),
                        400);
        assertThat(problem.path("errors").get(0).path("field").asString())
                .isEqualTo("lastReadMessageId");

        UUID conversationId = UUID.fromString(id);
        assertThat(
                        recordedEvents.of(
                                MessageSent.class,
                                event -> event.conversationId().equals(conversationId)))
                .hasSize(6)
                .allSatisfy(
                        event -> {
                            assertThat(event.kind()).isEqualTo("TEXT");
                            assertThat(event.recipientId()).isNotEqualTo(event.senderId());
                        });
        assertThat(
                        recordedEvents.of(
                                MessageRead.class,
                                event -> event.conversationId().equals(conversationId)))
                .extracting(MessageRead::lastReadMessageId)
                .containsExactly(UUID.fromString(sent.get(2)), UUID.fromString(sent.get(4)));

        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/conversations/"
                                                + id
                                                + "/messages?cursor=bm90LWEtY3Vyc29y",
                                        b.uid(),
                                        null,
                                        400)
                                .path("errorCode")
                                .asString())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void cardBinderAndPhotoMessagesCarryResolvedLinks() {
        Member a = member("link-a");
        Member b = member("link-b");
        String id = start(a, b, 201);
        UUID azure = printing(testUsers, "ygo-p001a");

        JsonNode card =
                send(a, id, message("CARD_LINK", "Still have this one", "cardPrintingId", azure));
        assertThat(card.path("kind").asString()).isEqualTo("CARD_LINK");
        assertThat(card.path("body").asString()).isEqualTo("Still have this one");
        JsonNode cardLink = card.path("payload").path("card");
        assertThat(cardLink.path("id").asString()).isEqualTo(azure.toString());
        assertThat(cardLink.path("cardId").asString()).isNotBlank();
        assertThat(cardLink.path("name").asString()).isNotBlank();
        assertThat(cardLink.path("imageUrl").asString()).startsWith("http");
        assertThat(summaryOf(b, id).path("lastMessage").path("preview").asString())
                .isEqualTo("Card: " + cardLink.path("name").asString());

        // Binder links need an effectively public binder of a listed owner.
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                a.uid(),
                InventoryTestSupport.privacy(false, "PUBLIC"),
                200);
        String publicBinder =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                a.uid(),
                                InventoryTestSupport.binder("Trade stack", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        String privateBinder =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                a.uid(),
                                InventoryTestSupport.binder("Keep", "PRIVATE"),
                                201)
                        .path("id")
                        .asString();
        JsonNode binder = send(a, id, message("BINDER_LINK", null, "binderId", publicBinder));
        assertThat(binder.path("body").asString()).isEmpty();
        assertThat(binder.path("payload").path("binder").path("id").asString())
                .isEqualTo(publicBinder);
        assertThat(binder.path("payload").path("binder").path("name").asString())
                .isEqualTo("Trade stack");
        assertThat(binder.path("payload").path("binder").path("ownerHandle").asString())
                .isEqualTo(a.handle());
        JsonNode refused =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + id + "/messages",
                        a.uid(),
                        message("BINDER_LINK", null, "binderId", privateBinder),
                        400);
        assertThat(refused.path("errors").get(0).path("field").asString()).isEqualTo("binderId");

        // Photos: upload, attach once, never twice, never somebody else's upload.
        JsonNode upload = upload(a.uid(), InventoryTestSupport.png(1200, 900), 201);
        assertThat(upload.path("uploadId").asString()).isNotBlank();
        assertThat(upload.path("url").asString()).contains("/api/v1/public/media/uploads/");
        assertThat(upload.path("width").asInt()).isEqualTo(1200);
        assertThat(upload.path("expiresAt").asString()).isNotBlank();
        String uploadId = upload.path("uploadId").asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + id + "/messages",
                b.uid(),
                message("IMAGE", null, "imageUploadId", uploadId),
                400);
        JsonNode photo = send(a, id, message("IMAGE", "Front and back", "imageUploadId", uploadId));
        assertThat(photo.path("payload").path("image").path("url").asString())
                .isEqualTo(upload.path("url").asString());
        assertThat(photo.path("payload").path("image").path("height").asInt()).isEqualTo(900);
        assertThat(summaryOf(b, id).path("lastMessage").path("preview").asString())
                .isEqualTo("Photo: Front and back");
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + id + "/messages",
                a.uid(),
                message("IMAGE", null, "imageUploadId", uploadId),
                400);
        JsonNode thread = messages(b, id);
        assertThat(thread.path("items").get(0).path("payload").path("image").path("url").asString())
                .isEqualTo(upload.path("url").asString());
        assertThat(thread.path("items").get(2).path("payload").path("card").path("id").asString())
                .isEqualTo(azure.toString());

        // Upload validation.
        assertThat(upload(a.uid(), "not an image".getBytes(), 415).path("errorCode").asString())
                .isEqualTo("UNSUPPORTED_MEDIA_TYPE");
        assertThat(uploadInventoryKind(a.uid()).path("errors").get(0).path("field").asString())
                .isEqualTo("kind");
    }

    @Test
    void invalidRequestsAre400Or404() {
        Member a = member("inv-a");
        Member b = member("inv-b");
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/conversations",
                                        a.uid(),
                                        Map.of("recipientId", a.id().toString()),
                                        400)
                                .path("errors")
                                .get(0)
                                .path("field")
                                .asString())
                .isEqualTo("recipientId");
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations",
                a.uid(),
                Map.of("recipientId", UUID.randomUUID().toString()),
                404);
        callJson(HttpMethod.POST, "/api/v1/conversations", a.uid(), Map.of(), 400);
        String id = start(a, b, 201);
        String uri = "/api/v1/conversations/" + id + "/messages";
        callJson(HttpMethod.POST, uri, a.uid(), text("   "), 400);
        callJson(HttpMethod.POST, uri, a.uid(), text("x".repeat(4001)), 400);
        callJson(HttpMethod.POST, uri, a.uid(), Map.of("body", "no kind"), 400);
        callJson(
                HttpMethod.POST,
                uri,
                a.uid(),
                message("OFFER_LINK", "x", "offerId", UUID.randomUUID()),
                400);
        callJson(HttpMethod.POST, uri, a.uid(), message("SYSTEM", "x", "body", null), 400);
        callJson(
                HttpMethod.POST,
                uri,
                a.uid(),
                message("CARD_LINK", null, "cardPrintingId", null),
                400);
        callJson(
                HttpMethod.POST,
                uri,
                a.uid(),
                message("CARD_LINK", null, "cardPrintingId", UUID.randomUUID()),
                400);
        callJson(
                HttpMethod.POST,
                uri,
                a.uid(),
                message("IMAGE", null, "imageUploadId", UUID.randomUUID()),
                400);
        callJson(HttpMethod.GET, "/api/v1/conversations?limit=500", a.uid(), null, 400);
        callJson(
                HttpMethod.GET,
                "/api/v1/conversations/" + UUID.randomUUID() + "/messages",
                a.uid(),
                null,
                404);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM message WHERE conversation_id = ?::uuid", id))
                .isZero();
    }

    @Test
    void muteAndArchiveArePerParticipantAndANewMessageUnarchives() {
        Member a = member("arch-a");
        Member b = member("arch-b");
        String id = start(a, b, 201);
        sendText(a, id, "First");

        JsonNode muted =
                callJson(
                        HttpMethod.PATCH,
                        "/api/v1/conversations/" + id,
                        b.uid(),
                        Map.of("muted", true),
                        200);
        assertThat(muted.path("muted").asBoolean()).isTrue();
        assertThat(muted.path("archived").asBoolean()).isFalse();
        assertThat(summaryOf(a, id).path("muted").asBoolean()).isFalse();

        callJson(
                HttpMethod.PATCH,
                "/api/v1/conversations/" + id,
                b.uid(),
                Map.of("archived", true),
                200);
        assertThat(summaryOf(b, id).isMissingNode()).isTrue();
        JsonNode archive =
                callJson(HttpMethod.GET, "/api/v1/conversations?archived=true", b.uid(), null, 200);
        assertThat(ids(archive)).contains(id);
        assertThat(summaryOf(a, id).isMissingNode()).isFalse();

        sendText(a, id, "Back to the inbox");
        JsonNode back = summaryOf(b, id);
        assertThat(back.path("archived").asBoolean()).isFalse();
        assertThat(back.path("muted").asBoolean()).as("mute survives new messages").isTrue();
    }

    @Test
    void theRateRuleAllowsThirtyMessagesPerMinute() {
        moderationService.invalidate();
        Member a = member("rate-a");
        Member b = member("rate-b");
        String id = start(a, b, 201);
        for (int index = 1; index <= 30; index++) {
            sendText(a, id, "Distinct message " + index);
        }
        JsonNode limited =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + id + "/messages",
                        a.uid(),
                        text("One too many"),
                        429);
        assertThat(limited.path("errorCode").asString()).isEqualTo("RATE_LIMITED");
        assertThat(limited.path("retryAfterSeconds").asInt()).isEqualTo(60);
        // The other participant has an own budget.
        sendText(b, id, "Slow down!");
    }

    @Test
    void conversationsAreOrderedByActivityAndPaged() {
        Member me = member("order-me");
        Member x = member("order-x");
        Member y = member("order-y");
        Member z = member("order-z");
        String cx = start(me, x, 201);
        String cy = start(me, y, 201);
        String cz = start(me, z, 201);
        sendText(x, cx, "x");
        sendText(y, cy, "y");
        sendText(z, cz, "z");
        sendText(x, cx, "x again");

        JsonNode first =
                callJson(HttpMethod.GET, "/api/v1/conversations?limit=2", me.uid(), null, 200);
        assertThat(ids(first)).containsExactly(cx, cz);
        JsonNode second =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/conversations?limit=2&cursor="
                                + first.path("nextCursor").asString(),
                        me.uid(),
                        null,
                        200);
        assertThat(ids(second)).containsExactly(cy);
        assertThat(second.path("hasMore").asBoolean()).isFalse();
    }

    @Test
    void unattachedUploadsAreDeletedByTheCleanupJob() {
        Member a = member("clean-a");
        String uploadId =
                upload(a.uid(), InventoryTestSupport.png(64, 64), 201).path("uploadId").asString();
        testUsers.update(
                "UPDATE image_upload SET created_at = now() - interval '2 hours' WHERE id ="
                        + " ?::uuid",
                uploadId);
        http.post()
                .uri("/internal/jobs/upload-cleanup")
                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                .exchange()
                .expectStatus()
                .isOk();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM image_upload WHERE id = ?::uuid", uploadId))
                .isZero();
        assertThat(testUsers.jobRuns("upload-cleanup")).isNotEmpty();
        assertThat(testUsers.jobRuns("upload-cleanup").get(0).get("status")).isEqualTo("SUCCEEDED");
        http.post().uri("/internal/jobs/upload-cleanup").exchange().expectStatus().isUnauthorized();
    }

    @Test
    void exportContainsOnlyTheOwnersMessagingData() {
        Member a = member("exp-a");
        Member b = member("exp-b");
        String id = start(a, b, 201);
        sendText(a, id, "Mine");
        sendText(b, id, "Theirs");
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + member("exp-c").id() + "/block",
                a.uid(),
                null,
                200);

        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", a.uid(), null, 200);
        JsonNode section = export.path("sections").path("messaging");
        assertThat(section.path("conversationIds").get(0).asString()).isEqualTo(id);
        assertThat(section.path("sentMessages")).hasSize(1);
        assertThat(section.path("sentMessages").get(0).path("body").asString()).isEqualTo("Mine");
        assertThat(section.path("blocks")).hasSize(1);
        assertThat(section.toString()).doesNotContain("Theirs");
    }

    private JsonNode upload(String uid, byte[] content, int expectedStatus) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(content) {
                            @Override
                            public String getFilename() {
                                return "photo.png";
                            }
                        })
                .contentType(MediaType.IMAGE_PNG);
        builder.part("kind", "MESSAGE");
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/api/v1/uploads/images")
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value())
                .as(
                        "upload -> %s",
                        result.getResponseBody() == null
                                ? ""
                                : new String(result.getResponseBody()))
                .isEqualTo(expectedStatus);
        return json(result);
    }

    private JsonNode uploadInventoryKind(String uid) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(InventoryTestSupport.png(32, 32)) {
                            @Override
                            public String getFilename() {
                                return "photo.png";
                            }
                        })
                .contentType(MediaType.IMAGE_PNG);
        builder.part("kind", "INVENTORY");
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/api/v1/uploads/images")
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value()).isEqualTo(400);
        return json(result);
    }

    private static List<String> ids(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(item -> ids.add(item.path("id").asString()));
        return ids;
    }

    private static boolean readByOther(JsonNode page, String messageId) {
        for (JsonNode item : page.path("items")) {
            if (item.path("id").asString().equals(messageId)) {
                return item.path("readByOther").asBoolean();
            }
        }
        throw new AssertionError("message " + messageId + " not in page");
    }
}
