package com.orenjitrade.api.messaging.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point implemented by the deals module (stage R4): which chats sold their current
 * subject. Messaging reads it for the pinned bar's "Sold" without depending on the module that
 * records sales.
 */
public interface ChatSaleStatus {

    /**
     * The conversations among {@code subjects} with a sale of their current subject that is not
     * undone and was made at or after the subject was pinned.
     */
    Set<UUID> soldSubjects(Collection<Subject> subjects);

    /**
     * A conversation's current subject.
     *
     * @param conversationId the conversation
     * @param itemId the card, if it is one
     * @param binderId the deck core, if it is one
     * @param setAt when it was pinned
     */
    record Subject(
            UUID conversationId,
            @Nullable UUID itemId,
            @Nullable UUID binderId,
            @Nullable Instant setAt) {}
}
