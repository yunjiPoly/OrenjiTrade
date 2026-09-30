package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import com.orenjitrade.api.messaging.domain.RealtimeNotices.Presence;
import com.orenjitrade.api.messaging.domain.RealtimePublisher;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.profiles.domain.PrivacyPolicyService;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import java.security.Principal;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * Presence of realtime sessions (Phase 5 contract): {@code presence:{userId}} is set when a session
 * connects, refreshed by the session's frames and heartbeats ({@link StompSecurityInterceptor}) and
 * cleared when the last session of this instance disconnects (another instance keeps refreshing it
 * within the TTL if the account is connected there). Coming online and going offline are announced
 * on {@code /user/queue/presence} to conversation partners only when the account shows its online
 * status and the partner may see it ({@link PrivacyPolicyService#canSeeOnlineStatus}).
 */
@Component
public class PresenceTracker {

    private static final Logger log = LoggerFactory.getLogger(PresenceTracker.class);

    private final Map<UUID, Set<String>> sessions = new ConcurrentHashMap<>();
    private final PresenceStore store;
    private final ConversationService conversations;
    private final MemberDirectory members;
    private final PrivacyPolicyService privacyPolicy;
    private final RealtimePublisher realtime;

    public PresenceTracker(
            PresenceStore store,
            ConversationService conversations,
            MemberDirectory members,
            PrivacyPolicyService privacyPolicy,
            RealtimePublisher realtime) {
        this.store = store;
        this.conversations = conversations;
        this.members = members;
        this.privacyPolicy = privacyPolicy;
        this.realtime = realtime;
    }

    @EventListener
    void onConnected(SessionConnectedEvent event) {
        Optional<UUID> userId = accountOf(event.getUser());
        @Nullable String sessionId =
                SimpMessageHeaderAccessor.getSessionId(event.getMessage().getHeaders());
        if (userId.isEmpty() || sessionId == null) {
            return;
        }
        sessions.computeIfAbsent(userId.get(), id -> ConcurrentHashMap.newKeySet()).add(sessionId);
        refresh(userId.get());
    }

    @EventListener
    void onDisconnect(SessionDisconnectEvent event) {
        Optional<UUID> userId = accountOf(event.getUser());
        if (userId.isEmpty()) {
            return;
        }
        @Nullable Set<String> open = sessions.get(userId.get());
        if (open != null) {
            open.remove(event.getSessionId());
            if (!open.isEmpty()) {
                return;
            }
            sessions.remove(userId.get(), open);
        }
        store.clear(userId.get());
        announce(userId.get(), OnlineStatus.OFFLINE);
    }

    /** Refreshes the presence key; announces the account when it just came online. */
    public void refresh(UUID userId) {
        if (store.touch(userId)) {
            announce(userId, OnlineStatus.ONLINE);
        }
    }

    /** Whether this instance holds an open session of the account (tests, diagnostics). */
    public boolean hasLocalSession(UUID userId) {
        Set<String> open = sessions.get(userId);
        return open != null && !open.isEmpty();
    }

    private void announce(UUID userId, OnlineStatus status) {
        try {
            Optional<MemberCard> card = members.card(userId);
            if (card.isEmpty() || !card.get().privacy().showOnlineStatus()) {
                return;
            }
            for (UUID partner : conversations.partnersOf(userId)) {
                if (privacyPolicy.canSeeOnlineStatus(
                        new ViewerContext(partner, false, false), userId, card.get().privacy())) {
                    realtime.publish(
                            partner, RealtimeDestinations.PRESENCE, new Presence(userId, status));
                }
            }
        } catch (RuntimeException e) {
            log.warn("Presence of {} not announced: {}", userId, e.getMessage());
        }
    }

    private static Optional<UUID> accountOf(@Nullable Principal user) {
        if (user == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(UUID.fromString(user.getName()));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
