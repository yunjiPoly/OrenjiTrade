package com.orenjitrade.api.profiles.domain;

import java.util.Comparator;
import java.util.UUID;

/** Detached view of a {@link Tag}. */
public record TagView(UUID id, String slug, String label, TagCategory category, int usageCount) {

    /** Display order on a profile: by category, then label. */
    public static final Comparator<TagView> DISPLAY_ORDER =
            Comparator.comparing(TagView::category)
                    .thenComparing(TagView::label, String.CASE_INSENSITIVE_ORDER);
}
