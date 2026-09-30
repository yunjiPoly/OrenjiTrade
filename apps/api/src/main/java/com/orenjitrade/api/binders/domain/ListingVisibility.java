package com.orenjitrade.api.binders.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Visibility chosen by the owner for a binder or an inventory item. */
@Schema(
        name = "ListingVisibility",
        description =
                "PRIVATE, PUBLIC or TEMPORARILY_PUBLIC (until publicUntil, at most 30 days ahead)")
public enum ListingVisibility {
    PRIVATE,
    PUBLIC,
    TEMPORARILY_PUBLIC;

    /** Whether the owner asked for this listing to be public (now or until a date). */
    public boolean isPublic() {
        return this != PRIVATE;
    }
}
