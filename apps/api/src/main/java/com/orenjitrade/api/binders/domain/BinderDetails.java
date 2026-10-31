package com.orenjitrade.api.binders.domain;

import org.jspecify.annotations.Nullable;

/**
 * A binder with the item statistics the owner's views show.
 *
 * @param binder the binder
 * @param stats item counts and games (all items of the binder)
 * @param coverImageUrl the chosen cover printing's image, else the first item's image
 * @param showcase photos, preview pictures and key cards (stage R3)
 * @param gameLocked the binder's game can't change now: it holds a card, or a card deleted or sold
 *     from it can still come back with an undo (stage G; owner views only, {@code false} in public
 *     ones)
 */
public record BinderDetails(
        BinderView binder,
        BinderContents.Stats stats,
        @Nullable String coverImageUrl,
        BinderShowcase showcase,
        boolean gameLocked) {}
