package com.orenjitrade.api.messaging.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Kind of a private message (Phase 5 contract). */
@Schema(name = "MessageKind")
public enum MessageKind {
    /** Plain text (body required). */
    TEXT,
    /** A shared printing ({@code cardPrintingId}); optional text. */
    CARD_LINK,
    /** A shared public binder ({@code binderId}); optional text. */
    BINDER_LINK,
    /** Reserved for Phase 8 offers; refused with 400 until then. */
    OFFER_LINK,
    /** A photo ({@code imageUploadId} from {@code POST /uploads/images}); optional caption. */
    IMAGE,
    /** Written by the platform only (never accepted from clients). */
    SYSTEM
}
