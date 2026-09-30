package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.messaging.infra.BlockRepository;
import com.orenjitrade.api.messaging.infra.ConversationRepository;
import com.orenjitrade.api.messaging.infra.ImageUploadRepository;
import com.orenjitrade.api.messaging.infra.MessageRepository;
import com.orenjitrade.api.messaging.infra.PresenceStore;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The messaging data of one account for {@code GET /me/export} (only what the owner wrote: sent
 * messages, their own blocks, the ids of their conversations; never the other participants' text)
 * and for the account deletion job (content of sent messages erased, photos and pending uploads
 * deleted, blocks removed both ways).
 */
@Service
public class MessagingAccountData {

    private static final Logger log = LoggerFactory.getLogger(MessagingAccountData.class);

    private final MessageRepository messages;
    private final ConversationRepository conversations;
    private final BlockRepository blocks;
    private final ImageUploadRepository uploads;
    private final PresenceStore presence;
    private final ObjectStorage storage;
    private final TimeProvider timeProvider;

    public MessagingAccountData(
            MessageRepository messages,
            ConversationRepository conversations,
            BlockRepository blocks,
            ImageUploadRepository uploads,
            PresenceStore presence,
            ObjectStorage storage,
            TimeProvider timeProvider) {
        this.messages = messages;
        this.conversations = conversations;
        this.blocks = blocks;
        this.uploads = uploads;
        this.presence = presence;
        this.storage = storage;
        this.timeProvider = timeProvider;
    }

    /** Export section {@code messaging}; {@code null} when the account has no messaging data. */
    @Transactional(readOnly = true)
    public @Nullable Map<String, Object> export(UUID userId) {
        List<UUID> conversationIds = conversations.conversationIdsOf(userId);
        List<Map<String, Object>> sent = new ArrayList<>();
        for (MessageRepository.MessageRow row : messages.sentBy(userId)) {
            Map<String, Object> message = new LinkedHashMap<>();
            message.put("id", row.id());
            message.put("conversationId", row.conversationId());
            message.put("kind", row.kind());
            message.put("body", row.body());
            message.put("createdAt", row.createdAt());
            sent.add(message);
        }
        List<Map<String, Object>> blocked = new ArrayList<>();
        for (BlockRepository.Row row : blocks.blockedBy(userId)) {
            Map<String, Object> block = new LinkedHashMap<>();
            block.put("blockedUserId", row.blockedId());
            block.put("createdAt", row.createdAt());
            blocked.add(block);
        }
        if (conversationIds.isEmpty() && sent.isEmpty() && blocked.isEmpty()) {
            return null;
        }
        Map<String, Object> section = new LinkedHashMap<>();
        section.put("conversationIds", conversationIds);
        section.put("sentMessages", sent);
        section.put("blocks", blocked);
        return section;
    }

    /** Account deletion: erase what the account wrote and every block involving it. */
    @Transactional
    public void purge(UUID userId) {
        List<String> keys = new ArrayList<>(messages.eraseSentBy(userId, timeProvider.now()));
        keys.addAll(uploads.deleteByOwner(userId));
        int removedBlocks = blocks.deleteAllOf(userId);
        presence.clear(userId);
        ConversationService.afterCommit(() -> keys.forEach(storage::delete));
        log.info(
                "Messaging data purged for {}: {} photo(s), {} block(s)",
                userId,
                keys.size(),
                removedBlocks);
    }
}
