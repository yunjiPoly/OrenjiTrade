package com.orenjitrade.api.profiles.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** {@code tag.category}. Curated tags use the first five; collectors create {@link #CUSTOM}. */
@Schema(name = "TagCategory")
public enum TagCategory {
    GAME,
    ROLE,
    STYLE,
    LOGISTICS,
    LANGUAGE,
    CUSTOM
}
