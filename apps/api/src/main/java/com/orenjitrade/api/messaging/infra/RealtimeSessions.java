package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.users.events.AccountDeletedEvent;
import com.orenjitrade.api.users.events.AccountDeletionRequestedEvent;
import com.orenjitrade.api.users.events.UserSuspendedEvent;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

/**
 * The open realtime sessions of this instance, so an account that may no longer connect loses the
 * sessions it opened before: a suspension or a ban ({@link UserSuspendedEvent}), a deletion request
 * and a deletion close every session of the account at once (owner decision of 2026-10-28, review
 * fix 1: the login stays on during a suspension, the realtime channel refuses the account like
 * REST). The STOMP session id is the WebSocket session id; the account's session ids come from
 * {@link PresenceTracker}. An instance that did not see the event ends such a session at its next
 * presence check ({@link StompSecurityInterceptor}).
 */
@Component
public class RealtimeSessions implements WebSocketHandlerDecoratorFactory {

    /** Close status of a session whose account may no longer connect. */
    static final CloseStatus ACCOUNT_REFUSED =
            CloseStatus.POLICY_VIOLATION.withReason("This account cannot connect");

    private static final Logger log = LoggerFactory.getLogger(RealtimeSessions.class);

    private final Map<String, WebSocketSession> open = new ConcurrentHashMap<>();
    private final PresenceTracker presence;

    public RealtimeSessions(PresenceTracker presence) {
        this.presence = presence;
    }

    @Override
    public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                open.put(session.getId(), session);
                super.afterConnectionEstablished(session);
            }

            @Override
            public void afterConnectionClosed(WebSocketSession session, CloseStatus status)
                    throws Exception {
                open.remove(session.getId());
                super.afterConnectionClosed(session, status);
            }
        };
    }

    /** Closes every session of the account on this instance; returns how many were closed. */
    public int closeSessionsOf(UUID userId) {
        int closed = 0;
        for (String sessionId : presence.localSessions(userId)) {
            @Nullable WebSocketSession session = open.get(sessionId);
            if (session == null || !session.isOpen()) {
                continue;
            }
            try {
                session.close(ACCOUNT_REFUSED);
                closed++;
            } catch (IOException e) {
                log.debug("Realtime session {} not closed: {}", sessionId, e.getMessage());
            }
        }
        if (closed > 0) {
            log.info("Closed {} realtime session(s) of account {}", closed, userId);
        }
        return closed;
    }

    @ApplicationModuleListener
    void on(UserSuspendedEvent event) {
        closeSessionsOf(event.userId());
    }

    @ApplicationModuleListener
    void on(AccountDeletionRequestedEvent event) {
        closeSessionsOf(event.userId());
    }

    @ApplicationModuleListener
    void on(AccountDeletedEvent event) {
        closeSessionsOf(event.userId());
    }
}
