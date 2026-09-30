package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.delisting.domain.ResponsivenessSource;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The messaging module's side of the delist job's {@link ResponsivenessSource} (Phase 7 strikes):
 * conversations whose last message, from the other participant, is still waiting for an answer.
 * Only ids and timestamps leave the module, never message text.
 */
@Component
public class MessagingResponsivenessSource implements ResponsivenessSource {

    private final ConversationRepository conversations;

    public MessagingResponsivenessSource(ConversationRepository conversations) {
        this.conversations = conversations;
    }

    @Override
    @Transactional(readOnly = true)
    public List<UnansweredConversation> unansweredBetween(Instant from, Instant to) {
        return conversations.waitingBetween(from, to).stream()
                .map(
                        row ->
                                new UnansweredConversation(
                                        row.userId(), row.conversationId(), row.since()))
                .toList();
    }
}
