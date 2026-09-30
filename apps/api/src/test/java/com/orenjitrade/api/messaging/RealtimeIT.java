package com.orenjitrade.api.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.infra.StaticIdentityTokenVerifier;
import com.orenjitrade.api.messaging.MessagingTestSupport.Member;
import java.lang.reflect.Type;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutionException;
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
import org.springframework.messaging.simp.stomp.StompCommand;
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
 * Realtime channel (Phase 5 contract "Realtime") with two real STOMP clients over the native
 * WebSocket endpoint {@code /ws}: B receives A's message and A receives B's read receipt through
 * the Redis fan-out, typing notices and presence changes flow to the partner, subscriptions to
 * somebody else's queues and sends to broker destinations are refused, and bad or missing tokens
 * never get a session.
 */
class RealtimeIT extends AbstractMessagingIT {

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
    void messagesReceiptsTypingAndPresenceReachThePartner() throws Exception {
        Member a = member("rt-a");
        Member b = member("rt-b");
        privacy(b, "MEMBERS_WITH_PROFILE", true);
        String conversationId = start(a, b, 201);

        // A authenticates the handshake with ?access_token=, B the STOMP CONNECT frame.
        StompSession sessionA = connectWithQueryToken(a.uid()).session();
        Queues queuesA = subscribeAll(sessionA);
        awaitSubscribed(a.id(), "/user/queue/presence");

        Connection connectionB = connectWithConnectHeader("Bearer " + token(b.uid()));
        StompSession sessionB = connectionB.session();
        Queues queuesB = subscribeAll(sessionB);
        awaitSubscribed(b.id(), "/user/queue/messages");
        awaitSubscribed(b.id(), "/user/queue/typing");

        JsonNode online = queuesA.presence().poll(10, TimeUnit.SECONDS);
        assertThat(online).as("A is told that B came online").isNotNull();
        assertThat(online.path("userId").asString()).isEqualTo(b.id().toString());
        assertThat(online.path("status").asString()).isEqualTo("ONLINE");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + b.handle(),
                                        a.uid(),
                                        null,
                                        200)
                                .path("onlineStatus")
                                .asString())
                .isEqualTo("ONLINE");
        assertThat(summaryOf(a, conversationId).path("other").path("onlineStatus").asString())
                .isEqualTo("ONLINE");

        JsonNode sent = sendText(a, conversationId, "Realtime hello");
        JsonNode received = queuesB.messages().poll(10, TimeUnit.SECONDS);
        assertThat(received).as("B receives A's message").isNotNull();
        assertThat(received.path("id").asString()).isEqualTo(sent.path("id").asString());
        assertThat(received.path("conversationId").asString()).isEqualTo(conversationId);
        assertThat(received.path("senderId").asString()).isEqualTo(a.id().toString());
        assertThat(received.path("body").asString()).isEqualTo("Realtime hello");
        assertThat(received.path("kind").asString()).isEqualTo("TEXT");
        JsonNode echo = queuesA.messages().poll(10, TimeUnit.SECONDS);
        assertThat(echo).as("A's other sessions get their own message too").isNotNull();
        assertThat(echo.path("id").asString()).isEqualTo(sent.path("id").asString());

        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/read",
                b.uid(),
                Map.of("lastReadMessageId", sent.path("id").asString()),
                204);
        JsonNode receipt = queuesA.receipts().poll(10, TimeUnit.SECONDS);
        assertThat(receipt).as("A receives B's read receipt").isNotNull();
        assertThat(receipt.path("conversationId").asString()).isEqualTo(conversationId);
        assertThat(receipt.path("userId").asString()).isEqualTo(b.id().toString());
        assertThat(receipt.path("lastReadMessageId").asString())
                .isEqualTo(sent.path("id").asString());

        sessionA.send("/app/typing", Map.of("conversationId", conversationId));
        JsonNode typing = queuesB.typing().poll(10, TimeUnit.SECONDS);
        assertThat(typing).as("B sees A typing").isNotNull();
        assertThat(typing.path("conversationId").asString()).isEqualTo(conversationId);
        assertThat(typing.path("userId").asString()).isEqualTo(a.id().toString());
        // Typing in somebody else's conversation is ignored.
        Member stranger = member("rt-s");
        String otherConversation = start(stranger, member("rt-t"), 201);
        sessionA.send("/app/typing", Map.of("conversationId", otherConversation));

        sessionB.disconnect();
        JsonNode offline = queuesA.presence().poll(10, TimeUnit.SECONDS);
        assertThat(offline).as("A is told that B went offline").isNotNull();
        assertThat(offline.path("status").asString()).isEqualTo("OFFLINE");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + b.handle(),
                                        a.uid(),
                                        null,
                                        200)
                                .path("onlineStatus")
                                .asString())
                .isEqualTo("OFFLINE");
        assertThat(queuesB.typing()).isEmpty();
    }

    @Test
    void subscriptionsToSomebodyElsesQueuesAreRejected() throws Exception {
        Member a = member("rt-owner");
        Member b = member("rt-peer");
        Member spy = member("rt-spy");
        String conversationId = start(a, b, 201);

        List<String> forbidden =
                List.of(
                        "/user/" + b.id() + "/queue/messages",
                        "/queue/messages",
                        "/topic/messages",
                        "/user/queue/secrets");
        for (String destination : forbidden) {
            Connection connection = connectWithQueryToken(spy.uid());
            Queues sink = new Queues();
            connection.session().subscribe(destination, sink.handler(sink.messages()));
            await().atMost(Duration.ofSeconds(10))
                    .alias("subscription to " + destination + " is refused")
                    .until(() -> !connection.errors().isEmpty());
            assertThat(connection.errors().get(0)).contains("Subscriptions are limited");
            await().atMost(Duration.ofSeconds(10)).until(() -> !connection.session().isConnected());
        }

        // Clients may not publish to broker or user destinations either.
        Connection sender = connectWithQueryToken(spy.uid());
        sender.session().send("/user/" + b.id() + "/queue/messages", Map.of("body", "forged"));
        await().atMost(Duration.ofSeconds(10)).until(() -> !sender.errors().isEmpty());
        assertThat(sender.errors().get(0)).contains("not allowed");

        // B still receives genuine messages only.
        StompSession sessionB = connectWithQueryToken(b.uid()).session();
        Queues queuesB = subscribeAll(sessionB);
        awaitSubscribed(b.id(), "/user/queue/messages");
        sendText(a, conversationId, "Only for B");
        JsonNode received = queuesB.messages().poll(10, TimeUnit.SECONDS);
        assertThat(received).isNotNull();
        assertThat(received.path("body").asString()).isEqualTo("Only for B");
        assertThat(queuesB.messages().poll(500, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void badOrMissingTokensNeverGetASession() {
        assertThatThrownBy(() -> connectWithRawQueryToken("bogus-token-value"))
                .isInstanceOf(ExecutionException.class);
        assertThatThrownBy(() -> connectWithConnectHeader("Bearer not-a-valid-token"))
                .isInstanceOf(ExecutionException.class);
        assertThatThrownBy(() -> connectWithConnectHeader(null))
                .isInstanceOf(ExecutionException.class);

        Member suspended = member("rt-susp");
        testUsers.setStatus(suspended.id(), AccountStatus.SUSPENDED, null);
        try {
            assertThatThrownBy(() -> connectWithQueryToken(suspended.uid()))
                    .isInstanceOf(ExecutionException.class);
        } finally {
            testUsers.setStatus(suspended.id(), AccountStatus.ACTIVE, null);
        }
        assertThat(userRegistry.getUser(suspended.id().toString())).isNull();
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private static String token(String uid) {
        return StaticIdentityTokenVerifier.token(uid);
    }

    private Connection connectWithQueryToken(String uid) throws Exception {
        return connectWithRawQueryToken(token(uid));
    }

    private Connection connectWithRawQueryToken(String rawToken) throws Exception {
        Handler handler = new Handler();
        StompSession session =
                stompClient
                        .connectAsync(
                                "ws://localhost:" + port + "/ws?access_token=" + rawToken,
                                (WebSocketHttpHeaders) null,
                                (StompHeaders) null,
                                handler)
                        .get(10, TimeUnit.SECONDS);
        sessions.add(session);
        return new Connection(session, handler.errors);
    }

    private Connection connectWithConnectHeader(@Nullable String authorization) throws Exception {
        Handler handler = new Handler();
        StompHeaders connectHeaders = new StompHeaders();
        if (authorization != null) {
            connectHeaders.add("Authorization", authorization);
        }
        StompSession session =
                stompClient
                        .connectAsync(
                                "ws://localhost:" + port + "/ws",
                                (WebSocketHttpHeaders) null,
                                connectHeaders,
                                handler)
                        .get(10, TimeUnit.SECONDS);
        sessions.add(session);
        return new Connection(session, handler.errors);
    }

    private Queues subscribeAll(StompSession session) {
        Queues queues = new Queues();
        session.subscribe("/user/queue/messages", queues.handler(queues.messages()));
        session.subscribe("/user/queue/receipts", queues.handler(queues.receipts()));
        session.subscribe("/user/queue/typing", queues.handler(queues.typing()));
        session.subscribe("/user/queue/presence", queues.handler(queues.presence()));
        return queues;
    }

    private void awaitSubscribed(UUID userId, String destination) throws InterruptedException {
        await().atMost(Duration.ofSeconds(10))
                .until(
                        () -> {
                            @Nullable SimpUser user = userRegistry.getUser(userId.toString());
                            if (user == null) {
                                return false;
                            }
                            return user.getSessions().stream()
                                    .flatMap(session -> session.getSubscriptions().stream())
                                    .map(SimpSubscription::getDestination)
                                    .anyMatch(destination::equals);
                        });
        // The broker registers the subscription on the inbound executor right after the registry.
        Thread.sleep(300);
    }

    /** A connected session and the ERROR frames it received. */
    private record Connection(StompSession session, List<String> errors) {}

    /** Collects ERROR frames. */
    private static final class Handler extends StompSessionHandlerAdapter {

        final List<String> errors = new CopyOnWriteArrayList<>();

        @Override
        public Type getPayloadType(StompHeaders headers) {
            return byte[].class;
        }

        @Override
        public void handleFrame(StompHeaders headers, @Nullable Object payload) {
            @Nullable String message = headers.getFirst("message");
            errors.add(message == null ? StompCommand.ERROR.name() : message);
        }
    }

    /** Payloads received per queue. */
    private record Queues(
            BlockingQueue<JsonNode> messages,
            BlockingQueue<JsonNode> receipts,
            BlockingQueue<JsonNode> typing,
            BlockingQueue<JsonNode> presence) {

        Queues() {
            this(
                    new LinkedBlockingQueue<>(),
                    new LinkedBlockingQueue<>(),
                    new LinkedBlockingQueue<>(),
                    new LinkedBlockingQueue<>());
        }

        StompFrameHandler handler(BlockingQueue<JsonNode> target) {
            return new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return JsonNode.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, @Nullable Object payload) {
                    if (payload instanceof JsonNode node) {
                        target.add(node);
                    }
                }
            };
        }
    }
}
