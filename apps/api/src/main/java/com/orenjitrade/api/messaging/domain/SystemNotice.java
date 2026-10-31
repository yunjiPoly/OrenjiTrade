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
 * @param sale the sale it announces (stage R4), if any
 * @param readByInitiator the initiator caused it from the chat they are reading (a sale): it is
 *     read for them, unread for the other collector only
 */
public record SystemNotice(
        UUID initiatorId,
        UUID otherId,
        String body,
        @Nullable OfferLink offer,
        String dedupKey,
        @Nullable SaleNotice sale,
        boolean readByInitiator) {

    /** An offer or trade notice (Phase 8): unread for both collectors. */
    public SystemNotice(
            UUID initiatorId,
            UUID otherId,
            String body,
            @Nullable OfferLink offer,
            String dedupKey) {
        this(initiatorId, otherId, body, offer, dedupKey, null, false);
    }
}
