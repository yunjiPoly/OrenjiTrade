package com.orenjitrade.api.ratings.infra;

import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.events.MessageSent;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
import com.orenjitrade.api.ratings.domain.InteractionSubjectType;
import java.util.Map;
import java.util.UUID;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Records a CONVERSATION_QUALIFIED interaction once a conversation has at least {@link
 * InteractionService#QUALIFYING_MESSAGES_PER_SIDE} messages from each side (Phase 7 rating
 * eligibility). Consumes the messaging module's {@link MessageSent} after commit (Spring Modulith
 * registry, own transaction, retried after a crash); idempotent through the unique {@code (kind,
 * subject_id)} of {@code interaction}. Reads counts only, never message text.
 */
@Component
public class ConversationQualificationListener {

    private final ConversationService conversations;
    private final InteractionService interactions;

    public ConversationQualificationListener(
            ConversationService conversations, InteractionService interactions) {
        this.conversations = conversations;
        this.interactions = interactions;
    }

    @ApplicationModuleListener
    void on(MessageSent event) {
        UUID conversationId = event.conversationId();
        if (interactions.exists(InteractionKind.CONVERSATION_QUALIFIED, conversationId)) {
            return;
        }
        Map<UUID, Long> counts = conversations.messageCountsBySender(conversationId);
        if (InteractionService.qualifies(counts, event.senderId(), event.recipientId())) {
            interactions.record(
                    InteractionKind.CONVERSATION_QUALIFIED,
                    event.senderId(),
                    event.recipientId(),
                    InteractionSubjectType.CONVERSATION,
                    conversationId,
                    event.occurredAt());
        }
    }
}
