package com.orenjitrade.api.messaging;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.messaging.MessagingTestSupport.Member;
import com.orenjitrade.api.moderation.domain.ModerationService;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/** Helpers shared by the messaging integration tests. */
abstract class AbstractMessagingIT extends AbstractIntegrationTest {

    @Autowired protected ModerationService moderationService;

    /** A compliant member with a saved (complete) profile. */
    protected Member member(String prefix) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliant(uid);
        String handle = me(uid).path("handle").asString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile",
                uid,
                MessagingTestSupport.profile(handle),
                200);
        return new Member(uid, id, handle);
    }

    /** A compliant member without a saved profile. */
    protected Member memberWithoutProfile(String prefix) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliant(uid);
        return new Member(uid, id, me(uid).path("handle").asString());
    }

    protected void privacy(Member member, String messaging, boolean showOnlineStatus) {
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                member.uid(),
                MessagingTestSupport.privacy(messaging, showOnlineStatus),
                200);
    }

    /** Starts (or reopens) a conversation and returns its id. */
    protected String start(Member from, Member to, int expectedStatus) {
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        from.uid(),
                        Map.of("recipientId", to.id().toString()),
                        expectedStatus)
                .path("id")
                .asString();
    }

    protected JsonNode send(Member from, String conversationId, Map<String, Object> body) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                from.uid(),
                body,
                201);
    }

    protected JsonNode sendText(Member from, String conversationId, String text) {
        return send(from, conversationId, MessagingTestSupport.text(text));
    }

    protected JsonNode conversations(Member member) {
        return callJson(HttpMethod.GET, "/api/v1/conversations", member.uid(), null, 200);
    }

    protected JsonNode messages(Member member, String conversationId) {
        return callJson(
                HttpMethod.GET,
                "/api/v1/conversations/" + conversationId + "/messages",
                member.uid(),
                null,
                200);
    }

    /** The conversation summary of {@code conversationId} in the member's inbox, or missing. */
    protected JsonNode summaryOf(Member member, String conversationId) {
        for (JsonNode item : conversations(member).path("items")) {
            if (item.path("id").asString().equals(conversationId)) {
                return item;
            }
        }
        return tools.jackson.databind.node.MissingNode.getInstance();
    }
}
