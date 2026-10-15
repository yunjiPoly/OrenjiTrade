package com.orenjitrade.api.ratings.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What makes two collectors eligible to rate each other ({@code interaction.kind}). */
@Schema(name = "InteractionKind")
public enum InteractionKind {
    /** A trade was completed (Phase 8 records it). */
    TRADE,
    /** An offer was accepted (Phase 8 records it). */
    OFFER_ACCEPTED,
    /** A private conversation has at least 3 messages from each side. */
    CONVERSATION_QUALIFIED,
    /**
     * A card or deck core was marked sold from the chat (stage R4, the deals module records it; an
     * undo removes it while nobody has rated it).
     */
    SALE;

    /** The subject type an interaction of this kind points at. */
    public InteractionSubjectType subjectType() {
        return switch (this) {
            case TRADE -> InteractionSubjectType.TRADE;
            case OFFER_ACCEPTED -> InteractionSubjectType.OFFER;
            case CONVERSATION_QUALIFIED -> InteractionSubjectType.CONVERSATION;
            case SALE -> InteractionSubjectType.SALE;
        };
    }
}
