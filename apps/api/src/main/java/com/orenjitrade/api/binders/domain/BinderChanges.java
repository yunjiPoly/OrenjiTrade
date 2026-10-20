package com.orenjitrade.api.binders.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Owner input for binders (validated by {@link BinderService}). */
public final class BinderChanges {

    private BinderChanges() {}

    /**
     * A new binder.
     *
     * @param name 1-80 characters (trimmed)
     * @param description at most 1 000 characters; empty when null (a deck core's public note)
     * @param kind COLLECTION when null
     * @param visibility PRIVATE when null
     * @param publicUntil end of a TEMPORARILY_PUBLIC publication
     * @param coverPrintingId printing whose image is the cover
     * @param sellsAsCore "Sell as a deck core" (stage R3); false when null
     * @param askingPriceText the deck core's asking price as typed (at most 40 characters)
     * @param gameId the game whose cards the binder holds (stage G): an ACTIVE game with cards;
     *     {@code null} only from the paused web, which has no game picker: the binder then takes
     *     the game of the first card filed in it while it holds none (Yu-Gi-Oh! until then)
     */
    public record NewBinder(
            String name,
            @Nullable String description,
            @Nullable BinderKind kind,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID coverPrintingId,
            @Nullable Boolean sellsAsCore,
            @Nullable String askingPriceText,
            @Nullable UUID gameId) {

        /** A binder of stage R3 (no game: it follows its first card). */
        public NewBinder(
                String name,
                @Nullable String description,
                @Nullable BinderKind kind,
                @Nullable ListingVisibility visibility,
                @Nullable Instant publicUntil,
                @Nullable UUID coverPrintingId,
                @Nullable Boolean sellsAsCore,
                @Nullable String askingPriceText) {
            this(
                    name,
                    description,
                    kind,
                    visibility,
                    publicUntil,
                    coverPrintingId,
                    sellsAsCore,
                    askingPriceText,
                    null);
        }

        /** A plain binder (before stage R3). */
        public NewBinder(
                String name,
                @Nullable String description,
                @Nullable BinderKind kind,
                @Nullable ListingVisibility visibility,
                @Nullable Instant publicUntil,
                @Nullable UUID coverPrintingId) {
            this(
                    name,
                    description,
                    kind,
                    visibility,
                    publicUntil,
                    coverPrintingId,
                    null,
                    null,
                    null);
        }
    }

    /**
     * A partial update: {@code null} scalar fields are unchanged; {@code publicUntil}, {@code
     * coverPrintingId} and {@code askingPriceText} are changed only when their {@code *Set} flag is
     * true (so they can be cleared). {@code confirm} also confirms the binder and its items, as
     * {@code POST /binders/{id}/confirm} does (the phone's "Save changes"). {@code gameId} changes
     * the binder's game only while it holds no card (stage G).
     */
    public record BinderPatch(
            @Nullable String name,
            @Nullable String description,
            @Nullable BinderKind kind,
            @Nullable ListingVisibility visibility,
            boolean publicUntilSet,
            @Nullable Instant publicUntil,
            boolean coverPrintingIdSet,
            @Nullable UUID coverPrintingId,
            @Nullable Boolean sellsAsCore,
            boolean askingPriceTextSet,
            @Nullable String askingPriceText,
            boolean confirm,
            @Nullable UUID gameId) {}
}
