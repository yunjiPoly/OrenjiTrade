package com.orenjitrade.api.binders.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A binder as the subject of a chat (stage R4: the deck core a chat is about), whatever its state.
 *
 * @param id binder id
 * @param ownerId its owner (the seller)
 * @param name name
 * @param sellsAsCore "Sell as a deck core" is on
 * @param askingPriceText the deck core's price as typed, {@code null} without one
 * @param imageUrl its first photo, else the first card picture buyers see, {@code null} without
 *     either
 * @param soldAt when it was marked sold, {@code null} if not
 * @param effectivePublic buyers can find it right now (public, unsold, its owner's listings public)
 */
public record ChatDeckCore(
        UUID id,
        UUID ownerId,
        String name,
        boolean sellsAsCore,
        @Nullable String askingPriceText,
        @Nullable String imageUrl,
        @Nullable Instant soldAt,
        boolean effectivePublic) {}
