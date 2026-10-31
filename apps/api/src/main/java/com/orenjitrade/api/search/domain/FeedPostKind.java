package com.orenjitrade.api.search.domain;

/** The kind of a post of Home's feed (stage R7). */
public enum FeedPostKind {
    /** One collector's cards that became public within the same hour. */
    NEW_CARDS,
    /** A public wish. */
    WANTED,
    /** A deck core that became public. */
    DECK_CORE
}
