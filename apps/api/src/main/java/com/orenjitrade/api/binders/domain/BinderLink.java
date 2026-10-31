package com.orenjitrade.api.binders.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A public binder shared in a private message or a community post (Phase 5).
 *
 * @param id binder id (link target: the public binder page)
 * @param name binder name at the time it was shared
 * @param ownerHandle handle of the owner at the time it was shared
 * @param deckCore community posts only (stage R11): whether the binder is a deck core buyers can
 *     find right now; absent in messages
 * @param askingPriceText community posts only: the deck core's price as typed, absent without one
 * @param imageUrl community posts only: the binder's first photo, else the first card picture
 *     buyers see, while the binder is public; absent otherwise
 */
@Schema(name = "BinderLink", description = "A public binder shared in a message or post")
public record BinderLink(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Yu-Gi-Oh! trade binder")
                String name,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "collector1") String ownerHandle,
        @Schema(
                        description =
                                "Community posts only (stage R11): a deck core buyers can find"
                                        + " right now. Absent in messages.")
                @Nullable Boolean deckCore,
        @Schema(
                        description =
                                "Community posts only: the deck core's price as typed (\"$95\")."
                                        + " Absent without one.",
                        example = "$95")
                @Nullable String askingPriceText,
        @Schema(
                        description =
                                "Community posts only: the binder's first photo, else the first"
                                        + " card picture buyers see, while it is public.")
                @Nullable String imageUrl) {

    /** A link as messages carry it (no deck core details). */
    public BinderLink(UUID id, String name, String ownerHandle) {
        this(id, name, ownerHandle, null, null, null);
    }
}
