package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.cards.domain.CardLink;
import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

/**
 * Structured part of a message: at most one member is present, matching the kind.
 *
 * @param card CARD_LINK: the shared printing
 * @param binder BINDER_LINK: the shared public binder (name and owner as shared)
 * @param offer OFFER_LINK and SYSTEM offer notices: the linked offer (Phase 8)
 * @param image IMAGE: the photo
 */
@Schema(name = "MessagePayload", description = "Links and attachments of a message")
public record MessagePayload(
        @Nullable CardLink card,
        @Nullable BinderLink binder,
        @Nullable OfferLink offer,
        @Nullable MessageImage image) {

    public static final MessagePayload EMPTY = new MessagePayload(null, null, null, null);
}
