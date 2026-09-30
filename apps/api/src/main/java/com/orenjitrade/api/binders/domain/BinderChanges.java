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
     * @param description at most 1 000 characters; empty when null
     * @param kind COLLECTION when null
     * @param visibility PRIVATE when null
     * @param publicUntil end of a TEMPORARILY_PUBLIC publication
     * @param coverPrintingId printing whose image is the cover
     */
    public record NewBinder(
            String name,
            @Nullable String description,
            @Nullable BinderKind kind,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID coverPrintingId) {}

    /**
     * A partial update: {@code null} scalar fields are unchanged; {@code publicUntil} and {@code
     * coverPrintingId} are changed only when their {@code *Set} flag is true (so they can be
     * cleared).
     */
    public record BinderPatch(
            @Nullable String name,
            @Nullable String description,
            @Nullable BinderKind kind,
            @Nullable ListingVisibility visibility,
            boolean publicUntilSet,
            @Nullable Instant publicUntil,
            boolean coverPrintingIdSet,
            @Nullable UUID coverPrintingId) {}
}
