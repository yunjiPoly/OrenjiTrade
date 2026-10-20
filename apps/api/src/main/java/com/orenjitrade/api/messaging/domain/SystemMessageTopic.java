package com.orenjitrade.api.messaging.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * What a SYSTEM message is about: an offer or a trade (Phase 8, history on the phone since ADR
 * 0018) or a sale (stage R4).
 */
@Schema(name = "SystemMessageTopic")
public enum SystemMessageTopic {
    OFFER,
    SALE
}
