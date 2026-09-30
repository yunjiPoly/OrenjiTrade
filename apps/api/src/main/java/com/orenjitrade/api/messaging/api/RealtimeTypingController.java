package com.orenjitrade.api.messaging.api;

import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import com.orenjitrade.api.messaging.domain.RealtimeNotices.Typing;
import com.orenjitrade.api.messaging.domain.RealtimePublisher;
import java.security.Principal;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

/**
 * STOMP application destination {@code /app/typing} {@code {conversationId}}: the other participant
 * receives {@code {conversationId, userId}} on {@code /user/queue/typing}. Silently ignored for
 * conversations the sender is not part of or that a block hides.
 */
@Controller
public class RealtimeTypingController {

    private final ConversationService conversations;
    private final RealtimePublisher realtime;

    public RealtimeTypingController(ConversationService conversations, RealtimePublisher realtime) {
        this.conversations = conversations;
        this.realtime = realtime;
    }

    @MessageMapping("/typing")
    public void typing(@Payload TypingRequest request, Principal principal) {
        if (request.conversationId() == null) {
            return;
        }
        UUID me;
        try {
            me = UUID.fromString(principal.getName());
        } catch (IllegalArgumentException e) {
            return;
        }
        UUID conversationId = request.conversationId();
        conversations
                .typingRecipient(me, conversationId)
                .ifPresent(
                        other ->
                                realtime.publish(
                                        other,
                                        RealtimeDestinations.TYPING,
                                        new Typing(conversationId, me)));
    }

    /** Payload of {@code SEND /app/typing}. */
    public record TypingRequest(@Nullable UUID conversationId) {}
}
