package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import java.security.Principal;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * Security of the STOMP inbound channel (Phase 5 contract "Realtime"):
 *
 * <ul>
 *   <li>CONNECT: the session must already carry the handshake principal, or the frame must carry
 *       {@code Authorization: Bearer <ID token>} (verified like REST bearer tokens);
 *   <li>SUBSCRIBE: only the caller's own queues {@code /user/queue/messages|receipts|typing|
 *       presence|notifications|errors}: explicit user destinations of somebody else ({@code
 *       /user/<id>/queue/...}), raw broker queues and topics are refused;
 *   <li>SEND: only {@code /app/typing}; clients can never publish to broker or user destinations;
 *   <li>every accepted frame of a session (heartbeats included) refreshes the presence key at most
 *       every {@link #PRESENCE_REFRESH_MILLIS} ms.
 * </ul>
 *
 * A refused frame ends the session with a STOMP ERROR frame (safe message, never the token).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 99)
public class StompSecurityInterceptor implements ChannelInterceptor {

    static final long PRESENCE_REFRESH_MILLIS = 20_000;
    static final String PRESENCE_ATTRIBUTE = "orenji.realtime.presenceRefreshedAt";

    /** Subscriptions a client may open. */
    public static final Set<String> ALLOWED_SUBSCRIPTIONS =
            RealtimeDestinations.ALL.stream()
                    .map(destination -> RealtimeDestinations.USER_PREFIX + destination)
                    .collect(Collectors.toUnmodifiableSet());

    /** Destinations a client may SEND to. */
    public static final Set<String> ALLOWED_SENDS = Set.of(RealtimeDestinations.APP_TYPING);

    private final RealtimeAuthenticator authenticator;
    private final PresenceTracker presenceTracker;

    public StompSecurityInterceptor(
            RealtimeAuthenticator authenticator, PresenceTracker presenceTracker) {
        this.authenticator = authenticator;
        this.presenceTracker = presenceTracker;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        @Nullable StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }
        @Nullable StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT || command == StompCommand.STOMP) {
            if (accessor.getUser() == null) {
                @Nullable String header = accessor.getFirstNativeHeader("Authorization");
                if (header == null) {
                    header = accessor.getFirstNativeHeader("authorization");
                }
                try {
                    accessor.setUser(authenticator.authenticate(header));
                } catch (RealtimeAuthenticator.RealtimeAuthenticationException e) {
                    throw new RealtimeAccessDeniedException(e.getMessage());
                }
            }
            return message;
        }
        @Nullable Principal user = accessor.getUser();
        if (command == StompCommand.DISCONNECT) {
            return message;
        }
        if (user == null) {
            if (accessor.getMessageType() == SimpMessageType.HEARTBEAT) {
                return message;
            }
            throw new RealtimeAccessDeniedException("Authentication required");
        }
        if (command == StompCommand.SUBSCRIBE) {
            @Nullable String destination = accessor.getDestination();
            if (destination == null || !ALLOWED_SUBSCRIPTIONS.contains(destination)) {
                throw new RealtimeAccessDeniedException(
                        "Subscriptions are limited to your own /user/queue destinations");
            }
        } else if (command == StompCommand.SEND) {
            @Nullable String destination = accessor.getDestination();
            if (destination == null || !ALLOWED_SENDS.contains(destination)) {
                throw new RealtimeAccessDeniedException(
                        "Sending to this destination is not allowed");
            }
        }
        refreshPresence(user, accessor.getSessionAttributes());
        return message;
    }

    private void refreshPresence(Principal user, @Nullable Map<String, Object> attributes) {
        long now = System.currentTimeMillis();
        if (attributes != null) {
            Object last = attributes.get(PRESENCE_ATTRIBUTE);
            if (last instanceof Long at && now - at < PRESENCE_REFRESH_MILLIS) {
                return;
            }
            attributes.put(PRESENCE_ATTRIBUTE, now);
        }
        try {
            presenceTracker.refresh(UUID.fromString(user.getName()));
        } catch (IllegalArgumentException e) {
            // not an account principal: nothing to refresh
        }
    }

    /**
     * A refused frame; the message (never the token or the frame) is sent to the client in the
     * STOMP ERROR frame. A {@link MessagingException} so the channel does not wrap it.
     */
    public static final class RealtimeAccessDeniedException extends MessagingException {

        private static final long serialVersionUID = 1L;

        public RealtimeAccessDeniedException(String message) {
            super(message);
        }
    }
}
