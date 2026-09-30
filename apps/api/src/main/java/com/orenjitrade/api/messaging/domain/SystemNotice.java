package com.orenjitrade.api.messaging.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A SYSTEM message the platform posts into the DIRECT conversation of two collectors (Phase 8 offer
 * and trade updates), see {@link ConversationService#postSystemMessage}.
 *
 * @param initiatorId the collector whose action caused the notice (creates the conversation when
 *     absent)
 * @param otherId the other collector
 * @param body the text shown in the thread (at most 4 000 characters; no private data)
 * @param offer the linked offer, if any
 * @param dedupKey idempotency key: a second notice with the same key is not posted
 */
public record SystemNotice(
        UUID initiatorId, UUID otherId, String body, @Nullable OfferLink offer, String dedupKey) {}
