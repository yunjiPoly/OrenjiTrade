package com.orenjitrade.api.cards.domain.scan;

/** Why a scan match is {@link ScanStatus#NOT_FOUND}. */
public enum ScanNotFoundReason {
    /** A code carries another language's region ({@code MACR-FR036}): English cards only. */
    OTHER_LANGUAGE,
    /** Several cards fit and nothing chooses between them: they are the other matches. */
    AMBIGUOUS,
    /** Nothing that was read is in the catalog. */
    NO_MATCH,
    /** No code and no name was read. */
    NOTHING_READ
}
