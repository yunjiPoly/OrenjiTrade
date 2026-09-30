package com.orenjitrade.api.messaging.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A message to send ({@code POST /conversations/{id}/messages}).
 *
 * @param kind kind (TEXT, CARD_LINK, BINDER_LINK, OFFER_LINK, IMAGE; SYSTEM is refused)
 * @param body text (required for TEXT, optional otherwise)
 * @param cardPrintingId printing of a CARD_LINK
 * @param binderId public binder of a BINDER_LINK
 * @param offerId offer of an OFFER_LINK (Phase 8)
 * @param imageUploadId upload of an IMAGE
 */
public record NewMessage(
        MessageKind kind,
        @Nullable String body,
        @Nullable UUID cardPrintingId,
        @Nullable UUID binderId,
        @Nullable UUID offerId,
        @Nullable UUID imageUploadId) {}
