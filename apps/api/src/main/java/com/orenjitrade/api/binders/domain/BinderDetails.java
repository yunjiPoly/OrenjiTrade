package com.orenjitrade.api.binders.domain;

import org.jspecify.annotations.Nullable;

/**
 * A binder with the item statistics the owner's views show.
 *
 * @param binder the binder
 * @param stats item counts and games (all items of the binder)
 * @param coverImageUrl the chosen cover printing's image, else the first item's image
 * @param showcase photos, preview pictures and key cards (stage R3)
 */
public record BinderDetails(
        BinderView binder,
        BinderContents.Stats stats,
        @Nullable String coverImageUrl,
        BinderShowcase showcase) {}
