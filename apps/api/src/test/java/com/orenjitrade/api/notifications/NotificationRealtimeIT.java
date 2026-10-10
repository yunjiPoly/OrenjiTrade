package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.auth.infra.StaticIdentityTokenVerifier;
import com.orenjitrade.api.wishlist.AbstractWishlistIT;
import java.lang.reflect.Type;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpMethod;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.messaging.simp.user.SimpSubscription;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import tools.jackson.databind.JsonNode;

/**
 * New notifications reach the recipient's open sessions on {@code /user/queue/notifications}
 * (through the Redis fan-out of the Phase 5 realtime channel) with the same representation as
 * {@code GET /notifications}: a wishlist match and a private message. Nobody else receives them.
 */
class NotificationRealtimeIT extends AbstractWishlistIT {

    private static final String QUEUE = "/user/queue/notifications";

    @LocalServerPort private int port;

    @Autowired private SimpUserRegistry userRegistry;

    private WebSocketStompClient stompClient;
    private final List<StompSession> sessions = new ArrayList<>();

    @BeforeEach
    void client() {
        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new JacksonJsonMessageConverter());
    }

    @AfterEach
    void disconnect() {
        for (StompSession session : sessions) {
            if (session.isConnected()) {
                session.disconnect();
            }
        }
        sessions.clear();
    }

    @Test
    void wishlistMatchesAndMessagesArePushedToTheRecipientOnly() throws Exception {
        Place place = americasNorth();
        Collector wisher = collector("nr-wisher", place);
        Collector seller = collector("nr-seller", place);
        UUID azure = printing(AZURE);
        String wishId = createWish(wisher, wish(azure, true)).path("id").asString();

        BlockingQueue<JsonNode> wisherQueue = subscribe(wisher);
        BlockingQueue<JsonNode> sellerQueue = subscribe(seller);

        String itemId = publicItem(seller, azure, offered("NEAR_MINT", "35.00", "SALE"));
        JsonNode pushed = wisherQueue.poll(20, TimeUnit.SECONDS);
        assertThat(pushed).as("the wisher receives the match in realtime").isNotNull();
        assertThat(pushed.path("type").asString()).isEqualTo("WISHLIST_MATCH");
        assertThat(pushed.path("data").path("wishlistItemId").asString()).isEqualTo(wishId);
        assertThat(pushed.path("data").path("inventoryItemId").asString()).isEqualTo(itemId);
        assertThat(pushed.path("readAt").isNull() || pushed.path("readAt").isMissingNode())
                .isTrue();
        JsonNode listed = notificationsOfType(wisher, "WISHLIST_MATCH").get(0);
        assertThat(pushed.path("id").asString()).isEqualTo(listed.path("id").asString());
        assertThat(pushed.path("title").asString()).isEqualTo(listed.path("title").asString());
        assertThat(pushed.path("body").asString()).isEqualTo(listed.path("body").asString());
        assertAtMostThreeDecimals(pushed, "realtime notification");
        awaitDispatched(wisher.id());
        assertThat(channelState(listed.path("id").asString())).contains("\"realtime\": \"SENT\"");

        // A private message notifies the recipient (never with the message text).
        String conversationId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations",
                                wisher.uid(),
                                Map.of("recipientId", seller.id().toString()),
                                201)
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                wisher.uid(),
                Map.of("kind", "TEXT", "body", "Is the Azure-Eyes still available?"),
                201);
        JsonNode message = sellerQueue.poll(20, TimeUnit.SECONDS);
        assertThat(message).as("the seller receives the message notification").isNotNull();
        assertThat(message.path("type").asString()).isEqualTo("MESSAGE");
        assertThat(message.path("title").asString()).startsWith("New message from ");
        assertThat(message.path("data").path("conversationId").asString())
                .isEqualTo(conversationId);
        assertThat(message.path("data").path("deepLink").asString())
                .isEqualTo("/messages/" + conversationId);
        assertThat(message.toString()).doesNotContain("still available");

        assertThat(wisherQueue.poll(500, TimeUnit.MILLISECONDS))
                .as("the sender is not notified about their own message")
                .isNull();
        assertThat(sellerQueue.poll(200, TimeUnit.MILLISECONDS)).isNull();
    }

    // ---------------------------------------------------------------------------------------

    private BlockingQueue<JsonNode> subscribe(Collector collector) throws Exception {
        StompSession session =
                stompClient
                        .connectAsync(
                                "ws://localhost:"
                                        + port
                                        + "/ws?access_token="
                                        + StaticIdentityTokenVerifier.token(collector.uid()),
                                (WebSocketHttpHeaders) null,
                                (StompHeaders) null,
                                new StompSessionHandlerAdapter() {})
                        .get(10, TimeUnit.SECONDS);
        sessions.add(session);
        BlockingQueue<JsonNode> queue = new LinkedBlockingQueue<>();
        session.subscribe(
                QUEUE,
                new StompFrameHandler() {
                    @Override
                    public Type getPayloadType(StompHeaders headers) {
                        return JsonNode.class;
                    }

                    @Override
                    public void handleFrame(StompHeaders headers, @Nullable Object payload) {
                        if (payload instanceof JsonNode node) {
                            queue.add(node);
                        }
                    }
                });
        await().atMost(Duration.ofSeconds(10))
                .until(
                        () -> {
                            @Nullable SimpUser user =
                                    userRegistry.getUser(collector.id().toString());
                            return user != null
                                    && user.getSessions().stream()
                                            .flatMap(s -> s.getSubscriptions().stream())
                                            .map(SimpSubscription::getDestination)
                                            .anyMatch(QUEUE::equals);
                        });
        // The broker registers the subscription on the inbound executor right after the registry.
        Thread.sleep(300);
        return queue;
    }
}
