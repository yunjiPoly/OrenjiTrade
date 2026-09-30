package com.orenjitrade.api.payments.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Kind of dispute evidence (typed and extensible, ADR 0011): TEXT, IMAGE (photo, re-encoded without
 * metadata), DOCUMENT (PDF), TRACKING (tracking number and optional link). VIDEO (unboxing videos)
 * is reserved: it is part of the vocabulary but refused until it is enabled.
 */
@Schema(name = "EvidenceKind")
public enum EvidenceKind {
    TEXT,
    IMAGE,
    DOCUMENT,
    TRACKING,
    /** Reserved, not enabled (400). */
    VIDEO;

    /** Whether the kind carries an uploaded file. */
    public boolean hasFile() {
        return this == IMAGE || this == DOCUMENT;
    }

    /** Whether the kind can be submitted today. */
    public boolean enabled() {
        return this != VIDEO;
    }
}
