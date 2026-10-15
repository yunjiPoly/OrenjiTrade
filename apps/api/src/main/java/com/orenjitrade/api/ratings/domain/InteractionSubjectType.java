package com.orenjitrade.api.ratings.domain;

/** What {@code interaction.subject_id} identifies. */
public enum InteractionSubjectType {
    TRADE,
    OFFER,
    CONVERSATION,
    /** A sale of the deals module (stage R4). */
    SALE
}
