package com.orenjitrade.api.messaging.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a chat is about (stage R4): one of its owner's cards, or a deck core. */
@Schema(name = "ConversationSubjectKind")
public enum SubjectKind {
    /** An inventory item (a card with its copies). */
    CARD,
    /** A binder sold as one bundle. */
    DECK_CORE
}
